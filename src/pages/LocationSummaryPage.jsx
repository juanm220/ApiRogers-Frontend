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
  const [denseRows, setDenseRows] = useState(false);

  // Resumen inventario por locación
  // { [locId]: { initial: { [prod]: num }, final: { [prod]: num|undefined }, transfer: { [prod]: +n|-n } } }
  const [invSummaries, setInvSummaries] = useState({});

  const orderMap = useMemo(() => {
    const m = new Map();
    stdOrder.forEach((name, idx) => m.set(toKey(name), idx));
    return m;
  }, [stdOrder]);

  const orderIndex = (name) => {
    const i = orderMap.get(toKey(name));
    return typeof i === 'number' ? i : 9999;
  };

  // Carga principal
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
        const locs = Array.isArray(data.locations) ? data.locations : [];
        setLocations(locs);
        setSummaries(data.summaries || {});
        setLoading(false);

        // 🔁 Una vez que tengo locaciones, busco sesiones activas y summaries
        // Esto funciona con TU backend actual:
        // GET /inventory-sessions/active?locationId=...
        // GET /inventory-sessions/:sessionId/summary
        const invMap = {};
        await Promise.all(
          (locs || []).map(async (loc) => {
            try {
              const activeRes = await API.get('/inventory-sessions/active', {
                params: { locationId: loc._id },
                timeout: 12000,
              });
              const sess = activeRes.data?.session;
              if (!sess?._id) return;

              const sumRes = await API.get(`/inventory-sessions/${sess._id}/summary`, { timeout: 15000 });
              const rows = sumRes.data?.data?.rows || [];
              // rows: [{ productName, inicial, entradas, salidas, final|null, diferencia|null }]

              const initial = {};
              const final = {};
              const transfer = {};
              for (const row of rows) {
                const name = row.productName;
                initial[name] = Number(row.inicial) || 0;
                if (row.final == null || Number.isNaN(Number(row.final))) {
                  // sesión aún abierta -> no hay final
                } else {
                  final[name] = Number(row.final) || 0;
                }
                const net = (Number(row.entradas) || 0) - (Number(row.salidas) || 0);
                if (net) transfer[name] = net;
              }
              invMap[loc._id] = { initial, final, transfer };
            } catch (e) {
              // si algo falla para una locación, seguimos con las demás
            }
          })
        );
        setInvSummaries(invMap);
      } catch (e) {
        if (e?.name !== 'CanceledError') {
          console.error('Summary load error:', e);
          setErrMsg('Error cargando el resumen');
          setLoading(false);
        }
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
      return rows.filter((r) => Number.isFinite(r.ratio) && r.ratio <= lowThreshold);
    }
    if (prodFilter === 'warn') {
      return rows.filter((r) => Number.isFinite(r.ratio) && r.ratio > lowThreshold && r.ratio <= warnThreshold);
    }
    return rows.filter((r) => Number.isFinite(r.ratio) && r.ratio > warnThreshold);
  }

  const visibleLocations = useMemo(() => {
    const q = toKey(searchLoc);
    if (!q) return locations;
    return locations.filter((l) => toKey(l.name).includes(q));
  }, [locations, searchLoc]);

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
          <div className="flex-row" style={{ alignItems: 'center', gap: 10 }}>
            <label>Ocultar locaciones sin resultados</label>
            <input
              type="checkbox"
              checked={hideEmptyAfterFilter}
              onChange={(e) => setHideEmptyAfterFilter(e.target.checked)}
            />
            <span className="push-right" />
            <label className="flex-row" style={{ gap: 8 }}>
              <input
                type="checkbox"
                checked={denseRows}
                onChange={(e) => setDenseRows(e.target.checked)}
              />
              Filas compactas
            </label>
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

      <div className="loc-grid" style={{ gap: 'clamp(12px, 2.5vmin, 20px)' }}>
        {visibleLocations.map((loc) => {
          const s = summaries[loc._id] || {};
          const breakdown = s.locationBreakdown || {};
          const keys = Object.keys(breakdown);

          let rows = keys.map((prod) => {
            const current = Number(breakdown[prod] || 0);
            const cap = effectiveCapacityFor(loc, prod);
            const ratio = cap > 0 ? current / cap : NaN;

            // Lectura de inicial / final / transfer (si existe sesión activa)
            const inv = invSummaries[loc._id] || {};
            const initial = Number(inv.initial?.[prod]);
            const final = Number(inv.final?.[prod]);
            const transferNet = Number(inv.transfer?.[prod]); // puede ser + o -

            return { prod, current, cap, ratio, initial, final, transferNet };
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
                  <table
                    className={`table-excel ${denseRows ? 'table--dense' : ''}`}
                    style={{ minWidth: 860 }}
                  >
                    <thead>
                      <tr>
                        <th style={{ width: '34%' }}>Producto</th>
                        <th className="num" style={{ width: 110 }}>Inicial</th>
                        <th className="num" style={{ width: 110 }}>Final</th>
                        <th className="num" style={{ width: 110 }}>Actual</th>
                        <th className="num" style={{ width: 180 }}>Capacidad efectiva</th>
                        <th className="num" style={{ width: 120 }}>Ocupación</th>
                        <th className="num" style={{ width: 120 }}>Faltan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const gap = Math.max(0, r.cap - r.current);
                        const hasInitial = Number.isFinite(r.initial);
                        const hasFinal = Number.isFinite(r.final);
                        const hasTransfer = Number.isFinite(r.transferNet) && r.transferNet !== 0;

                        return (
                          <tr key={`${loc._id}-${r.prod}`}>
                            <td>{r.prod}</td>

                            {/* Inicial con micro delta de transferencias */}
                            <td className="num">
                              {hasInitial ? r.initial : '—'}
                              {hasTransfer && (
                                <small
                                  className={`small-delta ${r.transferNet < 0 ? 'negative' : 'positive'}`}
                                  title="Transferencias netas durante la sesión"
                                >
                                  {Math.abs(r.transferNet)}
                                </small>
                              )}
                            </td>

                            {/* Final */}
                            <td className="num">{hasFinal ? r.final : '—'}</td>

                            {/* Métricas actuales */}
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

      {/* Estilo micro-badge de transferencias */}
      <style>
        {`
          .small-delta {
            font-size: 0.8rem;
            opacity: 0.7;
            margin-left: 6px;
            white-space: nowrap;
          }
          .small-delta.negative::before { content: '−'; }
          .small-delta.positive::before { content: '+'; }
        `}
      </style>

      <Footer />
    </div>
  );
}

export default LocationSummaryPage;
