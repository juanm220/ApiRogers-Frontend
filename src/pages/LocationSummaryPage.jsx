// src/pages/LocationSummaryPage.jsx
import React, { useEffect, useMemo, useState } from 'react';
import API from '../apiService';
import NavBar from '../components/NavBar';
import Footer from '../components/Footer';
import '../styles.css';
import {
  forgetClosedSession,
  getLastClosedSessionId,
  rememberClosedSession,
} from '../utils/inventorySessionStorage';

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

  // Resumen inventario por locación:
  // { [locId]: { initial:{[prod]:num}, final:{[prod]:num}, transfer:{[prod]:+n|-n}, closed:boolean } }
  const [invSummaries, setInvSummaries] = useState({});

  // === NUEVO: selección y copiado ===
  // modo de selección por locación: { [locId]: boolean }
  const [selectModeByLoc, setSelectModeByLoc] = useState({});
  // productos seleccionados por locación: { [locId]: Set<string> }
  const [selectedByLoc, setSelectedByLoc] = useState({});
  // feedback breve por locación
  const [copyMsgByLoc, setCopyMsgByLoc] = useState({});

  const setSelectMode = (locId, on) =>
    setSelectModeByLoc((p) => ({ ...p, [locId]: !!on }));

  const toggleSelected = (locId, prodName) =>
    setSelectedByLoc((p) => {
      const cur = new Set(p[locId] || []);
      if (cur.has(prodName)) cur.delete(prodName);
      else cur.add(prodName);
      return { ...p, [locId]: cur };
    });

  const clearSelection = (locId) =>
    setSelectedByLoc((p) => ({ ...p, [locId]: new Set() }));

  const setCopyMsg = (locId, text) => {
    setCopyMsgByLoc((p) => ({ ...p, [locId]: text }));
    // auto-clear en 2.2s
    setTimeout(() => {
      setCopyMsgByLoc((p2) => {
        if (p2[locId] !== text) return p2;
        const { [locId]: _x, ...rest } = p2;
        return rest;
      });
    }, 2200);
  };

  async function copyToClipboard(text, locId) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopyMsg(locId, 'Copied!');
    } catch {
      setCopyMsg(locId, 'Copy failed');
    }
  }

  const orderMap = useMemo(() => {
    const m = new Map();
    stdOrder.forEach((name, idx) => m.set(toKey(name), idx));
    return m;
  }, [stdOrder]);

  const orderIndex = (name) => {
    const i = orderMap.get(toKey(name));
    return typeof i === 'number' ? i : 9999;
  };

  // ----- Carga principal -----
  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      setErrMsg('');
      try {
        // 1) Dashboard overview
        const r = await API.get('/dashboard/overview', { signal: controller.signal, timeout: 20000 });
        const data = r.data?.data || {};
        setStdOrder(Array.isArray(data.stdOrder) ? data.stdOrder : []);
        setCapacityMap(data.capacityMap || {});
        setCapacityByLocation(data.capacityByLocation || {});
        const locs = Array.isArray(data.locations) ? data.locations : [];
        setLocations(locs);
        setSummaries(data.summaries || {});
        setLoading(false);

        // 2) sesiones inventario
        const invMap = {};
        await Promise.all(
          (locs || []).map(async (loc) => {
            const locId = loc?._id;
            if (!locId) return;

            let sessionId = null;
            let consideredClosed = false;

            try {
              const activeRes = await API.get('/locations/inventory-sessions/active', {
                params: { locationId: locId },
                signal: controller.signal,
                timeout: 12000,
              });
              const activeSess = activeRes.data?.session;
              if (activeSess?._id) {
                sessionId = activeSess._id;
                consideredClosed = activeSess.status === 'closed';
              }
            } catch {}

            if (!sessionId) {
              const storedId = getLastClosedSessionId(locId);
              if (storedId) {
                sessionId = storedId;
                consideredClosed = true;
              }
            }

            if (!sessionId) return;

            try {
              const sumRes = await API.get(`/locations/inventory-sessions/${sessionId}/summary`, {
                signal: controller.signal,
                timeout: 15000,
              });

              const rows = sumRes.data?.data?.rows || [];
              const closedAt = sumRes.data?.data?.closedAt;
              const closed = consideredClosed || !!closedAt;

              if (closed) rememberClosedSession(locId, sessionId);
              else forgetClosedSession(locId);

              const initial = {};
              const final = {};
              const transfer = {};
              for (const row of rows) {
                const name = row.productName;
                initial[name] = Number(row.inicial) || 0;
                if (row.final == null || Number.isNaN(Number(row.final))) {
                  // abierta
                } else {
                  final[name] = Number(row.final) || 0;
                }
                const net = (Number(row.entradas) || 0) - (Number(row.salidas) || 0);
                if (net) transfer[name] = net;
              }

              invMap[locId] = { initial, final, transfer, closed };
            } catch {
              forgetClosedSession(locId);
            }
          })
        );
        setInvSummaries(invMap);
      } catch (e) {
        if (e?.name !== 'CanceledError') {
          console.error('Summary load error:', e);
          setErrMsg('Error cargando el resumen');
        }
      } finally {
        setLoading(false);
      }
    };

    load();
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
      <h2 style={{ marginTop: '0.5rem' }}>Summary by location</h2>

      {/* Controles */}
      <div className="card" style={{ marginBottom: '1rem', display: 'grid', gap: 12 }}>
        <div className="grid-2">
          <div>
            <label>Search by location</label>
            <input
              type="text"
              placeholder="Ej: Sede Norte"
              value={searchLoc}
              onChange={(e) => setSearchLoc(e.target.value)}
            />
          </div>
          <div className="flex-row" style={{ alignItems: 'center', gap: 10 }}>
            <label>Hide locations without results</label>
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
              compact rows
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
            All
          </button>
          <button
            type="button"
            className={`chip-radio ${prodFilter === 'critical' ? 'active' : ''}`}
            onClick={() => setProdFilter('critical')}
            aria-pressed={prodFilter === 'critical'}
            title={`≤ ${Math.round(lowThreshold * 100)}%`}
          >
            Critics
          </button>
          <button
            type="button"
            className={`chip-radio ${prodFilter === 'warn' ? 'active' : ''}`}
            onClick={() => setProdFilter('warn')}
            aria-pressed={prodFilter === 'warn'}
            title={`≤ ${Math.round(warnThreshold * 100)}%`}
          >
            Warnings
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

      {loading && <p>Loading...</p>}
      {errMsg && <p style={{ color: 'crimson' }}>{errMsg}</p>}

      <div className="loc-grid" style={{ gap: 'clamp(12px, 2.5vmin, 20px)' }}>
        {visibleLocations.map((loc) => {
          const s = summaries[loc._id] || {};
          const breakdown = s.locationBreakdown || {};
          const keys = Object.keys(breakdown);

          const inv = invSummaries[loc._id] || {};
          const sessionClosed = !!inv.closed;
          const showSalesCol = sessionClosed;

          let rows = keys.map((prod) => {
            const current = Number(breakdown[prod] || 0);
            const cap = effectiveCapacityFor(loc, prod);
            const ratio = cap > 0 ? current / cap : NaN;

            const initial = Number(inv.initial?.[prod]);
            const final = Number(inv.final?.[prod]);
            const transferNet = Number(inv.transfer?.[prod]);
            const sales =
              Number.isFinite(initial) && Number.isFinite(final)
                ? Math.max(0, initial - final)
                : null;

            return { prod, current, cap, ratio, initial, final, transferNet, sales };
          });

          rows.sort((a, b) => {
            const ia = orderIndex(a.prod), ib = orderIndex(b.prod);
            if (ia !== ib) return ia - ib;
            return String(a.prod).localeCompare(String(b.prod));
          });

          rows = filterProductsByStatus(rows);
          if (hideEmptyAfterFilter && rows.length === 0) return null;

          const locId = String(loc._id);
          const selectMode = !!selectModeByLoc[locId];
          const selectedSet = selectedByLoc[locId] || new Set();

          const copyNumbers = async () => {
            const chosen = rows.filter((r) => selectedSet.has(r.prod));
            if (chosen.length === 0) {
              setCopyMsg(locId, 'No items selected');
              return;
            }
            // una cifra por línea (columna única en Excel)
            const text = chosen.map((r) => String(r.current ?? '')).join('\n');
            await copyToClipboard(text, locId);
          };

          const copyNameAndNumbers = async () => {
            const chosen = rows.filter((r) => selectedSet.has(r.prod));
            if (chosen.length === 0) {
              setCopyMsg(locId, 'No items selected');
              return;
            }
            // Producto<TAB>Current por línea (dos columnas en Excel)
            const text = chosen.map((r) => `${r.prod}\t${r.current ?? ''}`).join('\n');
            await copyToClipboard(text, locId);
          };

          return (
            <section key={loc._id} className="card loc-card">
              <header className="loc-head" style={{ alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <h3 className="m0">{loc.name}</h3>
                  <div className="loc-meta">
                    <span className="pill">Total Products: <b>{s.totalLocation || 0}</b></span>
                    <span className="pill">Users: <b>{loc.usersCount || 0}</b></span>
                    <span className="pill">Fridges: <b>{(loc.refrigerators || []).length || 0}</b></span>
                    {!sessionClosed && (
                      <span className="pill" title="La sesión sigue abierta">Sesión abierta</span>
                    )}
                  </div>
                </div>

                {/* NUEVO: controles de selección/copia para ESTA locación */}
                <div className="flex-row" style={{ gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={`chip-radio ${selectMode ? 'active' : ''}`}
                    onClick={() => {
                      const next = !selectMode;
                      setSelectMode(locId, next);
                      if (!next) clearSelection(locId);
                    }}
                    title="Enable selection mode for this location"
                  >
                    {selectMode ? 'Selection ON' : 'Selection OFF'}
                  </button>
                  {selectMode && (
                    <>
                      <button className="btn btn--secondary" onClick={copyNumbers} title="Copy Current of selected items">
                        Copy (numbers)
                      </button>
                      <button className="btn" onClick={copyNameAndNumbers} title="Copy Product and Current (TAB-separated)">
                        Copy (name + number)
                      </button>
                      <button className="btn btn--danger" onClick={() => clearSelection(locId)}>
                        Clear
                      </button>
                      {copyMsgByLoc[locId] && (
                        <span className="pill" aria-live="polite">{copyMsgByLoc[locId]}</span>
                      )}
                    </>
                  )}
                </div>
              </header>

              {rows.length === 0 ? (
                <em>There are not products that match the filter.</em>
              ) : (
                <div className="table-wrap table-wrap--shadow">
                  <table
                    className={`table-excel ${denseRows ? 'table--dense' : ''}`}
                    style={{ minWidth: (showSalesCol ? 980 : 860) + (selectMode ? 60 : 0) }}
                  >
                    <thead>
                      <tr>
                        {selectMode && <th style={{ width: 40 }} aria-label="Select" title="Select" />}
                        <th style={{ width: '34%' }}>Product</th>
                        <th className="num" style={{ width: 110 }}>Innitial</th>
                        <th className="num" style={{ width: 110 }}>Final</th>
                        {showSalesCol && (
                          <th
                            className="num"
                            style={{ width: 130 }}
                            title="Ventas = Inicial − Final (solo sesión cerrada)"
                          >
                            Ventas (sesión)
                          </th>
                        )}
                        <th className="num" style={{ width: 110 }}>Current</th>
                        <th className="num" style={{ width: 180 }}>Capacity</th>
                        <th className="num" style={{ width: 120 }}>Occupation</th>
                        <th className="num" style={{ width: 120 }}>Missing to be full</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const gap = Math.max(0, r.cap - r.current);
                        const hasInitial = Number.isFinite(r.initial);
                        const hasFinal = Number.isFinite(r.final);
                        const hasTransfer = Number.isFinite(r.transferNet) && r.transferNet !== 0;
                        const hasSales = Number.isFinite(r.sales);

                        const checked = selectedSet.has(r.prod);

                        return (
                          <tr key={`${loc._id}-${r.prod}`}>
                            {selectMode && (
                              <td className="num" style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleSelected(locId, r.prod)}
                                  aria-label={`Select ${r.prod}`}
                                />
                              </td>
                            )}
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

                            {/* Ventas */}
                            {showSalesCol && (
                              <td className="num" title="Ventas de la sesión (Inicial − Final)">
                                {hasSales ? r.sales : '—'}
                              </td>
                            )}

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
          .small-delta.negative::before { content: '-'; }
          .small-delta.positive::before { content: '+'; }
        `}
      </style>

      <Footer />
    </div>
  );
}

export default LocationSummaryPage;
