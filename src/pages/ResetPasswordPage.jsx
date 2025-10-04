import React, { useState, useMemo } from 'react';
import axios from 'axios';
import API from '../apiService';
import { useSearchParams, Link } from 'react-router-dom';
import '../styles.css';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = useMemo(() => params.get('token') || '', [params]);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg('');
    if (password !== confirm) {
      setMsg('Las contraseñas no coinciden.');
      return;
    }
    try {
      await API.post('/users/reset-password', { token, password });
      setMsg('Contraseña actualizada. Ya puedes iniciar sesión.');
    } catch (err) {
      setMsg(err.response?.data?.message || 'Error al actualizar la contraseña.');
    }
  };

  return (
    <div className="auth-page">
      <div className="login-container">
        <h2>Crear nueva contraseña</h2>
        <form onSubmit={onSubmit}>
          <div className="form-group">
            <label htmlFor="password">Nueva contraseña:</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="confirm">Confirmar contraseña:</label>
            <input
              id="confirm"
              type="password"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <button type="submit" className="login-btn">Actualizar</button>
          {msg && <p className={msg.toLowerCase().includes('error') ? 'error-message' : 'success-message'} style={{ marginTop: 10 }}>{msg}</p>}
          {msg && !msg.toLowerCase().includes('error') && (
            <p style={{ marginTop: 10 }}>
              <Link to="/login">Ir al login</Link>
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
