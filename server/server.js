
import process from "node:process";
import express from "express";
import cors from "cors";
import QRCode from "qrcode";
import { randomUUID } from "node:crypto";

const app = express();

app.use(cors());
app.use(express.json());

const sessions = new Map();

const DEMO_MODE = false;
const RADIUS_METRES = 50;
const MAX_GPS_ACCURACY = 50;
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

    return 2 * R * Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
    );
}

// Teacher starts a new attendance session
app.post("/api/attendance/start", async (req, res) => {
    try {
        const {
            teacherLat,
            teacherLon,
            teacherAccuracy
        } = req.body;

        // Validate teacher GPS coordinates and accuracy
        if (
            !Number.isFinite(teacherLat) ||
            !Number.isFinite(teacherLon) ||
            Math.abs(teacherLat) > 90 ||
            Math.abs(teacherLon) > 180 ||
            !Number.isFinite(teacherAccuracy) ||
            teacherAccuracy < 0 ||
            teacherAccuracy > MAX_GPS_ACCURACY
        ) {
            return res.status(400).json({
                message: "Valid teacher location and GPS accuracy are required."
            });
        }

        const token = randomUUID();
        const managementKey = randomUUID();
        const expiresAt = Date.now() + QR_VALIDITY;

        sessions.set(token, {
            managementKey,
            teacherLat,
            teacherLon,
            teacherAccuracy,
            expiresAt,
            attendance: new Set(),
            records: []
        });

        const frontendUrl = (
            process.env.FRONTEND_URL ||
            "http://localhost:5173"
        ).replace(/\/+$/, "");

        const studentUrl =
            `${frontendUrl}/student?token=${token}`;

        const qrCode = await QRCode.toDataURL(studentUrl);

        return res.json({
            message: "Attendance session started.",
            token,
            managementKey,
            qrCode,
            expiresAt,
            teacherAccuracy
        });

    } catch (error) {
        console.error("Session creation error:", error);

        return res.status(500).json({
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

    // Validate student information and GPS coordinates
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
            success: false,
            message: "Valid token, student ID and location are required."
        });
    }

    const session = sessions.get(token);

    if (!session) {
        return res.status(404).json({
            success: false,
            message: "Invalid attendance QR code."
        });
    }

    // Check QR expiry
    if (Date.now() > session.expiresAt) {
        sessions.delete(token);

        return res.status(410).json({
            success: false,
            message: "QR code expired. Attendance not marked."
        });
    }

    const cleanStudentId = studentId.trim();

    // Calculate distance between teacher and student
    const distance = calculateDistance(
        session.teacherLat,
        session.teacherLon,
        studentLat,
        studentLon
    );

    // Real GPS verification
    if (!DEMO_MODE) {

        // Validate teacher and student GPS accuracy
        if (
            !Number.isFinite(session.teacherAccuracy) ||
            !Number.isFinite(studentAccuracy) ||
            session.teacherAccuracy < 0 ||
            studentAccuracy < 0 ||
            session.teacherAccuracy > MAX_GPS_ACCURACY ||
            studentAccuracy > MAX_GPS_ACCURACY
        ) {
            return res.status(422).json({
                success: false,
                message: "GPS signal is too inaccurate.",
                teacherAccuracy: session.teacherAccuracy,
                studentAccuracy
            });
        }

        // Check whether student is within 50 metres
        if (distance > RADIUS_METRES) {
            return res.status(403).json({
                success: false,
                message: "You are not in the same location as your teacher.",
                distance: Math.round(distance),
                teacherAccuracy: session.teacherAccuracy,
                studentAccuracy
            });
        }
    }

    // Prevent duplicate attendance
    if (session.attendance.has(cleanStudentId)) {
        return res.status(409).json({
            success: false,
            message: "Attendance already marked.",
            distance: DEMO_MODE ? null : Math.round(distance)
        });
    }

    const markedAt = new Date().toISOString();

    session.attendance.add(cleanStudentId);

    const record = {
        studentId: cleanStudentId,
        markedAt,
        distance: DEMO_MODE ? null : Math.round(distance),
        studentAccuracy: Number.isFinite(studentAccuracy)
            ? studentAccuracy
            : null,
        locationVerification: DEMO_MODE
            ? "SIMULATED - DEMO MODE"
            : "GPS VERIFIED"
    };

    session.records.push(record);

    return res.json({
        success: true,
        message: DEMO_MODE
            ? "Attendance marked successfully! (DEMO MODE - Location not verified)"
            : "Attendance marked successfully!",
        distance: record.distance,
        markedAt,
        teacherAccuracy: session.teacherAccuracy,
        studentAccuracy: record.studentAccuracy,
        locationVerification: record.locationVerification
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

    // Verify teacher access
    if (
        !managementKey ||
        managementKey !== session.managementKey
    ) {
        return res.status(403).json({
            message: "Teacher access denied."
        });
    }

    return res.json({
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

// Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`CampusPass server running on port ${PORT}`);
});
