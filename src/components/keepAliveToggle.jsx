import React, { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import API from '../apiService';
import KeepAliveModal from './KeepAliveModal';

function formatRemaining(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '00:00';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hh > 0 ? `${pad(hh)}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
}

export default function KeepAliveToggle() {
  const role = (useSelector(s => s.auth?.role) || localStorage.getItem('role') || '')
    .toLowerCase().replace(/[\s_-]+/g,'');
  const isAdmin = role === 'admin' || role === 'superuser';

  const [enabled, setEnabled] = useState(false);
  const [untilIso, setUntilIso] = useState(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [open, setOpen] = useState(false);
  const tickRef = useRef(null);

  async function fetchStatus() {
    try {
      const r = await API.get('/keepalive/public-status');
      const on = !!r.data?.enabled;
      setEnabled(on);
      setUntilIso(on ? (r.data?.until || null) : null);
    } catch (_) { /* noop */ }
  }

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      if (!untilIso) return setRemainingMs(0);
      const ms = new Date(untilIso).getTime() - Date.now();
      setRemainingMs(ms > 0 ? ms : 0);
    }, 1000);
    return () => clearInterval(tickRef.current);
  }, [untilIso]);

  if (!isAdmin) return null;

  return (
    <>
      <button
        className={`robot-chip ${enabled ? 'robot-chip--on' : 'robot-chip--off'}`}
        onClick={() => setOpen(true)}
        title={enabled ? 'Robot ON' : 'Robot OFF'}
      >
        <span className={`robot-dot ${enabled ? 'on' : 'off'}`} aria-hidden />
        {enabled ? 'Robot ON' : 'Robot OFF'}
        {enabled && <span className="robot-eta">· {formatRemaining(remainingMs)}</span>}
      </button>

      <KeepAliveModal
        open={open}
        onClose={() => { setOpen(false); fetchStatus(); }}
      />
    </>
  );
}
