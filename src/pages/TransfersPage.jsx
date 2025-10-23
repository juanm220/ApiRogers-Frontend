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

  // Derivados
  const totalUnits = useMemo(() => {
    return stdOrder.reduce((acc, name) => {
      const q = parseInt(draft[name] || '0', 10);
      return acc + (isNaN(q) ? 0 : q);
    }, 0);
  }, [stdOrder, draft]);

  const disabled = busy || !fromLoc || !toLoc || fromLoc === toLoc || totalUnits <= 0;

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
        setStdOrder(Array.isArray(list) ? list : []);
      } catch (e) {
        console.error('Transfers init load error', e);
      }
    })();
    return () => ac.abort();
  }, []);

  function setQty(name, val) {
    // Acepta vacío, clamp >= 0
    const v = String(val ?? '').replace(/[^\d]/g, '');
    setDraft((prev) => ({ ...prev, [name]: v }));
  }

  function clearAll() {
    setDraft({});
  }

  function swapLocs() {
    setFromLoc((prev) => {
      const f = prev;
      setToLoc(f);
      return toLoc;
    });
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
      const msg = e?.response?.data?.message || 'No se pudo registrar la transferencia.';
      setToast({ type: 'error', text: msg });
    } finally {
      setBusy(false);
    }
  }

  const fromName = useMemo(
    () => locations.find((l) => String(l._id) === String(fromLoc))?.name || '',
    [locations, fromLoc]
  );
  const toName = useMemo(
    () => locations.find((l) => String(l._id) === String(toLoc))?.name || '',
    [locations, toLoc]
  );

  return (
    <div className="main-container">
      <NavBar />
      <h2 style={{ marginTop: 0 }}>Transferencias</h2>

      <form onSubmit={handleSubmit} className="card" style={{ display: 'grid', gap: 12 }}>
        <div className="grid-3" style={{ alignItems: 'end', gap: 8 }}>
          <div>
            <label>Desde (Locación)</label>
            <select value={fromLoc} onChange={(e) => setFromLoc(e.target.value)}>
              <option value="">— Selecciona —</option>
              {locations.map((l) => (
                <option key={l._id} value={l._id}>{l.name}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid' }}>
            <button
              type="button"
              onClick={swapLocs}
              className="btn btn--secondary"
              title="Intercambiar"
              style={{ marginTop: 22 }}
              disabled={busy}
            >
              ⇄ Intercambiar
            </button>
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

        {(fromName || toName) && (
          <div className="pill-row" style={{ gap: 8 }}>
            {fromName && <span className="pill">Desde: <b>{fromName}</b></span>}
            {toName && <span className="pill">Hacia: <b>{toName}</b></span>}
            <span className="pill">Total unidades: <b>{totalUnits}</b></span>
          </div>
        )}

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
                      type="text"
                      inputMode="numeric"
                      pattern="\d*"
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

        <div className="flex-row" style={{ gap: 8 }}>
          <button type="submit" disabled={disabled}>
            {busy ? 'Registrando…' : 'Registrar transferencia'}
          </button>
          <button type="button" className="btn btn--secondary" onClick={clearAll} disabled={busy}>
            Clean
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
