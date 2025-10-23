// src/pages/RegisterPage.jsx
import React, { useState } from 'react';
import API from '../apiService';
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

    // 👇 normaliza ANTES de enviar
    const payload = {
      name: form.name.trim(),
      lastname: form.lastname.trim(),
      email: form.email.trim().toLowerCase(),
      password: form.password, // no trim a passwords
    };

    try {
      const res = await API.post('/users/register', payload, {
        // timeouts y cancelables si quieres
      });
      setOk(res.data?.message || '¡Registro exitoso!');
      setTimeout(() => navigate('/login'), 600);
    } catch (error) {
      const status = error?.response?.status;
      const msg =
        status === 409
          ? 'Ese correo ya está registrado.'
          : error?.response?.data?.message || 'Error registrando usuario';
      setErr(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="login-container" role="dialog" aria-labelledby="register-title" aria-describedby="register-desc">
        <h2 id="register-title">Create account</h2>
        <p id="register-desc">Please complete all fields to create an user</p>

        {err && <div className="error-message" role="alert">{err}</div>}
        {ok  && <div className="success-message" role="status">{ok}</div>}

        <form onSubmit={handleRegister} autoComplete="off">
          <div className="form-group">
            <label htmlFor="name">Name</label>
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
            <label htmlFor="lastname">Lastname</label>
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
            <label htmlFor="email">Mail</label>
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
            <label htmlFor="password">Password</label>
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
          Do you have an account? <Link to="/login"> Login </Link>
        </p>
      </div>
    </div>
  );
}

export default RegisterPage;
