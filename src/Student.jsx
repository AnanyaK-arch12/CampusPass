
import { useState } from "react";

function Student() {
  const [studentId, setStudentId] = useState("");
  const [status, setStatus] = useState("Ready to mark attendance");
  const [loading, setLoading] = useState(false);
  const [distance, setDistance] = useState(null);
  const [accuracy, setAccuracy] = useState(null);

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
    setDistance(null);
    setAccuracy(null);
    setStatus("Checking your location...");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const studentLat = position.coords.latitude;
          const studentLon = position.coords.longitude;

          setAccuracy(Math.round(position.coords.accuracy));

          const response = await fetch(
            "https://campuspass-oitp.onrender.com/api/attendance/verify",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
  token,
  studentId: studentId.trim(),
  studentLat,
  studentLon,
  studentAccuracy: position.coords.accuracy,
}),
            }
          );

          const data = await response.json();

          setStatus(data.message || "Attendance verification failed.");

          if (data.distance !== undefined) {
            setDistance(data.distance);
          }
        } catch {
          setStatus("Could not connect to the attendance server.");
        } finally {
          setLoading(false);
        }
      },
      (error) => {
        setLoading(false);

        if (error.code === 1) {
          setStatus("Please allow location permission.");
        } else if (error.code === 3) {
          setStatus("Location request timed out. Please try again.");
        } else {
          setStatus("Unable to get your location.");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
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

        {distance !== null && (
          <p>
            <strong>Distance from teacher:</strong> {distance} metres
          </p>
        )}

        {accuracy !== null && (
          <p>
            <strong>Your GPS accuracy:</strong> ±{accuracy} metres
          </p>
        )}
      </div>
    </main>
  );
}

export default Student;
