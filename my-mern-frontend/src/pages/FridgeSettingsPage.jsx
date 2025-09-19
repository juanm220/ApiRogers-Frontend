// src/pages/FridgeSettingsPage.jsx
import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import NavBar from '../components/NavBar';
import { useSelector } from 'react-redux';
import '../styles.css';

function FridgeSettingsPage() {
  const token = useSelector((state) => state.auth.token);
  const role = useSelector((state) => state.auth.role);

  const [items, setItems] = useState([]);          // lista exacta del backend (última guardada)
  const [draftItems, setDraftItems] = useState([]); // lista editable local (UI)
 

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [newItem, setNewItem] = useState('');
  const [standardOrder, setStandardOrder] = useState([]);

  const isAdmin = role === 'admin' || role === 'superuser';

  // --- Drag & Drop state ---
  const dragIndexRef = useRef(null); // índice del elemento que empezamos a arrastrar
  const [dragOverIndex, setDragOverIndex] = useState(null); // índice donde estamos pasando por encima


  useEffect(() => {
    setLoading(true);
    axios
      .get('http://localhost:4000/api/config/standard-products', {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        const list = res.data?.items ?? res.data?.data?.items ?? [];
        setItems(list);
        setDraftItems(list);
      })
      .catch((err) => {
        console.error('Error fetching standard products:', err);
        setItems([]);
        setDraftItems([]);
      })
      .finally(() => setLoading(false));
  }, [token]);
  
  // --- Botones ↑↓ y eliminar ---
  const moveUp = (index) => {
    if (index <= 0) return;
    const copy = [...draftItems];
    [copy[index - 1], copy[index]] = [copy[index], copy[index - 1]];
    setDraftItems(copy);
  };

  const moveDown = (index) => {
    if (index >= draftItems.length - 1) return;
    const copy = [...draftItems];
    [copy[index + 1], copy[index]] = [copy[index], copy[index + 1]];
    setDraftItems(copy);
  };

  const removeItem = (index) => {
    const copy = [...draftItems];
    copy.splice(index, 1);
    setDraftItems(copy);
  };

  const addItem = () => {
    const v = (newItem || '').trim();
    if (!v) return;
    // evitar duplicados (case-insensitive)
    if (draftItems.some((x) => String(x).toLowerCase() === v.toLowerCase())) {
      alert('Ese producto ya existe en la lista.');
      return;
    }
    setDraftItems((prev) => [...prev, v]);
    setNewItem('');
  };

  const renameItem = (index, value) => {
    const copy = [...draftItems];
    copy[index] = value;
    setDraftItems(copy);
  };

  const resetToServer = () => {
    setDraftItems(items);
  };

  const save = async () => {
    if (!isAdmin) return;
    setSaving(true);
    try {
      const cleaned = draftItems
        .map((s) => (typeof s === 'string' ? s.trim() : ''))
        .filter(Boolean);

      const res = await axios.put(
        'http://localhost:4000/api/config/standard-products',
        { items: cleaned },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Acepta ambas respuestas: {data: {items}} o {items}
      const finalList =
        res.data?.data?.items ??
        res.data?.items ??
        cleaned;

      setItems(finalList);
      setDraftItems(finalList);
      alert('Lista de productos actualizada.');
    } catch (err) {
      console.error('Error saving standard products:', err);
      alert('Error al guardar la lista.');
    } finally {
      setSaving(false);
    }
  };

  const syncAllFridges = async () => {
    if (!isAdmin) return;
    setSyncing(true);
    try {
      const res = await axios.post(
        'http://localhost:4000/api/config/sync-fridges',
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const msg =
        res.data?.message ||
        `Sincronización completa: ${res.data?.updatedFridges ?? '-'} de ${res.data?.totalFridges ?? '-'} neveras actualizadas.`;
      alert(msg);
    } catch (err) {
      console.error('Error syncing fridges:', err);
      alert(err?.response?.data?.message || 'Error al sincronizar neveras.');
    } finally {
      setSyncing(false);
    }
  };

  // --- Drag & Drop handlers ---
  const onDragStart = (index) => (e) => {
    dragIndexRef.current = index;
    // Opcional: efecto visual
    e.dataTransfer.effectAllowed = 'move';
    // Evita que algunos navegadores ignoren el drag si no se setea data
    e.dataTransfer.setData('text/plain', String(index));
  };

  const onDragOver = (index) => (e) => {
    e.preventDefault(); // necesario para permitir drop
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const onDragLeave = () => {
    setDragOverIndex(null);
  };

  const onDrop = (index) => (e) => {
    e.preventDefault();
    const from = dragIndexRef.current;
    const to = index;
    setDragOverIndex(null);
    dragIndexRef.current = null;

    if (from === null || from === undefined) return;
    if (from === to) return;

    const copy = [...draftItems];
    const [moved] = copy.splice(from, 1);
    copy.splice(to, 0, moved);
    setDraftItems(copy);
  };

  if (loading) {
    return (
      <div className="main-container">
        <NavBar />
        <p>Cargando lista de productos...</p>
      </div>
    );
  }

  return (
    <div className="main-container">
      <NavBar />
      <h2>Ajustes de Productos (Orden Universal)</h2>
      <p style={{ marginTop: 0 }}>
        Esta lista define <strong>qué productos</strong> y <strong>en qué orden</strong> aparecen en todas las neveras.
      </p>

      {!isAdmin && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <strong>Solo lectura:</strong> Tu rol no permite modificar esta lista.
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Listado</h3>
        {draftItems.length === 0 && <p>No hay productos en la lista.</p>}

        <table>
          <thead>
            <tr>
              <th style={{ width: '52px' }}>#</th>
              <th>Producto</th>
              <th style={{ width: '260px' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {draftItems.map((name, idx) => {
              const dragClass =
                dragOverIndex === idx ? 'drag-over-row' : '';
              return (
                <tr
                  key={idx}
                  draggable={isAdmin}              // <- habilita drag solo a admin/superuser
                  onDragStart={onDragStart(idx)}
                  onDragOver={onDragOver(idx)}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop(idx)}
                  className={dragClass}
                  style={{ cursor: isAdmin ? 'grab' : 'default' }}
                  title={isAdmin ? 'Arrastra para reordenar' : ''}
                >
                  <td>{idx + 1}</td>
                  <td>
                    {isAdmin ? (
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => renameItem(idx, e.target.value)}
                        style={{ width: '100%' }}
                      />
                    ) : (
                      name
                    )}
                  </td>
                  <td>
                    {isAdmin ? (
                      <>
                        <button onClick={() => moveUp(idx)} disabled={idx === 0}>
                          ↑
                        </button>
                        <button
                          onClick={() => moveDown(idx)}
                          disabled={idx === draftItems.length - 1}
                          style={{ marginLeft: '0.5rem' }}
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => removeItem(idx)}
                          style={{ marginLeft: '0.5rem' }}
                        >
                          Eliminar
                        </button>
                        <span style={{ marginLeft: '0.75rem', opacity: 0.7 }}>
                          
                        </span>
                      </>
                    ) : (
                      <em>—</em>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {isAdmin && (
          <>
            <div style={{ marginTop: '1rem' }}>
              <input
                type="text"
                placeholder="Nuevo producto..."
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
              />
              <button onClick={addItem} style={{ marginLeft: '0.5rem' }}>
                Añadir
              </button>
            </div>
            <div style={{ marginTop: '1rem' }}>
                <button onClick={resetToServer} style={{ marginRight: '0.5rem' }}>
                    Deshacer cambios
                </button>
                <button onClick={save} disabled={saving} style={{ marginRight: '0.5rem' }}>
                    {saving ? 'Guardando...' : 'Guardar'}
                </button>
                <button onClick={syncAllFridges} disabled={syncing}>
                    {syncing ? 'Sincronizando...' : 'Sincronizar neveras'}
                </button>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h4 style={{ marginTop: 0 }}>Cómo impacta</h4>
        <p>
          — Al <strong>crear una nevera</strong>, se inicializa con esta lista (cantidades en 0).<br />
          — Al <strong>editar cantidades</strong>, puedes ordenar la UI según este orden para mantener consistencia.<br />
          — Si un admin <strong>cambia el orden/aumenta/disminuye</strong> aquí, el cambio será global.
        </p>
      </div>
    </div>
  );
}

export default FridgeSettingsPage;