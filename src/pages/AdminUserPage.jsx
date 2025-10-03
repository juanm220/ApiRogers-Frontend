// src/pages/AdminUsersPage.jsx — con modal inline para editar usuarios
import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import NavBar from '../components/NavBar';

/* Modal accesible para editar usuario (inline, sin ruta nueva) */
function UserEditModal({ open, onClose, user, onSaved, token, locations }) {
  const [form, setForm] = useState({
    name: '',
    lastname: '',
    email: '',
    role: 'user',
    password: '',
    confirm: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const cardRef = useRef(null);

  useEffect(() => {
    if (open && user) {
      setForm({
        name: user.name || '',
        lastname: user.lastname || '',
        email: user.email || '',
        role: (user.role || 'user').toLowerCase(),
        password: '',
        confirm: ''
      });
      setError('');
    }
  }, [open, user]);

  // Cierra con ESC y click en backdrop
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !user) return null;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const roles = ['admin', 'superuser', 'user'];

  const handleSave = async () => {
    setError('');
    // Validaciones básicas
    if (!form.name.trim()) return setError('El nombre es obligatorio');
    if (!form.email.trim()) return setError('El email es obligatorio');
    if (form.password || form.confirm) {
      if (form.password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres');
      if (form.password !== form.confirm) return setError('Las contraseñas no coinciden');
    }

    const payload = {
      name: form.name.trim(),
      lastname: form.lastname.trim(),
      email: form.email.trim(),
      role: form.role.trim().toLowerCase(),
    };
    if (form.password) payload.password = form.password; // opcional: backend debe permitirlo

    try {
      setSaving(true);
      const r = await axios.put(`http://localhost:4000/api/users/${user._id}`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const updated = r.data?.data || { ...user, ...payload };
      onSaved?.(updated);
      onClose?.();
    } catch (err) {
      console.error('Save user error', err);
      setError(err?.response?.data?.error || 'No se pudo guardar el usuario');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="editUserTitle" onClick={(e)=>{ if(e.target===e.currentTarget) onClose?.(); }}>
      <div className="modal-card card" ref={cardRef}>
        <div className="modal-head">
          <h3 id="editUserTitle" className="m0">Editar usuario</h3>
          <button className="btn btn--ghost" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <div className="modal-body">
          {error && <div className="alert alert--danger">{error}</div>}
          <div className="grid-2">
            <div>
              <label>Nombre</label>
              <input type="text" value={form.name} onChange={(e)=>set('name', e.target.value)} />
            </div>
            <div>
              <label>Apellido</label>
              <input type="text" value={form.lastname} onChange={(e)=>set('lastname', e.target.value)} />
            </div>
            <div>
              <label>Email</label>
              <input type="text" value={form.email} onChange={(e)=>set('email', e.target.value)} />
            </div>
            <div>
              <label>Rol</label>
              <select value={form.role} onChange={(e)=>set('role', e.target.value)}>
                {roles.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          <div className="divider" />

          <details>
            <summary><strong>Cambiar contraseña (opcional)</strong></summary>
            <div className="grid-2" style={{ marginTop: 8 }}>
              <div>
                <label>Nueva contraseña</label>
                <input type="password" value={form.password} onChange={(e)=>set('password', e.target.value)} />
              </div>
              <div>
                <label>Confirmar</label>
                <input type="password" value={form.confirm} onChange={(e)=>set('confirm', e.target.value)} />
              </div>
            </div>
          </details>

          <div className="hint">Si dejas la contraseña vacía, se mantiene la actual.</div>
        </div>

        <div className="modal-foot">
          <button className="btn btn--secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn" onClick={handleSave} disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
        </div>
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const token = useSelector((state) => state.auth.token);

  useEffect(() => {
    axios.get('http://localhost:4000/api/users/all', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setUsers(Array.isArray(res.data) ? res.data : res.data?.data || []))
      .catch(err => console.error('Error fetching users:', err));

    axios.get('http://localhost:4000/api/locations', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setLocations(Array.isArray(res.data) ? res.data : res.data?.data || []))
      .catch(err => console.error('Error fetching locations:', err));
  }, [token]);

  // Normaliza comparación de locations
  const locIdStr = (x) => String(x?._id || x);

  const filteredUsers = useMemo(() => {
    const q = (searchTerm || '').toLowerCase();
    return (users || []).filter(u => {
      const name = u.name ?? '';
      const lastname = u.lastname ?? '';
      const email = u.email ?? '';
      const role = u.role ?? '';
      const fullName = `${name} ${lastname}`.toLowerCase();
      return fullName.includes(q) || email.toLowerCase().includes(q) || role.toLowerCase().includes(q);
    });
  }, [users, searchTerm]);

  const handleLocationToggle = async (userId, locationId, isAssigned) => {
    try {
      if (!isAssigned) {
        await axios.put(
          `http://localhost:4000/api/locations/${locationId}/assign-user`,
          { userId },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setUsers(prev => prev.map(u => u._id === userId ? { ...u, locations: [...(u.locations||[]), locationId] } : u));
      } else {
        await axios.put(
          `http://localhost:4000/api/locations/${locationId}/remove-user`,
          { userId },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setUsers(prev => prev.map(u => u._id === userId ? { ...u, locations: (u.locations||[]).filter(l => locIdStr(l) !== String(locationId)) } : u));
      }
    } catch (err) {
      console.error('Error toggling location assignment:', err);
    }
  };

  const handleDelete = async (userId) => {
    if (!window.confirm('¿Eliminar usuario?')) return;
    try {
      await axios.delete(`http://localhost:4000/api/users/${userId}`, { headers: { Authorization: `Bearer ${token}` } });
      setUsers(prev => prev.filter(u => u._id !== userId));
    } catch (err) {
      console.error(err);
    }
  };

  const openEdit = (user) => setEditingUser(user);
  const closeEdit = () => setEditingUser(null);
  const onSaved = (updated) => setUsers(prev => prev.map(u => u._id === updated._id ? { ...u, ...updated } : u));

  return (
    <div className="main-container">
      <NavBar />
      <h2>Admin Users</h2>

      <div className="card" style={{ display:'flex', gap:8, alignItems:'center' }}>
        <input
          type="text"
          placeholder="Buscar usuario..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ maxWidth: 320 }}
        />
      </div>

      <div style={{ overflowX:'auto' }}>
        <table className="table-excel" style={{ minWidth: 980 }}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Apellido</th>
              <th>Rol</th>
              <th>Email</th>
              <th>Locations</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map(user => {
              const userLocs = Array.isArray(user.locations) ? user.locations : [];
              return (
                <tr key={user._id}>
                  <td>{user.name}</td>
                  <td>{user.lastname}</td>
                  <td>{user.role}</td>
                  <td>{user.email}</td>
                  <td>
                    {locations.map(loc => {
                      const isAssigned = userLocs.map(locIdStr).includes(String(loc._id));
                      return (
                        <label key={loc._id} style={{ marginRight: 8, display:'inline-flex', alignItems:'center', gap:4 }}>
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
                    <button className="btn" onClick={() => openEdit(user)}>Editar</button>
                    <button className="btn btn--danger" onClick={() => handleDelete(user._id)}>Eliminar</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <UserEditModal
        open={!!editingUser}
        onClose={closeEdit}
        user={editingUser}
        onSaved={onSaved}
        token={token}
        locations={locations}
      />
    </div>
  );
}


