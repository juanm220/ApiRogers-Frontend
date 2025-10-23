import React, { useState } from 'react';
import axios from 'axios';
import API from '../apiService';
import '../styles.css';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await API.post('/users/forgot-password', { email });
      setMsg('If the email address exists, we will send you instructions. Also, check the server console in dev mode.');
    } catch (err) {
      setMsg(err.response?.data?.message || 'Error to send the request.');
    }
  };

  return (
    <div className="auth-page">
      <div className="login-container">
        <h2>Recover password </h2>
        <form onSubmit={onSubmit}>
          <div className="form-group">
            <label htmlFor="email">Mail:</label>
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
          <button type="submit" className="login-btn">Send Link</button>
          {msg && <p className="success-message" style={{ marginTop: 10 }}>{msg}</p>}
        </form>
      </div>
    </div>
  );
}
