// src/pages/AdminUsersPage.jsx
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import NavBar from '../components/NavBar';
import { useNavigate } from 'react-router-dom';

function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const token = useSelector((state) => state.auth.token);
  const navigate = useNavigate();

  useEffect(() => {
    // 1) Fetch all users
    axios.get('http://localhost:4000/api/users/all', {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(res => setUsers(res.data))
    .catch(err => console.error('Error fetching users:', err));

    // 2) Fetch all locations
    axios.get('http://localhost:4000/api/locations', {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(res => setLocations(res.data))
    .catch(err => console.error('Error fetching locations:', err));
  }, [token]);

  // Filter users by searchTerm
  const filteredUsers = users.filter(u => {
    const name = u.name ?? '';
    const lastname = u.lastname ?? '';
    const email = u.email ?? '';
    const role = u.role ?? '';

    const fullName = `${name} ${lastname}`.toLowerCase();
    return (
      fullName.includes(searchTerm.toLowerCase()) ||
      email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      role.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  // Assign or remove user from a location
  const handleLocationToggle = async (userId, locationId, isAssigned) => {
    try {
      if (!isAssigned) {
        // Assign user
        await axios.put(
          `http://localhost:4000/api/locations/${locationId}/assign-user`,
          { userId },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        // Update local state
        setUsers(prev => prev.map(u => {
          if (u._id === userId) {
            return { ...u, locations: [...u.locations, locationId] };
          }
          return u;
        }));
      } else {
        // Remove user
        await axios.put(
          `http://localhost:4000/api/locations/${locationId}/remove-user`,
          { userId },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        // Update local state
        setUsers(prev => prev.map(u => {
          if (u._id === userId) {
            return { ...u, locations: u.locations.filter(l => l !== locationId) };
          }
          return u;
        }));
      }
    } catch (err) {
      console.error('Error toggling location assignment:', err);
    }
  };

  // Delete user
  const handleDelete = async (userId) => {
    if (!window.confirm('Are you sure to delete user?')) return;
    try {
      await axios.delete(`http://localhost:4000/api/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(prev => prev.filter(u => u._id !== userId));
    } catch (err) {
      console.error(err);
    }
  };

  // Edit user
  const handleEdit = (userId) => {
    navigate(`/admin/edit-user/${userId}`);
  };

  return (
    <div>
      <NavBar />
      <h2>Admin Users</h2>

      <input 
        type="text"
        placeholder="Buscar usuario..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      <table border="1" cellPadding="5" style={{ marginTop: '10px' }}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Last Name</th>
            <th>Role</th>
            <th>Email</th>
            <th>Locations</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredUsers.map(user => (
            <tr key={user._id}>
              <td>{user.name}</td>
              <td>{user.role}</td>
              <td>{user.email}</td>
              <td>{user.lastname}</td>
              <td>
                {/* Checkboxes for each location */}
                {locations.map(loc => {
                  // Check if user is assigned
                  const isAssigned = user.locations.includes(loc._id);
                  return (
                    <label key={loc._id} style={{ marginRight: '5px' }}>
                      <input
                        type="checkbox"
                        checked={isAssigned}
                        onChange={() => handleLocationToggle(user._id, loc._id, isAssigned)}
                      />
                      {loc.name}
                    </label>
                  );
                })}
              </td>
              <td>
                <button onClick={() => handleEdit(user._id)}>Edit</button>
                <button onClick={() => handleDelete(user._id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default AdminUsersPage;
