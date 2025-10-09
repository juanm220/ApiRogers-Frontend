import axios from 'axios';

// Quita slashes finales por sanidad (http://x.com/ -> http://x.com)
const fromEnv = (process.env.REACT_APP_API_BASE || '').replace(/\/+$/, '');

// Si hay env -> usa `${env}/api`. Si no, usa ruta relativa "/api" (Vercel rewrites)
const baseURL = fromEnv ? `${fromEnv}/api` : '/api';

const API = axios.create({
  baseURL,
  timeout: 15000,
  // withCredentials: true, // solo si usas cookies en algún flujo
});

// --- 🔐 INTERCEPTOR DE REQUEST: añade el Bearer automáticamente ---
API.interceptors.request.use((cfg) => {
  try {
    const raw = localStorage.getItem('token');
    if (raw) {
      // sanea por si hubiera comillas/espacios (errores comunes)
      const clean = String(raw).trim().replace(/^"+|"+$/g, '');
      cfg.headers = cfg.headers || {};
      cfg.headers['Authorization'] = `Bearer ${clean}`;
    }
  } catch {
    // localStorage inaccesible (SSR) -> ignora
  }
  return cfg;
});

// --- Interceptor de respuesta (tu versión, con pequeño endurecimiento) ---
API.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') {
      return Promise.reject(err);
    }
    console.error('API error:', err?.response?.status, err?.response?.data || err.message);
    return Promise.reject(err);
  }
);

// --- También soporta fetch directo al backend con Authorization ---
const BACKEND_BASE = fromEnv || ''; // p.ej. https://...onrender.com

export async function fetchBackend(path, options = {}) {
  const url = `${BACKEND_BASE}/${String(path).replace(/^\/+/, '')}`;
  const headers = new Headers(options.headers || {});
  try {
    const raw = localStorage.getItem('token');
    if (raw) {
      const clean = String(raw).trim().replace(/^"+|"+$/g, '');
      headers.set('Authorization', `Bearer ${clean}`);
    }
  } catch {}
  return fetch(url, { ...options, headers });
}

export default API;
