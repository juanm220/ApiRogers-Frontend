// src/App.jsx;
import './App.css';
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './styles.css'; // import the single CSS file here

// If using Redux:
import { Provider } from 'react-redux';
import store from './redux/store';  // if you have a store
import { loginSuccess } from './redux/slides/authSlice';

// Components
import ProtectedRoute from './components/ProtectedRoute';

// Pages
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import HomePage from './pages/HomePage';
import DashboardPage from './pages/DashboardPage';
import AdminUsersPage from './pages/AdminUserPage';
import LocationPage from './pages/LocationPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import FridgeSettingsPage from './pages/FridgeSettingsPage';
import LocationSummaryPage from './pages/LocationSummaryPage';
import HistoryCapacityPage from './pages/HistoryCapacityPage';
import TransfersPage from './pages/TransfersPage';

//import FridgePage from './pages/FridgePage';
//import SummaryPage from './pages/SummaryPage';


const savedToken = localStorage.getItem('token');
const savedRole = localStorage.getItem('role');
if (savedToken && savedRole) {
  store.dispatch(loginSuccess({ token: savedToken, role: savedRole }));
}

function App() {
  const defaultPath = savedToken && savedRole ? '/home' : '/login';
  return (
    // Single Router
    <Provider store={store}>
      <Router>
        <Routes>

          {/* Public */}
            {/* <- clave: define raíz */}
          <Route path="/" element={<Navigate to={defaultPath} replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Protected */}
          <Route 
            path="/home" 
            element={
              <ProtectedRoute allowedRoles={['admin','superuser', 'user']}>
                <HomePage />
              </ProtectedRoute>
            } 
          />
          <Route
            path="/summary"
            element={
              <ProtectedRoute allowedRoles={['admin','superuser','user']}>
                <LocationSummaryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/history-capacity"
            element={
              <ProtectedRoute allowedRoles={['admin','superuser']}>
                <HistoryCapacityPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/transfers"
            element={
              <ProtectedRoute allowedRoles={['admin','superuser']}>
                <TransfersPage />
              </ProtectedRoute>
            }
          />
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute allowedRoles={['admin','superuser']}>
                <DashboardPage />
              </ProtectedRoute>
            } 
          />
          
          <Route
            path="/fridge-settings"
            element={
              <ProtectedRoute allowedRoles={['admin','superuser', 'user']}>
                <FridgeSettingsPage />
              </ProtectedRoute>
            }
          />

          {/* Location routes */}
          <Route
            path="/locations/:locationId"
            element={
              <ProtectedRoute allowedRoles={['admin','superuser', 'user']}>
                <LocationPage />
              </ProtectedRoute>
            }
          />
          {/* <Route
            path="/locations/:locationId/fridge/:fridgeId"
            element={
              <ProtectedRoute>
                <FridgePage />
              </ProtectedRoute>
            }
          /> */}
          {/* <Route
            path="/locations/:locationId/summary"
            element={
              <ProtectedRoute>
                <SummaryPage />
              </ProtectedRoute>
            }
          /> */}

          {/* Admin only */}
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminUsersPage />
              </ProtectedRoute>
            }
          />

          {/* 404 fallback */}
          <Route path="*" element={<h2>404 Not Found</h2>} />
        </Routes>
      </Router>
    </Provider>
  );
}

export default App;

