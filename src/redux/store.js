// src/redux/store.js
import { configureStore } from '@reduxjs/toolkit';
import authReducer, { loginSuccess } from './slides/authSlice';
import productsReducer from './slides/productsSlice'; 

// Set up the store with your auth slice
const store = configureStore({
  reducer: {
    auth: authReducer,
    products: productsReducer, 
  },
});

// Rehydrate token/role from localStorage if present
const tokenFromStorage = localStorage.getItem('token');
const roleFromStorage = localStorage.getItem('role');

if (tokenFromStorage) {
  store.dispatch(loginSuccess({
    token: tokenFromStorage,
    role: roleFromStorage,
  }));
}

export default store;
