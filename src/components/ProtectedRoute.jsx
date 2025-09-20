// src/components/ProtectedRoute.jsx
import React, { useMemo as ApplyMemo } from 'react';
import { useSelector } from 'react-redux';
import { Navigate, useLocation } from 'react-router-dom';

const norm = (s='') => String(s).toLowerCase().replace(/[\s_-]+/g, '');

function hasAllowedRole(userRoles = [], allowed = []) {
  if (!allowed || allowed.length === 0) return true; // si no pides roles, basta con tener token
  const allowedN = allowed.map(norm);
  const userN = userRoles.map(norm);
  return userN.some(r => allowedN.includes(r));
}

export default function ProtectedRoute({ children, allowedRoles = [] }) {
  const location = useLocation();
  const token = useSelector((s) => s.auth?.token);
  const roleFromStore = useSelector((s) => s.auth?.role);
  const roleFromLS = typeof localStorage !== 'undefined' ? localStorage.getItem('role') : null;

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const userRoles = ApplyMemo(
    () => [roleFromStore, roleFromLS].filter(Boolean),
    [roleFromStore, roleFromLS]
  );

  if (!hasAllowedRole(userRoles, allowedRoles)) {
    // sin permiso → manda a /home (o a una página 403 si la tienes)
    return <Navigate to="/home" replace state={{ from: location, forbidden: true }} />;
  }

  return children;
}
