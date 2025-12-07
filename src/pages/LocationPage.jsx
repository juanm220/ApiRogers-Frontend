import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import API from '../apiService';
import { useSelector } from 'react-redux';
import NavBar from '../components/NavBar';
import NumberInput from '../components/NumberInput';
import '../styles.css';
import Footer from '../components/Footer';
import { rememberClosedSession } from '../utils/inventorySessionStorage';
import jsPDF from 'jspdf';


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

  // Inventory (session)
  const [invActive, setInvActive] = useState(null); // { _id, startedAt } | null
  const [invBusy, setInvBusy] = useState(false);

  const [locationData, setLocationData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState('');
  const [newFridgeName, setNewFridgeName] = useState('');
  const [standardOrder, setStandardOrder] = useState([]);

  // Last edit meta
  const [lastEdit, setLastEdit] = useState(null); // { at: ISO, actorName: string|null, source?:string }

  // Edits per mode:
  // quantities: { [fridgeId]: { [productName]: "12" } }
  const [fridgeEditsByMode, setFridgeEditsByMode] = useState({
    [MODE_INITIAL]: {},
    [MODE_FINAL]: {},
  });

  // Parts (per mode): { [fridgeId]: { [productName]: [{label, quantity}] } }
  const [partsEditsByMode, setPartsEditsByMode] = useState({
    [MODE_INITIAL]: {},
    [MODE_FINAL]: {},
  });

  // Expanded state per product row (UI only, auto-open if parts exist)
  const [expandedMap, setExpandedMap] = useState({}); // { [fridgeId]: { [productName]: boolean } }

  // UI states
  const [savingFridgeId, setSavingFridgeId] = useState(null);
  const [toast, setToast] = useState(null); // { type:'ok'|'error', text:string }
  const [autoSave, setAutoSave] = useState(() => {
    const v = localStorage.getItem('autosave_fridges');
    return v ? v === '1' : true;
  });

  const isStableNumber = (s) => /^\s*\d+\s*$/.test(String(s ?? ''));

  // autosave orchestration
  const inFlight = useRef({});
  const pending = useRef({});
  const [rowSaving, setRowSaving] = useState({});
  const [dirtyMapByMode, setDirtyMapByMode] = useState({
    [MODE_INITIAL]: {},
    [MODE_FINAL]: {},
  });
  const debouncers = useRef({});
  const inputRefs = useRef({});

  const orderIndex = (name) => {
    const i = (standardOrder || []).findIndex(
      (s) => String(s).toLowerCase() === String(name).toLowerCase()
    );
    return i === -1 ? 9999 : i;
  };

  // Baseline for initial mode = backend quantities
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

  // Baseline for final mode = empty (0)
  const baselineFinal = useMemo(() => {
    const m = {};
    if (locationData?.refrigerators) {
      locationData.refrigerators.forEach((fr) => {
        const inner = {};
        fr.products.forEach((p) => {
          inner[p.productName] = '';
        });
        m[fr._id] = inner;
      });
    }
    return m;
  }, [locationData]);

  // Baseline parts (for change detection) from backend
  const baselineParts = useMemo(() => {
    const m = {};
    if (locationData?.refrigerators) {
      locationData.refrigerators.forEach((fr) => {
        const inner = {};
        fr.products.forEach((p) => {
          inner[p.productName] = Array.isArray(p.parts)
            ? p.parts.map((pp) => ({
                label: String(pp.label || ''),
                quantity: Number(pp.quantity) || 0,
              }))
            : [];
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
  const partsEdits = useMemo(
    () => partsEditsByMode[viewMode] || {},
    [partsEditsByMode, viewMode]
  );
  const thisDirtyMap = useMemo(
    () => dirtyMapByMode[viewMode] || {},
    [dirtyMapByMode, viewMode]
  );

  // Unsaved check (quantities + parts vs baselines)
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
    const frPartIds = Object.keys(partsEdits || {});
    for (const frId of frPartIds) {
      const prodNames = Object.keys(partsEdits[frId] || {});
      for (const pName of prodNames) {
        const cur = (partsEdits[frId] || {})[pName] || [];
        const base = (baselineParts[frId] || {})[pName] || [];
        const norm = (arr) =>
          (arr || []).map((x) => ({
            label: String(x.label || ''),
            quantity: Number(x.quantity) || 0,
          }));
        const a = JSON.stringify(norm(cur));
        const b = JSON.stringify(norm(base));
        if (a !== b) return true;
      }
    }
    return false;
  }, [fridgeEdits, activeBaseline, partsEdits, baselineParts]);

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
        const res = await API.get(`/locations/${locationId}`, {
          signal: controller.signal,
          timeout: 15000,
        });
        setLocationData(res.data);
        setNewName(res.data?.name || '');

        // initialize edits for both modes + parts from backend
        const initInitial = {};
        const initFinal = {};
        const initParts = {}; // same for both modes initially (from backend)
        const expInit = {};

        if (res.data?.refrigerators) {
          res.data.refrigerators.forEach((fr) => {
            const eInitial = {};
            const eFinal = {};
            const pMap = {};
            const expMap = {};
            fr.products.forEach((p) => {
              // initial: backend values
              eInitial[p.productName] = p.quantity === 0 ? '' : String(p.quantity);
              // final: zero baseline
              eFinal[p.productName] = '';

              // parts from backend (if any)
              const parts = Array.isArray(p.parts)
                ? p.parts.map((pp) => ({
                    label: String(pp.label || ''),
                    quantity: Number(pp.quantity) || 0,
                  }))
                : [];

              pMap[p.productName] = parts;
              // auto expand if there are additional parts saved
              expMap[p.productName] = parts.length > 0;
            });
            initInitial[fr._id] = eInitial;
            initFinal[fr._id] = eFinal;
            initParts[fr._id] = pMap;
            expInit[fr._id] = expMap;
          });
        }

        setFridgeEditsByMode({
          [MODE_INITIAL]: initInitial,
          [MODE_FINAL]: initFinal,
        });
        // use same parts for both modes initially (you can diverge later per mode)
        setPartsEditsByMode({
          [MODE_INITIAL]: initParts,
          [MODE_FINAL]: JSON.parse(JSON.stringify(initParts)),
        });
        setDirtyMapByMode({ [MODE_INITIAL]: {}, [MODE_FINAL]: {} });
        setExpandedMap(expInit);
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

  // Last edit meta
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

  // ======== Inventory session ========
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
      const partsForFr = (partsEditsByMode[viewMode] || {})[fr._id] || {};
      const products = (fr.products || []).map((p) => {
        const raw = editsForFr[p.productName];
        const q =
          raw === '' || raw == null
            ? 0
            : parseInt(String(raw).replace(/\D+/g, ''), 10) || 0;
        const parts = Array.isArray(partsForFr[p.productName])
          ? partsForFr[p.productName].map((pp) => ({
              label: String(pp.label || ''),
              quantity: Math.max(0, Number(pp.quantity) || 0),
            }))
          : [];
        const totalFromParts =
          parts.length > 0 ? parts.reduce((a, b) => a + (Number(b.quantity) || 0), 0) : null;

        return {
          productName: p.productName,
          quantity: totalFromParts != null ? totalFromParts : q,
          ...(parts.length ? { parts } : {}),
        };
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
      const msg = e?.response?.data?.message || 'The session could not be started.';
      setToast({ type: 'error', text: msg });
    } finally {
      setInvBusy(false);
    }
  }

  async function handleCloseWithFinal() {
    if (invBusy || !invActive?._id) return;
    const ok = window.confirm(
      `The session will be closed with the values from the "${
        viewMode === MODE_FINAL ? 'Final' : 'Initial'
      }" view. Confirm?`
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

  // ---- admin actions ----
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
      await API.delete(`/locations/${locationId}/refrigerators/${fridge._id}`, {
        timeout: 12000,
      });
      const refetch = await API.get(`/locations/${locationId}`, { timeout: 12000 });
      setLocationData(refetch.data);
      setToast({ type: 'ok', text: 'Fridge deleted!' });
    } catch {
      setToast({ type: 'error', text: 'Error deleting fridge.' });
    }
  };

  // ---- parts helpers ----
  const getParts = (fridgeId, productName) =>
    ((partsEdits[fridgeId] || {})[productName] || []).map((p) => ({
      label: String(p.label || ''),
      quantity: String(p.quantity ?? ''),
    }));

  const setParts = (fridgeId, productName, nextParts) => {
    setPartsEditsByMode((prev) => {
      const copy = { ...prev };
      const byMode = { ...(copy[viewMode] || {}) };
      const fr = { ...(byMode[fridgeId] || {}) };
      fr[productName] = nextParts;
      byMode[fridgeId] = fr;
      copy[viewMode] = byMode;
      return copy;
    });
  };

  const totalFromParts = (partsArr) =>
    (partsArr || []).reduce(
      (a, b) => a + (parseInt(String(b.quantity || '0'), 10) || 0),
      0
    );

  const ensureExpanded = (fridgeId, productName, expanded) => {
    setExpandedMap((prev) => {
      const copy = { ...prev };
      const fr = { ...(copy[fridgeId] || {}) };
      fr[productName] = expanded;
      copy[fridgeId] = fr;
      return copy;
    });
  };

  // Improved: seed the primary part from what the user currently sees in the main cell
  const addPart = (fridgeId, productName) => {
    // Read backend qty for this product (used for Initial mode when no edit yet)
    const fr = (locationData?.refrigerators || []).find(
      (x) => String(x._id) === String(fridgeId)
    );
    const backendQty = fr
      ? fr.products.find((p) => p.productName === productName)?.quantity || 0
      : 0;

    // Value currently visible in the main cell
    const mainNow =
      (fridgeEdits[fridgeId] || {})[productName] ??
      (viewMode === MODE_INITIAL ? String(backendQty) : '');

    const curParts = getParts(fridgeId, productName);
    const out = [...curParts];

    if (out.length === 0) {
      const seedQty = Math.max(0, parseInt(String(mainNow || '0'), 10) || 0);
      out.push({ label: 'Primary', quantity: seedQty });

      // keep the main cell in sync with the parts sum (same value)
      setFridgeEditsByMode((prev) => {
        const copy = { ...prev };
        const byMode = { ...(copy[viewMode] || {}) };
        const m = { ...(byMode[fridgeId] || {}) };
        m[productName] = seedQty === 0 ? '' : String(seedQty);
        byMode[fridgeId] = m;
        copy[viewMode] = byMode;
        return copy;
      });
    }

    // Add a new empty part the user can fill (e.g., "Bottom shelf")
    out.push({ label: 'Part', quantity: '' });

    setParts(fridgeId, productName, out);
    ensureExpanded(fridgeId, productName, true);
  };

  const removePartAt = (fridgeId, productName, idx) => {
    const cur = getParts(fridgeId, productName);
    if (idx < 0 || idx >= cur.length) return;
    const out = cur.filter((_, i) => i !== idx);
    setParts(fridgeId, productName, out);

    const sum = totalFromParts(out);
    // reflect new total in main cell
    setFridgeEditsByMode((prev) => {
      const copy = { ...prev };
      const byMode = { ...(copy[viewMode] || {}) };
      const fr = { ...(byMode[fridgeId] || {}) };
      fr[productName] = sum === 0 ? '' : String(sum);
      byMode[fridgeId] = fr;
      copy[viewMode] = byMode;
      return copy;
    });

    ensureExpanded(fridgeId, productName, out.length > 0);
    queueAutoSave(fridgeId);
  };

  const updatePart = (fridgeId, productName, idx, field, value) => {
    const cur = getParts(fridgeId, productName);
    if (idx < 0 || idx >= cur.length) return;
    const out = cur.map((p, i) =>
      i === idx
        ? {
            ...p,
            [field]: field === 'quantity' ? value : String(value || ''),
          }
        : p
    );
    setParts(fridgeId, productName, out);

    const sum = totalFromParts(out);
    // reflect in main cell
    setFridgeEditsByMode((prev) => {
      const copy = { ...prev };
      const byMode = { ...(copy[viewMode] || {}) };
      const fr = { ...(byMode[fridgeId] || {}) };
      fr[productName] = sum === 0 ? '' : String(sum);
      byMode[fridgeId] = fr;
      copy[viewMode] = byMode;
      return copy;
    });

    // mark dirty
    setDirtyMapByMode((prev) => {
      const copy = { ...prev };
      const dm = { ...(copy[viewMode] || {}) };
      dm[fridgeId] = { ...(dm[fridgeId] || {}), [productName]: true };
      copy[viewMode] = dm;
      return copy;
    });

    // autosave
    if (isStableNumber(value) || field === 'label') {
      queueAutoSave(fridgeId);
    }
  };

  // ---- edits / autosave ----
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
    // If parts exist for this product, main cell = primary part
    const curParts = getParts(fridgeId, productName);
    if (curParts.length > 0) {
      // Update primary part (index 0)
      updatePart(fridgeId, productName, 0, 'quantity', newVal);
      ensureExpanded(fridgeId, productName, true);
      return;
    }

    // Otherwise it's a plain single-cell quantity
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

  // Build updates array mixing quantity + parts for changed products
  const buildBatchUpdatesForFridge = (fridgeId) => {
    const edits = (fridgeEditsByMode[viewMode] || {})[fridgeId] || {};
    const parts = (partsEditsByMode[viewMode] || {})[fridgeId] || {};
    const baseQ = (viewMode === MODE_FINAL ? baselineFinal : baselineInitial)[fridgeId] || {};
    const baseParts = baselineParts[fridgeId] || {};

    const changedNames = new Set();

    // changes in quantities
    Object.keys(edits).forEach((p) => {
      if (String(edits[p] ?? '') !== String(baseQ[p] ?? '')) {
        changedNames.add(p);
      }
    });

    // changes in parts
    Object.keys(parts).forEach((p) => {
      const cur = parts[p] || [];
      const base = baseParts[p] || [];
      const norm = (arr) =>
        (arr || []).map((x) => ({
          label: String(x.label || ''),
          quantity: Number(x.quantity) || 0,
        }));
      if (JSON.stringify(norm(cur)) !== JSON.stringify(norm(base))) {
        changedNames.add(p);
      }
    });

    if (!changedNames.size) return [];

    const updates = [];
    for (const pName of changedNames) {
      const curQty = Math.max(0, parseInt(String(edits[pName] || '0'), 10) || 0);
      const curParts = Array.isArray(parts[pName]) ? parts[pName] : [];
      const cleanParts = curParts
        .map((pp) => ({
          label: String(pp.label || ''),
          quantity: Math.max(0, Number(pp.quantity) || 0),
        }))
        .filter((pp) => Number.isFinite(pp.quantity));

      const totalFromParts =
        cleanParts.length > 0
          ? cleanParts.reduce((a, b) => a + (Number(b.quantity) || 0), 0)
          : null;

      updates.push({
        productName: pName,
        quantity: totalFromParts != null ? totalFromParts : curQty,
        ...(cleanParts.length ? { parts: cleanParts } : {}),
      });
    }
    return updates;
  };

  // Save (used by autosave and manual)
  const doSaveFridge = async (fridgeId, { silentOverlay = false } = {}) => {
    const updates = buildBatchUpdatesForFridge(fridgeId);
    if (!updates.length) {
      if (!silentOverlay) setToast({ type: 'ok', text: 'There are no changes to save.' });
      return;
    }

    try {
      if (!silentOverlay) setSavingFridgeId(fridgeId);

      setRowSaving((prev) => {
        const copy = { ...prev };
        const flags = { ...(copy[fridgeId] || {}) };
        updates.forEach((u) => (flags[u.productName] = true));
        copy[fridgeId] = flags;
        return copy;
      });

      await API.put(
        `/locations/${locationId}/refrigerators/${fridgeId}/products/batch`,
        { updates },
        { timeout: 15000 }
      );

      // Reconcile local state (quantities + parts) using what we sent
      setLocationData((prev) => {
        if (!prev) return prev;
        const next = { ...prev };
        next.refrigerators = (prev.refrigerators || []).map((fr) => {
          if (String(fr._id) !== String(fridgeId)) return fr;
          const copy = { ...fr, products: [...(fr.products || [])] };
          copy.products = copy.products.map((p) => {
            const sent = updates.find((u) => u.productName === p.productName);
            if (!sent) return p;
            return {
              ...p,
              quantity: Number(sent.quantity) || 0,
              parts: Array.isArray(sent.parts) ? sent.parts : p.parts || [],
            };
          });
          return copy;
        });
        return next;
      });

      // Reflect back into edits maps (mode active)
      setFridgeEditsByMode((prevAll) => {
        const byMode = { ...prevAll };
        const modeMap = { ...(byMode[viewMode] || {}) };
        const fr = { ...(modeMap[fridgeId] || {}) };
        updates.forEach((u) => {
          const q = Number(u.quantity) || 0;
          fr[u.productName] = q === 0 ? '' : String(q);
        });
        modeMap[fridgeId] = fr;
        byMode[viewMode] = modeMap;
        return byMode;
      });

      setPartsEditsByMode((prevAll) => {
        const byMode = { ...prevAll };
        const modeMap = { ...(byMode[viewMode] || {}) };
        const fr = { ...(modeMap[fridgeId] || {}) };
        updates.forEach((u) => {
          if (Array.isArray(u.parts)) {
            fr[u.productName] = u.parts.map((pp) => ({
              label: String(pp.label || ''),
              quantity: Number(pp.quantity) || 0,
            }));
          }
        });
        modeMap[fridgeId] = fr;
        byMode[viewMode] = modeMap;
        return byMode;
      });

      // Clear dirty flags for saved products
      setDirtyMapByMode((prev) => {
        const copy = { ...prev };
        const dMode = { ...(copy[viewMode] || {}) };
        const d = { ...(dMode[fridgeId] || {}) };
        updates.forEach((u) => (d[u.productName] = false));
        dMode[fridgeId] = d;
        copy[viewMode] = dMode;
        return copy;
      });

      if (!silentOverlay) setToast({ type: 'ok', text: 'Changes saved.' });
    } catch (err) {
      console.error(err);
      setToast({ type: 'error', text: 'Error saving changes.' });
    } finally {
      if (!silentOverlay) setSavingFridgeId(null);
      setRowSaving((prev) => {
        const copy = { ...prev };
        if (copy[fridgeId]) {
          Object.keys(copy[fridgeId]).forEach((k) => (copy[fridgeId][k] = false));
        }
        return copy;
      });
    }
  };
  // ======== PRINT BY FRIDGE (inline, sin popup) ========
   // Construye las filas producto / cantidad de una nevera, usando lo que se ve en pantalla
  const getFridgeTicketRows = (fridge) => {
    const frEdits = (fridgeEditsByMode[viewMode] || {})[fridge._id] || {};
    const frParts = (partsEditsByMode[viewMode] || {})[fridge._id] || {};

    const products = [...(fridge.products || [])].sort((a, b) => {
      const ia = orderIndex(a.productName);
      const ib = orderIndex(b.productName);
      if (ia !== ib) return ia - ib;
      return String(a.productName).localeCompare(String(b.productName));
    });

    return products.map((p) => {
      const curParts = frParts[p.productName] || [];
      const sumParts = totalFromParts(curParts);
      const editVal = frEdits[p.productName];

      let qty;
      if (curParts.length > 0 && Number.isFinite(sumParts)) {
        qty = sumParts;
      } else if (editVal !== undefined && editVal !== null && editVal !== '') {
        const parsed = parseInt(String(editVal).replace(/\D+/g, ''), 10);
        qty = Number.isFinite(parsed) ? parsed : 0;
      } else if (viewMode === MODE_INITIAL) {
        qty = Number(p.quantity) || 0;
      } else {
        qty = 0;
      }

      return { name: p.productName, qty };
    });
  };
// ======== Ticket PDF por nevera ========
const handlePrintFridgePdf = (fridge) => {
  if (!fridge) return;

  const rows = getFridgeTicketRows(fridge);
  const safeLocation = locationData?.name || 'Location';
  const modeLabel = viewMode === MODE_FINAL ? 'Final inventory' : 'Initial inventory';
  const nowStr = new Date().toLocaleString();

  const doc = new jsPDF({
    unit: 'mm',
    format: [58, 120], // ancho x alto
  });

  const left = 2;                 // margen izquierdo más pequeño
  const right = 58 - 2;           // margen derecho
  let y = 6;                      // posición vertical inicial
  const lineH = 5;                // alto de línea un poco mayor
  const textArea = (right - left) - 10; // ancho para el nombre dejando ~10mm a la derecha para Qty
  const maxY = 115;               // límite inferior útil

  doc.setFont('courier', 'normal');

  // ===== HEADER =====
  doc.setFontSize(12);
  doc.text('Tools Helper per Fridge', 58 / 2, y, { align: 'center' });
  y += lineH;

  doc.text(safeLocation, 58 / 2, y, { align: 'center' });
  y += lineH;

  doc.text(`Fridge: ${fridge.name}`, 58 / 2, y, { align: 'center' });
  y += lineH;

  doc.text(modeLabel, 58 / 2, y, { align: 'center' });
  y += lineH;

  doc.text(nowStr, 58 / 2, y, { align: 'center' });
  y += lineH;

  // línea bajo el header
  doc.setLineWidth(0.25);
  doc.setDrawColor(0);
  doc.line(left, y, right, y);
  y += lineH * 0.7;

  // ===== CABECERA DE TABLA =====
  doc.setFontSize(12);
  doc.text('Product', left, y);
  doc.text('Qty', right, y, { align: 'right' });
  y += lineH;

  doc.line(left, y, right, y);
  y += lineH * 0.4;

  // ===== FILAS =====
  rows.forEach((r) => {
    if (y > maxY) return;

    const name = String(r.name || '');
    const qty = String(r.qty ?? '0');

    // dividir el nombre en varias líneas si es largo
    const wrapped = doc.splitTextToSize(name, textArea);

    wrapped.forEach((ln, idx) => {
      if (y > maxY) return;

      // texto del producto
      doc.text(ln, left, y);

      // cantidad solo en la primera línea
      if (idx === 0) {
        doc.text(qty, right, y, { align: 'right' });
      }

      y += lineH;
    });

    if (y > maxY) return;

    // baseline de la última línea de texto del producto
    const lastBaseline = y - lineH;

    // línea 1.3mm por debajo de esa base → no toca las letras
    const lineY = lastBaseline + 1.3;
    doc.line(left, lineY, right, lineY);

    // espacio para el siguiente producto
    y = lineY + 2;
  });

  // (Opcional) recortar alto de la página al contenido usado
  try {
    const usedHeight = Math.min(y + 5, 120);
    if (doc.internal?.pageSize?.setHeight) {
      doc.internal.pageSize.setHeight(usedHeight);
    }
  } catch (e) {
    // si falla, no pasa nada, se queda en 120mm
  }

  const safeLocSlug = safeLocation.replace(/[^a-z0-9]+/gi, '_');
  const safeFridgeSlug = String(fridge.name || '').replace(/[^a-z0-9]+/gi, '_');
  const safeMode = viewMode === MODE_FINAL ? 'final' : 'initial';

  doc.save(`${safeLocSlug}_${safeFridgeSlug}_${safeMode}.pdf`);
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

  useEffect(() => {
    return () => {
      Object.values(debouncers.current).forEach((t) => t && clearTimeout(t));
      debouncers.current = {};
      inFlight.current = {};
      pending.current = {};
    };
  }, []);

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

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
        <strong>Inventory: </strong>
        <button
          className={`chip-radio ${viewMode === MODE_INITIAL ? 'active' : ''}`}
          onClick={() => goMode(MODE_INITIAL)}
        >
          Initial
        </button>
        <button
          className={`chip-radio ${viewMode === MODE_FINAL ? 'active' : ''}`}
          onClick={() => goMode(MODE_FINAL)}
          title="In Final view, fields start at 0"
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
          ({viewMode === MODE_FINAL ? 'Final inventory' : 'Initial inventory'})
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

      {/* Session controls */}
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
                : `Close with ${
                    viewMode === MODE_FINAL ? 'FINAL (Final view)' : 'FINAL (Initial view)'
                  }`}
            </button>
          </>
        )}
      </div>

      {viewMode === MODE_FINAL && (
        <div
          className="card"
          style={{ borderColor: '#ef4444', background: '#fff1f2', marginBottom: 10 }}
        >
          <b>Final view:</b> fields start at 0. Autosave updates inventory with the values you
          enter. When you close from this view, the final snapshot will use these values.
        </div>
      )}

      {locationData.refrigerators?.length ? (
        <div className="fridge-stack">
          {locationData.refrigerators.map((fridge) => {
            const disabled = savingFridgeId === fridge._id;
            const thisRowSaving = rowSaving[fridge._id] || {};
            const frEdits = (fridgeEditsByMode[viewMode] || {})[fridge._id] || {};
            const frDirty = (dirtyMapByMode[viewMode] || {})[fridge._id] || {};
            const frParts = (partsEditsByMode[viewMode] || {})[fridge._id] || {};
            const frExpanded = expandedMap[fridge._id] || {};

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
                      <span className="pill" title="Confirmed changes are saved automatically">
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

                <div
                  className="table-wrap table-wrap--shadow"
                  style={{ position: 'relative' }}
                >
                  <table className="table-excel" aria-describedby={`desc-${fridge._id}`}>
                    <caption id={`desc-${fridge._id}`} style={{ display: 'none' }}>
                      Products table for fridge {fridge.name}
                    </caption>
                    <thead>
                      <tr>
                        <th style={{ width: '42%' }}>Product</th>
                        <th className="num" style={{ width: 130 }}>
                          Quantity
                        </th>
                        <th className="num" style={{ width: 70 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...fridge.products]
                        .sort((a, b) => {
                          const ia = orderIndex(a.productName);
                          const ib = orderIndex(b.productName);
                          if (ia !== ib) return ia - ib;
                          return String(a.productName).localeCompare(
                            String(b.productName)
                          );
                        })
                        .map((prod, index) => {
                          const refKey = `${fridge._id}-${index}`;
                          const savingThisRow = !!thisRowSaving[prod.productName];

                          // main display value: from edits (mode) or baseline
                          const mainDisplay =
                            frEdits[prod.productName] ??
                            (viewMode === MODE_INITIAL
                              ? String(prod.quantity)
                              : '');

                          const isExpanded = !!frExpanded[prod.productName];
                          const curParts = frParts[prod.productName] || [];
                          const sumParts = totalFromParts(curParts);
                          const showSumBadge = curParts.length > 0;

                          return (
                            <React.Fragment key={prod.productName}>
                              <tr>
                                <td>
                                  {prod.productName}
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
                                        border:
                                          '2px solid rgba(37,99,235,.25)',
                                        borderTopColor: '#2563eb',
                                        animation:
                                          'hawking-spin 800ms linear infinite',
                                      }}
                                    />
                                  )}
                                  {showSumBadge && (
                                    <small
                                      className="pill"
                                      style={{ marginLeft: 8 }}
                                    >
                                      Sum: <b>{sumParts}</b>
                                    </small>
                                  )}
                                </td>
                                <td className="num">
                                  <NumberInput
                                    ref={(el) => {
                                      if (el) inputRefs.current[refKey] = el;
                                    }}
                                    value={mainDisplay}
                                    onChange={(newVal) =>
                                      handleQuantityChange(
                                        fridge._id,
                                        prod.productName,
                                        newVal
                                      )
                                    }
                                    onEnter={() => {
                                      const nextKey = `${fridge._id}-${
                                        index + 1
                                      }`;
                                      const nextEl = inputRefs.current[nextKey];
                                      if (nextEl?.focus) nextEl.focus();
                                    }}
                                    aria-label={`Quantity of ${prod.productName}`}
                                    inputMode={isMobile ? 'text' : 'decimal'}
                                    autoComplete="off"
                                    autoCorrect="off"
                                    spellCheck={false}
                                  />
                                </td>
                                <td
                                  className="num"
                                  style={{ textAlign: 'right' }}
                                >
                                  <button
                                    className="btn btn--secondary"
                                    onClick={() =>
                                      ensureExpanded(
                                        fridge._id,
                                        prod.productName,
                                        !isExpanded
                                      )
                                    }
                                    title={
                                      isExpanded
                                        ? 'Hide parts'
                                        : 'Show parts / Add part'
                                    }
                                  >
                                    {isExpanded ? '▾' : '▸'}
                                  </button>
                                </td>
                              </tr>

                              {isExpanded && (
                                <tr>
                                  <td
                                    colSpan={3}
                                    style={{ background: '#f8fafc' }}
                                  >
                                    {/* Parts editor */}
                                    <div
                                      className="card"
                                      style={{
                                        marginTop: 6,
                                        border: '1px dashed #cbd5e1',
                                        background: '#ffffff',
                                      }}
                                    >
                                      <div
                                        className="flex-row"
                                        style={{
                                          justifyContent: 'space-between',
                                          alignItems: 'center',
                                        }}
                                      >
                                        <strong>Parts (shelves / groups)</strong>
                                        <button
                                          className="btn"
                                          onClick={() =>
                                            addPart(
                                              fridge._id,
                                              prod.productName
                                            )
                                          }
                                        >
                                          + Add part
                                        </button>
                                      </div>

                                      {curParts.length === 0 ? (
                                        <p
                                          style={{
                                            marginTop: 8,
                                            opacity: 0.7,
                                          }}
                                        >
                                          No parts yet. Click “+ Add part” to
                                          split this product into sub-entries.
                                        </p>
                                      ) : (
                                        <div
                                          className="table-wrap"
                                          style={{ marginTop: 8 }}
                                        >
                                          <table
                                            className="table-excel table--dense"
                                            style={{ minWidth: 520 }}
                                          >
                                            <thead>
                                              <tr>
                                                <th style={{ width: '60%' }}>
                                                  Label
                                                </th>
                                                <th
                                                  className="num"
                                                  style={{ width: 160 }}
                                                >
                                                  Quantity
                                                </th>
                                                <th
                                                  className="num"
                                                  style={{ width: 80 }}
                                                ></th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {curParts.map((part, pidx) => (
                                                <tr
                                                  key={`${prod.productName}-part-${pidx}`}
                                                >
                                                  <td>
                                                    <input
                                                      type="text"
                                                      value={part.label}
                                                      onChange={(e) =>
                                                        updatePart(
                                                          fridge._id,
                                                          prod.productName,
                                                          pidx,
                                                          'label',
                                                          e.target.value
                                                        )
                                                      }
                                                      placeholder={
                                                        pidx === 0
                                                          ? 'Primary (e.g., Top shelf)'
                                                          : 'Part name'
                                                      }
                                                    />
                                                  </td>
                                                  <td className="num">
                                                    <NumberInput
                                                      value={String(
                                                        part.quantity ?? ''
                                                      )}
                                                      onChange={(v) =>
                                                        updatePart(
                                                          fridge._id,
                                                          prod.productName,
                                                          pidx,
                                                          'quantity',
                                                          v
                                                        )
                                                      }
                                                      aria-label={`Quantity for ${
                                                        part.label ||
                                                        `part ${pidx + 1}`
                                                      }`}
                                                      inputMode={
                                                        isMobile
                                                          ? 'text'
                                                          : 'decimal'
                                                      }
                                                      autoComplete="off"
                                                      autoCorrect="off"
                                                      spellCheck={false}
                                                    />
                                                  </td>
                                                  <td
                                                    className="num"
                                                    style={{
                                                      textAlign: 'right',
                                                    }}
                                                  >
                                                    <button
                                                      className="btn btn--danger"
                                                      onClick={() =>
                                                        removePartAt(
                                                          fridge._id,
                                                          prod.productName,
                                                          pidx
                                                        )
                                                      }
                                                      title="Remove this part"
                                                    >
                                                      ×
                                                    </button>
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      )}

                                      <div
                                        style={{
                                          marginTop: 8,
                                          textAlign: 'right',
                                        }}
                                      >
                                        <span className="pill">
                                          Total = <b>{sumParts}</b>
                                        </span>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                    </tbody>
                  </table>
                </div>

                <div className="fridge-foot" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => handleSaveFridge(fridge)} disabled={disabled}>
                    {disabled ? 'Saving…' : 'Save changes'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => handlePrintFridgePdf(fridge)}
                    disabled={disabled}
                  >
                    Ticket PDF
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
