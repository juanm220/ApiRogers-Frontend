// src/pages/LoginPage.jsx
import React, { useState } from 'react';
import axios from 'axios';
import API from '../apiService';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { loginSuccess } from '../redux/slides/authSlice';

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  const navigate = useNavigate();
  const dispatch = useDispatch();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await API.post('/users/login', { email, password });

      localStorage.setItem('token', res.data.token);
      localStorage.setItem('role', res.data.user?.role);

      dispatch(loginSuccess({
        token: res.data.token,
        role: res.data.user?.role
      }));

      setMessage('Session successfully logged in!');
      navigate('/summary');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Error al iniciar sesión');
    }
  };

  return (
    <div className="auth-page">
      <div className="login-container" role="main" aria-label="Formulario de inicio de sesión">
        <h2>Login</h2>

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="email">Mail:</label>
            <input
              id="email"
              type="email"
              placeholder="you@mail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              aria-required="true"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password:</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              aria-required="true"
            />
          </div>

          <button type="submit" className="login-btn">
            Login
          </button>

          {message && (
            <p
              role="status"
              aria-live="polite"
              className={message.toLowerCase().includes('error') ? 'error-message' : 'success-message'}
            >
              {message}
            </p>
          )}
        </form>
        <p style={{ marginTop: 12 }}>
          Don´t have an account?
          <Link to="/register"> Register here</Link>
        </p>
        <p style={{ marginTop: 12 }}>
          Forgot your password? 
          <Link to="/forgot-password">Recover it here</Link>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
