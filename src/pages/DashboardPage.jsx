import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import NavBar from '../components/NavBar';
import { useSelector } from 'react-redux';
import '../styles.css';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ResponsiveContainer,
} from 'recharts';
import Footer from '../components/Footer';

const toKey = (s) => String(s || '').trim().toLowerCase();

function DashboardPage() {
  const token = useSelector((state) => state.auth.token);

  const [stdOrder, setStdOrder] = useState([]);
  const [capacityMap, setCapacityMap] = useState({});        // base por producto
  const [capacityByLocation, setCapacityByLocation] = useState({}); // overrides por locación
  const [locations, setLocations] = useState([]);
  const [summaries, setSummaries] = useState({});
  const [analyticsByFridge, setAnalyticsByFridge] = useState({});
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState('');
  const [breakdownSort, setBreakdownSort] = useState('critical');

  // --- Estado del mini-CRUD de capacidades por locación ---
  const [capItemsDraft, setCapItemsDraft] = useState([]); // [{ product, capacity }]
  const [suggestions, setSuggestions] = useState({ histMaxSum: {}, dailyPeakMax: {}, avgTop3Daily: {} });
  const [suggestMethod, setSuggestMethod] = useState('both'); // 'both' | 'histMaxSum' | 'dailyPeakMax'
  const [savingCaps, setSavingCaps] = useState(false);
  const [loadingCaps, setLoadingCaps] = useState(false);

  // Filtros de fecha
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Selecciones gráfica
  const [selectedLocId, setSelectedLocId] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');

  // Color por capacidad (ON por defecto) y umbrales
  const [colorByCapacity, setColorByCapacity] = useState(true);
  const [lowThreshold, setLowThreshold] = useState(0.3);  // <= 30% -> rojo
  const [warnThreshold, setWarnThreshold] = useState(0.6); // <= 60% -> ámbar

  // Capacidad por defecto si no hay base/override (asumimos por nevera * #neveras)
  const [defaultPerFridgeCapacity, setDefaultPerFridgeCapacity] = useState(72);

  // Mostrar columna “Faltan (total)” (OFF por defecto)
  const [showGapColumn, setShowGapColumn] = useState(false);

  const orderMap = useMemo(() => {
    const m = new Map();
    stdOrder.forEach((name, idx) => m.set(toKey(name), idx));
    return m;
  }, [stdOrder]);
  const orderIndex = (name) => {
    const i = orderMap.get(toKey(name));
    return typeof i === 'number' ? i : 9999;
  };

  // seguridad
  const role = useSelector((s) => s.auth?.role) || localStorage.getItem('role') || '';
  const r = role.toLowerCase().replace(/[\s_-]+/g, '');
  const canEdit = r === 'admin' || r === 'superuser';

  //

  const loadData = async (signal) => {
    setLoading(true);
    setErrMsg('');
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('start', startDate);
      if (endDate) params.set('end', endDate);
      const qs = params.toString() ? `?${params.toString()}` : '';

      const r = await axios.get(`http://localhost:4000/api/dashboard/overview${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });

      const data = r.data?.data || {};
      setStdOrder(Array.isArray(data.stdOrder) ? data.stdOrder : []);
      setCapacityMap(data.capacityMap || {});
      setCapacityByLocation(data.capacityByLocation || {});
      setLocations(Array.isArray(data.locations) ? data.locations : []);
      setSummaries(data.summaries || {});
      setAnalyticsByFridge(data.analyticsByFridge || {});
      setLoading(false);

      if (!selectedLocId && Array.isArray(data.locations) && data.locations.length > 0) {
        setSelectedLocId(String(data.locations[0]._id));
      }
      if (!selectedProduct) {
        const candidate = (Array.isArray(data.stdOrder) && data.stdOrder[0]) || '';
        setSelectedProduct(candidate || '');
      }
    } catch (err) {
      if (axios.isCancel(err)) return;
      console.error('Dashboard load error:', err);
      setErrMsg('Error loading dashboard');
      setLoading(false);
    }
  };

  useEffect(() => {
    async function loadLocOverrides() {
      if (!selectedLocId) { setCapItemsDraft([]); return; }
      try {
        const r = await axios.get(`http://localhost:4000/api/capacity/location/${selectedLocId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const items = r.data?.data?.items || [];
        // normaliza a [{product, capacity}]
        setCapItemsDraft(items.map(it => ({ product: it.product, capacity: it.capacity })));
      } catch (e) {
        console.error('loadLocOverrides error', e);
        setCapItemsDraft([]);
      }
    }
    loadLocOverrides();
  }, [selectedLocId, token]);

  useEffect(() => {
    const controller = new AbortController();
    loadData(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const applyDateFilters = () => {
    const controller = new AbortController();
    loadData(controller.signal);
  };

  const getLocationById = (id) => locations.find((l) => String(l._id) === String(id));

  // Capacidad efectiva por locación+producto:
  // 1) override por locación si existe
  // 2) base por producto * #neveras en la locación (asumiendo base por nevera)
  // 3) defaultPerFridgeCapacity * #neveras
  const effectiveCapacityFor = (loc, productName) => {
    const locId = String(loc._id);
    const prodKey = toKey(productName);
    const override = capacityByLocation?.[locId]?.[prodKey];
    if (Number.isFinite(override) && override > 0) return override;

    const base = capacityMap?.[prodKey];
    const fridgeCount = (loc?.refrigerators || []).length || 1;
    if (Number.isFinite(base) && base > 0) return base * fridgeCount;

    return (Number(defaultPerFridgeCapacity) || 72) * fridgeCount;
  };

  // cargas sugerencias de histórico
  async function fetchSuggestions() {
    if (!selectedLocId) return;
    setLoadingCaps(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('start', startDate);
      if (endDate) params.set('end', endDate);
      if (suggestMethod) params.set('method', suggestMethod);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const r = await axios.get(`http://localhost:4000/api/capacity/location/${selectedLocId}/suggest${qs}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSuggestions(r.data?.data || { histMaxSum: {}, dailyPeakMax: {}, avgTop3Daily: {} });
    } catch (e) {
      console.error('fetchSuggestions error', e);
      setSuggestions({ histMaxSum: {}, dailyPeakMax: {}, avgTop3Daily: {} });
    } finally {
      setLoadingCaps(false);
    }
  }
  function setCapForProduct(prod, val) {
    setCapItemsDraft(prev => {
      const arr = [...prev];
      const idx = arr.findIndex(x => toKey(x.product) === toKey(prod));
      const cap = parseInt(val || '0', 10);
      if (idx === -1) arr.push({ product: prod, capacity: cap });
      else arr[idx] = { product: arr[idx].product, capacity: cap };
      // quita ceros o NaN
      return arr.filter(x => Number.isFinite(x.capacity) && x.capacity > 0);
    });
  }

  function removeCapForProduct(prod) {
    setCapItemsDraft(prev => prev.filter(x => toKey(x.product) !== toKey(prod)));
  }

  function applyAllFrom(source) {
    // source: 'histMaxSum' | 'dailyPeakMax' | 'avgTop3Daily'
    const src = suggestions[source] || {};
    // Armamos lista fusionando con lo que ya hay
    const merged = new Map(capItemsDraft.map(x => [toKey(x.product), x.capacity]));
    Object.keys(src).forEach(k => {
      const v = Number(src[k] || 0);
      if (v > 0) merged.set(toKey(k), v);
    });
    const out = [];
    merged.forEach((cap, key) => {
      const originalName = stdOrder.find(n => toKey(n) === key) || key; // para mostrar “bonito”
      if (cap > 0) out.push({ product: originalName, capacity: cap });
    });
    setCapItemsDraft(out);
  }

  async function saveCaps() {
    if (!selectedLocId) return;
    setSavingCaps(true);
    try {
      await axios.put(`http://localhost:4000/api/capacity/location/${selectedLocId}`, {
        items: capItemsDraft
      }, { headers: { Authorization: `Bearer ${token}` } });
      // refresca overview para que el breakdown use las capacidades nuevas
      await loadData(new AbortController().signal);
    } catch (e) {
      console.error('saveCaps error', e);
    } finally {
      setSavingCaps(false);
    }
  }

  // Color según ratio actual/capacidad
  const colorForRatio = (ratio) => {
    if (!colorByCapacity) return 'inherit';
    if (!Number.isFinite(ratio)) return 'inherit';
    if (ratio <= lowThreshold) return '#b00020'; // rojo
    if (ratio <= warnThreshold) return '#8a6d3b'; // ámbar/mostaza
    return '#0b6e4f'; // verde
  };
  const bgForRatio = (ratio) => {
    if (!colorByCapacity) return 'transparent';
    if (!Number.isFinite(ratio)) return 'transparent';
    if (ratio <= lowThreshold) return 'rgba(176, 0, 32, 0.08)';
    if (ratio <= warnThreshold) return 'rgba(138, 109, 59, 0.10)';
    return 'rgba(11, 110, 79, 0.08)';
  };

  // Calcular “faltan total” (solo si la columna está activa)
  const totalGapForLocation = (loc) => {
    const s = summaries[loc._id] || {};
    const breakdown = s.locationBreakdown || {};
    let total = 0;
    for (const prod of Object.keys(breakdown)) {
      const current = Number(breakdown[prod] || 0);
      const cap = effectiveCapacityFor(loc, prod);
      const gap = Math.max(0, cap - current);
      total += gap;
    }
    return total;
  };

  // Analytics agregado por locación (para tabla de usage)
  const buildLocationAnalytics = (loc) => {
    const result = {};
    const fridges = loc?.refrigerators || [];
    fridges.forEach(fr => {
      const fid = fr && (fr._id || fr);
      const a = analyticsByFridge[fid];
      if (!a) return;
      Object.keys(a).forEach(prodName => {
        const src = a[prodName];
        if (!result[prodName]) {
          result[prodName] = {
            totalUsed: 0,
            totalRestocked: 0,
            minQuantity: Number.POSITIVE_INFINITY,
            maxQuantity: Number.NEGATIVE_INFINITY
          };
        }
        result[prodName].totalUsed += src.totalUsed || 0;
        result[prodName].totalRestocked += src.totalRestocked || 0;
        result[prodName].minQuantity = Math.min(result[prodName].minQuantity, src.minQuantity ?? Infinity);
        result[prodName].maxQuantity = Math.max(result[prodName].maxQuantity, src.maxQuantity ?? -Infinity);
      });
    });
    return result;
  };

  // Tendencia por día (igual que antes)
  const trendDataForLocationProduct = (loc, productName) => {
    if (!loc || !productName) return [];
    const fridges = loc.refrigerators || [];
    const dayMap = {};
    fridges.forEach(fr => {
      const fid = fr && (fr._id || fr);
      const a = analyticsByFridge[fid];
      if (!a) return;
      const prod = a[productName];
      const usageByDay = prod?.usageByDay || {};
      Object.keys(usageByDay).forEach((day) => {
        const diff = Number(usageByDay[day] || 0);
        const used = diff > 0 ? diff : 0;
        const restocked = diff < 0 ? Math.abs(diff) : 0;
        if (!dayMap[day]) dayMap[day] = { used: 0, restocked: 0 };
        dayMap[day].used += used;
        dayMap[day].restocked += restocked;
      });
    });
    return Object.keys(dayMap)
      .sort((a, b) => a.localeCompare(b))
      .map(d => ({ date: d, used: dayMap[d].used, restocked: dayMap[d].restocked }));
  };

  const selectedLocation = getLocationById(selectedLocId);
  const chartData = useMemo(
    () => trendDataForLocationProduct(selectedLocation, selectedProduct),
    [selectedLocation, selectedProduct, analyticsByFridge]
  );

  if (loading) {
    return (
      <div className="main-container">
        <NavBar />
        <p>Loading...</p>
      </div>
    );
  }
  if (errMsg) {
    return (
      <div className="main-container">
        <NavBar />
        <p style={{ color: 'crimson' }}>{errMsg}</p>
      </div>
    );
  }

  // ===== Helpers visuales =====
  const fmtPct = (r) => (Number.isFinite(r) ? `${Math.round(r * 100)}%` : '—');
  const numCell = { textAlign:'right', fontVariantNumeric:'tabular-nums', padding:'6px 8px', border:'1px solid #e6e8ec' };
  const txtCell = { textAlign:'left', padding:'6px 8px', border:'1px solid #e6e8ec' };
  const headCell = { ...txtCell, background:'#f7f8fa', fontWeight:700 };
  const tableBase = { width:'100%', borderCollapse:'collapse', background:'#fff', fontSize:'0.95rem' };

  // Ordena productos según selector
  function sortBreakdownKeys(keys, getRatio, orderIndexFn) {
    if (breakdownSort === 'critical') {
      return keys.sort((a, b) => {
        const ra = getRatio(a);
        const rb = getRatio(b);
        if (!Number.isFinite(ra) && !Number.isFinite(rb)) return 0;
        if (!Number.isFinite(ra)) return 1;
        if (!Number.isFinite(rb)) return -1;
        if (ra !== rb) return ra - rb; // más crítico (menor %) primero
        const ia = orderIndexFn(a), ib = orderIndexFn(b);
        if (ia !== ib) return ia - ib;
        return String(a).localeCompare(String(b));
      });
    } else if (breakdownSort === 'alpha') {
      return keys.sort((a, b) => String(a).localeCompare(String(b)));
    }
    // 'order' por defecto: orden universal y luego alfabético
    return keys.sort((a, b) => {
      const ia = orderIndexFn(a), ib = orderIndexFn(b);
      if (ia !== ib) return ia - ib;
      return String(a).localeCompare(String(b));
    });
  }

  // Tabla "grande" de breakdown (para panel superior) — ya era vertical
  function renderBreakdownTable(loc) {
    const s = summaries[loc._id] || {};
    const breakdown = s.locationBreakdown || {};
    const keys = Object.keys(breakdown);
    if (keys.length === 0) return <em>No data</em>;

    const getCap = (prod) => effectiveCapacityFor(loc, prod);
    const getRatio = (prod) => {
      const current = Number(breakdown[prod] || 0);
      const cap = getCap(prod);
      return cap > 0 ? current / cap : NaN;
    };

    const ordered = sortBreakdownKeys([...keys], getRatio, orderIndex);

    return (
      <div style={{ width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 8px 0', fontSize: '0.92rem' }}>
          <label>Orden:</label>
          <select value={breakdownSort} onChange={(e) => setBreakdownSort(e.target.value)}>
            <option value="critical">Crítico primero</option>
            <option value="order">Orden estándar</option>
            <option value="alpha">Alfabético</option>
          </select>
        </div>

        <table style={{ ...tableBase }}>
          <thead>
            <tr>
              <th style={{ ...headCell, width:'30%' }}>Producto</th>
              <th style={{ ...headCell, textAlign:'right', width: 90 }}>Actual</th>
              <th style={{ ...headCell, textAlign:'right', width:120 }}>Capacidad (Loc.)</th>
              <th style={{ ...headCell, textAlign:'right', width: 90 }}>Ocupación</th>
              <th style={{ ...headCell }}>Barra</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((prod, i) => {
              const current = Number(breakdown[prod] || 0);
              const cap = getCap(prod);
              const ratio = cap > 0 ? current / cap : NaN;
              const w = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
              const rowBg = i % 2 === 0 ? '#fcfdff' : '#ffffff';

              return (
                <tr key={`br-${prod}`} style={{ background: rowBg }}>
                  <td style={{ ...txtCell, fontWeight: 600 }}>{prod}</td>
                  <td style={{ ...numCell }}>{current}</td>
                  <td style={{ ...numCell }}>{cap}</td>
                  <td style={{ ...numCell, color: colorForRatio(ratio) }}>{Number.isFinite(ratio) ? `${Math.round(w*100)}%` : '—'}</td>
                  <td style={{ padding:'6px 8px', border:'1px solid #e6e8ec' }}>
                    <div
                      style={{ position:'relative', width:'100%', height:12, borderRadius:9999, background:'#eef1f5', overflow:'hidden' }}
                      role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(w*100)}
                      aria-label={`Ocupación de ${prod}`}
                    >
                      <div style={{ position:'relative', height:'100%', borderRadius:9999, width: `${Math.round(w*100)}%`, background: colorForRatio(ratio), opacity: 0.9, transition:'width 200ms ease-out' }} />
                      <div style={{ position:'absolute', inset:0, background: bgForRatio(ratio), opacity: 0.15, pointerEvents:'none' }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // Tabla "mini" para el Resumen por Location — vertical por producto, tipo Excel
  function renderMiniBreakdownTable(loc) {
    const s = summaries[loc._id] || {};
    const breakdown = s.locationBreakdown || {};
    const keys = Object.keys(breakdown);
    if (keys.length === 0) return <em>No data</em>;

    const getCap = (prod) => effectiveCapacityFor(loc, prod);
    const getRatio = (prod) => {
      const current = Number(breakdown[prod] || 0);
      const cap = getCap(prod);
      return cap > 0 ? current / cap : NaN;
    };

    const ordered = sortBreakdownKeys([...keys], getRatio, orderIndex);

    return (
      <div style={{ overflowX:'auto' }}>
        <table style={{ ...tableBase, minWidth: 560 }}>
          <thead>
            <tr>
              <th style={{ ...headCell, width: '38%' }}>Producto</th>
              <th style={{ ...headCell, textAlign:'right', width: 90 }}>Actual</th>
              <th style={{ ...headCell, textAlign:'right', width: 140 }}>Capacidad efectiva (Loc.)</th>
              <th style={{ ...headCell, textAlign:'right', width: 100 }}>Ocupación</th>
              <th style={{ ...headCell, textAlign:'right', width: 100 }}>Faltan</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((prod, idx) => {
              const current = Number(breakdown[prod] || 0);
              const cap = getCap(prod);
              const ratio = cap > 0 ? current / cap : NaN;
              const gap = Math.max(0, cap - current);
              const rowBg = idx % 2 === 0 ? '#fcfdff' : '#ffffff';
              return (
                <tr key={`mini-${prod}`} style={{ background: rowBg }}>
                  <td style={{ ...txtCell, fontWeight:600 }}>{prod}</td>
                  <td style={{ ...numCell }}>{current}</td>
                  <td style={{ ...numCell }}>{cap}</td>
                  <td style={{ ...numCell, color: colorForRatio(ratio) }}>{fmtPct(ratio)}</td>
                  <td style={{ ...numCell }}>{gap}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // Tabla mini de Usage por Location (histórico) — vertical por producto, tipo Excel
  function renderMiniUsageTable(loc) {
    const agg = buildLocationAnalytics(loc);
    const keys = Object.keys(agg);
    if (keys.length === 0) return <em>No data</em>;

    const ordered = keys.sort((a, b) => {
      const ia = orderIndex(a), ib = orderIndex(b);
      if (ia !== ib) return ia - ib;
      return String(a).localeCompare(String(b));
    });

    return (
      <div style={{ overflowX:'auto' }}>
        <table style={{ ...tableBase, minWidth: 560 }}>
          <thead>
            <tr>
              <th style={{ ...headCell, width:'38%' }}>Producto</th>
              <th style={{ ...headCell, textAlign:'right', width:110 }}>Used</th>
              <th style={{ ...headCell, textAlign:'right', width:110 }}>Restocked</th>
              <th style={{ ...headCell, textAlign:'right', width:90 }}>Min</th>
              <th style={{ ...headCell, textAlign:'right', width:90 }}>Max</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((k, idx) => {
              const p = agg[k];
              const rowBg = idx % 2 === 0 ? '#fcfdff' : '#ffffff';
              return (
                <tr key={`u-${k}`} style={{ background: rowBg }}>
                  <td style={{ ...txtCell, fontWeight:600 }}>{k}</td>
                  <td style={{ ...numCell }}>{p.totalUsed || 0}</td>
                  <td style={{ ...numCell }}>{p.totalRestocked || 0}</td>
                  <td style={{ ...numCell }}>{Number.isFinite(p.minQuantity) ? p.minQuantity : '—'}</td>
                  <td style={{ ...numCell }}>{Number.isFinite(p.maxQuantity) ? p.maxQuantity : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="main-container">
      <NavBar />
      
      <h2>Dashboard Summary</h2>

      {/* Controles */}
      <div className="card" style={{ marginBottom: '1rem', display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div>
          <label>Start (YYYY-MM-DD)</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ width: '100%' }} />
        </div>
        <div>
          <label>End (YYYY-MM-DD)</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ width: '100%' }} />
        </div>
        <div style={{ alignSelf: 'end' }}>
          <button onClick={applyDateFilters} style={{ width: '100%' }}>Aplicar filtros</button>
        </div>
        <div>
          <label>Location</label>
          <select value={selectedLocId} onChange={(e) => setSelectedLocId(e.target.value)} style={{ width: '100%' }}>
            {locations.map(l => <option key={l._id} value={l._id}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <label>Producto</label>
          <select value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)} style={{ width: '100%' }}>
            {stdOrder.map((p) => <option key={`std-${p}`} value={p}>{p}</option>)}
            {selectedLocation && summaries[selectedLocation._id] && Object.keys(summaries[selectedLocation._id].locationBreakdown || {})
              .filter(p => !stdOrder.some(s => s.toLowerCase() === p.toLowerCase()))
              .map(p => <option key={`bk-${p}`} value={p}>{p}</option>)
            }
          </select>
        </div>
        <div>
          <label>Colorear por capacidad</label>
          <input type="checkbox" checked={colorByCapacity} onChange={(e) => setColorByCapacity(e.target.checked)} />
        </div>
        <div>
          <label>Umbral bajo ({Math.round(lowThreshold * 100)}%)</label>
          <input type="range" min="0.1" max="0.9" step="0.05" value={lowThreshold} onChange={(e) => setLowThreshold(parseFloat(e.target.value))} style={{ width: '100%' }} />
        </div>
        <div>
          <label>Umbral advertencia ({Math.round(warnThreshold * 100)}%)</label>
          <input type="range" min="0.2" max="0.95" step="0.05" value={warnThreshold} onChange={(e) => setWarnThreshold(parseFloat(e.target.value))} style={{ width: '100%' }} />
        </div>
        <div>
          <label>Capacidad por nevera (default)</label>
          <input type="number" min={1} value={defaultPerFridgeCapacity} onChange={(e) => setDefaultPerFridgeCapacity(parseInt(e.target.value || '72', 10))} style={{ width: '100%' }} />
          <small>Se usa si no hay capacidad base ni override por locación.</small>
        </div>
        <div>
          <label>Mostrar columna “Faltan (total)”</label>
          <input type="checkbox" checked={showGapColumn} onChange={(e) => setShowGapColumn(e.target.checked)} />
        </div>
      </div>

      {/* Leyenda de colores */}
      {colorByCapacity && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <strong>Leyenda:</strong>{' '}
          <span style={{ color: '#b00020' }}>Rojo ≤ {Math.round(lowThreshold*100)}%</span>,{' '}
          <span style={{ color: '#8a6d3b' }}>Ámbar ≤ {Math.round(warnThreshold*100)}%</span>,{' '}
          <span style={{ color: '#0b6e4f' }}>Verde &gt; {Math.round(warnThreshold*100)}%</span>
        </div>
      )}

      {/* Panel UI de capacidades por locación */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>Capacidad de la locación — {selectedLocation ? selectedLocation.name : '—'}</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label>Método de sugerencia</label>
            <select value={suggestMethod} onChange={(e) => setSuggestMethod(e.target.value)}>
              <option value="both">Ambos (Max & Top3)</option>
              <option value="histMaxSum">Max observado (suma por nevera)</option>
              <option value="dailyPeakMax">Pico diario (y Top3)</option>
            </select>
            <button onClick={fetchSuggestions} disabled={!selectedLocId || loadingCaps}>
              {loadingCaps ? 'Cargando…' : 'Cargar sugerencias'}
            </button>
            <button onClick={() => applyAllFrom('dailyPeakMax')} disabled={loadingCaps}>Usar todas (Max diario)</button>
            <button onClick={() => applyAllFrom('avgTop3Daily')} disabled={loadingCaps}>Usar todas (Top 3)</button>
            <button onClick={() => setCapItemsDraft([])} disabled={loadingCaps}>Borrar todas</button>
            <button onClick={saveCaps} disabled={savingCaps || !selectedLocId}>
              {savingCaps ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>

        {/* Tabla editable por producto */}
        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <table border="1" cellPadding="6" style={{ minWidth: 720, ...tableBase }}>
            <thead>
              <tr>
                <th style={{ ...headCell, width: 220 }}>Producto</th>
                <th style={{ ...headCell, textAlign:'right', width: 140 }}>Capacidad override</th>
                <th style={{ ...headCell, textAlign:'left', width: 140 }}>Sugerido (Max)</th>
                <th style={{ ...headCell, textAlign:'left', width: 140 }}>Sugerido (Top 3)</th>
                <th style={{ ...headCell, width: 140 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                // Productos a mostrar: stdOrder + breakdown actual de la locación
                const prodSet = new Set(stdOrder.map(toKey));
                const br = selectedLocation && summaries[selectedLocation._id]?.locationBreakdown || {};
                Object.keys(br).forEach(p => prodSet.add(toKey(p)));
                const products = Array.from(prodSet)
                  .map(k => stdOrder.find(s => toKey(s) === k) || k)
                  .sort((a, b) => {
                    const ia = orderIndex(a), ib = orderIndex(b);
                    if (ia !== ib) return ia - ib;
                    return String(a).localeCompare(String(b));
                  });

                return products.map(prodName => {
                  const key = toKey(prodName);
                  const draft = capItemsDraft.find(x => toKey(x.product) === key);
                  const v = draft?.capacity || '';
                  const sMax = suggestions.dailyPeakMax?.[prodName] ?? suggestions.dailyPeakMax?.[key] ?? suggestions.histMaxSum?.[prodName] ?? suggestions.histMaxSum?.[key] ?? '';
                  const sTop3 = suggestions.avgTop3Daily?.[prodName] ?? suggestions.avgTop3Daily?.[key] ?? '';

                  return (
                    <tr key={`cap-${key}`}>
                      <td style={{ ...txtCell }}>{prodName}</td>
                      <td style={{ ...numCell }}>
                        <input
                          type="number"
                          min={1}
                          value={v}
                          onChange={(e) => setCapForProduct(prodName, e.target.value)}
                          style={{ width: 120 }}
                        />
                      </td>
                      <td style={{ ...txtCell }}>
                        {sMax ? <button onClick={() => setCapForProduct(prodName, sMax)}>Usar {sMax}</button> : <em>—</em>}
                      </td>
                      <td style={{ ...txtCell }}>
                        {sTop3 ? <button onClick={() => setCapForProduct(prodName, sTop3)}>Usar {sTop3}</button> : <em>—</em>}
                      </td>
                      <td style={{ ...txtCell }}>
                        {draft
                          ? <button onClick={() => removeCapForProduct(prodName)}>Quitar</button>
                          : <em>—</em>
                        }
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>

        <p style={{ marginTop: 8, opacity: 0.8 }}>
          Sugerencias:
          <br/>— <strong>Max observado</strong>: suma de máximos por nevera (robusto con cambios esporádicos).
          <br/>— <strong>Pico diario</strong>: máximo total visto en un día (sensible a eventos pico); <em>Top 3</em> es el promedio de los 3 días más altos (suaviza outliers).
        </p>
      </div>

      {/* Resumen por Location */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Resumen por Location</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ ...tableBase, minWidth: 920 }}>
            <thead>
              <tr>
                <th style={{ ...headCell, width: 220 }}>Location</th>
                <th style={{ ...headCell, textAlign:'right', width: 130 }}>Total Products</th>
                <th style={{ ...headCell, width: 260 }}>Producto</th>
                <th style={{ ...headCell, textAlign:'right', width: 110 }}>Actual</th>
                <th style={{ ...headCell, textAlign:'right', width: 170 }}>Capacidad efectiva (Loc.)</th>
                <th style={{ ...headCell, textAlign:'right', width: 110 }}>Ocupación</th>
                <th style={{ ...headCell, textAlign:'right', width: 110 }}>Faltan</th>
                {showGapColumn && <th style={{ ...headCell, textAlign:'right', width: 140 }}>Faltan (total)</th>}
                <th style={{ ...headCell, textAlign:'right', width: 140 }}>Assigned Users</th>
              </tr>
            </thead>
            <tbody>
              {locations.map(loc => {
                const s = summaries[loc._id] || {};
                const breakdown = s.locationBreakdown || {};
                const keys = Object.keys(breakdown);

                const getCap = (prod) => effectiveCapacityFor(loc, prod);
                const getRatio = (prod) => {
                  const current = Number(breakdown[prod] || 0);
                  const cap = getCap(prod);
                  return cap > 0 ? current / cap : NaN;
                };

                const ordered = keys.length ? sortBreakdownKeys([...keys], getRatio, orderIndex) : [];
                const rows = ordered.map(prod => {
                  const current = Number(breakdown[prod] || 0);
                  const cap = getCap(prod);
                  const ratio = cap > 0 ? current / cap : NaN;
                  const gap = Math.max(0, cap - current);
                  return { prod, current, cap, ratio, gap };
                });

                const rowSpan = Math.max(rows.length, 1);
                const gapTotal = showGapColumn ? totalGapForLocation(loc) : 0;

                if (!rows.length) {
                  return (
                    <tr key={loc._id}>
                      <td style={{ ...txtCell }}>{loc.name}</td>
                      <td style={{ ...numCell }}>{Number(s.totalLocation) || 0}</td>
                      <td style={{ ...txtCell }} colSpan={5}><em>No data</em></td>
                      {showGapColumn && <td style={{ ...numCell }}>{gapTotal}</td>}
                      <td style={{ ...numCell }}>{loc.usersCount || 0} users</td>
                    </tr>
                  );
                }

                return rows.map((r, idx) => (
                  <tr key={`${loc._id}-${r.prod}`}>
                    {idx === 0 && <td style={{ ...txtCell, fontWeight:700 }} rowSpan={rowSpan}>{loc.name}</td>}
                    {idx === 0 && <td style={{ ...numCell }} rowSpan={rowSpan}>{s.totalLocation}</td>}
                    <td style={{ ...txtCell, fontWeight:600 }}>{r.prod}</td>
                    <td style={{ ...numCell }}>{r.current}</td>
                    <td style={{ ...numCell }}>{r.cap}</td>
                    <td style={{ ...numCell, color: colorForRatio(r.ratio) }}>{fmtPct(r.ratio)}</td>
                    <td style={{ ...numCell }}>{r.gap}</td>
                    {showGapColumn && idx === 0 && <td style={{ ...numCell }} rowSpan={rowSpan}>{gapTotal}</td>}
                    {idx === 0 && <td style={{ ...numCell }} rowSpan={rowSpan}>{loc.usersCount || 0} users</td>}
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Usage agregado por Location (histórico) */}
      <h3 style={{ marginTop: '1.25rem' }}>Usage (Historial) por Location</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ ...tableBase, minWidth: 820 }}>
          <thead>
            <tr>
              <th style={{ ...headCell, width: 220 }}>Location</th>
              <th style={{ ...headCell, width: 260 }}>Producto</th>
              <th style={{ ...headCell, textAlign:'right', width: 110 }}>Used</th>
              <th style={{ ...headCell, textAlign:'right', width: 110 }}>Restocked</th>
              <th style={{ ...headCell, textAlign:'right', width: 90 }}>Min</th>
              <th style={{ ...headCell, textAlign:'right', width: 90 }}>Max</th>
            </tr>
          </thead>
          <tbody>
            {locations.map(loc => {
              const agg = buildLocationAnalytics(loc);
              const keys = Object.keys(agg);
              const ordered = keys.sort((a, b) => {
                const ia = orderIndex(a), ib = orderIndex(b);
                if (ia !== ib) return ia - ib;
                return String(a).localeCompare(String(b));
              });

              const rowSpan = Math.max(ordered.length, 1);

              if (!ordered.length) {
                return (
                  <tr key={`u-${loc._id}`}>
                    <td style={{ ...txtCell }}>{loc.name}</td>
                    <td style={{ ...txtCell }} colSpan={5}><em>No data</em></td>
                  </tr>
                );
              }

              return ordered.map((k, idx) => {
                const p = agg[k];
                return (
                  <tr key={`u-${loc._id}-${k}`}>
                    {idx === 0 && <td style={{ ...txtCell, fontWeight:700 }} rowSpan={rowSpan}>{loc.name}</td>}
                    <td style={{ ...txtCell, fontWeight:600 }}>{k}</td>
                    <td style={{ ...numCell }}>{p.totalUsed || 0}</td>
                    <td style={{ ...numCell }}>{p.totalRestocked || 0}</td>
                    <td style={{ ...numCell }}>{Number.isFinite(p.minQuantity) ? p.minQuantity : '—'}</td>
                    <td style={{ ...numCell }}>{Number.isFinite(p.maxQuantity) ? p.maxQuantity : '—'}</td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>

      {/* Tendencia */}
      <h3 style={{ marginTop: '1.25rem' }}>
        Tendencia — {selectedLocation ? selectedLocation.name : '—'} / {selectedProduct || '—'}
      </h3>
      <div className="card" style={{ height: 320 }}>
        {chartData.length === 0 ? (
          <em>No hay datos de historial para este rango/producto.</em>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis allowDecimals />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="used" name="Used (qty)" dot={false} />
              <Line type="monotone" dataKey="restocked" name="Restocked (qty)" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <Footer />
    </div>
    
  );
}

export default DashboardPage;

/* =============================================================
   Opcional — agrega esto a styles.css para un look aún más "Excel"

.table-excel { width:100%; border-collapse:collapse; background:#fff; }
.table-excel th, .table-excel td { border:1px solid #e6e8ec; padding:6px 8px; }
.table-excel thead th { background:#f7f8fa; font-weight:700; text-align:left; }
.table-excel .num { text-align:right; font-variant-numeric:tabular-nums; }
.table-excel tbody tr:nth-child(even) { background:#fcfdff; }
*/
