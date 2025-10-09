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

  // NUEVO: filtros UI
  const [searchLoc, setSearchLoc] = useState('');                 // buscador por locación
  const [prodFilter, setProdFilter] = useState('all');            // all | critical | warn | ok
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

  // capacidad efectiva loc+producto
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

  // Aplica filtro de criticidad a los productos de una locación
  function filterProductsByStatus(rows) {
    if (prodFilter === 'all') return rows;
    if (prodFilter === 'critical') {
      return rows.filter(r => Number.isFinite(r.ratio) && r.ratio <= lowThreshold);
    }
    if (prodFilter === 'warn') {
      return rows.filter(r => Number.isFinite(r.ratio) && r.ratio > lowThreshold && r.ratio <= warnThreshold);
    }
    // ok
    return rows.filter(r => Number.isFinite(r.ratio) && r.ratio > warnThreshold);
  }

  // estilos tabla
  const tableBase = { width:'100%', borderCollapse:'collapse', background:'#fff', fontSize:'0.95rem' };
  const txtCell = { textAlign:'left', padding:'8px 10px', border:'1px solid #e6e8ec' };
  const numCell = { textAlign:'right', padding:'8px 10px', border:'1px solid #e6e8ec', fontVariantNumeric:'tabular-nums' };
  const headCell = { ...txtCell, background:'#f7f8fa', fontWeight:700 };

  // Filtra locaciones por búsqueda
  const visibleLocations = useMemo(() => {
    const q = toKey(searchLoc);
    if (!q) return locations;
    return locations.filter(l => toKey(l.name).includes(q));
  }, [locations, searchLoc]);

  return (
    <div className="main-container">
      <NavBar />
      <h2 style={{ marginTop: '0.5rem' }}>Resumen por Locación</h2>

      {/* Controles de filtro */}
      <div className="card" style={{ marginBottom: '1rem', display:'grid', gap:12 }}>
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
            title={`≤ ${Math.round(lowThreshold * 100)}%`}
          >
            Críticos
          </button>
          <button
            type="button"
            className={`chip-radio ${prodFilter === 'warn' ? 'active' : ''}`}
            onClick={() => setProdFilter('warn')}
            aria-pressed={prodFilter === 'warn'}
            title={`≤ ${Math.round(warnThreshold * 100)}%`}
          >
            Advertencia
          </button>
          <button
            type="button"
            className={`chip-radio ${prodFilter === 'ok' ? 'active' : ''}`}
            onClick={() => setProdFilter('ok')}
            aria-pressed={prodFilter === 'ok'}
            title={`> ${Math.round(warnThreshold * 100)}%`}
          >
            OK
          </button>
        </div>
      </div>

      {loading && <p>Cargando…</p>}
      {errMsg && <p style={{ color: 'crimson' }}>{errMsg}</p>}

      <div className="loc-grid">
        {visibleLocations.map((loc) => {
          const s = summaries[loc._id] || {};
          const breakdown = s.locationBreakdown || {};
          const keys = Object.keys(breakdown);

          // arma filas base
          let rows = keys.map((prod) => {
            const current = Number(breakdown[prod] || 0);
            const cap = effectiveCapacityFor(loc, prod);
            const ratio = cap > 0 ? current / cap : NaN;
            return { prod, current, cap, ratio };
          });

          // ordena por orden estándar y luego alfabético
          rows.sort((a, b) => {
            const ia = orderIndex(a.prod), ib = orderIndex(b.prod);
            if (ia !== ib) return ia - ib;
            return String(a.prod).localeCompare(String(b.prod));
          });

          // aplica filtro por criticidad
          rows = filterProductsByStatus(rows);

          // si está activo, oculta locaciones sin filas visibles tras filtros
          if (hideEmptyAfterFilter && rows.length === 0) {
            return null;
          }

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
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ ...tableBase, minWidth: 560 }}>
                    <thead>
                      <tr>
                        <th style={{ ...headCell, width:'40%' }}>Producto</th>
                        <th style={{ ...headCell, textAlign:'right', width:110 }}>Actual</th>
                        <th style={{ ...headCell, textAlign:'right', width:160 }}>Capacidad efectiva</th>
                        <th style={{ ...headCell, textAlign:'right', width:110 }}>Ocupación</th>
                        <th style={{ ...headCell, textAlign:'right', width:110 }}>Faltan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, idx) => {
                        const gap = Math.max(0, r.cap - r.current);
                        const rowBg = idx % 2 === 0 ? '#fcfdff' : '#ffffff';
                        return (
                          <tr key={`${loc._id}-${r.prod}`} style={{ background: rowBg }}>
                            <td style={{ ...txtCell, fontWeight:600 }}>{r.prod}</td>
                            <td style={{ ...numCell }}>{r.current}</td>
                            <td style={{ ...numCell }}>{r.cap}</td>
                            <td style={{ ...numCell, color: colorForRatio(r.ratio) }}>{fmtPct(r.ratio)}</td>
                            <td style={{ ...numCell }}>{gap}</td>
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
