// src/apiService.js
import axios from 'axios';

// Quita slashes finales por sanidad (http://x.com/ -> http://x.com)
const fromEnv = (process.env.REACT_APP_API_BASE || '').replace(/\/+$/, '');

// Si hay env -> usa `${env}/api`. Si no, usa ruta relativa "/api"
const baseURL = fromEnv ? `${fromEnv}/api` : '/api';

const API = axios.create({ baseURL });

// Adjunta token si existe
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default API;
