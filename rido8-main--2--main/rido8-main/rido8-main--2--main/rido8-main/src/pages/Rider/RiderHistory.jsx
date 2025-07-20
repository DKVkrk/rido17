import React, { useEffect, useState } from "react";
import axios from "../../utils/axios";
import { useNavigate } from "react-router-dom";
import "../../styles/RiderHistory.css";

const RiderHistory = () => {
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchRides = async () => {
      setLoading(true);
      setError(null);
      try {
        // Replace this endpoint with your backend's rider history endpoint
        const token = localStorage.getItem("token");
        const response = await axios.get("/api/user/rider/history", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setRides(response.data.rides || []);
      } catch (err) {
        setError("Could not fetch ride history.");
        setRides([]);
      } finally {
        setLoading(false);
      }
    };
    fetchRides();
  }, []);

  return (
    <div className="rider-history-container">
      <h2>Your Trip History</h2>
      {loading && <div>Loading...</div>}
      {error && <div className="error">{error}</div>}
      {!loading && !error && rides.length === 0 && (
        <div>No rides found.</div>
      )}
      {!loading && !error && rides.length > 0 && (
        <table className="ride-history-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Pickup</th>
              <th>Dropoff</th>
              <th>Fare</th>
              <th>Driver</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rides.map((ride) => (
              <tr key={ride._id}>
                <td>{new Date(ride.completedAt || ride.createdAt).toLocaleString()}</td>
                <td>{ride.pickup?.address || "-"}</td>
                <td>{ride.dropoff?.address || "-"}</td>
                <td>₹{ride.fare}</td>
                <td>{ride.driver?.name || "-"}</td>
                <td>{ride.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button className="back-btn" onClick={() => navigate("/user-home")}>Back to Dashboard</button>
    </div>
  );
};

export default RiderHistory;
