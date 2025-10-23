// src/components/NavBar.jsx
import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import API from '../apiService';
import KeepAliveToggle from './keepAliveToggle';
import ThemeToggle from './ThemeToggle';
import '../styles.css';

function NavBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const menuRef = useRef(null);

  // If using localStorage for token/role
  const token = localStorage.getItem('token');
  const role  = localStorage.getItem('role');

  const [locations, setLocations] = useState([]);
  const [selectedLoc, setSelectedLoc] = useState('');
  const [open, setOpen] = useState(false); // 👈 móvil: estado del menú

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    setOpen(false);
    navigate('/login');
  };

  useEffect(() => {
    if (!token) return;
    API.get('/locations')
      .then((res) => setLocations(res.data))
      .catch((err) => console.error('Error fetching locations in NavBar:', err));
  }, [token]);

  const handleLocationChange = (e) => {
    const locId = e.target.value;
    setSelectedLoc(locId);
    setOpen(false);
    if (locId) navigate(`/locations/${locId}`);
  };

  // Cierra menú al cambiar de ruta
  useEffect(() => { setOpen(false); }, [location.pathname]);

  // Cierra con click fuera
  useEffect(() => {
    function onDocClick(e) {
      if (!open) return;
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // Cierra con ESC
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const isAdmin = role === 'admin' || role === 'superuser';

  return (
    <header className="navbar" role="banner">
      {/* Brand */}
      <Link to="/summary" className="brand" aria-label="Ir al Dashboard summary">
        <span className="brand-mark" aria-hidden="true" />
        <h1 className="brand-title">Hawking Team</h1>
      </Link>

      {/* Botón Hamburger (solo móvil via CSS) */}
      <button
        type="button"
        className="nav-toggle"
        aria-label={open ? 'Cerrar navegación' : 'Abrir navegación'}
        aria-expanded={open ? 'true' : 'false'}
        aria-controls="primary-nav"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="nav-toggle-bar" />
        <span className="nav-toggle-bar" />
        <span className="nav-toggle-bar" />
      </button>

      {/* Desktop nav */}
      <nav className="nav-right" aria-label="Principal" id="primary-nav">
        <NavLink to="/home" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          Home
        </NavLink>

        {/* Resumen visible para todos los roles logueados */}
        <NavLink to="/summary" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          Summary Dashboard
        </NavLink>

        {isAdmin && (
          <>
            {/* Historial & Capacidad solo admin/superuser */}
            <NavLink to="/history-capacity" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              Historical & capacity
            </NavLink>
          </>
        )}
        {/* Transferencias */}
        {isAdmin && (
          <NavLink to="/transfers" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            Transfers
          </NavLink>
        )}
        {/* Administrar usuarios // fridges */}
        {isAdmin && (
          <>
            <NavLink to="/admin/users" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              Admin Users
            </NavLink>
            <NavLink to="/fridge-settings" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              Settings fridges
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
              <option key={loc._id} value={loc._id}>{loc.name}</option>
            ))}
          </select>
        )}

        <KeepAliveToggle />
        <ThemeToggle />

        {token && (
          <button type="button" className="nav-btn nav-btn--danger" onClick={handleLogout}>
            Logout
          </button>
        )}
      </nav>

      {/* Mobile dropdown (se muestra con media query) */}
      <div
        ref={menuRef}
        className={`mobile-menu${open ? ' is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Menú de navegación"
      >
        <div className="mobile-menu-inner">
          <NavLink to="/home" className="nav-link" onClick={() => setOpen(false)}>Home</NavLink>

          {/* Resumen visible para todos */}
          <NavLink to="/summary" className="nav-link" onClick={() => setOpen(false)}>Summary</NavLink>

          {isAdmin && (
            <NavLink to="/history-capacity" className="nav-link" onClick={() => setOpen(false)}>
              Hitorical and Capacity
            </NavLink>
          )}

          {isAdmin && (
            <NavLink to="/dashboard" className="nav-link" onClick={() => setOpen(false)}>Dashboard</NavLink>
          )}
          {isAdmin && (
            <NavLink to="/transfers" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              Transfers
            </NavLink>
          )}
          {isAdmin && (
            <>
              <NavLink to="/admin/users" className="nav-link" onClick={() => setOpen(false)}>Admin Users</NavLink>
              <NavLink to="/fridge-settings" className="nav-link" onClick={() => setOpen(false)}>Settings fridges</NavLink>
            </>
          )}

          {locations.length > 0 && (
            <div className="mobile-control">
              <label className="mobile-label">Location</label>
              <select
                className="nav-select"
                aria-label="Cambiar Locación"
                value={selectedLoc}
                onChange={handleLocationChange}
              >
                <option value="">— Change Location —</option>
                {locations.map((loc) => (
                  <option key={loc._id} value={loc._id}>{loc.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="mobile-control">
            <KeepAliveToggle />
          </div>
          <div className="mobile-control">
            <ThemeToggle />
          </div>
        </div>

        {/* Footer fijo: Logout siempre visible */}
        <div className="mobile-footer">
          {token && (
            <button
              type="button"
              className="nav-btn nav-btn--danger mobile-logout"
              onClick={handleLogout}
              aria-label="Cerrar sesión"
            >
              Logout
            </button>
          )}
        </div>
      </div>

      {/* Backdrop para cerrar tocando fuera (solo móvil) */}
      {open && <button className="mobile-backdrop" aria-label="Cerrar" onClick={() => setOpen(false)} />}
    </header>
  );
}

export default NavBar;
