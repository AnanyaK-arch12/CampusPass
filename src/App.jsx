
import { useState, useEffect } from "react";
import Student from "./Student";
import "./App.css";

const API_URL = "https://campuspass-oitp.onrender.com";

function App() {
  const [qrCode, setQrCode] = useState("");
  const [expiresAt, setExpiresAt] = useState(null);
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const [token, setToken] = useState("");
  const [managementKey, setManagementKey] = useState("");
  const [teacherAccuracy, setTeacherAccuracy] = useState(null);

  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [listError, setListError] = useState("");

  // Countdown timer
  useEffect(() => {
    if (!expiresAt) return;

    const updateTimer = () => {
      const seconds = Math.max(
        0,
        Math.ceil((expiresAt - Date.now()) / 1000)
      );

      setRemaining(seconds);
    };

    updateTimer();

    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  // Fetch attendance records every 3 seconds
  useEffect(() => {
    if (!token || !managementKey) return;

    let cancelled = false;

    const fetchAttendance = async () => {
      try {
        const response = await fetch(
          `${API_URL}/api/attendance/list/${token}`,
          {
            headers: {
              "x-teacher-key": managementKey
            }
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Could not load attendance.");
        }

        if (!cancelled) {
          setAttendanceRecords(data.records || []);
          setListError("");
        }
      } catch {
        if (!cancelled) {
          setListError("Could not refresh attendance records.");
        }
      }
    };

    fetchAttendance();

    const interval = setInterval(fetchAttendance, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token, managementKey]);

  // Start attendance session
  const startAttendance = () => {
    setLoading(true);
    setStatus("Getting teacher location...");
    setAttendanceRecords([]);
    setQrCode("");
    setToken("");
    setManagementKey("");
    setExpiresAt(null);
    setTeacherAccuracy(null);
    setListError("");

    if (!navigator.geolocation) {
      setStatus("Geolocation is not supported by this browser.");
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const teacherLat = position.coords.latitude;
          const teacherLon = position.coords.longitude;
          const accuracy = position.coords.accuracy;

          setTeacherAccuracy(accuracy);

          setStatus("Generating attendance QR code...");

          const response = await fetch(
            `${API_URL}/api/attendance/start`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                teacherLat,
                teacherLon,
                teacherAccuracy: accuracy
              })
            }
          );

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.message || "Could not start attendance.");
          }

          setQrCode(data.qrCode);
          setToken(data.token);
          setManagementKey(data.managementKey);
          setExpiresAt(data.expiresAt);
          setRemaining(
            Math.max(0, Math.ceil((data.expiresAt - Date.now()) / 1000))
          );

          setStatus("Attendance session started successfully!");
        } catch (error) {
          setStatus(error.message || "Could not connect to the server.");
        } finally {
          setLoading(false);
        }
      },
      () => {
        setStatus("Unable to get teacher location. Please allow location access.");
        setLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  };

  // Student page
  const params = new URLSearchParams(window.location.search);
  const studentToken = params.get("token");

  if (window.location.pathname === "/student" && studentToken) {
    return <Student />;
  }

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return (
    <div className="campus-container">
      <header className="campus-header">
        <h1>CampusPass</h1>
        <p>Smart QR-Based Attendance System</p>
      </header>

      <main className="attendance-card">
        <h2>Teacher Dashboard</h2>

        <button
          onClick={startAttendance}
          disabled={loading}
        >
          {loading ? "Please wait..." : "Generate Attendance QR"}
        </button>

        {status && <p className="status">{status}</p>}

        {teacherAccuracy !== null && (
          <p>
            Teacher GPS accuracy: ±{Math.round(teacherAccuracy)} metres
          </p>
        )}

        {qrCode && remaining > 0 && (
          <section className="qr-section">
            <h3>Scan to Mark Attendance</h3>

            <img
              src={qrCode}
              alt="Attendance QR Code"
              width="220"
            />

            <p className="timer">
              QR expires in: {minutes}:{String(seconds).padStart(2, "0")}
            </p>
          </section>
        )}

        {qrCode && remaining === 0 && (
          <p className="status">
            This QR code has expired. Generate a new one for the next session.
          </p>
        )}

        {token && (
          <section className="attendance-list">
            <h3>Attendance Records</h3>

            <h2>Total Students: {attendanceRecords.length}</h2>

            {listError && <p>{listError}</p>}

            {attendanceRecords.length === 0 ? (
              <p>No students have marked attendance yet.</p>
            ) : (
              <div>
                {attendanceRecords.map((record, index) => (
                  <div key={`${record.studentId}-${index}`}>
                    <p>
                      <strong>Student ID:</strong> {record.studentId}
                    </p>

                    <p>
                      <strong>Marked at:</strong>{" "}
                      {new Date(record.markedAt).toLocaleTimeString()}
                    </p>

                    <p>
                      <strong>Distance from teacher:</strong>{" "}
                      {record.distance} metres
                    </p>

                    <p>
                      <strong>Student GPS accuracy:</strong>{" "}
                      {record.studentAccuracy == null
                        ? "Unavailable"
                        : `±${Math.round(record.studentAccuracy)} metres`}
                    </p>

                    <hr />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
