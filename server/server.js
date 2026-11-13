import process from "node:process";
import express from "express";
import cors from "cors";
import QRCode from "qrcode";
import { randomUUID } from "crypto";

const app = express();

app.use(cors());
app.use(express.json());

const sessions = new Map();

const RADIUS_METRES = 50;
const QR_VALIDITY = 5 * 60 * 1000;

// Calculate distance between two GPS coordinates
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;

    const toRadians = (degrees) => degrees * Math.PI / 180;

    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) ** 2;

    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Teacher starts attendance
app.post("/api/attendance/start", async (req, res) => {
    try {
        const { teacherLat, teacherLon } = req.body;

        if (
            !Number.isFinite(teacherLat) ||
            !Number.isFinite(teacherLon) ||
            Math.abs(teacherLat) > 90 ||
            Math.abs(teacherLon) > 180
        ) {
            return res.status(400).json({
                message: "Valid teacher location is required."
            });
        }

        const token = randomUUID();
        const expiresAt = Date.now() + QR_VALIDITY;

        sessions.set(token, {
            teacherLat,
            teacherLon,
            expiresAt,
            attendance: new Set()
        });

        const frontendUrl =
    process.env.FRONTEND_URL || "http://localhost:5173";

const studentUrl = `${frontendUrl}/student?token=${token}`;

const qrCode = await QRCode.toDataURL(studentUrl);

        res.json({
            message: "Attendance session started.",
            token,
            qrCode,
            expiresAt
        });

    } catch {
    res.status(500).json({
        message: "Could not generate QR code."
    });
}
});

// Student verifies attendance
app.post("/api/attendance/verify", (req, res) => {
    const { token, studentLat, studentLon, studentId } = req.body;

    if (
        !token ||
        !studentId ||
        !Number.isFinite(studentLat) ||
        !Number.isFinite(studentLon) ||
        Math.abs(studentLat) > 90 ||
        Math.abs(studentLon) > 180
    ) {
        return res.status(400).json({
            message: "Valid token, student ID and location are required."
        });
    }

    const session = sessions.get(token);

    if (!session) {
        return res.status(404).json({
            message: "Invalid attendance QR code."
        });
    }

    if (Date.now() > session.expiresAt) {
        sessions.delete(token);

        return res.status(410).json({
            message: "QR code expired. Attendance not marked."
        });
    }

    const distance = calculateDistance(
        session.teacherLat,
        session.teacherLon,
        studentLat,
        studentLon
    );

    if (distance > RADIUS_METRES) {
        return res.status(403).json({
            success: false,
            message: "You are not in the same location as your teacher. Attendance not marked.",
            distance: Math.round(distance)
        });
    }

    if (session.attendance.has(studentId)) {
        return res.status(409).json({
            message: "Attendance already marked."
        });
    }

    session.attendance.add(studentId);

    res.json({
        success: true,
        message: "Attendance marked successfully!",
        distance: Math.round(distance)
    });
});

app.get("/", (req, res) => {
    res.send("CampusPass Backend is Running!");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`CampusPass server running on port ${PORT}`);
});


