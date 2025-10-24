// src/pages/LocationPage.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import API from '../apiService';
import { useSelector } from 'react-redux';
import NavBar from '../components/NavBar';
import NumberInput from '../components/NumberInput';
import '../styles.css';
import Footer from '../components/Footer';
import { rememberClosedSession } from '../utils/inventorySessionStorage';

const MODE_INITIAL = 'initial';
const MODE_FINAL = 'final';

function useQueryMode() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const mode = params.get('mode');
  if (mode === MODE_FINAL) return MODE_FINAL;
  return MODE_INITIAL;
}

function LocationPage() {
  const { locationId } = useParams();
  const navigate = useNavigate();
  const token = useSelector((s) => s.auth.token);
  const role = useSelector((s) => s.auth.role);
  const viewMode = useQueryMode(); // 'initial' | 'final'

  // Inventario (sesión)
  const [invActive, setInvActive] = useState(null); // { _id, startedAt } | null
  const [invBusy, setInvBusy] = useState(false);

  const [locationData, setLocationData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState('');
  const [newFridgeName, setNewFridgeName] = useState('');
  const [standardOrder, setStandardOrder] = useState([]);

  // Última edición (quién y cuándo)
  const [lastEdit, setLastEdit] = useState(null); // { at: ISO, actorName: string|null, source?:string }

  // Ediciones por modo:
  // { initial: { [fridgeId]: { [productName]: "12" } }, final: { ... } }
  const [fridgeEditsByMode, setFridgeEditsByMode] = useState({ [MODE_INITIAL]: {}, [MODE_FINAL]: {} });

  // UI states
  const [savingFridgeId, setSavingFridgeId] = useState(null); // overlay al guardar manual
  const [toast, setToast] = useState(null); // { type:'ok'|'error', text:string }
  const [autoSave, setAutoSave] = useState(() => {
    const v = localStorage.getItem('autosave_fridges');
    return v ? v === '1' : true; // por defecto ON
  });

  const isStableNumber = (s) => /^\s*\d+\s*$/.test(String(s ?? ''));

  // refs globales para coalescer autosaves por nevera
  const inFlight = useRef({});  // { [fridgeId]: true|false }
  const pending  = useRef({});  // { [fridgeId]: true|false }

  // Guardado por fila (spinner junto al input)
  const [rowSaving, setRowSaving] = useState({}); // { [fridgeId]: { [productName]: boolean } }

  // dirty map por modo (para no pisar campos que el usuario sigue editando)
  const [dirtyMapByMode, setDirtyMapByMode] = useState({ [MODE_INITIAL]: {}, [MODE_FINAL]: {} });

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

  // Baseline desde locationData para modo INITIAL
  const baselineInitial = useMemo(() => {
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

  // Baseline 0 para modo FINAL (todo vacío ≡ 0)
  const baselineFinal = useMemo(() => {
    const m = {};
    if (locationData?.refrigerators) {
      locationData.refrigerators.forEach((fr) => {
        const inner = {};
        fr.products.forEach((p) => {
          inner[p.productName] = ''; // '' ≡ 0
        });
        m[fr._id] = inner;
      });
    }
    return m;
  }, [locationData]);

  const activeBaseline = viewMode === MODE_FINAL ? baselineFinal : baselineInitial;

  // Ediciones activas segun modo
  const fridgeEdits = useMemo(() => fridgeEditsByMode[viewMode] || {}, [fridgeEditsByMode, viewMode]);
  const thisDirtyMap = useMemo(() => dirtyMapByMode[viewMode] || {}, [dirtyMapByMode, viewMode]);

  // ¿hay cambios sin guardar? (vs baseline de modo activo)
  const hasUnsaved = useMemo(() => {
    const frIds = Object.keys(fridgeEdits || {});
    for (const frId of frIds) {
      const prodNames = Object.keys(fridgeEdits[frId] || {});
      for (const pName of prodNames) {
        const current = (fridgeEdits[frId] || {})[pName] ?? '';
        const base = (activeBaseline[frId] || {})[pName] ?? '';
        if (String(current) !== String(base)) return true;
      }
    }
    return false;
  }, [fridgeEdits, activeBaseline]);

  // Simplificado: solo flags visibles
  const hasAnySaving =
    savingFridgeId != null ||
    Object.values(rowSaving).some((m) => Object.values(m || {}).some(Boolean));

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
        const res = await API.get(`/locations/${locationId}`, { signal: controller.signal, timeout: 15000 });
        setLocationData(res.data);
        setNewName(res.data?.name || '');

        // Inicializa edits por modo
        const initInitial = {};
        const initFinal = {};
        if (res.data?.refrigerators) {
          res.data.refrigerators.forEach((fr) => {
            const editsInitial = {};
            const editsFinal = {};
            fr.products.forEach((p) => {
              // initial: base backend
              editsInitial[p.productName] = p.quantity === 0 ? '' : String(p.quantity);
              // final: base cero
              editsFinal[p.productName] = ''; // '' ≡ 0
            });
            initInitial[fr._id] = editsInitial;
            initFinal[fr._id] = editsFinal;
          });
        }
        setFridgeEditsByMode({ [MODE_INITIAL]: initInitial, [MODE_FINAL]: initFinal });
        setDirtyMapByMode({ [MODE_INITIAL]: {}, [MODE_FINAL]: {} });
      } catch (err) {
        if (err?.name !== 'CanceledError') {
          console.error('Error fetching location data:', err);
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [locationId, token]);

  // Cargar "último editor" (opcional; si no existe la ruta, no muestra nada)
  useEffect(() => {
    if (!locationId) return;
    const ac = new AbortController();
    (async () => {
      try {
        const r = await API.get(`/locations/${locationId}/last-edit`, { signal: ac.signal, timeout: 10000 });
        const data = r.data?.data;
        if (data?.at) {
          setLastEdit({ at: data.at, actorName: data.actorName || null, source: data.source || null });
        } else {
          setLastEdit(null);
        }
      } catch {
        setLastEdit(null);
      }
    })();
    return () => ac.abort();
  }, [locationId]);

  useEffect(() => {
    (async () => {
      try {
        const res = await API.get('/config/standard-products', { timeout: 10000 });
        const list = res.data?.items ?? res.data?.data?.items ?? [];
        setStandardOrder(list);
      } catch (err) {
        console.error('Error fetching standard order:', err);
        setStandardOrder([]);
      }
    })();
  }, [token]);

  // ======== INVENTARIO: Sesión activa (solo iniciar/cerrar) ========

  async function fetchActiveInv() {
    try {
      const r = await API.get(`/locations/inventory-sessions/active`, {
        params: { locationId },
        timeout: 12000,
      });
      setInvActive(r.data?.session || null);
    } catch (e) {
      console.error('fetchActiveInv error', e);
      setInvActive(null);
    }
  }

  useEffect(() => {
    if (!locationId) return;
    fetchActiveInv();
  }, [locationId]);

  // Construye snapshot FINAL desde ediciones del modo ACTIVO
  function buildFinalSnapshotFromActiveEdits() {
    const out = [];
    for (const fr of (locationData?.refrigerators || [])) {
      const editsForFr = (fridgeEditsByMode[viewMode] || {})[fr._id] || {};
      const products = (fr.products || []).map((p) => {
        const raw = editsForFr[p.productName];
        const q = raw === '' || raw == null ? 0 : parseInt(String(raw).replace(/\D+/g, ''), 10) || 0;
        return { productName: p.productName, quantity: q };
      });
      out.push({ fridgeId: fr._id, products });
    }
    return out;
  }

  async function handleStartInventory() {
    if (invBusy) return;
    // No bloqueamos por unsaved; el staff puede empezar sesión y seguir editando
    setInvBusy(true);
    try {
      await API.post(`/locations/inventory-sessions/start`, { locationId }, { timeout: 15000 });
      await fetchActiveInv();
      setToast({ type: 'ok', text: 'Sesión de inventario inicial iniciada.' });
    } catch (e) {
      console.error(e);
      const msg = e?.response?.data?.message || 'No se pudo iniciar la sesión.';
      setToast({ type: 'error', text: msg });
    } finally {
      setInvBusy(false);
    }
  }

  // Cerrar con snapshot del modo ACTIVO (si estás en Final, será con base 0 + lo escrito)
  async function handleCloseWithFinal() {
    if (invBusy || !invActive?._id) return;
    const ok = window.confirm(
      `Se cerrará la sesión con los valores de la vista "${viewMode === MODE_FINAL ? 'Final' : 'Inicial'}". ¿Confirmas?`
    );
    if (!ok) return;

    setInvBusy(true);
    try {
      const finalSnapshot = buildFinalSnapshotFromActiveEdits();
      const res = await API.patch(
        `/locations/inventory-sessions/${invActive._id}/final`,
        { finalSnapshot },
        { timeout: 20000 },
      );
      const closedSessionId = res?.data?.session?._id;
      if (closedSessionId) {
        rememberClosedSession(locationId, closedSessionId);
      }
      await fetchActiveInv();
      setToast({ type: 'ok', text: 'Inventario final registrado y sesión cerrada.' });
    } catch (e) {
      console.error(e);
      const msg = e?.response?.data?.message || 'No se pudo cerrar la sesión.';
      setToast({ type: 'error', text: msg });
    } finally {
      setInvBusy(false);
    }
  }

  // ---- acciones admin ----
  const handleRenameLocation = async () => {
    if (role !== 'admin' && role !== 'superuser') return;
    if (!newName.trim()) return alert('El nombre no puede estar vacío.');
    try {
      const res = await API.put(`/locations/${locationId}`, { name: newName }, { timeout: 12000 });
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
      await API.delete(`/locations/${locationId}`, { timeout: 12000 });
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
      const res = await API.post(`/locations/${locationId}/refrigerators`, { name: newFridgeName }, { timeout: 12000 });
      const refetch = await API.get(`/locations/${locationId}`, { timeout: 12000 });
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
      const res = await API.put(`/locations/${locationId}/refrigerators/${fridge._id}`, { newName: n }, { timeout: 12000 });
      const refetch = await API.get(`/locations/${locationId}`, { timeout: 12000 });
      setLocationData(refetch.data);
      setToast({ type: 'ok', text: res.data.message || 'Fridge renamed.' });
    } catch {
      setToast({ type: 'error', text: 'Error renaming fridge.' });
    }
  };

  const handleDeleteFridge = async (fridge) => {
    if (!window.confirm(`Are you sure you want to delete fridge ${fridge.name}?`)) return;
    try {
      await API.delete(`/locations/${locationId}/refrigerators/${fridge._id}`, { timeout: 12000 });
      const refetch = await API.get(`/locations/${locationId}`, { timeout: 12000 });
      setLocationData(refetch.data);
      setToast({ type: 'ok', text: 'Fridge deleted!' });
    } catch {
      setToast({ type: 'error', text: 'Error deleting fridge.' });
    }
  };

  // ---- edición y autosave con debounce ----
  const queueAutoSave = (fridgeId, delay = 800) => {
    if (!autoSave) return;

    if (debouncers.current[fridgeId]) {
      clearTimeout(debouncers.current[fridgeId]);
      debouncers.current[fridgeId] = null;
    }
    debouncers.current[fridgeId] = setTimeout(async () => {
      debouncers.current[fridgeId] = null;

      if (inFlight.current[fridgeId]) {
        pending.current[fridgeId] = true;
        return;
      }

      inFlight.current[fridgeId] = true;
      try {
        await doSaveFridge(fridgeId, { silentOverlay: true });
      } finally {
        inFlight.current[fridgeId] = false;
        if (pending.current[fridgeId]) {
          pending.current[fridgeId] = false;
          inFlight.current[fridgeId] = true;
          try {
            await doSaveFridge(fridgeId, { silentOverlay: true });
          } finally {
            inFlight.current[fridgeId] = false;
          }
        }
      }
    }, delay);
  };

  const updateEdits = (mode, fn) => {
    setFridgeEditsByMode((prev) => {
      const copy = { ...prev };
      copy[mode] = fn(copy[mode] || {});
      return copy;
    });
  };
  const updateDirtyMap = (mode, fn) => {
    setDirtyMapByMode((prev) => {
      const copy = { ...prev };
      copy[mode] = fn(copy[mode] || {});
      return copy;
    });
  };

  const handleQuantityChange = (fridgeId, productName, newVal) => {
    updateEdits(viewMode, (prev) => ({
      ...prev,
      [fridgeId]: { ...(prev[fridgeId] || {}), [productName]: newVal },
    }));
    updateDirtyMap(viewMode, (prev) => ({
      ...prev,
      [fridgeId]: { ...(prev[fridgeId] || {}), [productName]: true },
    }));

    if (isStableNumber(newVal)) {
      queueAutoSave(fridgeId);
    }
  };

  // guardado real (usado por autosave y por botón)
  const doSaveFridge = async (fridgeId, { silentOverlay = false } = {}) => {
    const edits = (fridgeEditsByMode[viewMode] || {})[fridgeId] || {};
    const currentBase = (viewMode === MODE_FINAL ? baselineFinal : baselineInitial)[fridgeId] || {};
    const changed = Object.keys(edits).filter(
      (p) => String(edits[p] ?? '') !== String(currentBase[p] ?? '')
    );

    if (changed.length === 0) {
      if (!silentOverlay) setToast({ type: 'ok', text: 'No hay cambios que guardar.' });
      return;
    }

    const payloadMap = new Map(
      changed.map((pName) => [pName, parseInt(edits[pName] || '0', 10)])
    );

    try {
      if (!silentOverlay) setSavingFridgeId(fridgeId);

      // spinners por fila
      setRowSaving((prev) => ({
        ...prev,
        [fridgeId]: {
          ...(prev[fridgeId] || {}),
          ...Object.fromEntries(changed.map((p) => [p, true])),
        },
      }));

      // ✅ UN SOLO REQUEST (batch)
      await API.put(
        `/locations/${locationId}/refrigerators/${fridgeId}/products/batch`,
        {
          updates: changed.map((pName) => ({
            productName: pName,
            quantity: payloadMap.get(pName) || 0,
          })),
        },
        { timeout: 12000 }
      );

      if (silentOverlay) {
        // 🔁 AUTOSAVE: reconciliar localmente sin refetch
        setLocationData((prev) => {
          if (!prev) return prev;
          const next = { ...prev };
          next.refrigerators = (prev.refrigerators || []).map((fr) => {
            if (String(fr._id) !== String(fridgeId)) return fr;
            const copy = { ...fr, products: [...(fr.products || [])] };
            copy.products = copy.products.map((p) => {
              if (payloadMap.has(p.productName)) {
                return { ...p, quantity: payloadMap.get(p.productName) };
              }
              return p;
            });
            return copy;
          });
          return next;
        });

        // Reconcilia edits del modo activo sin pisar lo que el usuario sigue editando
        setFridgeEditsByMode((prevAll) => {
          const byMode = { ...prevAll };
          const modeMap = { ...(byMode[viewMode] || {}) };
          const fr = { ...(modeMap[fridgeId] || {}) };
          for (const pName of changed) {
            const sent = String(payloadMap.get(pName) || 0);
            const currentUI = String(fr[pName] ?? '');
            if (currentUI === '' || currentUI === sent) {
              fr[pName] = Number(sent) === 0 ? '' : sent;
              setDirtyMapByMode((dmAll) => {
                const dmCopy = { ...dmAll };
                const dmMode = { ...(dmCopy[viewMode] || {}) };
                dmMode[fridgeId] = { ...(dmMode[fridgeId] || {}), [pName]: false };
                dmCopy[viewMode] = dmMode;
                return dmCopy;
              });
            }
          }
          modeMap[fridgeId] = fr;
          byMode[viewMode] = modeMap;
          return byMode;
        });
      } else {
        // 🧾 MANUAL: refetch y realinea (manteniendo campos dirty del modo activo)
        const refetch = await API.get(`/locations/${locationId}`, { timeout: 15000 });
        const fresh = refetch.data;
        setLocationData(fresh);

        // Realineamos SOLO el modo activo
        setFridgeEditsByMode((prevAll) => {
          const byMode = { ...prevAll };
          const modeMap = { ...(byMode[viewMode] || {}) };

          for (const fr of (fresh.refrigerators || [])) {
            const frId = String(fr._id);
            const frDirty = (dirtyMapByMode[viewMode] || {})[frId] || {};
            const updated = { ...(modeMap[frId] || {}) };
            fr.products.forEach((p) => {
              if (!frDirty[p.productName]) {
                // En INITIAL, reflejamos lo que vino del backend
                // En FINAL, seguimos dejando '' como base si no está dirty
                if (viewMode === MODE_INITIAL) {
                  updated[p.productName] = p.quantity === 0 ? '' : String(p.quantity);
                } else {
                  // modo final: si no estaba editado, mantener vacío (0)
                  updated[p.productName] = updated[p.productName] ?? '';
                }
              }
            });
            modeMap[frId] = updated;
          }
          byMode[viewMode] = modeMap;
          return byMode;
        });

        setDirtyMapByMode((prev) => {
          const copy = { ...prev };
          const dMode = { ...(copy[viewMode] || {}) };
          const d = { ...(dMode[fridgeId] || {}) };
          changed.forEach((p) => (d[p] = false));
          dMode[fridgeId] = d;
          copy[viewMode] = dMode;
          return copy;
        });
      }

      if (!silentOverlay) setToast({ type: 'ok', text: 'Cambios guardados.' });
    } catch (err) {
      console.error(err);
      setToast({ type: 'error', text: 'Error al guardar cambios.' });
    } finally {
      if (!silentOverlay) setSavingFridgeId(null);

      // Limpia TODOS los spinners por fila de esa nevera
      setRowSaving((prev) => {
        const copy = { ...prev };
        if (copy[fridgeId]) {
          const cleared = {};
          for (const k of Object.keys(copy[fridgeId])) cleared[k] = false;
          copy[fridgeId] = cleared;
        }
        return copy;
      });
    }
  };

  const handleSaveFridge = async (fridge) => {
    // 1) Cancela cualquier debounce pendiente (evita que se dispare justo al guardar)
    if (debouncers.current[fridge._id]) {
      clearTimeout(debouncers.current[fridge._id]);
      debouncers.current[fridge._id] = null;
    }

    // 2) Cancela "pendiente" de autosave para esta nevera
    pending.current[fridge._id] = false;

    // 3) Espera un máximo si hay autosave en vuelo
    const started = Date.now();
    while (inFlight.current[fridge._id]) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 120));
      if (Date.now() - started > 2500) break;
    }

    // 4) Guarda en modo manual (overlay visible)
    await doSaveFridge(fridge._id, { silentOverlay: false });
  };

  const toggleAutosave = () => {
    setAutoSave((v) => {
      const nv = !v;
      localStorage.setItem('autosave_fridges', nv ? '1' : '0');
      return nv;
    });
  };

  // Limpieza total en unmount: timers y flags
  useEffect(() => {
    return () => {
      Object.values(debouncers.current).forEach((t) => t && clearTimeout(t));
      debouncers.current = {};
      inFlight.current = {};
      pending.current = {};
    };
  }, []);

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  // Navegación entre modos (siempre visible)
  const goMode = (mode) => {
    const params = new URLSearchParams(window.location.search);
    params.set('mode', mode);
    navigate({ search: params.toString() }, { replace: false });
  };

  if (loading) return <p>Loading location...</p>;
  if (!locationData) return <p>Location not found or error occurred.</p>;

  return (
    <div className="main-container">
      <NavBar />

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

      {/* Toggle de modos: SIEMPRE visible */}
      <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <strong>Inventario:</strong>
        <button
          className={`chip-radio ${viewMode === MODE_INITIAL ? 'active' : ''}`}
          onClick={() => goMode(MODE_INITIAL)}
        >
          Inicial
        </button>
        <button
          className={`chip-radio ${viewMode === MODE_FINAL ? 'active' : ''}`}
          onClick={() => goMode(MODE_FINAL)}
          title="En Final, los campos inician en 0"
        >
          Final
        </button>
        <span className="push-right" />
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

      <h2>
        Location: {locationData.name}{' '}
        <small style={{ fontWeight: 400, opacity: 0.8 }}>
          ({viewMode === MODE_FINAL ? 'Inventario Final' : 'Inventario Inicial'})
        </small>
      </h2>
      {lastEdit && (
        <div className="pill" title={lastEdit.source ? `Fuente: ${lastEdit.source}` : undefined} style={{ margin: '6px 0 12px' }}>
          Última edición: <b>{lastEdit.actorName || '—'}</b>
          <span style={{ opacity: .8 }}> · {new Date(lastEdit.at).toLocaleString()}</span>
        </div>
      )}

      {/* Inventario (sesión) */}
      <div className="card" style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <strong style={{ marginRight: 8 }}>Sesión</strong>
        {!invActive ? (
          <button onClick={handleStartInventory} disabled={invBusy}>
            {invBusy ? 'Iniciando…' : 'Iniciar sesión'}
          </button>
        ) : (
          <>
            <span className="pill">
              Activa desde:&nbsp;
              <b>{new Date(invActive.startedAt || Date.now()).toLocaleString()}</b>
            </span>
            <button onClick={handleCloseWithFinal} disabled={invBusy}>
              {invBusy ? 'Cerrando…' : `Cerrar con ${viewMode === MODE_FINAL ? 'FINAL (vista Final)' : 'FINAL (vista Inicial)'}`}
            </button>
          </>
        )}
      </div>

      {/* Nota modo Final */}
      {viewMode === MODE_FINAL && (
        <div className="card" style={{ borderColor: '#ef4444', background: '#fff1f2', marginBottom: 10 }}>
          <b>Vista Final:</b> los campos inician en 0. El autosave actualizará el inventario con los valores que ingreses.
          Al cerrar la sesión desde esta vista, se enviará el snapshot final con estos valores.
        </div>
      )}

      {locationData.refrigerators?.length ? (
        <div className="fridge-stack">
          {locationData.refrigerators.map((fridge) => {
            const disabled = savingFridgeId === fridge._id;
            const thisRowSaving = rowSaving[fridge._id] || {};
            const frEdits = (fridgeEditsByMode[viewMode] || {})[fridge._id] || {};
            const frDirty = (dirtyMapByMode[viewMode] || {})[fridge._id] || {};

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
                          const refKey = `${fridge._id}-${index}`;
                          // Valor a mostrar: por modo
                          const displayVal =
                            frEdits[prod.productName] ??
                            (viewMode === MODE_INITIAL
                              ? String(prod.quantity) // initial: refleja backend
                              : '' // final: base 0
                            );
                          const savingThisRow = !!thisRowSaving[prod.productName];

                          return (
                            <tr key={prod.productName}>
                              <td>
                                {prod.productName}
                                {(savingThisRow || frDirty[prod.productName]) && (
                                  <span
                                    aria-label={savingThisRow ? 'Guardando…' : 'Editando…'}
                                    title={savingThisRow ? 'Guardando…' : 'Editando…'}
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
                                  inputMode={isMobile ? 'text' : 'decimal'}
                                  autoComplete="off"
                                  autoCorrect="off"
                                  spellCheck={false}
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
