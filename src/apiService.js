// src/apiService.js
import axios from 'axios';

// Quita slashes finales por sanidad (http://x.com/ -> http://x.com)
const fromEnv = (process.env.REACT_APP_API_BASE || '').replace(/\/+$/, '');

// Si hay env -> usa `${env}/api`. Si no, usa ruta relativa "/api"
const baseURL = fromEnv ? `${fromEnv}/api` : '/api';

const API = axios.create({
  baseURL,
  timeout: 15000,          // evita requests colgados
  // withCredentials: true, // úsalas SOLO si vas con cookies/sesiones
});
const BACKEND_BASE = fromEnv || ''; // p.ej. https://...onrender.com

export function fetchBackend(path, options) {
  const url = `${BACKEND_BASE}/${String(path).replace(/^\/+/, '')}`;
  return fetch(url, options);
}

// Uso: fetchBackend('/health');
// Adjunta token si existe

API.interceptors.response.use(
  r => r,
  err => {
    // silencia aborts AbortController
    if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return Promise.reject(err);
    console.error('API error:', err?.response?.status, err?.response?.data || err.message);
    return Promise.reject(err);
  }
);



export default API;
