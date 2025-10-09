// src/pages/LocationSummaryPage.jsx
import React, { useEffect, useMemo, useState } from 'react';
import API from '../apiService';
import NavBar from '../components/NavBar';
import Footer from '../components/Footer';
import '../styles.css';

const toKey = (s) => String(s || '').trim().toLowerCase();

function LocationSummaryPage() {
  const [stdOrder, setStdOrder] = useState([]);
  const [capacityMap, setCapacityMap] = useState({});
  const [capacityByLocation, setCapacityByLocation] = useState({});
  const [locations, setLocations] = useState([]);
  const [summaries, setSummaries] = useState({});
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState('');

  // thresholds / colores
  const [colorByCapacity] = useState(true);
  const [lowThreshold] = useState(0.3);
  const [warnThreshold] = useState(0.6);
  const [defaultPerFridgeCapacity] = useState(72);

  // filtros UI
  const [searchLoc, setSearchLoc] = useState('');
  const [prodFilter, setProdFilter] = useState('all'); // all | critical | warn | ok
  const [hideEmptyAfterFilter, setHideEmptyAfterFilter] = useState(true);

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
    (async () => {
      setLoading(true);
      setErrMsg('');
      try {
        const r = await API.get('/dashboard/overview', { signal: controller.signal });
        const data = r.data?.data || {};
        setStdOrder(Array.isArray(data.stdOrder) ? data.stdOrder : []);
        setCapacityMap(data.capacityMap || {});
        setCapacityByLocation(data.capacityByLocation || {});
        setLocations(Array.isArray(data.locations) ? data.locations : []);
        setSummaries(data.summaries || {});
        setLoading(false);
      } catch (e) {
        if (e?.name === 'CanceledError') return;
        console.error('Summary load error:', e);
        setErrMsg('Error cargando el resumen');
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  const colorForRatio = (ratio) => {
    if (!colorByCapacity || !Number.isFinite(ratio)) return 'inherit';
    if (ratio <= lowThreshold) return '#b00020';
    if (ratio <= warnThreshold) return '#8a6d3b';
    return '#0b6e4f';
  };
  const fmtPct = (r) => (Number.isFinite(r) ? `${Math.round(r * 100)}%` : '—');

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

  function filterProductsByStatus(rows) {
    if (prodFilter === 'all') return rows;
    if (prodFilter === 'critical') {
      return rows.filter(r => Number.isFinite(r.ratio) && r.ratio <= lowThreshold);
    }
    if (prodFilter === 'warn') {
      return rows.filter(r => Number.isFinite(r.ratio) && r.ratio > lowThreshold && r.ratio <= warnThreshold);
    }
    return rows.filter(r => Number.isFinite(r.ratio) && r.ratio > warnThreshold);
  }

  const visibleLocations = useMemo(() => {
    const q = toKey(searchLoc);
    if (!q) return locations;
    return locations.filter(l => toKey(l.name).includes(q));
  }, [locations, searchLoc]);

  // Etiquetas de columnas
  const COLS = {
    prod: 'Producto',
    current: 'Actual',
    cap: 'Capacidad efectiva',
    occ: 'Ocupación',
    gap: 'Faltan',
  };

  return (
    <div className="main-container">
      <NavBar />
      <h2 style={{ marginTop: '0.5rem' }}>Resumen por Locación</h2>

      {/* Controles */}
      <div className="card" style={{ marginBottom: '1rem', display: 'grid', gap: 12 }}>
        <div className="grid-2">
          <div>
            <label>Buscar locación</label>
            <input
              type="text"
              placeholder="Ej: Sede Norte"
              value={searchLoc}
              onChange={(e) => setSearchLoc(e.target.value)}
            />
          </div>
          <div>
            <label>Ocultar locaciones sin resultados</label>
            <input
              type="checkbox"
              checked={hideEmptyAfterFilter}
              onChange={(e) => setHideEmptyAfterFilter(e.target.checked)}
            />
          </div>
        </div>

        <div className="chip-row">
          <button
            type="button"
            className={`chip-radio ${prodFilter === 'all' ? 'active' : ''}`}
            onClick={() => setProdFilter('all')}
            aria-pressed={prodFilter === 'all'}
            title="Ver todos los productos"
          >
            Todos
          </button>
          <button
            type="button"
            className={`chip-radio ${prodFilter === 'critical' ? 'active' : ''}`}
            onClick={() => setProdFilter('critical')}
            aria-pressed={prodFilter === 'critical'}
            title="Críticos"
          >
            Críticos
          </button>
          <button
            type="button"
            className={`chip-radio ${prodFilter === 'warn' ? 'active' : ''}`}
            onClick={() => setProdFilter('warn')}
            aria-pressed={prodFilter === 'warn'}
            title="Advertencia"
          >
            Advertencia
          </button>
          <button
            type="button"
            className={`chip-radio ${prodFilter === 'ok' ? 'active' : ''}`}
            onClick={() => setProdFilter('ok')}
            aria-pressed={prodFilter === 'ok'}
            title="OK"
          >
            OK
          </button>
        </div>
      </div>

      {loading && <p>Cargando…</p>}
      {errMsg && <p style={{ color: 'crimson' }}>{errMsg}</p>}

      {/* grid con respiración entre locaciones */}
      <div className="loc-grid" style={{ gap: 'clamp(12px, 2.5vmin, 20px)' }}>
        {visibleLocations.map((loc) => {
          const s = summaries[loc._id] || {};
          const breakdown = s.locationBreakdown || {};
          const keys = Object.keys(breakdown);

          let rows = keys.map((prod) => {
            const current = Number(breakdown[prod] || 0);
            const cap = effectiveCapacityFor(loc, prod);
            const ratio = cap > 0 ? current / cap : NaN;
            return { prod, current, cap, ratio };
          });

          rows.sort((a, b) => {
            const ia = orderIndex(a.prod), ib = orderIndex(b.prod);
            if (ia !== ib) return ia - ib;
            return String(a.prod).localeCompare(String(b.prod));
          });

          rows = filterProductsByStatus(rows);

          if (hideEmptyAfterFilter && rows.length === 0) return null;

          return (
            <section key={loc._id} className="card loc-card">
              <header className="loc-head">
                <h3 className="m0">{loc.name}</h3>
                <div className="loc-meta">
                  <span className="pill">Total productos: <b>{s.totalLocation || 0}</b></span>
                  <span className="pill">Usuarios: <b>{loc.usersCount || 0}</b></span>
                  <span className="pill">Neveras: <b>{(loc.refrigerators || []).length || 0}</b></span>
                </div>
              </header>

              {(rows.length === 0) ? (
                <em>No hay productos que coincidan con el filtro.</em>
              ) : (
                <div className="table-wrap table-wrap--shadow">
                  {/* Mantiene el look “Excel” existente */}
                  <table className="table-excel" style={{ minWidth: 680 }}>
                    <thead>
                      <tr>
                        <th style={{ width: '40%' }}>{COLS.prod}</th>
                        <th className="num" style={{ width: 120 }}>{COLS.current}</th>
                        <th className="num" style={{ width: 180 }}>{COLS.cap}</th>
                        <th className="num" style={{ width: 120 }}>{COLS.occ}</th>
                        <th className="num" style={{ width: 120 }}>{COLS.gap}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const gap = Math.max(0, r.cap - r.current);
                        return (
                          <tr key={`${loc._id}-${r.prod}`}>
                            <td>{r.prod}</td>
                            <td className="num">{r.current}</td>
                            <td className="num">{r.cap}</td>
                            <td className="num" style={{ color: colorForRatio(r.ratio) }}>
                              {fmtPct(r.ratio)}
                            </td>
                            <td className="num">{gap}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <Footer />
    </div>
  );
}

export default LocationSummaryPage;
