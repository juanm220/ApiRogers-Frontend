// src/pages/LocationPage.jsx
import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import API from '../apiService';
import { useSelector } from 'react-redux';
import NavBar from '../components/NavBar';
import NumberInput from '../components/NumberInput'; // Our custom component
import '../styles.css';
import Footer from '../components/Footer';

function LocationPage() {
  const { locationId } = useParams();
  const navigate = useNavigate();
  const standardProducts = useSelector((state) => state.products.standardProducts);
  const token = useSelector((state) => state.auth.token);
  const role = useSelector((state) => state.auth.role);
//redux
  const [locationData, setLocationData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState('');
  const [newFridgeName, setNewFridgeName] = useState('');
  const [standardOrder, setStandardOrder] = useState([]); // Orden universal de productos (desde /api/config/standard-products)

  // Instead of numeric, store string:
  // shape: { fridgeId: { "Leche": "3", "Huevos": "7" } }
    // We'll store updated product data in local state for each fridge
  const [fridgeEdits, setFridgeEdits] = useState({});
  // inputRefs.current will be an object mapping "fridgeId-productIndex" => actual input element
  const inputRefs = useRef({}); 
 
  // handleKeyDown to jump to next input
  const handleKeyDown = (e, fridgeId, prodIndex) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Find the next product index
      const nextIndex = prodIndex + 1;
      const nextKey = fridgeId + '-' + nextIndex;
      const nextEl = inputRefs.current[nextKey];
      if (nextEl) {
        nextEl.focus();
      } else {
        // No more products => maybe jump to next fridge or do nothing
      }
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
      setNewName(res.data.name); // set for rename
      setLoading(false);
      // Initialize fridgeEdits with existing quantities
      const initEdits = {};
      if (res.data.refrigerators) {
        res.data.refrigerators.forEach(fr => {
          const edits = {};
          fr.products.forEach(p => {
            // store as string
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

    // Cargar el orden estándar desde backend para ordenar la UI
  useEffect(() => {
    API
      .get('/config/standard-products')
      .then((res) => {
        const list = res.data?.items ?? res.data?.data?.items ?? [];
        setStandardOrder(list);
      })
      .catch((err) => {
        console.error('Error fetching standard order:', err);
        setStandardOrder([]); // fallback
      });
  }, [token]);

  if (loading) return <p>Loading location...</p>;
  if (!locationData) return <p>Location not found or error occurred.</p>;

  // 1) Admin can rename location
  const handleRenameLocation = async () => {
    if (role !== 'admin' && role !== 'superuser') return;
    if (!newName.trim()) return alert('El nombre no puede estar vacío.');
    try {
      // Suppose we have a route: PUT /api/locations/:id for rename
      const res = await API.put(`/locations/${locationId}`, 
        { name: newName }
      );
      alert(res.data.message || 'Locación renombrada.');
      // Re-fetch or update local state
      setLocationData(prev => ({ ...prev, name: newName }));
    } catch (err) {
      console.error(err);
      alert('Error al renombrar la locación.');
    }
  };

  // 2) Admin can delete location
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

  // 3) Admin can create a new fridge
  // 3) Admin can create a new fridge
const handleCreateFridge = async () => {
  if (role !== 'admin' && role !== 'superuser') return;
  if (!newFridgeName.trim()) return alert('Nombre del refrigerador es requerido.');

  try {
    // ✅ NO mandamos products: el backend inicializa con Config
    const res = await API.post(
      `/locations/${locationId}/refrigerators`,
      { name: newFridgeName }
    );

    alert(res.data.message || 'Refrigerador creado.');
    // Re-fetch location data
    const refetch = await API.get(
      `/locations/${locationId}`
    );
    setLocationData(refetch.data);
    setNewFridgeName('');
  } catch (err) {
    console.error(err);
    alert(err?.response?.data?.message || 'Error al crear el refrigerador.');
  }
};



  // 4) Handling updates to product quantities
  // handleQuantityChange now sets string:
  const handleQuantityChange = (fridgeId, productName, newVal) => {
    setFridgeEdits(prev => ({
      ...prev,
      [fridgeId]: {
        ...prev[fridgeId],
        [productName]: newVal
      }
    }));
  };

  // 5) Save changes for a given fridge
  const handleSaveFridge = async (fridge) => {
    // For each product in fridgeEdits[fridge._id], call the update route?
    // or do one by one. Let's do one by one for example:
    const edits = fridgeEdits[fridge._id];
    const productNames = Object.keys(edits);

    try {
      for (let pName of productNames) {
        const quantitySTR = edits[pName];
        const quantity = parseInt(quantitySTR || "0", 10); // parse or fallback to 0
        // call updateProductInRefrigerator route
        await API.put(`/locations/${locationId}/refrigerators/${fridge._id}/products`, {
          productName: pName,
          quantity: quantity
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
      // refetch location
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
      const res = await API.put(`/locations/${locationId}/refrigerators/${fridge._id}`, 
        { newName }
      );
      alert(res.data.message || 'Fridge renamed.');
      // refetch
      const refetch = await API.get(`/locations/${locationId}`);
      setLocationData(refetch.data);
    } catch (err) {
      console.error(err);
      alert('Error renaming fridge.');
    }
  };
  
  return (
    <div className="main-container">
      {/* // Menu de navegación */}
      <NavBar />
      
      <h2>Location: {locationData.name}</h2>

      {/* Admin rename or delete */}
      {(role === 'admin' || role === 'superuser') && (
        <div style={{ marginBottom: '1rem' }}>
          <label>Renombrar locación:</label>
          <input 
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button onClick={handleRenameLocation}>Guardar</button>
          <button style={{ marginLeft: '1rem' }} onClick={handleDeleteLocation}>Eliminar locación</button>
        </div>
      )}

      <p>Created By: {locationData.createdBy?.name}</p>
      <p>Users assigned: {locationData.users?.length || 0}</p>

      {locationData.refrigerators && locationData.refrigerators.length > 0 ? (
        <div>
          {locationData.refrigerators.map(fridge => (
            <div key={fridge._id} style={{ border: '1px solid #ccc', marginBottom: '1rem', padding: '1rem' }}>
              <h4>
                <span className="fridge-icon"></span>
                {fridge.name}
                {fridge.updatedAt && (
                  <small style={{ marginLeft: '10px' }}>
                    Last updated: {new Date(fridge.updatedAt).toLocaleString()}
                  </small>
                )}
              </h4>
              {(role === 'admin' || role === 'superuser') && (
                    <>
                      <button onClick={() => handleRenameFridge(fridge)}>Rename</button>
                      <button onClick={() => handleDeleteFridge(fridge)}>Delete</button>
                    </>
                  )}
                
              <table>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // orden universal (case-insensitive)
                  const orderIndex = (name) => {
                  const i = (standardOrder || []).findIndex(s => String(s).toLowerCase() === String(name).toLowerCase());
                      return i === -1 ? 9999 : i;
                    };
                    const orderedProducts = [...fridge.products].sort((a, b) => {
                      const ia = orderIndex(a.productName);
                      const ib = orderIndex(b.productName);
                      if (ia !== ib) return ia - ib;
                      return String(a.productName).localeCompare(String(b.productName));
                    });

                    return orderedProducts.map((prod, index) => {
                      const displayVal = fridgeEdits[fridge._id]?.[prod.productName] ?? String(prod.quantity);
                      return (
                        <tr key={prod.productName}>
                          <td>{prod.productName}</td>
                          <td>
                            <NumberInput
                              value={displayVal}
                              onChange={(newVal) => handleQuantityChange(fridge._id, prod.productName, newVal)}
                            />
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
              <button onClick={() => handleSaveFridge(fridge)}>Guardar cambios</button>
            </div>
          ))}
        </div>
      ) : (
        <p>No refrigerators in this location yet.</p>
      )}

      {/* Admin can create new fridge */}
      {(role === 'admin' || role === 'superuser') && (
        <div style={{ marginTop: '1rem' }}>
          <h4>Crear nuevo refrigerador</h4>
          <input 
            type="text"
            placeholder="Nombre del refrigerador"
            value={newFridgeName}
            onChange={(e) => setNewFridgeName(e.target.value)}
          />
          <button onClick={handleCreateFridge}>Crear</button>
        </div>
      )}
      <Footer />
    </div>
  );
}

export default LocationPage;
