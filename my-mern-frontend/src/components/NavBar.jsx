// src/components/NavBar.jsx
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import '../styles.css';

function NavBar() {
  const navigate = useNavigate();

  // If using localStorage for token:
  const token = localStorage.getItem('token');
  // If you store role in localStorage or Redux:
  const role = localStorage.getItem('role'); 

  // location options
  const [locations, setLocations] = useState([]);
  const [selectedLoc, setSelectedLoc] = useState('');

  const handleLogout = () => {
    // Clear token & role from localStorage (or dispatch a Redux logout if you prefer)
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    navigate('/login');
  };

  useEffect(() => {
    if (!token) return;
    // Fetch all or assigned locations for the dropdown
    axios.get('http://localhost:4000/api/locations', {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(res => {
      setLocations(res.data);
    })
    .catch(err => console.error('Error fetching locations in NavBar:', err));
  }, [token]);

  // On select a location from dropdown => navigate to its page
  const handleLocationChange = (e) => {
    const locId = e.target.value;
    setSelectedLoc(locId);
    if (locId) {
      navigate(`/locations/${locId}`);
    }
  };

  return (
    <div className="navbar">
      <h1>Hawking Team</h1>
      <div className="nav-right">
        {/* Link to Home, Dashboard, or whichever pages */}
        <Link style={{ marginRight: '1rem' }} to="/home">Home</Link>
        <Link style={{ marginRight: '1rem' }} to="/dashboard">Dashboard</Link>
        {/* If user is admin or superuser, show AdminUserPage link */}
        {(role === 'admin' || role === 'superuser') && (
          <><Link style={{ marginRight: '1rem' }} to="/admin/users">
            Admin Users
          </Link>
          <Link style={{ marginRight: '1rem' }} to="/fridge-settings">
            Ajustes Neveras
          </Link></>
        )}

        {/* If we have locations, show a dropdown */}
        {locations.length > 0 && (
          <select value={selectedLoc} onChange={handleLocationChange}>
            <option value="">--Cambiar Locación--</option>
            {locations.map((loc) => (
              <option key={loc._id} value={loc._id}>
                {loc.name}
              </option>
            ))}
          </select>
        )}

        {/* Logout button if there's a token */}
        {token && (
          <button onClick={handleLogout} style={{ marginLeft: '1rem' }}>
            Logout
          </button>
        )}
      </div>
    </div>
  );
}

export default NavBar;
