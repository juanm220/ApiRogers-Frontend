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

      setMessage('¡Sesión iniciada correctamente!');
      navigate('/dashboard');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Error al iniciar sesión');
    }
  };

  return (
    <div className="auth-page">
      <div className="login-container" role="main" aria-label="Formulario de inicio de sesión">
        <h2>Iniciar Sesión</h2>

        <form onSubmit={handleSubmit} noValidate>
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
              aria-required="true"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Contraseña:</label>
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
            Iniciar Sesión
          </button>

          {message && (
            <p className={message.toLowerCase().includes('error') ? 'error-message' : 'success-message'}>
              {message}
            </p>
          )}
        </form>

        <p style={{ marginTop: 12 }}>
          ¿No tienes cuenta?
          <Link to="/register"> Regístrate aquí</Link>
        </p>
        <p style={{ marginTop: 12 }}>
          ¿Olvidaste tu contraseña? 
          <Link to="/forgot-password">Recupérala aquí</Link>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
