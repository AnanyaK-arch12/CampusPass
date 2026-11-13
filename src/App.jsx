import Student from "./Student";
import { useState, useEffect } from "react";
import "./App.css";

function App() {
  
  const [qrCode, setQrCode] = useState("");
  const [expiresAt, setExpiresAt] = useState(null);
  const [remaining, setRemaining] = useState(300);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Ready to start attendance");

  // Add this check immediately after the opening brace
  if (window.location.pathname === "/student") {
    return <Student />;
  }
  
  // Five-minute countdown
  useEffect(() => {
    if (!expiresAt) return;

    const updateTimer = () => {
      const seconds = Math.max(
        0,
        Math.ceil((expiresAt - Date.now()) / 1000)
      );

      setRemaining(seconds);

      if (seconds === 0) {
        setQrCode("");
        setExpiresAt(null);
        setStatus("QR code expired. Generate a new one.");
      }
    };

    updateTimer();

    const timer = setInterval(updateTimer, 1000);

    return () => clearInterval(timer);
  }, [expiresAt]);

  // Get teacher location and generate QR
  const startAttendance = () => {
    if (!navigator.geolocation) {
      setStatus("Geolocation is not supported by this browser.");
      return;
    }

    setLoading(true);
    setStatus("Getting teacher location...");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const teacherLat = position.coords.latitude;
          const teacherLon = position.coords.longitude;

          const response = await fetch(
            "http://localhost:5000/api/attendance/start",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                teacherLat,
                teacherLon,
              }),
            }
          );

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.message || "Could not start attendance.");
          }

          setQrCode(data.qrCode);
          setExpiresAt(data.expiresAt);
          setRemaining(300);
          setStatus("Attendance session started successfully!");
        } catch (error) {
          setStatus(error.message);
        } finally {
          setLoading(false);
        }
      },
      (error) => {
        setLoading(false);

        if (error.code === 1) {
          setStatus("Please allow location permission.");
        } else {
          setStatus("Unable to get your location. Please try again.");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  const minutes = String(Math.floor(remaining / 60)).padStart(2, "0");
  if (new URLSearchParams(window.location.search).get("student") === "1") {
  return <Student />;
}
  const seconds = String(remaining % 60).padStart(2, "0");

  return (
    <div className="campus-container">
      <header className="campus-header">
        <h1>CampusPass</h1>
        <p>Smart Campus Attendance System</p>
      </header>

      <main className="attendance-card">
        <h2>Teacher Dashboard</h2>
        <p>Generate a temporary QR code for student attendance.</p>

        <button
          onClick={startAttendance}
          disabled={loading || Boolean(qrCode)}
        >
          {loading ? "Please wait..." : "Generate Attendance QR"}
        </button>

        {qrCode && (
          <div className="qr-section">
            <h3>Scan to Mark Attendance</h3>

            <img src={qrCode} alt="Attendance QR Code" />

            <h2 className="timer">
              {minutes}:{seconds}
            </h2>

            <p>QR code expires in five minutes.</p>
          </div>
        )}

        <div className="status">
          <strong>Status:</strong>
          <p>{status}</p>
        </div>
      </main>

      <footer>
        CampusPass © 2026
      </footer>
    </div>
  );
}

export default App;
