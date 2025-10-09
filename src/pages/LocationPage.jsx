// src/pages/LocationPage.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../apiService';
import { useSelector } from 'react-redux';
import NavBar from '../components/NavBar';
import NumberInput from '../components/NumberInput';
import '../styles.css';
import Footer from '../components/Footer';

function LocationPage() {
  const { locationId } = useParams();
  const navigate = useNavigate();
  const standardProducts = useSelector((s) => s.products.standardProducts);
  const token = useSelector((s) => s.auth.token);
  const role = useSelector((s) => s.auth.role);

  const [locationData, setLocationData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState('');
  const [newFridgeName, setNewFridgeName] = useState('');
  const [standardOrder, setStandardOrder] = useState([]);

  // Ediciones locales (string)
  // shape: { [fridgeId]: { [productName]: "12" } }
  const [fridgeEdits, setFridgeEdits] = useState({});

  // UI states
  const [savingFridgeId, setSavingFridgeId] = useState(null); // overlay al guardar manual
  const [toast, setToast] = useState(null); // { type:'ok'|'error', text:string }
  const [autoSave, setAutoSave] = useState(() => {
    const v = localStorage.getItem('autosave_fridges');
    return v ? v === '1' : false;
  });

  // Guardado por fila (spinner junto al input): { [fridgeId]: { [productName]: boolean } }
  const [rowSaving, setRowSaving] = useState({});

  // Timers de debounce por fridge
  const debouncers = useRef({}); // { [fridgeId]: numberTimeoutId }

  // refs para focus secuencial
  const inputRefs = useRef({});

  // ---- helpers ----
  const orderIndex = (name) => {
    const i = (standardOrder || []).findIndex(
      (s) => String(s).toLowerCase() === String(name).toLowerCase()
    );
    return i === -1 ? 9999 : i;
  };

  // baseline desde locationData (comparación para cambios)
  const baseline = useMemo(() => {
    const m = {};
    if (locationData?.refrigerators) {
      locationData.refrigerators.forEach((fr) => {
        const inner = {};
        fr.products.forEach((p) => {
          inner[p.productName] = p.quantity === 0 ? '' : String(p.quantity);
        });
        m[fr._id] = inner;
      });
    }
    return m;
  }, [locationData]);

  // ¿hay cambios sin guardar?
  const hasUnsaved = useMemo(() => {
    const frIds = Object.keys(fridgeEdits || {});
    for (const frId of frIds) {
      const prodNames = Object.keys(fridgeEdits[frId] || {});
      for (const pName of prodNames) {
        const current = (fridgeEdits[frId] || {})[pName] ?? '';
        const base = (baseline[frId] || {})[pName] ?? '';
        if (String(current) !== String(base)) return true;
      }
    }
    return false;
  }, [fridgeEdits, baseline]);

  // proteger salida si hay cambios o guardados en curso/cola
  const hasAnySaving =
    savingFridgeId != null ||
    Object.values(rowSaving).some((m) => Object.values(m || {}).some(Boolean)) ||
    Object.values(debouncers.current).some(Boolean);

  useEffect(() => {
    const beforeUnload = (e) => {
      if (!(hasUnsaved || hasAnySaving)) return;
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [hasUnsaved, hasAnySaving]);

  // ---- data fetch ----
  useEffect(() => {
    if (!locationId) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    (async () => {
      try {
        const res = await API.get(`/locations/${locationId}`, { signal: controller.signal });
        setLocationData(res.data);
        setNewName(res.data?.name || '');
        const initEdits = {};
        if (res.data?.refrigerators) {
          res.data.refrigerators.forEach((fr) => {
            const edits = {};
            fr.products.forEach((p) => {
              edits[p.productName] = p.quantity === 0 ? '' : String(p.quantity);
            });
            initEdits[fr._id] = edits;
          });
        }
        setFridgeEdits(initEdits);
      } catch (err) {
        console.error('Error fetching location data:', err);
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [locationId, token]);

  useEffect(() => {
    (async () => {
      try {
        const res = await API.get('/config/standard-products');
        const list = res.data?.items ?? res.data?.data?.items ?? [];
        setStandardOrder(list);
      } catch (err) {
        console.error('Error fetching standard order:', err);
        setStandardOrder([]);
      }
    })();
  }, [token]);

  // ---- acciones admin ----
  const handleRenameLocation = async () => {
    if (role !== 'admin' && role !== 'superuser') return;
    if (!newName.trim()) return alert('El nombre no puede estar vacío.');
    try {
      const res = await API.put(`/locations/${locationId}`, { name: newName });
      setLocationData((prev) => ({ ...prev, name: newName }));
      setToast({ type: 'ok', text: res.data.message || 'Locación renombrada.' });
    } catch {
      setToast({ type: 'error', text: 'Error al renombrar la locación.' });
    }
  };

  const handleDeleteLocation = async () => {
    if (role !== 'admin' && role !== 'superuser') return;
    const confirmed = window.confirm('¿Seguro que deseas eliminar esta locación?');
    if (!confirmed) return;
    try {
      await API.delete(`/locations/${locationId}`);
      setToast({ type: 'ok', text: 'Locación eliminada.' });
      navigate('/home');
    } catch {
      setToast({ type: 'error', text: 'Error al eliminar la locación.' });
    }
  };

  const handleCreateFridge = async () => {
    if (role !== 'admin' && role !== 'superuser') return;
    if (!newFridgeName.trim()) return alert('Nombre del refrigerador es requerido.');
    try {
      const res = await API.post(`/locations/${locationId}/refrigerators`, { name: newFridgeName });
      const refetch = await API.get(`/locations/${locationId}`);
      setLocationData(refetch.data);
      setNewFridgeName('');
      setToast({ type: 'ok', text: res.data.message || 'Refrigerador creado.' });
    } catch (err) {
      setToast({ type: 'error', text: err?.response?.data?.message || 'Error al crear el refrigerador.' });
    }
  };

  const handleRenameFridge = async (fridge) => {
    const n = prompt('Enter new fridge name', fridge.name);
    if (!n) return;
    try {
      const res = await API.put(`/locations/${locationId}/refrigerators/${fridge._id}`, { newName: n });
      const refetch = await API.get(`/locations/${locationId}`);
      setLocationData(refetch.data);
      setToast({ type: 'ok', text: res.data.message || 'Fridge renamed.' });
    } catch {
      setToast({ type: 'error', text: 'Error renaming fridge.' });
    }
  };

  const handleDeleteFridge = async (fridge) => {
    if (!window.confirm(`Are you sure you want to delete fridge ${fridge.name}?`)) return;
    try {
      await API.delete(`/locations/${locationId}/refrigerators/${fridge._id}`);
      const refetch = await API.get(`/locations/${locationId}`);
      setLocationData(refetch.data);
      setToast({ type: 'ok', text: 'Fridge deleted!' });
    } catch {
      setToast({ type: 'error', text: 'Error deleting fridge.' });
    }
  };

  // ---- edición y (opcional) autosave con debounce ----
  const queueAutoSave = (fridgeId, delay = 1200) => {
    // borra debounce previo
    if (debouncers.current[fridgeId]) {
      clearTimeout(debouncers.current[fridgeId]);
      debouncers.current[fridgeId] = null;
    }
    // agenda
    debouncers.current[fridgeId] = setTimeout(async () => {
      debouncers.current[fridgeId] = null;
      await doSaveFridge(fridgeId, { silentOverlay: true });
    }, delay);
  };

  const handleQuantityChange = (fridgeId, productName, newVal) => {
    setFridgeEdits((prev) => ({
      ...prev,
      [fridgeId]: { ...(prev[fridgeId] || {}), [productName]: newVal },
    }));
    if (autoSave) {
      queueAutoSave(fridgeId);
    }
  };

  // guardado real (usado por autosave y por botón)
  const doSaveFridge = async (fridgeId, { silentOverlay = false } = {}) => {
    const edits = fridgeEdits[fridgeId] || {};
    const currentBase = baseline[fridgeId] || {};
    const changed = Object.keys(edits).filter(
      (p) => String(edits[p] ?? '') !== String(currentBase[p] ?? '')
    );
    if (changed.length === 0) {
      if (!silentOverlay) setToast({ type: 'ok', text: 'No hay cambios que guardar.' });
      return;
    }

    try {
      if (!silentOverlay) setSavingFridgeId(fridgeId);

      // marca saving por fila
      setRowSaving((prev) => ({
        ...prev,
        [fridgeId]: { ...(prev[fridgeId] || {}), ...Object.fromEntries(changed.map((p) => [p, true])) },
      }));

      // paraleliza PUTs para acelerar
      await Promise.all(
        changed.map((pName) => {
          const quantity = parseInt(edits[pName] || '0', 10);
          return API.put(
            `/locations/${locationId}/refrigerators/${fridgeId}/products`,
            { productName: pName, quantity }
          );
        })
      );

      // refresca datos (baseline nuevo)
      const refetch = await API.get(`/locations/${locationId}`);
      setLocationData(refetch.data);

      // alinear edits con baseline
      setFridgeEdits((prev) => {
        const next = { ...prev };
        const fr = refetch.data.refrigerators.find((f) => f._id === fridgeId);
        if (fr) {
          const updated = {};
          fr.products.forEach((p) => {
            updated[p.productName] = p.quantity === 0 ? '' : String(p.quantity);
          });
          next[fridgeId] = updated;
        }
        return next;
      });

      if (!silentOverlay) setToast({ type: 'ok', text: 'Cambios guardados.' });
    } catch (err) {
      console.error(err);
      setToast({ type: 'error', text: 'Error al guardar cambios.' });
    } finally {
      if (!silentOverlay) setSavingFridgeId(null);
      // limpia flags de fila
      setRowSaving((prev) => {
        const copy = { ...prev };
        if (copy[fridgeId]) {
          changed.forEach((p) => (copy[fridgeId][p] = false));
        }
        return copy;
      });
    }
  };

  const handleSaveFridge = async (fridge) => {
    // si hay debounce pendiente, ejecútalo ya
    if (debouncers.current[fridge._id]) {
      clearTimeout(debouncers.current[fridge._id]);
      debouncers.current[fridge._id] = null;
    }
    await doSaveFridge(fridge._id, { silentOverlay: false });
  };

  // toggle autosave persistido
  const toggleAutosave = () => {
    setAutoSave((v) => {
      const nv = !v;
      localStorage.setItem('autosave_fridges', nv ? '1' : '0');
      return nv;
    });
  };

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (loading) return <p>Loading location...</p>;
  if (!locationData) return <p>Location not found or error occurred.</p>;

  return (
    <div className="main-container">
      <NavBar />

      {/* Aviso cambios sin guardar */}
      {(hasUnsaved || hasAnySaving) && (
        <div
          role="status"
          aria-live="polite"
          className="alert"
          style={{
            marginBottom: 12,
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid #f59e0b55',
            background: '#fff7e6',
            color: '#8a6d3b',
            fontWeight: 600,
          }}
        >
          {hasAnySaving ? 'Guardando cambios…' : 'Tienes cambios sin guardar.'}
        </div>
      )}

      {/* Toggle de autosave (global en la page) */}
      <div className="flex-row" style={{ gap: 8, marginBottom: 12 }}>
        <label className="chip-radio" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={autoSave}
            onChange={toggleAutosave}
            style={{ marginRight: 8 }}
          />
          Auto-guardado por refrigerador
        </label>
      </div>

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
            <button className="btn btn--danger" onClick={handleDeleteLocation}>
              Eliminar locación
            </button>
          </div>
        </div>
      )}

      <p>Created By: {locationData.createdBy?.name}</p>
      <p>Users assigned: {locationData.users?.length || 0}</p>

      {locationData.refrigerators?.length ? (
        <div className="fridge-stack">
          {locationData.refrigerators.map((fridge) => {
            const disabled = savingFridgeId === fridge._id;
            const thisRowSaving = rowSaving[fridge._id] || {};
            return (
              <section key={fridge._id} className="card fridge-card" aria-busy={disabled}>
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

                  <div className="fridge-actions">
                    {autoSave && (
                      <span className="pill" title="Los cambios confirmados se guardan solos">
                        Auto-guardado: <b>ON</b>
                      </span>
                    )}
                    {(role === 'admin' || role === 'superuser') && (
                      <>
                        <button
                          className="btn btn--secondary"
                          onClick={() => handleRenameFridge(fridge)}
                          disabled={disabled}
                        >
                          Rename
                        </button>
                        <button
                          className="btn btn--danger"
                          onClick={() => handleDeleteFridge(fridge)}
                          disabled={disabled}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </header>

                <div className="table-wrap table-wrap--shadow" style={{ position: 'relative' }}>
                  <table className="table-excel" aria-describedby={`desc-${fridge._id}`}>
                    <caption id={`desc-${fridge._id}`} style={{ display: 'none' }}>
                      Tabla de productos del refrigerador {fridge.name}
                    </caption>
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th className="num">Cantidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...fridge.products]
                        .sort((a, b) => {
                          const ia = orderIndex(a.productName);
                          const ib = orderIndex(b.productName);
                          if (ia !== ib) return ia - ib;
                          return String(a.productName).localeCompare(String(b.productName));
                        })
                        .map((prod, index) => {
                          const displayVal =
                            fridgeEdits[fridge._id]?.[prod.productName] ??
                            String(prod.quantity);
                          const refKey = `${fridge._id}-${index}`;
                          const savingThisRow = !!thisRowSaving[prod.productName];

                          return (
                            <tr key={prod.productName}>
                              <td>
                                {prod.productName}
                                {savingThisRow && (
                                  <span
                                    aria-label="Guardando…"
                                    title="Guardando…"
                                    style={{
                                      display: 'inline-block',
                                      width: 12,
                                      height: 12,
                                      marginLeft: 8,
                                      verticalAlign: 'middle',
                                      borderRadius: '50%',
                                      border: '2px solid rgba(37,99,235,.25)',
                                      borderTopColor: '#2563eb',
                                      animation: 'hawking-spin 800ms linear infinite',
                                    }}
                                  />
                                )}
                              </td>
                              <td className="num">
                                <NumberInput
                                  ref={(el) => {
                                    if (el) inputRefs.current[refKey] = el;
                                  }}
                                  value={displayVal}
                                  onChange={(newVal) =>
                                    handleQuantityChange(fridge._id, prod.productName, newVal)
                                  }
                                  onEnter={() => {
                                    const nextKey = `${fridge._id}-${index + 1}`;
                                    const nextEl = inputRefs.current[nextKey];
                                    if (nextEl?.focus) nextEl.focus();
                                  }}
                                  aria-label={`Cantidad de ${prod.productName}`}
                                  // teclado móvil con '+'
                                  inputMode={isMobile ? 'text' : 'decimal'}
                                  autoComplete="off"
                                  autoCorrect="off"
                                  spellCheck={false}
                                  pattern="[0-9+\-*/xX÷\s]*"
                                />
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>

                <div className="fridge-foot">
                  <button onClick={() => handleSaveFridge(fridge)} disabled={disabled}>
                    {disabled ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                </div>

                {/* Overlay por guardado manual */}
                {savingFridgeId === fridge._id && <SavingOverlay label={`Guardando "${fridge.name}"…`} />}
              </section>
            );
          })}
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

      {/* Toast */}
      {toast && (
        <div
          className={`toast ${toast.type === 'error' ? 'error' : 'ok'}`}
          role="status"
          aria-live="polite"
          style={{ zIndex: 1100 }}
        >
          {toast.text}
          <button
            onClick={() => setToast(null)}
            style={{
              marginLeft: 10,
              background: 'transparent',
              border: 0,
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 700,
            }}
            aria-label="Cerrar notificación"
          >
            ×
          </button>
        </div>
      )}

      {/* keyframes spinner */}
      <style>{`@keyframes hawking-spin { to { transform: rotate(360deg); } }`}</style>

      <Footer />
    </div>
  );
}

function SavingOverlay({ label = 'Guardando…' }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(255,255,255,.65)',
        backdropFilter: 'blur(1px)',
        display: 'grid',
        placeItems: 'center',
        borderRadius: 12,
        zIndex: 5,
      }}
    >
      <div style={{ display: 'grid', justifyItems: 'center', gap: 10 }}>
        <div
          aria-hidden="true"
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: '3px solid rgba(37,99,235,.25)',
            borderTopColor: '#2563eb',
            animation: 'hawking-spin 800ms linear infinite',
          }}
        />
        <div style={{ fontWeight: 700, color: '#1e40af' }}>{label}</div>
      </div>
    </div>
  );
}

export default LocationPage;
