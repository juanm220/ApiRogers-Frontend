import React, { useState } from 'react';
import axios from 'axios';
import '../styles.css';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await axios.post('http://localhost:4000/api/users/forgot-password', { email });
      setMsg('Si el email existe, te enviaremos instrucciones. Revisa también la consola del servidor en modo dev.');
    } catch (err) {
      setMsg(err.response?.data?.message || 'Error al enviar la solicitud.');
    }
  };

  return (
    <div className="auth-page">
      <div className="login-container">
        <h2>Recuperar contraseña</h2>
        <form onSubmit={onSubmit}>
          <div className="form-group">
            <label htmlFor="email">Correo:</label>
            <input
              id="email"
              type="email"
              placeholder="tu@correo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <button type="submit" className="login-btn">Enviar enlace</button>
          {msg && <p className="success-message" style={{ marginTop: 10 }}>{msg}</p>}
        </form>
      </div>
    </div>
  );
}
