import React, { useEffect, useMemo, useState } from 'react';
import API from '../apiService';
import NavBar from '../components/NavBar';
import Footer from '../components/Footer';
import '../styles.css';

const toKey = (s) => String(s || '').trim().toLowerCase();

export default function TransfersPage() {
  const [locations, setLocations] = useState([]);
  const [stdOrder, setStdOrder] = useState([]);
  const [fromLoc, setFromLoc] = useState('');
  const [toLoc, setToLoc] = useState('');
  const [draft, setDraft] = useState({}); // { productName: "12" }
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const [locRes, stdRes] = await Promise.all([
          API.get('/locations', { signal: ac.signal, timeout: 15000 }),
          API.get('/config/standard-products', { signal: ac.signal, timeout: 10000 }),
        ]);
        setLocations(Array.isArray(locRes.data) ? locRes.data : []);
        const list = stdRes.data?.items ?? [];
        setStdOrder(list);
      } catch (e) {
        console.error('Transfers init load error', e);
      }
    })();
    return () => ac.abort();
  }, []);

  const disabled = busy || !fromLoc || !toLoc || fromLoc === toLoc;

  function setQty(name, val) {
    setDraft((prev) => ({ ...prev, [name]: val }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (disabled) return;

    // construir payload con solo >0
    const items = stdOrder
      .map((name) => {
        const q = parseInt(draft[name] || '0', 10);
        return { productName: name, quantity: isNaN(q) ? 0 : q };
      })
      .filter((x) => x.quantity > 0);

    if (!items.length) {
      setToast({ type: 'error', text: 'Añade cantidades (>0) para transferir.' });
      return;
    }

    setBusy(true);
    try {
      // endpoint de backend: POST /locations/:fromLocationId/transfer
      const res = await API.post(
        `/locations/${fromLoc}/transfer`,
        {
          toLocationId: toLoc,
          items,
          reason: 'manual-transfer-ui',
        },
        { timeout: 20000 }
      );

      setToast({ type: 'ok', text: res.data?.message || 'Transferencia registrada.' });
      setDraft({});
    } catch (e) {
      console.error(e);
      setToast({ type: 'error', text: 'No se pudo registrar la transferencia.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="main-container">
      <NavBar />
      <h2 style={{ marginTop: 0 }}>Transferencias</h2>

      <form onSubmit={handleSubmit} className="card" style={{ display: 'grid', gap: 12 }}>
        <div className="grid-2">
          <div>
            <label>Desde (Locación)</label>
            <select value={fromLoc} onChange={(e) => setFromLoc(e.target.value)}>
              <option value="">— Selecciona —</option>
              {locations.map((l) => (
                <option key={l._id} value={l._id}>{l.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Hacia (Locación)</label>
            <select value={toLoc} onChange={(e) => setToLoc(e.target.value)}>
              <option value="">— Selecciona —</option>
              {locations.map((l) => (
                <option key={l._id} value={l._id}>{l.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="table-wrap table-wrap--shadow">
          <table className="table-excel" style={{ minWidth: 560 }}>
            <thead>
              <tr>
                <th>Producto</th>
                <th className="num" style={{ width: 160 }}>Cantidad a transferir</th>
              </tr>
            </thead>
            <tbody>
              {stdOrder.map((name) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td className="num">
                    <input
                      type="number"
                      min="0"
                      value={draft[name] ?? ''}
                      onChange={(e) => setQty(name, e.target.value)}
                      placeholder="0"
                      style={{ width: 120 }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <button type="submit" disabled={disabled}>
            {busy ? 'Registrando…' : 'Registrar transferencia'}
          </button>
        </div>
      </form>

      {toast && (
        <div className={`toast ${toast.type === 'error' ? 'error' : 'ok'}`} role="status" aria-live="polite">
          {toast.text}
          <button onClick={() => setToast(null)} aria-label="Cerrar notificación" style={{ marginLeft: 10, background: 'transparent', border: 0, color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
            ×
          </button>
        </div>
      )}

      <Footer />
    </div>
  );
}
