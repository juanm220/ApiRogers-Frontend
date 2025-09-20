// src/components/NavBar.jsx — polished navbar
import React, { useEffect, useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import '../styles.css';

function NavBar() {
  const navigate = useNavigate();

  // If using localStorage for token/role
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');

  const [locations, setLocations] = useState([]);
  const [selectedLoc, setSelectedLoc] = useState('');

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    navigate('/login');
  };

  useEffect(() => {
    if (!token) return;
    axios
      .get('http://localhost:4000/api/locations', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setLocations(res.data))
      .catch((err) => console.error('Error fetching locations in NavBar:', err));
  }, [token]);

  const handleLocationChange = (e) => {
    const locId = e.target.value;
    setSelectedLoc(locId);
    if (locId) navigate(`/locations/${locId}`);
  };

  return (
    <header className="navbar">
      {/* Brand (white text like the Hawking Team sign) */}
      <Link to="/dashboard" className="brand" aria-label="Go to Dashboard">
        <span className="brand-mark" aria-hidden="true" />
        <h1 className="brand-title">Hawking Team</h1>
      </Link>

      {/* Right-side actions */}
      <nav className="nav-right" aria-label="Primary">
        <NavLink to="/home" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          Home
        </NavLink>
        {(role === 'admin' || role === 'superuser') && (
          <NavLink to="/dashboard" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            Dashboard
          </NavLink>
        )}
        {(role === 'admin' || role === 'superuser') && (
          <>
            <NavLink to="/admin/users" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              Admin Users
            </NavLink>
            <NavLink to="/fridge-settings" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              Ajustes Neveras
            </NavLink>
          </>
        )}

        {locations.length > 0 && (
          <select
            className="nav-select"
            aria-label="Cambiar Locación"
            value={selectedLoc}
            onChange={handleLocationChange}
          >
            <option value="">— Cambiar Locación —</option>
            {locations.map((loc) => (
              <option key={loc._id} value={loc._id}>
                {loc.name}
              </option>
            ))}
          </select>
        )}

        {token && (
          <button type="button" className="nav-btn nav-btn--danger" onClick={handleLogout}>
            Logout
          </button>
        )}
      </nav>
    </header>
  );
}

export default NavBar;


