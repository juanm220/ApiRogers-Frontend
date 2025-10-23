// src/pages/HistoryCapacityPage.jsx
import React, { useEffect, useMemo, useState } from 'react';
import API from '../apiService';
import NavBar from '../components/NavBar';
import Footer from '../components/Footer';
import '../styles.css';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ResponsiveContainer,
} from 'recharts';

const toKey = (s) => String(s || '').trim().toLowerCase();

function HistoryCapacityPage() {
  const [stdOrder, setStdOrder] = useState([]);
  const [capacityMap, setCapacityMap] = useState({});
  const [capacityByLocation, setCapacityByLocation] = useState({});
  const [locations, setLocations] = useState([]);
  const [summaries, setSummaries] = useState({});
  const [analyticsByFridge, setAnalyticsByFridge] = useState({});
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState('');

  // filtros / selects
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedLocId, setSelectedLocId] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');

  // sugerencias / overrides
  const [capItemsDraft, setCapItemsDraft] = useState([]);
  const [suggestions, setSuggestions] = useState({ histMaxSum: {}, dailyPeakMax: {}, avgTop3Daily: {} });
  const [suggestMethod, setSuggestMethod] = useState('both');
  const [savingCaps, setSavingCaps] = useState(false);
  const [loadingCaps, setLoadingCaps] = useState(false);

  // helpers
  const orderMap = useMemo(() => {
    const m = new Map();
    stdOrder.forEach((name, idx) => m.set(toKey(name), idx));
    return m;
  }, [stdOrder]);
  const orderIndex = (name) => {
    const i = orderMap.get(toKey(name));
    return typeof i === 'number' ? i : 9999;
  };

  useEffect(() => {
    const controller = new AbortController();
    (async function load() {
      setErrMsg('');
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (startDate) params.set('start', startDate);
        if (endDate) params.set('end', endDate);
        const qs = params.toString() ? `?${params}` : '';
        const r = await API.get(`/dashboard/overview${qs}`, { signal: controller.signal });

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
          setSelectedProduct((data.stdOrder && data.stdOrder[0]) || '');
        }
      } catch (e) {
        if (e?.name === 'CanceledError') return;
        console.error('HistoryCapacity load error:', e);
        setErrMsg('Error cargando datos');
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [startDate, endDate]); // refetch al cambiar fechas

  // cargar overrides actuales de la locación
  useEffect(() => {
    async function loadLocOverrides() {
      if (!selectedLocId) { setCapItemsDraft([]); return; }
      try {
        const r = await API.get(`/capacity/location/${selectedLocId}`);
        const items = r.data?.data?.items || [];
        setCapItemsDraft(items.map(it => ({ product: it.product, capacity: it.capacity })));
      } catch (e) {
        console.error('loadLocOverrides error', e);
        setCapItemsDraft([]);
      }
    }
    loadLocOverrides();
  }, [selectedLocId]);

  const getLocationById = (id) => locations.find((l) => String(l._id) === String(id));
  const selectedLocation = getLocationById(selectedLocId);

  // capacidad efectiva
  const effectiveCapacityFor = (loc, productName) => {
    const locId = String(loc._id);
    const prodKey = toKey(productName);
    const override = capacityByLocation?.[locId]?.[prodKey];
    if (Number.isFinite(override) && override > 0) return override;
    const base = capacityMap?.[prodKey];
    const fridgeCount = (loc?.refrigerators || []).length || 1;
    if (Number.isFinite(base) && base > 0) return base * fridgeCount;
    return 72 * fridgeCount;
  };

  // tendencia por día
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

  const chartData = useMemo(
    () => trendDataForLocationProduct(selectedLocation, selectedProduct),
    [selectedLocation, selectedProduct, analyticsByFridge]
  );

  // sugerencias
  async function fetchSuggestions() {
    if (!selectedLocId) return;
    setLoadingCaps(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('start', startDate);
      if (endDate) params.set('end', endDate);
      if (suggestMethod) params.set('method', suggestMethod);
      const qs = params.toString() ? `?${params}` : '';
      const r = await API.get(`/capacity/location/${selectedLocId}/suggest${qs}`);
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
      return arr.filter(x => Number.isFinite(x.capacity) && x.capacity > 0);
    });
  }
  function removeCapForProduct(prod) {
    setCapItemsDraft(prev => prev.filter(x => toKey(x.product) !== toKey(prod)));
  }
  function applyAllFrom(source) {
    const src = suggestions[source] || {};
    const merged = new Map(capItemsDraft.map(x => [toKey(x.product), x.capacity]));
    Object.keys(src).forEach(k => {
      const v = Number(src[k] || 0);
      if (v > 0) merged.set(toKey(k), v);
    });
    const out = [];
    merged.forEach((cap, key) => {
      const originalName = stdOrder.find(n => toKey(n) === key) || key;
      if (cap > 0) out.push({ product: originalName, capacity: cap });
    });
    setCapItemsDraft(out);
  }
  async function saveCaps() {
    if (!selectedLocId) return;
    setSavingCaps(true);
    try {
      await API.put(`/capacity/location/${selectedLocId}`, { items: capItemsDraft });
      // refresca overview
      const r = await API.get('/dashboard/overview');
      const data = r.data?.data || {};
      setCapacityByLocation(data.capacityByLocation || {});
    } catch (e) {
      console.error('saveCaps error', e);
    } finally {
      setSavingCaps(false);
    }
  }

  if (loading) {
    return (
      <div className="main-container">
        <NavBar />
        <p>Cargando…</p>
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

  // estilos tabla simple
  const headCell = { padding: '8px 10px', border: '1px solid var(--border)', background: 'var(--thead-bg)', fontWeight: 700, textAlign: 'left' };
  const txtCell  = { padding: '8px 10px', border: '1px solid var(--border)', textAlign: 'left' };
  const numCell  = { padding: '8px 10px', border: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

  return (
    <div className="main-container">
      <NavBar />
      <h2 style={{ marginBottom: 12 }}>Historial & Capacidad</h2>

      {/* Filtros */}
      <div className="card grid-2" style={{ marginBottom: '1rem' }}>
        <div>
          <label>Start (YYYY-MM-DD)</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <label>End (YYYY-MM-DD)</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div>
          <label>Location</label>
          <select value={selectedLocId} onChange={(e) => setSelectedLocId(e.target.value)}>
            {locations.map(l => <option key={l._id} value={l._id}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <label>Product</label>
          <select value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)}>
            {stdOrder.map((p) => <option key={`std-${p}`} value={p}>{p}</option>)}
            {selectedLocation && summaries[selectedLocation._id] &&
              Object.keys(summaries[selectedLocation._id].locationBreakdown || {})
                .filter(p => !stdOrder.some(s => s.toLowerCase() === p.toLowerCase()))
                .map(p => <option key={`bk-${p}`} value={p}>{p}</option>)
            }
          </select>
        </div>
      </div>

      {/* Editor de capacidad por locación */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="flex-row" style={{ flexWrap: 'wrap', gap: 10 }}>
          <h3 className="m0">Capacidad — {selectedLocation ? selectedLocation.name : '—'}</h3>
          <span className="push-right" />
          <label>Método</label>
          <select value={suggestMethod} onChange={(e) => setSuggestMethod(e.target.value)}>
            <option value="both">Ambos (Max & Top3)</option>
            <option value="histMaxSum">Max observado (suma por nevera)</option>
            <option value="dailyPeakMax">Pico diario</option>
          </select>
          <button onClick={fetchSuggestions} disabled={!selectedLocId || loadingCaps}>
            {loadingCaps ? 'Cargando…' : 'Cargar sugerencias'}
          </button>
          <button onClick={() => applyAllFrom('dailyPeakMax')} disabled={loadingCaps}>Usar Max diario</button>
          <button onClick={() => applyAllFrom('avgTop3Daily')} disabled={loadingCaps}>Usar Top 3</button>
          <button onClick={() => setCapItemsDraft([])} disabled={loadingCaps}>Borrar</button>
          <button onClick={saveCaps} disabled={savingCaps || !selectedLocId}>
            {savingCaps ? 'Guardando…' : 'Guardar'}
          </button>
        </div>

        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', minWidth: 720 }}>
            <thead>
              <tr>
                <th style={headCell}>Producto</th>
                <th style={{ ...headCell, textAlign: 'right', width: 140 }}>Override</th>
                <th style={headCell}>Sugerido (Max)</th>
                <th style={headCell}>Sugerido (Top 3)</th>
                <th style={headCell}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                if (!selectedLocation) return null;
                const prodSet = new Set(stdOrder.map(toKey));
                const br = summaries[selectedLocation._id]?.locationBreakdown || {};
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
                      <td style={txtCell}>{prodName}</td>
                      <td style={numCell}>
                        <input
                          type="number"
                          min={1}
                          value={v}
                          onChange={(e) => setCapForProduct(prodName, e.target.value)}
                          style={{ width: 120 }}
                        />
                      </td>
                      <td style={txtCell}>
                        {sMax ? <button onClick={() => setCapForProduct(prodName, sMax)}>Usar {sMax}</button> : <em>—</em>}
                      </td>
                      <td style={txtCell}>
                        {sTop3 ? <button onClick={() => setCapForProduct(prodName, sTop3)}>Usar {sTop3}</button> : <em>—</em>}
                      </td>
                      <td style={txtCell}>
                        {draft ? <button onClick={() => removeCapForProduct(prodName)}>Quitar</button> : <em>—</em>}
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* Usage agregado (historial) */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 className="m0">Usage (Historial) — {selectedLocation ? selectedLocation.name : '—'}</h3>
        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <table className="table-excel" style={{ minWidth: 820 }}>
            <thead>
              <tr>
                <th>Producto</th>
                <th className="num">Used</th>
                <th className="num">Restocked</th>
                <th className="num">Min</th>
                <th className="num">Max</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                if (!selectedLocation) return null;
                const agg = {};
                const fridges = selectedLocation?.refrigerators || [];
                fridges.forEach(fr => {
                  const fid = fr && (fr._id || fr);
                  const a = analyticsByFridge[fid];
                  if (!a) return;
                  Object.keys(a).forEach(prodName => {
                    const src = a[prodName];
                    if (!agg[prodName]) {
                      agg[prodName] = { totalUsed: 0, totalRestocked: 0, minQuantity: Infinity, maxQuantity: -Infinity };
                    }
                    agg[prodName].totalUsed += src.totalUsed || 0;
                    agg[prodName].totalRestocked += src.totalRestocked || 0;
                    agg[prodName].minQuantity = Math.min(agg[prodName].minQuantity, src.minQuantity ?? Infinity);
                    agg[prodName].maxQuantity = Math.max(agg[prodName].maxQuantity, src.maxQuantity ?? -Infinity);
                  });
                });
                const keys = Object.keys(agg).sort((a, b) => {
                  const ia = orderIndex(a), ib = orderIndex(b);
                  if (ia !== ib) return ia - ib;
                  return String(a).localeCompare(String(b));
                });
                return keys.map(k => {
                  const p = agg[k];
                  return (
                    <tr key={`u-${k}`}>
                      <td style={{ fontWeight: 600 }}>{k}</td>
                      <td className="num">{p.totalUsed || 0}</td>
                      <td className="num">{p.totalRestocked || 0}</td>
                      <td className="num">{Number.isFinite(p.minQuantity) ? p.minQuantity : '—'}</td>
                      <td className="num">{Number.isFinite(p.maxQuantity) ? p.maxQuantity : '—'}</td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tendencia */}
      <div className="card" style={{ height: 320 }}>
        <h3 className="m0" style={{ marginBottom: 8 }}>
          Tendencia — {selectedLocation ? selectedLocation.name : '—'} / {selectedProduct || '—'}
        </h3>
        {chartData.length === 0 ? (
          <em>No hay datos de historial para este rango/producto.</em>
        ) : (
          <ResponsiveContainer width="100%" height="85%">
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

export default HistoryCapacityPage;
