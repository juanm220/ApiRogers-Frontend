// src/pages/RegisterPage.jsx
import React, { useState } from 'react';
import axios from 'axios';
import NavBar from '../components/NavBar';
import { useNavigate } from 'react-router-dom';

function RegisterPage() {
  const [name, setName] = useState('');
  const [lastname, setLastname] = useState('');
  const [email, setEmail]   = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post('http://localhost:4000/api/users/register', {
        name, lastname, email, password
      });
      setMessage(res.data.message || 'Registered successfully!');
      // maybe navigate to /login:
      navigate('/login');
    } catch (err) {
      setMessage(err.response?.data?.message || 'Error registering');
    }
  };


  return (
    <div>
      <NavBar />
      <h2>Register Page</h2>
      <form onSubmit={handleRegister}>
        <label>Name:</label>
        <input 
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <br />
        <label>Last Name:</label>
        <input 
          value={lastname}
          onChange={(e) => setLastname(e.target.value)}
          required
        />
        <br />
        <label>Email:</label>
        <input 
          type="email" 
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <br />
        <label>Password:</label>
        <input 
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <br />
        <button type="submit">Register</button>
      </form>
      <p>{message}</p>
    </div>
  );
}

export default RegisterPage;