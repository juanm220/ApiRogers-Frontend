// src/pages/RegisterPage.jsx
import React, { useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import '../styles.css';

function RegisterPage() {
  const [form, setForm] = useState({ name: '', lastname: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setErr('');
    setOk('');
    setLoading(true);
    try {
      const res = await axios.post('http://localhost:4000/api/users/register', form);
      setOk(res.data?.message || '¡Registro exitoso!');
      // redirige al login tras un pequeño respiro visual
      setTimeout(() => navigate('/login'), 700);
    } catch (error) {
      setErr(error.response?.data?.message || 'Error registrando usuario');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div
        className="login-container"
        role="dialog"
        aria-labelledby="register-title"
        aria-describedby="register-desc"
      >
        <h2 id="register-title">Crear cuenta</h2>
        <p id="register-desc">Completa los campos para registrar un usuario.</p>

        {err && <div className="error-message" role="alert">{err}</div>}
        {ok  && <div className="success-message" role="status">{ok}</div>}

        <form onSubmit={handleRegister} autoComplete="off">
          <div className="form-group">
            <label htmlFor="name">Nombre</label>
            <input
              id="name"
              type="text"
              placeholder="Ada"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="lastname">Apellido</label>
            <input
              id="lastname"
              type="text"
              placeholder="Lovelace"
              value={form.lastname}
              onChange={(e) => setForm({ ...form, lastname: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Correo</label>
            <input
              id="email"
              type="email"
              placeholder="nombre@empresa.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </div>

          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? 'Registrando…' : 'Crear cuenta'}
          </button>
        </form>

        <p style={{ marginTop: 12 }}>
          ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
        </p>
      </div>
    </div>
  );
}

export default RegisterPage;
