// src/pages/DashboardPage.jsx
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import NavBar from '../components/NavBar';
import { useSelector } from 'react-redux';
import '../styles.css';

function DashboardPage() {
  const token = useSelector((state) => state.auth.token);

  const [locations, setLocations] = useState([]);
  const [summaries, setSummaries] = useState({});
  const [analyticsByFridge, setAnalyticsByFridge] = useState({}); // key: fridgeId
  const [stdOrder, setStdOrder] = useState([]); // orden universal desde Ajustes de Neveras
  const [loading, setLoading] = useState(true);

  // Util: índice en orden universal
  const orderIndex = (name) => {
    const i = stdOrder.findIndex(s => String(s).toLowerCase() === String(name).toLowerCase());
    return i === -1 ? 9999 : i;
  };

  useEffect(() => {
    setLoading(true);

    // 1) Traer orden universal
    const orderReq = axios.get('http://localhost:4000/api/config/standard-products', {
      headers: { Authorization: `Bearer ${token}` }
    });

    // 2) Traer locations
    const locReq = axios.get('http://localhost:4000/api/locations', {
      headers: { Authorization: `Bearer ${token}` }
    });

    Promise.all([orderReq, locReq])
      .then(async ([orderRes, locRes]) => {
        const order =
          orderRes.data?.items ??
          orderRes.data?.data?.items ??
          [];
        setStdOrder(order);

        const locs = locRes.data || [];
        setLocations(locs);

        // 3) Para cada location, pedir summary
        const summaryPromises = locs.map(loc =>
          axios.get(`http://localhost:4000/api/locations/${loc._id}/summary`, {
            headers: { Authorization: `Bearer ${token}` }
          })
          .then(r => ({ locId: loc._id, summary: r.data?.data }))
          .catch(() => ({ locId: loc._id, summary: null }))
        );

        // 4) Para cada fridge pedir analytics (historial)
        const fridgeIds = locs.flatMap(loc =>
          (loc.refrigerators || []).map(fr => fr && (fr._id || fr)) // poblado o id simple
        ).filter(Boolean);

        const analyticsPromises = fridgeIds.map(fid =>
          axios.get(`http://localhost:4000/api/refrigerators/${fid}/history`, {
            headers: { Authorization: `Bearer ${token}` }
          })
          .then(r => ({ fridgeId: fid, analytics: r.data?.data || {} }))
          .catch(() => ({ fridgeId: fid, analytics: null }))
        );

        const [summaryRes, analyticsRes] = await Promise.all([
          Promise.all(summaryPromises),
          Promise.all(analyticsPromises),
        ]);

        const summaryObj = {};
        summaryRes.forEach(s => { summaryObj[s.locId] = s.summary; });
        setSummaries(summaryObj);

        const analyticsObj = {};
        analyticsRes.forEach(a => { analyticsObj[a.fridgeId] = a.analytics; });
        setAnalyticsByFridge(analyticsObj);

        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching data for dashboard:', err);
        setLoading(false);
      });
  }, [token]);

  if (loading) {
    return (
      <div>
        <NavBar />
        <p>Loading...</p>
      </div>
    );
  }

  // Agrega analytics de varios fridges a nivel LOCATION
  const buildLocationAnalytics = (loc) => {
    // Combina analytics de todos sus fridges
    const result = {}; // key: productName -> {totalUsed, totalRestocked, minQuantity, maxQuantity}
    const fridges = loc.refrigerators || [];

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

  return (
    <div className='main-container'>
      <NavBar />
      <h2>Dashboard Summary</h2>

      <table border="1" cellPadding="5">
        <thead>
          <tr>
            <th>Location</th>
            <th>Total Products</th>
            <th>Product Breakdown</th>
            <th>Assigned Users</th>
          </tr>
        </thead>
        <tbody>
          {locations.map(loc => {
            const s = summaries[loc._id];
            if (!s) {
              return (
                <tr key={loc._id}>
                  <td>{loc.name}</td>
                  <td colSpan="3">No Summary Available</td>
                </tr>
              );
            }
            const breakdown = s.locationBreakdown || {};

            // Ordena claves según stdOrder para “universal order” en UI
            const orderedKeys = Object.keys(breakdown).sort((a, b) => {
              const ia = orderIndex(a), ib = orderIndex(b);
              if (ia !== ib) return ia - ib;
              return String(a).localeCompare(String(b)); // alfabético como tie-breaker
            });

            return (
              <tr key={loc._id}>
                <td>{loc.name}</td>
                <td>{s.totalLocation}</td>
                <td>
                  {orderedKeys.map(prodName => (
                    <div key={prodName}>
                      {prodName}: {breakdown[prodName]}
                    </div>
                  ))}
                </td>
                <td>{loc.users?.length || 0} users</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Bloque de analytics a nivel Location (combina todos los fridges de esa location) */}
      <h3 style={{ marginTop: '1.25rem' }}>Usage (Historial) por Location</h3>
      <table border="1" cellPadding="5">
        <thead>
          <tr>
            <th>Location</th>
            <th>Usage (TotalUsed / Restocked / Min / Max)</th>
          </tr>
        </thead>
        <tbody>
          {locations.map(loc => {
            const agg = buildLocationAnalytics(loc);
            const keys = Object.keys(agg);

            // Orden universal de productos aquí también
            const ordered = keys.sort((a, b) => {
              const ia = orderIndex(a), ib = orderIndex(b);
              if (ia !== ib) return ia - ib;
              return String(a).localeCompare(String(b));
            });

            return (
              <tr key={`a-${loc._id}`}>
                <td>{loc.name}</td>
                <td>
                  {ordered.length === 0
                    ? <em>No data</em>
                    : ordered.map(k => {
                        const p = agg[k];
                        return (
                          <div key={k}>
                            <strong>{k}</strong>{' — '}
                            Used: {p.totalUsed || 0}, Restocked: {p.totalRestocked || 0},
                            Min: {Number.isFinite(p.minQuantity) ? p.minQuantity : '—'},
                            Max: {Number.isFinite(p.maxQuantity) ? p.maxQuantity : '—'}
                          </div>
                        );
                      })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

    </div>
  );
}

export default DashboardPage;
