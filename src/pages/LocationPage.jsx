import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import API from '../apiService';
import { useSelector } from 'react-redux';
import NavBar from '../components/NavBar';
import NumberInput from '../components/NumberInput';
import '../styles.css';
import Footer from '../components/Footer';

function LocationPage() {
  const { locationId } = useParams();
  const navigate = useNavigate();
  const standardProducts = useSelector((state) => state.products.standardProducts);
  const token = useSelector((state) => state.auth.token);
  const role = useSelector((state) => state.auth.role);

  const [locationData, setLocationData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState('');
  const [newFridgeName, setNewFridgeName] = useState('');
  const [standardOrder, setStandardOrder] = useState([]);

  // shape: { fridgeId: { "Leche": "3", "Huevos": "7" } }
  const [fridgeEdits, setFridgeEdits] = useState({});
  const inputRefs = useRef({});

  // salto con Enter al siguiente input
  const handleKeyDown = (e, fridgeId, prodIndex) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const nextIndex = prodIndex + 1;
      const nextKey = fridgeId + '-' + nextIndex;
      const nextEl = inputRefs.current[nextKey];
      if (nextEl) nextEl.focus();
    }
  };

  useEffect(() => {
    if (!locationId) {
      setLoading(false);
      return;
    }
    API.get(`/locations/${locationId}`)
      .then(res => {
        setLocationData(res.data);
        setNewName(res.data.name);
        setLoading(false);
        // init edits
        const initEdits = {};
        if (res.data.refrigerators) {
          res.data.refrigerators.forEach(fr => {
            const edits = {};
            fr.products.forEach(p => {
              edits[p.productName] = p.quantity === 0 ? "" : String(p.quantity);
            });
            initEdits[fr._id] = edits;
          });
        }
        setFridgeEdits(initEdits);
      })
      .catch(err => {
        console.error('Error fetching location data:', err);
        setLoading(false);
      });
  }, [locationId, token]);

  useEffect(() => {
    API.get('/config/standard-products')
      .then((res) => {
        const list = res.data?.items ?? res.data?.data?.items ?? [];
        setStandardOrder(list);
      })
      .catch((err) => {
        console.error('Error fetching standard order:', err);
        setStandardOrder([]);
      });
  }, [token]);

  if (loading) return <p>Loading location...</p>;
  if (!locationData) return <p>Location not found or error occurred.</p>;

  // 1) Renombrar locación
  const handleRenameLocation = async () => {
    if (role !== 'admin' && role !== 'superuser') return;
    if (!newName.trim()) return alert('El nombre no puede estar vacío.');
    try {
      const res = await API.put(`/locations/${locationId}`, { name: newName });
      alert(res.data.message || 'Locación renombrada.');
      setLocationData(prev => ({ ...prev, name: newName }));
    } catch (err) {
      console.error(err);
      alert('Error al renombrar la locación.');
    }
  };

  // 2) Eliminar locación
  const handleDeleteLocation = async () => {
    if (role !== 'admin' && role !== 'superuser') return;
    const confirmed = window.confirm('¿Seguro que deseas eliminar esta locación?');
    if (!confirmed) return;
    try {
      await API.delete(`/locations/${locationId}`);
      alert('Locación eliminada.');
      navigate('/home');
    } catch (err) {
      console.error(err);
      alert('Error al eliminar la locación.');
    }
  };

  // 3) Crear refrigerador
  const handleCreateFridge = async () => {
    if (role !== 'admin' && role !== 'superuser') return;
    if (!newFridgeName.trim()) return alert('Nombre del refrigerador es requerido.');
    try {
      const res = await API.post(`/locations/${locationId}/refrigerators`, { name: newFridgeName });
      alert(res.data.message || 'Refrigerador creado.');
      const refetch = await API.get(`/locations/${locationId}`);
      setLocationData(refetch.data);
      setNewFridgeName('');
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || 'Error al crear el refrigerador.');
    }
  };

  // 4) Editar cantidades
  const handleQuantityChange = (fridgeId, productName, newVal) => {
    setFridgeEdits(prev => ({
      ...prev,
      [fridgeId]: {
        ...prev[fridgeId],
        [productName]: newVal
      }
    }));
  };

  // 5) Guardar un refrigerador
  const handleSaveFridge = async (fridge) => {
    const edits = fridgeEdits[fridge._id] || {};
    const productNames = Object.keys(edits);
    try {
      for (let pName of productNames) {
        const quantitySTR = edits[pName];
        const quantity = parseInt(quantitySTR || "0", 10);
        await API.put(`/locations/${locationId}/refrigerators/${fridge._id}/products`, {
          productName: pName,
          quantity
        });
      }
      alert(`Se guardaron los cambios para refrigerador: ${fridge.name}`);
    } catch (err) {
      console.error(err);
      alert('Error al guardar los cambios del refrigerador');
    }
  };

  const handleDeleteFridge = async (fridge) => {
    if (!window.confirm(`Are you sure you want to delete fridge ${fridge.name}?`)) return;
    try {
      await API.delete(`/locations/${locationId}/refrigerators/${fridge._id}`);
      alert('Fridge deleted!');
      const refetch = await API.get(`/locations/${locationId}`);
      setLocationData(refetch.data);
    } catch (err) {
      console.error(err);
      alert('Error deleting fridge.');
    }
  };

  const handleRenameFridge = async (fridge) => {
    const newName = prompt('Enter new fridge name', fridge.name);
    if (!newName) return;
    try {
      const res = await API.put(`/locations/${locationId}/refrigerators/${fridge._id}`, { newName });
      alert(res.data.message || 'Fridge renamed.');
      const refetch = await API.get(`/locations/${locationId}`);
      setLocationData(refetch.data);
    } catch (err) {
      console.error(err);
      alert('Error renaming fridge.');
    }
  };

  // helper para ordenar productos por orden estándar
  const orderIndex = (name) => {
    const i = (standardOrder || []).findIndex(s => String(s).toLowerCase() === String(name).toLowerCase());
    return i === -1 ? 9999 : i;
  };
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return (
    <div className="main-container">
      <NavBar />

      <h2>Location: {locationData.name}</h2>

      {(role === 'admin' || role === 'superuser') && (
        <div className="flex-row stack-sm" style={{ marginBottom: '1rem' }}>
          <div className="flex-row" style={{ gap: 8 }}>
            <label>Renombrar locación:</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={{ width: 280 }}
            />
            <button onClick={handleRenameLocation}>Guardar</button>
          </div>
          <div className="push-right">
            <button className="btn btn--danger" onClick={handleDeleteLocation}>Eliminar locación</button>
          </div>
        </div>
      )}

      <p>Created By: {locationData.createdBy?.name}</p>
      <p>Users assigned: {locationData.users?.length || 0}</p>

      {locationData.refrigerators && locationData.refrigerators.length > 0 ? (
        <div className="fridge-stack">
          {locationData.refrigerators.map((fridge) => (
            <section key={fridge._id} className="card fridge-card">
              <header className="fridge-head">
                <h4 className="fridge-title">
                  <span className="fridge-icon" aria-hidden="true"></span>
                  {fridge.name}
                </h4>
                {fridge.updatedAt && (
                  <small className="fridge-updated">
                    Last updated: {new Date(fridge.updatedAt).toLocaleString()}
                  </small>
                )}

                {(role === 'admin' || role === 'superuser') && (
                  <div className="fridge-actions">
                    <button className="btn btn--secondary" onClick={() => handleRenameFridge(fridge)}>Rename</button>
                    <button className="btn btn--danger" onClick={() => handleDeleteFridge(fridge)}>Delete</button>
                  </div>
                )}
              </header>

              <div className="table-wrap table-wrap--shadow">
                <table className="table-excel">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th className="num">Cantidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {([...fridge.products].sort((a, b) => {
                      const ia = orderIndex(a.productName);
                      const ib = orderIndex(b.productName);
                      if (ia !== ib) return ia - ib;
                      return String(a.productName).localeCompare(String(b.productName));
                    })).map((prod, index) => {
                      const displayVal = fridgeEdits[fridge._id]?.[prod.productName] ?? String(prod.quantity);
                      const refKey = `${fridge._id}-${index}`;
                      return (
                        <tr key={prod.productName}>
                          <td>{prod.productName}</td>
                          <td className="num">
                            <NumberInput
                              ref={(el) => { if (el) inputRefs.current[refKey] = el; }}
                              value={displayVal}
                              onChange={(newVal) => handleQuantityChange(fridge._id, prod.productName, newVal)}
                              onEnter={() => {
                                const nextKey = `${fridge._id}-${index + 1}`;
                                const nextEl = inputRefs.current[nextKey];
                                if (nextEl?.focus) nextEl.focus();
                              }}
                              aria-label={`Cantidad de ${prod.productName}`}

                              // 👇 Fuerza teclado con '+' en móvil, mantiene numérico en desktop
                              inputMode={isMobile ? 'text' : 'decimal'}
                              autoComplete="off"
                              autoCorrect="off"
                              spellCheck={false}
                              pattern="[0-9+\-\s]*"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="fridge-foot">
                <button onClick={() => handleSaveFridge(fridge)}>Guardar cambios</button>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p>No refrigerators in this location yet.</p>
      )}

      {(role === 'admin' || role === 'superuser') && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h4>Crear nuevo refrigerador</h4>
          <div className="flex-row stack-sm">
            <input
              type="text"
              placeholder="Nombre del refrigerador"
              value={newFridgeName}
              onChange={(e) => setNewFridgeName(e.target.value)}
              style={{ maxWidth: 360 }}
            />
            <button onClick={handleCreateFridge}>Crear</button>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}

export default LocationPage;
