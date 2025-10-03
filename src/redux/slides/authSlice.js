// src/redux/slices/authSlice.js
import { createSlice } from '@reduxjs/toolkit';
import React from 'react';           // for JSX
import { useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';


const initialState = {
  token: null,
  role: null,
  // anything else (username, email, etc.)
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    loginSuccess: (state, action) => {
      state.token = action.payload.token;
      state.role = action.payload.role; 
    },
    logout: (state) => {
      state.token = null;
      state.role = null;
    }
  }
});

function ProtectedRoute({ children, allowedRoles }) {
    const { token, role } = useSelector((state) => state.auth);
  
    if (!token) {
      return <Navigate to="/login" />;
    }
  
    if (allowedRoles && !allowedRoles.includes(role)) {
      return <Navigate to="/unauthorized" />;
    }
  
    return children;
  }
  

export const { loginSuccess, logout } = authSlice.actions;
export default authSlice.reducer;
