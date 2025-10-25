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

// Helper
const isStableNumber = (s) => /^\s*\d+\s*$/.test(String(s ?? ''));
const toInt = (s) => {
  if (s === '' || s == null) return 0;
  const n = parseInt(String(s).replace(/\D+/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};

function LocationPage() {
  const { locationId } = useParams();
  const navigate = useNavigate();
  const token = useSelector((s) => s.auth.token);
  const role = useSelector((s) => s.auth.role);
  const viewMode = useQueryMode(); // 'initial' | 'final'

  // Inventory session
  const [invActive, setInvActive] = useState(null); // { _id, startedAt } | null
  const [invBusy, setInvBusy] = useState(false);

  const [locationData, setLocationData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState('');
  const [newFridgeName, setNewFridgeName] = useState('');
  const [standardOrder, setStandardOrder] = useState([]);

  // Last edit (who/when)
  const [lastEdit, setLastEdit] = useState(null); // { at: ISO, actorName: string|null, source?:string }

  // Edits by mode: { initial: { [fridgeId]: { [productName]: "12" } }, final: { ... } }
  const [fridgeEditsByMode, setFridgeEditsByMode] = useState({
    [MODE_INITIAL]: {},
    [MODE_FINAL]: {},
  });

  // Persistent product parts UI state (mirrors backend parts)
  // { [fridgeId]: { [productName]: [{ id, label, qtyStr }] } }
  const [fridgeParts, setFridgeParts] = useState({});

  // Toggle visibility per product parts panel
  // { [fridgeId]: { [productName]: true|false } }
  const [partsOpen, setPartsOpen] = useState({});

  // UI states
  const [savingFridgeId, setSavingFridgeId] = useState(null);
  const [toast, setToast] = useState(null); // { type:'ok'|'error', text:string }
  const [autoSave, setAutoSave] = useState(() => {
    const v = localStorage.getItem('autosave_fridges');
    return v ? v === '1' : true;
  });

  // autosave coalescing
  const inFlight = useRef({});
  const pending = useRef({});
  const [rowSaving, setRowSaving] = useState({});
  const [dirtyMapByMode, setDirtyMapByMode] = useState({
    [MODE_INITIAL]: {},
    [MODE_FINAL]: {},
  });
  const debouncers = useRef({});
  const inputRefs = useRef({});

  // Order helper
  const orderIndex = (name) => {
    const i = (standardOrder || []).findIndex(
      (s) => String(s).toLowerCase() === String(name).toLowerCase()
    );
    return i === -1 ? 9999 : i;
  };

  // Baseline from backend for initial
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

  // Baseline zero for final
  const baselineFinal = useMemo(() => {
    const m = {};
    if (locationData?.refrigerators) {
      locationData.refrigerators.forEach((fr) => {
        const inner = {};
        fr.products.forEach((p) => {
          inner[p.productName] = ''; // '' = 0
        });
        m[fr._id] = inner;
      });
    }
    return m;
  }, [locationData]);

  const activeBaseline = viewMode === MODE_FINAL ? baselineFinal : baselineInitial;
  const fridgeEdits = useMemo(
    () => fridgeEditsByMode[viewMode] || {},
    [fridgeEditsByMode, viewMode]
  );
  const thisDirtyMap = useMemo(
    () => dirtyMapByMode[viewMode] || {},
    [dirtyMapByMode, viewMode]
  );

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

  // Keep visible only simple saving flags (avoid stuck overlays)
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

  // ---- Fetch ----
  useEffect(() => {
    if (!locationId) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    (async () => {
      try {
        const res = await API.get(`/locations/${locationId}`, {
          signal: controller.signal,
          timeout: 15000,
        });
        const data = res.data;
        setLocationData(data);
        setNewName(data?.name || '');

        // Initialize edits per mode
        const initInitial = {};
        const initFinal = {};
        const parts = {};

        if (data?.refrigerators) {
          data.refrigerators.forEach((fr) => {
            const eInitial = {};
            const eFinal = {};
            const partsForFr = {};

            fr.products.forEach((p) => {
              // initial baseline from backend
              eInitial[p.productName] = p.quantity === 0 ? '' : String(p.quantity);
              // final baseline zero
              eFinal[p.productName] = '';

              // load parts from backend (persistent)
              const pParts = Array.isArray(p.parts) ? p.parts : [];
              partsForFr[p.productName] = pParts.map((line, idx) => ({
                id: `${fr._id}-${p.productName}-${idx}-${Date.now()}`,
                label: String(line.label || ''),
                qtyStr: String(line.quantity ?? 0),
              }));
            });

            initInitial[fr._id] = eInitial;
            initFinal[fr._id] = eFinal;
            parts[fr._id] = partsForFr;
          });
        }

        setFridgeEditsByMode({ [MODE_INITIAL]: initInitial, [MODE_FINAL]: initFinal });
        setDirtyMapByMode({ [MODE_INITIAL]: {}, [MODE_FINAL]: {} });
        setFridgeParts(parts);
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

  // Last edit (optional)
  useEffect(() => {
    if (!locationId) return;
    const ac = new AbortController();
    (async () => {
      try {
        const r = await API.get(`/locations/${locationId}/last-edit`, {
          signal: ac.signal,
          timeout: 10000,
        });
        const data = r.data?.data;
        if (data?.at) {
          setLastEdit({
            at: data.at,
            actorName: data.actorName || null,
            source: data.source || null,
          });
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

  // ===== Inventory sessions =====
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

  function buildFinalSnapshotFromActiveEdits() {
    const out = [];
    for (const fr of locationData?.refrigerators || []) {
      const editsForFr = (fridgeEditsByMode[viewMode] || {})[fr._id] || {};
      const products = (fr.products || []).map((p) => {
        const raw = editsForFr[p.productName];
        const q =
          raw === '' || raw == null ? 0 : parseInt(String(raw).replace(/\D+/g, ''), 10) || 0;
        return { productName: p.productName, quantity: q };
      });
      out.push({ fridgeId: fr._id, products });
    }
    return out;
  }

  async function handleStartInventory() {
    if (invBusy) return;
    setInvBusy(true);
    try {
      await API.post(`/locations/inventory-sessions/start`, { locationId }, { timeout: 15000 });
      await fetchActiveInv();
      setToast({ type: 'ok', text: 'Initial inventory session started.' });
    } catch (e) {
      console.error(e);
      const msg = e?.response?.data?.message || 'Could not start the session.';
      setToast({ type: 'error', text: msg });
    } finally {
      setInvBusy(false);
    }
  }

  async function handleCloseWithFinal() {
    if (invBusy || !invActive?._id) return;
    const ok = window.confirm(
      `The session will be closed using the values from the "${viewMode === MODE_FINAL ? 'Final' : 'Initial'}" view. Confirm?`
    );
    if (!ok) return;

    setInvBusy(true);
    try {
      const finalSnapshot = buildFinalSnapshotFromActiveEdits();
      const res = await API.patch(
        `/locations/inventory-sessions/${invActive._id}/final`,
        { finalSnapshot },
        { timeout: 20000 }
      );
      const closedSessionId = res?.data?.session?._id;
      if (closedSessionId) {
        rememberClosedSession(locationId, closedSessionId);
      }
      await fetchActiveInv();
      setToast({ type: 'ok', text: 'Final inventory recorded and session closed.' });
    } catch (e) {
      console.error(e);
      const msg = e?.response?.data?.message || 'Could not close the session.';
      setToast({ type: 'error', text: msg });
    } finally {
      setInvBusy(false);
    }
  }

  // --- Admin actions ---
  const handleRenameLocation = async () => {
    if (role !== 'admin' && role !== 'superuser') return;
    if (!newName.trim()) return alert('Name cannot be empty.');
    try {
      const res = await API.put(`/locations/${locationId}`, { name: newName }, { timeout: 12000 });
      setLocationData((prev) => ({ ...prev, name: newName }));
      setToast({ type: 'ok', text: res.data.message || 'Location renamed.' });
    } catch {
      setToast({ type: 'error', text: 'Error renaming location.' });
    }
  };

  const handleDeleteLocation = async () => {
    if (role !== 'admin' && role !== 'superuser') return;
    const confirmed = window.confirm('Are you sure you want to delete this location?');
    if (!confirmed) return;
    try {
      await API.delete(`/locations/${locationId}`, { timeout: 12000 });
      setToast({ type: 'ok', text: 'Location deleted.' });
      navigate('/home');
    } catch {
      setToast({ type: 'error', text: 'Error deleting location.' });
    }
  };

  const handleCreateFridge = async () => {
    if (role !== 'admin' && role !== 'superuser') return;
    if (!newFridgeName.trim()) return alert('Fridge name is required.');
    try {
      const res = await API.post(
        `/locations/${locationId}/refrigerators`,
        { name: newFridgeName },
        { timeout: 12000 }
      );
      const refetch = await API.get(`/locations/${locationId}`, { timeout: 12000 });
      setLocationData(refetch.data);
      setNewFridgeName('');
      setToast({ type: 'ok', text: res.data.message || 'Fridge created.' });
    } catch (err) {
      setToast({
        type: 'error',
        text: err?.response?.data?.message || 'Error creating fridge.',
      });
    }
  };

  const handleRenameFridge = async (fridge) => {
    const n = prompt('Enter new fridge name', fridge.name);
    if (!n) return;
    try {
      const res = await API.put(
        `/locations/${locationId}/refrigerators/${fridge._id}`,
        { newName: n },
        { timeout: 12000 }
      );
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

  // ===== Parts panel handlers =====
  const toggleParts = (fridgeId, productName) => {
    setPartsOpen((prev) => ({
      ...prev,
      [fridgeId]: { ...(prev[fridgeId] || {}), [productName]: !prev?.[fridgeId]?.[productName] },
    }));
  };

  const addPartLine = (fridgeId, productName) => {
    setPartsOpen((prev) => ({
      ...prev,
      [fridgeId]: { ...(prev[fridgeId] || {}), [productName]: true },
    }));
    setFridgeParts((prev) => {
      const fr = { ...(prev[fridgeId] || {}) };
      const arr = [...(fr[productName] || [])];
      arr.push({
        id: `${fridgeId}-${productName}-${Date.now()}`,
        label: '',
        qtyStr: '0',
      });
      fr[productName] = arr;
      return { ...prev, [fridgeId]: fr };
    });
    // Trigger autosave debounce on the fridge (sum will change when user edits)
  };

  const removePartLine = (fridgeId, productName, id) => {
    setFridgeParts((prev) => {
      const fr = { ...(prev[fridgeId] || {}) };
      const arr = (fr[productName] || []).filter((x) => x.id !== id);
      fr[productName] = arr;
      return { ...prev, [fridgeId]: fr };
    });
    // After removing, recompute total and update edits
    recomputeTotalFromParts(fridgeId, productName);
    queueAutoSave(fridgeId);
  };

  const changePartField = (fridgeId, productName, id, field, value) => {
    setFridgeParts((prev) => {
      const fr = { ...(prev[fridgeId] || {}) };
      const arr = [...(fr[productName] || [])];
      const idx = arr.findIndex((x) => x.id === id);
      if (idx !== -1) {
        arr[idx] = { ...arr[idx], [field]: value };
      }
      fr[productName] = arr;
      return { ...prev, [fridgeId]: fr };
    });

    if (field === 'qtyStr' && isStableNumber(value)) {
      // Update total immediately
      recomputeTotalFromParts(fridgeId, productName);
      queueAutoSave(fridgeId);
    }
  };

  const recomputeTotalFromParts = (fridgeId, productName) => {
    const arr = (fridgeParts?.[fridgeId]?.[productName] || []);
    const sum = arr.reduce((acc, l) => acc + toInt(l.qtyStr), 0);
    // Update active mode edit total
    setFridgeEditsByMode((prev) => {
      const copy = { ...prev };
      const modeMap = { ...(copy[viewMode] || {}) };
      const fr = { ...(modeMap[fridgeId] || {}) };
      fr[productName] = sum === 0 ? '' : String(sum);
      modeMap[fridgeId] = fr;
      copy[viewMode] = modeMap;
      return copy;
    });
    // Mark dirty
    setDirtyMapByMode((prev) => {
      const copy = { ...prev };
      const dmMode = { ...(copy[viewMode] || {}) };
      const dmFr = { ...(dmMode[fridgeId] || {}) };
      dmFr[productName] = true;
      dmMode[fridgeId] = dmFr;
      copy[viewMode] = dmMode;
      return copy;
    });
  };

  // ===== Autosave =====
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

  // ===== Save (manual + autosave) =====
  const doSaveFridge = async (fridgeId, { silentOverlay = false } = {}) => {
    const edits = (fridgeEditsByMode[viewMode] || {})[fridgeId] || {};
    const currentBase =
      (viewMode === MODE_FINAL ? baselineFinal : baselineInitial)[fridgeId] || {};
    const changed = Object.keys(edits).filter(
      (p) => String(edits[p] ?? '') !== String(currentBase[p] ?? '')
    );

    if (changed.length === 0) {
      if (!silentOverlay) setToast({ type: 'ok', text: 'No changes to save.' });
      return;
    }

    // Prepare updates with parts if present
    const updates = changed.map((pName) => {
      const partsArr = (fridgeParts?.[fridgeId]?.[pName] || []).map((line) => ({
        label: String(line.label || ''),
        quantity: toInt(line.qtyStr),
      }));
      const hasParts = partsArr.some((x) => Number.isFinite(x.quantity));
      return {
        productName: pName,
        quantity: toInt(edits[pName]),
        ...(hasParts ? { parts: partsArr } : {}),
      };
    });

    try {
      if (!silentOverlay) setSavingFridgeId(fridgeId);

      // Row spinners
      setRowSaving((prev) => ({
        ...prev,
        [fridgeId]: {
          ...(prev[fridgeId] || {}),
          ...Object.fromEntries(changed.map((p) => [p, true])),
        },
      }));

      await API.put(
        `/locations/${locationId}/refrigerators/${fridgeId}/products/batch`,
        { updates },
        { timeout: 15000 }
      );

      if (silentOverlay) {
        // Local reconcile without refetch
        setLocationData((prev) => {
          if (!prev) return prev;
          const next = { ...prev };
          next.refrigerators = (prev.refrigerators || []).map((fr) => {
            if (String(fr._id) !== String(fridgeId)) return fr;
            const copy = { ...fr, products: [...(fr.products || [])] };
            copy.products = copy.products.map((p) => {
              const u = updates.find((x) => x.productName === p.productName);
              if (u) {
                return {
                  ...p,
                  quantity: toInt(u.quantity),
                  parts: Array.isArray(u.parts) ? u.parts : p.parts,
                };
              }
              return p;
            });
            return copy;
          });
          return next;
        });

        // Edits + dirty reset for changed fields (only if value matches)
        setFridgeEditsByMode((prevAll) => {
          const byMode = { ...prevAll };
          const modeMap = { ...(byMode[viewMode] || {}) };
          const fr = { ...(modeMap[fridgeId] || {}) };
          for (const pName of changed) {
            const sent = String(toInt(edits[pName]));
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
        // Manual save: refetch (keeps other users' changes aligned)
        const refetch = await API.get(`/locations/${locationId}`, { timeout: 15000 });
        const fresh = refetch.data;
        setLocationData(fresh);

        // Sync parts state from backend
        setFridgeParts((prev) => {
          const next = { ...prev };
          (fresh.refrigerators || []).forEach((fr) => {
            const forFr = { ...(next[fr._id] || {}) };
            fr.products.forEach((p) => {
              const pParts = Array.isArray(p.parts) ? p.parts : [];
              forFr[p.productName] = pParts.map((line, idx) => ({
                id: `${fr._id}-${p.productName}-${idx}-${Date.now()}`,
                label: String(line.label || ''),
                qtyStr: String(line.quantity ?? 0),
              }));
            });
            next[fr._id] = forFr;
          });
          return next;
        });

        // Realign ONLY active mode edits
        setFridgeEditsByMode((prevAll) => {
          const byMode = { ...prevAll };
          const modeMap = { ...(byMode[viewMode] || {}) };

          for (const fr of fresh.refrigerators || []) {
            const frId = String(fr._id);
            const frDirty = (dirtyMapByMode[viewMode] || {})[frId] || {};
            const updated = { ...(modeMap[frId] || {}) };
            fr.products.forEach((p) => {
              if (!frDirty[p.productName]) {
                if (viewMode === MODE_INITIAL) {
                  updated[p.productName] = p.quantity === 0 ? '' : String(p.quantity);
                } else {
                  // final: leave as '' baseline if not dirty
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

      if (!silentOverlay) setToast({ type: 'ok', text: 'Changes saved.' });
    } catch (err) {
      console.error(err);
      setToast({ type: 'error', text: 'Error saving changes.' });
    } finally {
      if (!silentOverlay) setSavingFridgeId(null);
      // clear row spinners
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
    if (debouncers.current[fridge._id]) {
      clearTimeout(debouncers.current[fridge._id]);
      debouncers.current[fridge._id] = null;
    }
    pending.current[fridge._id] = false;

    const started = Date.now();
    while (inFlight.current[fridge._id]) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 120));
      if (Date.now() - started > 2500) break;
    }

    await doSaveFridge(fridge._id, { silentOverlay: false });
  };

  const toggleAutosave = () => {
    setAutoSave((v) => {
      const nv = !v;
      localStorage.setItem('autosave_fridges', nv ? '1' : '0');
      return nv;
    });
  };

  // Cleanup
  useEffect(() => {
    return () => {
      Object.values(debouncers.current).forEach((t) => t && clearTimeout(t));
      debouncers.current = {};
      inFlight.current = {};
      pending.current = {};
    };
  }, []);

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  // Mode navigation (always visible)
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
          {hasAnySaving ? 'Saving changes…' : 'You have unsaved changes.'}
        </div>
      )}

      {/* Mode toggle */}
      <div
        className="card"
        style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}
      >
        <strong>Inventory:</strong>
        <button
          className={`chip-radio ${viewMode === MODE_INITIAL ? 'active' : ''}`}
          onClick={() => goMode(MODE_INITIAL)}
        >
          Initial
        </button>
        <button
          className={`chip-radio ${viewMode === MODE_FINAL ? 'active' : ''}`}
          onClick={() => goMode(MODE_FINAL)}
          title="In Final view, inputs start at 0"
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
          Auto-save by fridge
        </label>
      </div>

      <h2>
        Location: {locationData.name}{' '}
        <small style={{ fontWeight: 400, opacity: 0.8 }}>
          ({viewMode === MODE_FINAL ? 'Final Inventory' : 'Initial Inventory'})
        </small>
      </h2>

      {lastEdit && (
        <div
          className="pill"
          title={lastEdit.source ? `Source: ${lastEdit.source}` : undefined}
          style={{ margin: '6px 0 12px' }}
        >
          Last edit: <b>{lastEdit.actorName || '—'}</b>
          <span style={{ opacity: 0.8 }}> · {new Date(lastEdit.at).toLocaleString()}</span>
        </div>
      )}

      {/* Inventory session bar */}
      <div
        className="card"
        style={{
          marginBottom: '0.75rem',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <strong style={{ marginRight: 8 }}>Session</strong>
        {!invActive ? (
          <button onClick={handleStartInventory} disabled={invBusy}>
            {invBusy ? 'Starting…' : 'Start session'}
          </button>
        ) : (
          <>
            <span className="pill">
              Active since:&nbsp;
              <b>{new Date(invActive.startedAt || Date.now()).toLocaleString()}</b>
            </span>
            <button onClick={handleCloseWithFinal} disabled={invBusy}>
              {invBusy
                ? 'Closing…'
                : `Close with ${viewMode === MODE_FINAL ? 'FINAL (Final view)' : 'FINAL (Initial view)'}`}
            </button>
          </>
        )}
      </div>

      {/* Final mode hint */}
      {viewMode === MODE_FINAL && (
        <div
          className="card"
          style={{ borderColor: '#ef4444', background: '#fff1f2', marginBottom: 10 }}
        >
          <b>Final view:</b> Fields start at 0. Autosave will update the inventory with the values
          you enter. When you close the session from this view, the final snapshot will use these
          values.
        </div>
      )}

      <p>Created By: {locationData.createdBy?.name}</p>
      <p>Users assigned: {locationData.users?.length || 0}</p>

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
                      <span className="pill" title="Confirmed changes are auto-saved">
                        Auto-save: <b>ON</b>
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
                      Product table for fridge {fridge.name}
                    </caption>
                    <thead>
                      <tr>
                        <th style={{ width: '40%' }}>Product</th>
                        <th className="num" style={{ width: '20%' }}>Total</th>
                        <th style={{ width: '40%' }} className="num">
                          Parts (breakdown)
                        </th>
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
                          const displayVal =
                            frEdits[prod.productName] ??
                            (viewMode === MODE_INITIAL ? String(prod.quantity) : '');
                          const savingThisRow = !!thisRowSaving[prod.productName];
                          const open = !!partsOpen?.[fridge._id]?.[prod.productName];
                          const partsArr = fridgeParts?.[fridge._id]?.[prod.productName] || [];

                          const totalFromParts = partsArr.reduce(
                            (acc, l) => acc + toInt(l.qtyStr),
                            0
                          );
                          const showPartsTotalHint =
                            partsArr.length > 0 && toInt(displayVal) !== totalFromParts;

                          return (
                            <tr key={prod.productName}>
                              <td>
                                <div className="flex-row" style={{ gap: 8, alignItems: 'center' }}>
                                  <button
                                    type="button"
                                    className="btn btn--secondary"
                                    onClick={() =>
                                      toggleParts(fridge._id, prod.productName)
                                    }
                                    aria-expanded={open}
                                    aria-controls={`parts-${fridge._id}-${index}`}
                                    title={open ? 'Hide parts' : 'Show parts'}
                                  >
                                    {open ? '▾' : '▸'}
                                  </button>
                                  <span>{prod.productName}</span>
                                  {(savingThisRow || frDirty[prod.productName]) && (
                                    <span
                                      aria-label={savingThisRow ? 'Saving…' : 'Editing…'}
                                      title={savingThisRow ? 'Saving…' : 'Editing…'}
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
                                </div>
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
                                  aria-label={`Quantity of ${prod.productName}`}
                                  inputMode={isMobile ? 'text' : 'decimal'}
                                  autoComplete="off"
                                  autoCorrect="off"
                                  spellCheck={false}
                                />
                                {showPartsTotalHint && (
                                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                                    Parts sum: <b>{totalFromParts}</b>
                                  </div>
                                )}
                              </td>
                              <td>
                                {/* Parts panel */}
                                {open && (
                                  <div
                                    id={`parts-${fridge._id}-${index}`}
                                    className="parts-panel"
                                    style={{
                                      display: 'grid',
                                      gap: 8,
                                      alignItems: 'center',
                                    }}
                                  >
                                    {(partsArr || []).length === 0 && (
                                      <em style={{ opacity: 0.75 }}>
                                        No parts yet. Add lines for shelves or sub-areas.
                                      </em>
                                    )}

                                    {(partsArr || []).map((line) => (
                                      <div
                                        key={line.id}
                                        className="flex-row"
                                        style={{ gap: 8, alignItems: 'center' }}
                                      >
                                        <input
                                          type="text"
                                          value={line.label}
                                          onChange={(e) =>
                                            changePartField(
                                              fridge._id,
                                              prod.productName,
                                              line.id,
                                              'label',
                                              e.target.value
                                            )
                                          }
                                          placeholder="Label (e.g., top shelf)"
                                          style={{ flex: 1, minWidth: 140 }}
                                        />
                                        <input
                                          type="text"
                                          value={line.qtyStr}
                                          onChange={(e) =>
                                            changePartField(
                                              fridge._id,
                                              prod.productName,
                                              line.id,
                                              'qtyStr',
                                              e.target.value
                                            )
                                          }
                                          onBlur={() => {
                                            // Normalize blanks/non-numbers to 0
                                            changePartField(
                                              fridge._id,
                                              prod.productName,
                                              line.id,
                                              'qtyStr',
                                              String(toInt(line.qtyStr))
                                            );
                                            recomputeTotalFromParts(fridge._id, prod.productName);
                                          }}
                                          inputMode={isMobile ? 'text' : 'decimal'}
                                          placeholder="0"
                                          style={{ width: 90, textAlign: 'right' }}
                                        />
                                        <button
                                          type="button"
                                          className="btn btn--danger"
                                          onClick={() =>
                                            removePartLine(
                                              fridge._id,
                                              prod.productName,
                                              line.id
                                            )
                                          }
                                          title="Remove line"
                                        >
                                          ×
                                        </button>
                                      </div>
                                    ))}

                                    <div className="flex-row" style={{ gap: 8 }}>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          addPartLine(fridge._id, prod.productName)
                                        }
                                      >
                                        + Add part
                                      </button>
                                      <span className="push-right" />
                                      <small style={{ opacity: 0.7 }}>
                                        Total by parts:{' '}
                                        <b>
                                          {partsArr.reduce(
                                            (acc, l) => acc + toInt(l.qtyStr),
                                            0
                                          )}
                                        </b>
                                      </small>
                                    </div>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>

                <div className="fridge-foot">
                  <button onClick={() => handleSaveFridge(fridge)} disabled={disabled}>
                    {disabled ? 'Saving…' : 'Save changes'}
                  </button>
                </div>

                {savingFridgeId === fridge._id && (
                  <SavingOverlay label={`Saving "${fridge.name}"…`} />
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <p>No refrigerators in this location yet.</p>
      )}

      {(role === 'admin' || role === 'superuser') && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h4>Create new fridge</h4>
          <div className="flex-row stack-sm">
            <input
              type="text"
              placeholder="Fridge name"
              value={newFridgeName}
              onChange={(e) => setNewFridgeName(e.target.value)}
              style={{ maxWidth: 360 }}
            />
            <button onClick={handleCreateFridge}>Create</button>
          </div>
        </div>
      )}

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
            aria-label="Close notification"
          >
            ×
          </button>
        </div>
      )}

      <style>{`@keyframes hawking-spin { to { transform: rotate(360deg); } }`}</style>

      <Footer />
    </div>
  );
}

function SavingOverlay({ label = 'Saving…' }) {
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
