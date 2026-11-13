
import process from "node:process";
import express from "express";
import cors from "cors";
import QRCode from "qrcode";
import { randomUUID } from "node:crypto";

const app = express();

app.use(cors());
app.use(express.json());

const sessions = new Map();

const RADIUS_METRES = 50;
const MAX_GPS_ACCURACY = 2500;
const QR_VALIDITY = 5 * 60 * 1000;

// Calculate distance between GPS coordinates
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

    return 2 * R * Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
    );
}

// Teacher starts a new attendance session
app.post("/api/attendance/start", async (req, res) => {
    try {
        const { teacherLat, teacherLon, teacherAccuracy } = req.body;

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
        const managementKey = randomUUID();
        const expiresAt = Date.now() + QR_VALIDITY;

        sessions.set(token, {
            managementKey,
            teacherLat,
            teacherLon,
            teacherAccuracy: Number.isFinite(teacherAccuracy)
                ? teacherAccuracy
                : null,
            expiresAt,
            attendance: new Set(),
            records: []
        });

        const frontendUrl = (
            process.env.FRONTEND_URL || "http://localhost:5173"
        ).replace(/\/$/, "");

        const studentUrl =
            `${frontendUrl}/student?token=${token}`;

        const qrCode = await QRCode.toDataURL(studentUrl);

        res.json({
            message: "Attendance session started.",
            token,
            managementKey,
            qrCode,
            expiresAt,
            teacherAccuracy: Number.isFinite(teacherAccuracy)
                ? teacherAccuracy
                : null
        });

    } catch (error) {
        console.error("Session creation error:", error);

        res.status(500).json({
            message: "Could not generate QR code."
        });
    }
});

// Student marks attendance
app.post("/api/attendance/verify", (req, res) => {
    const {
        token,
        studentLat,
        studentLon,
        studentId,
        studentAccuracy
    } = req.body;

    if (
        !token ||
        typeof studentId !== "string" ||
        !studentId.trim() ||
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
    // Check GPS accuracy before calculating distance
if (
    !Number.isFinite(session.teacherAccuracy) ||
    !Number.isFinite(studentAccuracy) ||
    session.teacherAccuracy > MAX_GPS_ACCURACY ||
    studentAccuracy > MAX_GPS_ACCURACY
) {
    return res.status(422).json({
        success: false,
        message: "GPS signal is too inaccurate. Please try again in a location with a better GPS signal.",
        teacherAccuracy: session.teacherAccuracy,
        studentAccuracy
    });
}
    const cleanStudentId = studentId.trim();

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
            distance: Math.round(distance),
            teacherAccuracy: session.teacherAccuracy,
            studentAccuracy: Number.isFinite(studentAccuracy)
                ? studentAccuracy
                : null
        });
    }

    if (session.attendance.has(cleanStudentId)) {
        return res.status(409).json({
            success: false,
            message: "Attendance already marked.",
            distance: Math.round(distance)
        });
    }

    const markedAt = new Date().toISOString();

    session.attendance.add(cleanStudentId);

    session.records.push({
        studentId: cleanStudentId,
        markedAt,
        distance: Math.round(distance),
        studentAccuracy: Number.isFinite(studentAccuracy)
            ? studentAccuracy
            : null
    });

    res.json({
        success: true,
        message: "Attendance marked successfully!",
        distance: Math.round(distance),
        markedAt,
        teacherAccuracy: session.teacherAccuracy,
        studentAccuracy: Number.isFinite(studentAccuracy)
            ? studentAccuracy
            : null
    });
});

// Teacher retrieves attendance for a particular QR session
app.get("/api/attendance/list/:token", (req, res) => {
    const { token } = req.params;
    const managementKey = req.headers["x-teacher-key"];

    const session = sessions.get(token);

    if (!session) {
        return res.status(404).json({
            message: "Attendance session not found."
        });
    }

    if (
        !managementKey ||
        managementKey !== session.managementKey
    ) {
        return res.status(403).json({
            message: "Teacher access denied."
        });
    }

    res.json({
        success: true,
        total: session.records.length,
        records: session.records,
        teacherAccuracy: session.teacherAccuracy,
        expiresAt: session.expiresAt
    });
});

// Backend health check
app.get("/", (req, res) => {
    res.send("CampusPass Backend is Running!");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`CampusPass server running on port ${PORT}`);
});
