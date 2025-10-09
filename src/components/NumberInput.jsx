import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import '../styles.css';

/**
 * Soporta:
 * - Entrada numérica directa ("14")
 * - Expresiones con + - * /  (x, ×, ÷ también) ej: "12+2-3*2"
 * - Enter / blur => evalúa y fija el valor (string)
 * - Botones +/- siguen funcionando
 * - min/max: clamp del resultado
 */
const NumberInput = forwardRef(function NumberInput(
  {
    value,
    onChange,
    onEnter,
    min = 0,
    max = 999999,
    ...rest
  },
  ref
) {
  const inputRef = useRef(null);
  const [draft, setDraft] = useState(value ?? '');

  // Heurística simple de móvil (solo para inputMode por defecto)
  const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const defaultInputMode = isMobile ? 'text' : 'decimal';

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    blur: () => inputRef.current?.blur(),
    node: inputRef.current,
  }));

  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  // Eval con prioridad (* / antes que + -), admite x, ×, ÷
  const evalExpr = (str) => {
    const normalized = String(str || '')
      .replace(/\s+/g, '')
      .replace(/[xX×]/g, '*')
      .replace(/÷/g, '/');

    if (normalized === '') return '';

    if (!/^[\d+\-*/]+$/.test(normalized)) return null;

    const tokens = normalized.match(/(\d+|[+\-*/])/g);
    if (!tokens) return null;

    // Manejo de +/− unarios
    const fixed = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if ((t === '+' || t === '-') && (i === 0 || /[+\-*/]/.test(tokens[i - 1]))) {
        fixed.push('0', t);
      } else {
        fixed.push(t);
      }
    }

    // * y /
    const stack = [];
    let i = 0;
    while (i < fixed.length) {
      const t = fixed[i];
      if (t === '*' || t === '/') {
        const prev = stack.pop();
        const next = parseInt(fixed[i + 1], 10);
        if (prev == null || Number.isNaN(next)) return null;
        const a = parseInt(prev, 10);
        const res = t === '*'
          ? (a * next)
          : (next === 0 ? NaN : Math.trunc(a / next));
        if (!Number.isFinite(res)) return null;
        stack.push(String(res));
        i += 2;
      } else {
        stack.push(t);
        i += 1;
      }
    }

    // + y -
    let sum = parseInt(stack[0], 10);
    if (Number.isNaN(sum)) return null;
    for (let j = 1; j < stack.length; j += 2) {
      const op = stack[j];
      const num = parseInt(stack[j + 1], 10);
      if (Number.isNaN(num)) return null;
      sum = op === '+' ? sum + num : sum - num;
    }

    const clamped = Math.max(min, Math.min(max, sum));
    return String(clamped);
  };

  // Tecleo: dígitos + operadores + espacios
  const handleInputChange = (e) => {
    const text = e.target.value;
    if (/^[\d+\-*/xX÷\s]*$/.test(text)) {
      setDraft(text);
    }
  };

  const handlePaste = (e) => {
    const text = (e.clipboardData || window.clipboardData)?.getData('text') || '';
    const cleaned = text.replace(/[^\d+\-*/xX÷\s]/g, '');
    e.preventDefault();
    setDraft((prev) => (prev || '') + cleaned);
  };

  const handleBeforeInput = (e) => {
    if (e.data == null) return;
    if (!/^[\d+\-*/xX÷\s]$/.test(e.data)) e.preventDefault();
  };

  const commit = () => {
    const res = evalExpr(draft);
    if (res == null) {
      setDraft(value ?? '');
      return;
    }
    setDraft(res);
    onChange(res);
  };

  const increment = () => {
    const base = evalExpr(draft === '' ? '0' : draft);
    const n = Math.min(max, parseInt(base || '0', 10) + 1);
    const s = String(n);
    setDraft(s);
    onChange(s);
  };

  const decrement = () => {
    const base = evalExpr(draft === '' ? '0' : draft);
    const n = Math.max(min, parseInt(base || '0', 10) - 1);
    const s = String(n);
    setDraft(s);
    onChange(s);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
      if (onEnter) onEnter();
    }
  };

  const handleBlur = () => { commit(); };

  return (
    <div className="custom-number-input">
      <button type="button" className="minus-btn" onClick={decrement}>-</button>
      <input
        ref={inputRef}
        type="text"
        className="custom-input-field"
        value={draft}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onBeforeInput={handleBeforeInput}
        onPaste={handlePaste}

        /* 👇 Por defecto: 'text' en móvil para que aparezca '+'; 'decimal' en desktop.
              Si el padre pasa inputMode, tiene prioridad. */
        inputMode={rest.inputMode ?? defaultInputMode}

        /* Alineado con lo que soporta el parser (+ - * / x ÷ y espacios) */
        pattern={rest.pattern ?? '[0-9+\\-*/xX÷\\s]*'}

        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        aria-label="Cantidad"
        {...rest}
      />
      <button type="button" className="plus-btn" onClick={increment}>+</button>
    </div>
  );
});

export default NumberInput;
