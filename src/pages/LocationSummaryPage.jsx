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

  // para orden consistente por producto
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
        console.error('LocationSummary load error:', e);
        setErrMsg('Error cargando datos');
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  // capacidad efectiva = override loc → base por producto * #neveras → default 72 * #neveras
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

  const fmtPct = (r) => (Number.isFinite(r) ? `${Math.round(r * 100)}%` : '—');

  const renderMiniBreakdownTable = (loc) => {
    const s = summaries[loc._id] || {};
    const breakdown = s.locationBreakdown || {};
    const keys = Object.keys(breakdown);
    if (keys.length === 0) return <em>No data</em>;

    const ordered = [...keys].sort((a, b) => {
      const ia = orderIndex(a), ib = orderIndex(b);
      if (ia !== ib) return ia - ib;
      return String(a).localeCompare(String(b));
    });

    return (
      <div style={{ overflowX: 'auto' }}>
        <table className="table-excel" style={{ minWidth: 560 }}>
          <thead>
            <tr>
              <th>Producto</th>
              <th className="num">Actual</th>
              <th className="num">Capacidad</th>
              <th className="num">Ocupación</th>
              <th className="num">Faltan</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((prod, i) => {
              const current = Number(breakdown[prod] || 0);
              const cap = effectiveCapacityFor(loc, prod);
              const ratio = cap > 0 ? current / cap : NaN;
              const gap = Math.max(0, cap - current);
              return (
                <tr key={prod}>
                  <td style={{ fontWeight: 600 }}>{prod}</td>
                  <td className="num">{current}</td>
                  <td className="num">{cap}</td>
                  <td className="num">{fmtPct(ratio)}</td>
                  <td className="num">{gap}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

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

  return (
    <div className="main-container">
      <NavBar />
      <h2 style={{ marginBottom: 12 }}>Resumen por Locación</h2>
      <p style={{ marginTop: 0, color: 'var(--muted)' }}>
        Vista rápida y práctica: total por locación y detalle por producto.
      </p>

      <div className="loc-grid">
        {locations.map((loc) => {
          const s = summaries[loc._id] || {};
          return (
            <section key={loc._id} className="card loc-card">
              <div className="loc-head">
                <h3 className="m0">{loc.name}</h3>
                <div className="loc-meta">
                  <span className="chip">{(loc?.refrigerators?.length || 0)} neveras</span>
                  <span className="chip">{s?.usersCount ?? loc?.usersCount ?? 0} usuarios</span>
                </div>
              </div>

              <div className="loc-kpis">
                <div className="kpi">
                  <div className="kpi-label">Total productos</div>
                  <div className="kpi-value">{s?.totalLocation ?? 0}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Productos distintos</div>
                  <div className="kpi-value">{Object.keys(s?.locationBreakdown || {}).length}</div>
                </div>
              </div>

              {renderMiniBreakdownTable(loc)}
            </section>
          );
        })}
      </div>

      <Footer />
    </div>
  );
}

export default LocationSummaryPage;
