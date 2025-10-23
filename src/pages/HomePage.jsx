// src/pages/HomePage.jsx
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import API from '../apiService';
import NavBar from '../components/NavBar';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import '../styles.css'; // css structure
import Footer from '../components/Footer';

function HomePage() {
  const [locations, setLocations] = useState([]);
  const [newLocName, setNewLocName] = useState('');
  const [message, setMessage] = useState('');

  const navigate = useNavigate();
  const token = useSelector((state) => state.auth.token);
  const role  = useSelector((state) => state.auth.role); 

  useEffect(() => {
    if (!token) return;
    API.get('/locations')
    .then(res => {
      setLocations(res.data);
    })
    .catch(err => {
      console.error('Error fetching locations:', err);
      setMessage('Error fetching locations');
    });
  }, [token]);

  const handleClick = (locId) => {
    // go to /locations/:locId
    navigate(`/locations/${locId}`);
  };

  // Admin or superuser can create a new location from here
  const handleCreateLocation = async () => {
    if (role !== 'admin' && role !== 'superuser') {
      return alert('No tienes permiso para crear una locación.');
    }
    if (!newLocName.trim()) {
      return alert('El nombre de la locación es requerido.');
    }
    try {
      const res = await API.post('/locations',
        { name: newLocName }
      );
      alert(res.data.message || 'Locación creada.');
      setNewLocName('');

      // Refresh the locations list
      const refresh = await API.get('/locations');
      setLocations(refresh.data);
    } catch (error) {
      console.error('Error creating location:', error);
      alert(error.response?.data?.message || 'Error al crear la locación');
    }
  };

  return (
    <div className="main-container">
      <NavBar />
      
      <h2>Home Page</h2>
      <p>{message}</p>

      {/* List of assigned/all locations */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {locations.map(loc => (
          <button 
            key={loc._id} 
            onClick={() => handleClick(loc._id)}
          >
            {loc.name || loc._id}
          </button>
        ))}
      </div>

      {/* Admin can create new location */}
      {(role === 'admin' || role === 'superuser') && (
        <div style={{ marginTop: '1rem' }}>
          <h4>Create new location</h4>
          <input
            type="text"
            value={newLocName}
            onChange={(e) => setNewLocName(e.target.value)}
            placeholder="Nombre de la locación"
          />
          <button onClick={handleCreateLocation}>
            Create location
          </button>
        </div>
      )}
      <Footer />
    </div>
  );
}

export default HomePage;
