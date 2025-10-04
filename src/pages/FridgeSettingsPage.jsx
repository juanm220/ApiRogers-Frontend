// src/pages/FridgeSettingsPage.jsx
import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import API from '../apiService';
import NavBar from '../components/NavBar';
import { useSelector } from 'react-redux';
import '../styles.css';
import Footer from '../components/Footer';

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
    API
      .get('/config/standard-products',
      )
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
  
  // Debounce para guardar automáticamente al cambiar draftItems
  useEffect(() => {
    if (!isAdmin) return;                // solo admin/superuser guardan
    if (loading) return;                 // evita disparar justo al cargar
    if (!Array.isArray(draftItems)) return;

    const cleaned = draftItems
      .map((s) => (typeof s === 'string' ? s.trim() : ''))
      .filter(Boolean);

    // Evita guardar si no hay cambios respecto a items
    const same =
      cleaned.length === items.length &&
      cleaned.every((v, i) => v === items[i]);
    if (same) return;

    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        // 1) Guardar nuevo estándar
        const putRes = await API.put(
          '/config/standard-products',
          { items: cleaned },
          {
            
            signal: controller.signal,
          }
        );
        const finalList = putRes.data?.data?.items ?? putRes.data?.items ?? cleaned;
        setItems(finalList);

        // 2) Sincronizar NEVERAS automáticamente
        //    ✅ Enviar correctamente removeExtras en el BODY (o usa query si prefieres)
        await API.post(
          '/config/sync-fridges',
          { removeExtras: removeExtrasRef.current },
          {
            
            signal: controller.signal,
          }
        );
        // ✅ Resetear el flag después de sincronizar
        removeExtrasRef.current = false;

        // (Si quieres, aquí puedes hacer un toast/indicador sutil)
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error('Auto-guardado/sync error:', err);
      }
    }, 600); // 600ms de debounce
    
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [draftItems, isAdmin, loading, token, items]);

    // helper: limpieza inmediata de un producto
  async function cleanupOne(name) {
    try {
      await API.post(
        '/maintenance/cleanup-products',
        { names: [name] }
      );
    } catch (e) {
      console.error('cleanupOne error', e);
    }
  }

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

  const removeItem = async (index) => {
    const name = draftItems[index];
    const ok = window.confirm(
      `¿Eliminar "${name}" del estándar y de TODAS las neveras? Esta acción quitará ese producto de cada nevera.`
    );
    if (!ok) return;

    // 1) Quitar de la UI
    const copy = [...draftItems];
    copy.splice(index, 1);
    setDraftItems(copy);

    // 2) Limpiar inmediatamente en backend (pull global por nombre)
    await cleanupOne(name);

  // 3) Reset para que el próximo autosync solo reordene/complemente
  removeExtrasRef.current = false;
  // 3) Forzar que el próximo autosync QUITE extras no-estándar
  removeExtrasRef.current = true;

  // 4) (Opcional, más inmediato) dispara el sync ahora mismo:
  try {
    await API.post('/config/sync-fridges', { removeExtras: true });
  } catch (e) {
    console.error('sync after cleanup error', e);
  }
  };

  const removeExtrasRef = useRef(false);

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
        {/* Indicador sutil */}
        <p style={{ marginTop: 0, fontSize: '0.9rem', opacity: 0.7 }}>
          Los cambios se guardan y sincronizan automáticamente.
        </p>
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
      <Footer />
    </div>
  );
}

export default FridgeSettingsPage;