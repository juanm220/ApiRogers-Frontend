import React, { useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'theme';        // 'light' | 'dark'
const MANUAL_KEY  = 'theme_manual'; // '1' (si el usuario tocó el toggle)

function getSystemTheme() {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', 'dark');
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState('light');
  const mqlRef = useRef(null);
  const manualRef = useRef(false);

  // init
  useEffect(() => {
    const saved  = localStorage.getItem(STORAGE_KEY);
    const manual = localStorage.getItem(MANUAL_KEY) === '1';
    manualRef.current = manual;

    const initial = (saved === 'light' || saved === 'dark') ? saved : getSystemTheme();
    setTheme(initial);
    applyTheme(initial);

    // solo escucha cambios del sistema si NO hay preferencia manual
    if (!manual && typeof window !== 'undefined') {
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      mqlRef.current = mql;

      const handler = (e) => {
        if (manualRef.current) return; // si el user ya tocó, ignorar
        const sysTheme = e.matches ? 'dark' : 'light';
        setTheme(sysTheme);
        applyTheme(sysTheme);
        // no persistimos STORAGE_KEY si seguimos en modo "system"
      };

      // addEventListener es el moderno; fallback a addListener
      if (mql.addEventListener) mql.addEventListener('change', handler);
      else mql.addListener(handler);

      return () => {
        if (!mqlRef.current) return;
        if (mqlRef.current.removeEventListener) mqlRef.current.removeEventListener('change', handler);
        else mqlRef.current.removeListener(handler);
      };
    }
  }, []);

  // persistimos cuando el state cambie (solo si manual)
  useEffect(() => {
    if (manualRef.current) {
      applyTheme(theme);
      localStorage.setItem(STORAGE_KEY, theme);
    }
  }, [theme]);

  const isDark = theme === 'dark';
  const label  = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  const onToggle = () => {
    // a partir de aquí, el usuario manda
    manualRef.current = true;
    localStorage.setItem(MANUAL_KEY, '1');

    const next = isDark ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
  };

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-pressed={isDark ? 'true' : 'false'}
      title={label}
      onClick={onToggle}
    >
      <span className="icon" aria-hidden="true">{isDark ? '🌙' : '☀️'}</span>
      {isDark ? 'Dark' : 'Light'}
    </button>
  );
}
