
import { useState } from "react";

function Student() {
  const [studentId, setStudentId] = useState("");
  const [status, setStatus] = useState("Ready to mark attendance");
  const [loading, setLoading] = useState(false);

  const markAttendance = () => {
    const token = new URLSearchParams(window.location.search).get("token");

    if (!token) {
      setStatus("QR token is missing. Please scan a valid QR code.");
      return;
    }

    if (!studentId.trim()) {
      setStatus("Please enter your student ID.");
      return;
    }

    if (!navigator.geolocation) {
      setStatus("Location is not supported by this browser.");
      return;
    }

    setLoading(true);
    setStatus("Checking your location...");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const response = await fetch(
            "https://campuspass-oitp.onrender.com/api/attendance/verify",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                token,
                studentId,
                studentLat: position.coords.latitude,
                studentLon: position.coords.longitude,
              }),
            }
          );

          const data = await response.json();
          setStatus(data.message);
        } catch {
          setStatus("Could not connect to the attendance server.");
        } finally {
          setLoading(false);
        }
      },
      () => {
        setLoading(false);
        setStatus("Please allow location permission to mark attendance.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  return (
    <main className="attendance-card">
      <h2>Student Attendance</h2>
      <p>Enter your student ID to verify attendance.</p>

      <input
        type="text"
        placeholder="Enter Student ID"
        value={studentId}
        onChange={(e) => setStudentId(e.target.value)}
      />

      <button onClick={markAttendance} disabled={loading}>
        {loading ? "Verifying..." : "Mark Attendance"}
      </button>

      <div className="status">
        <strong>Status:</strong>
        <p>{status}</p>
      </div>
    </main>
  );
}

export default Student;
