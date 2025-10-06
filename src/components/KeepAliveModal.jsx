// src/components/KeepAliveModal.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import API from '../apiService';

const PRESETS = [3, 6, 9, 12];

function fmtCountdown(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '00:00';
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hh > 0 ? `${pad(hh)}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
}

function fmtAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return '—';
  const s = Math.floor(diff / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h >= 1) return `hace ${h}h ${m % 60}m`;
  if (m >= 1) return `hace ${m}m ${s % 60}s`;
  return `hace ${s}s`;
}

export default function KeepAliveModal({ open, onClose }) {
  const [enabled, setEnabled] = useState(false);
  const [untilIso, setUntilIso] = useState(null);
  const [lastPingIso, setLastPingIso] = useState(null);
  const [selectedHours, setSelectedHours] = useState(() => {
    const saved = Number(localStorage.getItem('keepalive_hours'));
    return PRESETS.includes(saved) ? saved : 12;
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const [remainingMs, setRemainingMs] = useState(0);
  const [ago, setAgo] = useState('—');
  const tickRef = useRef(null);
  const pollRef = useRef(null);

  const untilDate = useMemo(() => (untilIso ? new Date(untilIso) : null), [untilIso]);

  async function fetchStatus() {
    try {
      const r = await API.get('/keepalive/public-status');
      const on = !!r.data?.enabled;
      setEnabled(on);
      setUntilIso(on ? (r.data?.until || null) : null);
      setLastPingIso(r.data?.lastPingIso || null);
      setErr('');
    } catch (e) {
      console.error(e);
      setErr('No se pudo leer el estado del robot.');
    }
  }

  async function start(hours) {
    setLoading(true);
    setErr('');
    try {
      await API.post('/keepalive/toggle', { mode: 'on', hours });
      await fetchStatus();
    } catch (e) {
      console.error(e);
      setErr('No se pudo encender/reiniciar el robot.');
    } finally {
      setLoading(false);
    }
  }

  async function stop() {
    setLoading(true);
    setErr('');
    try {
      await API.post('/keepalive/toggle', { mode: 'off' });
      await fetchStatus();
    } catch (e) {
      console.error(e);
      setErr('No se pudo apagar el robot.');
    } finally {
      setLoading(false);
    }
  }

   async function pingOnce() {
    setLoading(true);
    setErr('');
    try {
      await API.post('/keepalive/toggle', { mode: 'once' });
      await fetchStatus();
    } catch (e) {
      console.error(e);
      setErr('No se pudo hacer ping manual.');
    } finally {
      setLoading(false);
    }
  }
  // abrir → cargar estado + empezar ticks
  useEffect(() => {
    if (!open) return;
    fetchStatus();

    // countdown + “hace …” cada 1s
    tickRef.current = setInterval(() => {
      setAgo(fmtAgo(lastPingIso));
      if (untilIso) {
        const ms = new Date(untilIso).getTime() - Date.now();
        setRemainingMs(ms > 0 ? ms : 0);
      } else {
        setRemainingMs(0);
      }
    }, 1000);

    // sondeo ligero del estado cada 2.5 min
    pollRef.current = setInterval(fetchStatus, 150000);

    return () => {
      clearInterval(tickRef.current);
      clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, untilIso, lastPingIso]);

  function choosePreset(h) {
    setSelectedHours(h);
    localStorage.setItem('keepalive_hours', String(h));
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card card">
        <div className="modal-head">
          <h3 className="m0">Robot de Keep-Alive</h3>
          <button className="btn btn--secondary" onClick={onClose}>Cerrar</button>
        </div>

        <div className="divider" />

        <div className="modal-body grid-2">
          <div className="card" style={{margin:0}}>
            <h4 className="m0">Estado</h4>
            <p style={{margin:'6px 0 0'}}>
              • Robot: <strong style={{color: enabled ? 'var(--ok)' : 'var(--danger)'}}>
                {enabled ? 'ON' : 'OFF'}
              </strong>
            </p>
            <p className="m0">
              • Restante: <strong>{fmtCountdown(remainingMs)}</strong>
              {untilDate && <> (hasta <em>{untilDate.toLocaleString()}</em>)</>}
            </p>
            <p className="m0">• Último ping: <strong>{ago}</strong></p>
          </div>

          <div className="card" style={{margin:0}}>
            <h4 className="m0">Duración</h4>
            <div className="chip-row" style={{marginTop:8}}>
              {PRESETS.map(h => (
                <button
                  key={h}
                  className={`chip-radio ${h === selectedHours ? 'active' : ''}`}
                  onClick={() => choosePreset(h)}
                >
                  {h} h
                </button>
              ))}
            </div>
            <p className="hint" style={{marginTop:8}}>
              Un workflow de GitHub Actions hace ping (con autorización) cada ~5 min cuando el robot está ON.
            </p>
          </div>

          <div className="card" style={{gridColumn:'1 / -1', margin:0}}>
            {err && <div className="alert alert--danger" style={{marginBottom:8}}>{err}</div>}

            <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
              {!enabled && (
                <button
                  className="btn"
                  onClick={() => start(selectedHours)}
                  disabled={loading}
                  title="Encender por la duración elegida"
                >
                  {loading ? '...': `Encender por ${selectedHours}h`}
                </button>
              )}

              {enabled && (
                <>
                  <button
                    className="btn"
                    onClick={() => start(selectedHours)}
                    disabled={loading}
                    title="Reinicia el contador usando la duración elegida"
                  >
                    {loading ? '...' : `Reiniciar (${selectedHours}h)`}
                  </button>
                  <button
                    className="btn btn--danger"
                    onClick={stop}
                    disabled={loading}
                  >
                    {loading ? '...' : 'Apagar ahora'}
                  </button>
                </>
              )}
              <button
                className="btn btn--ghost"
                onClick={pingOnce}
                disabled={loading}
                title="Hacer ping inmediato sin cambiar el estado del robot"
              >
                {loading ? '...' : 'Ping una vez'}
              </button>
              <button
                className="btn btn--ghost"
                onClick={fetchStatus}
                disabled={loading}
                title="Refrescar estado"
              >
                {loading ? '...' : 'Refrescar'}
              </button>
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <span className="hint">
            Tip: puedes cambiar la duración y pulsar <strong>{enabled ? 'Reiniciar' : 'Encender'}</strong>.
          </span>
        </div>
      </div>
    </div>
  );
}