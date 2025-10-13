import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import '../styles.css';

/**
 * NumberInput sin `pattern` HTML (evita SyntaxError de regex en navegadores).
 * Filtra y valida SOLO con JS:
 *  - Acepta dígitos, espacios y operadores + - * / (incluye x, ×, ÷ -> se normalizan)
 *  - No sobreescribe el draft mientras hay foco
 *  - Enter / blur: commit de la expresión
 */
const NumberInput = forwardRef(function NumberInput(
  { value, onChange, onEnter, min = 0, max = 999999, ...rest },
  ref
) {
  const inputRef = useRef(null);
  const [draft, setDraft] = useState(value ?? '');

  // Heurística simple de móvil
  const isMobile =
    typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const defaultInputMode = isMobile ? 'text' : 'decimal';

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    blur: () => inputRef.current?.blur(),
    node: inputRef.current,
  }));

  // No sobrescribir mientras el input tiene foco
  useEffect(() => {
    const el = inputRef.current;
    const hasFocus = el && document.activeElement === el;
    if (!hasFocus) setDraft(value ?? '');
  }, [value]);

  // Eval con prioridad y normalización de x, ×, ÷
  const evalExpr = (str) => {
    const normalized = String(str || '')
      .replace(/\s+/g, '')
      .replace(/[xX×]/g, '*')
      .replace(/÷/g, '/');

    if (normalized === '') return '';

    // Solo dígitos y operadores +-*/
    if (!/^[\d+*/-]+$/.test(normalized)) return null;

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
        const res = t === '*' ? a * next : next === 0 ? NaN : Math.trunc(a / next);
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

  // Filtro de tecleo/pegado por JS (sin depender de pattern HTML)
  const allowedChar = (ch) => /^[0-9xX+*/÷\s-]$/.test(ch);

  const handleInputChange = (e) => {
    const text = e.target.value;
    // Permitimos batch de texto si todos los chars son válidos
    for (let i = 0; i < text.length; i++) {
      if (!allowedChar(text[i])) return;
    }
    setDraft(text);
  };

  const handlePaste = (e) => {
    const text = (e.clipboardData || window.clipboardData)?.getData('text') || '';
    const cleaned = text.replace(/[^0-9xX+*/÷\s-]/g, '');
    e.preventDefault();
    setDraft((prev) => (prev || '') + cleaned);
  };

  const handleBeforeInput = (e) => {
    if (e.data == null) return;
    if (!allowedChar(e.data)) e.preventDefault();
  };

  const commit = () => {
    const res = evalExpr(draft);
    if (res == null) {
      // Expresión inválida -> vuelve al value actual
      setDraft(value ?? '');
      return;
    }
    setDraft(res);
    onChange?.(res); // '' o número como string
  };

  const increment = () => {
    const base = evalExpr(draft === '' ? '0' : draft);
    const n = Math.min(max, parseInt(base || '0', 10) + 1);
    const s = String(n);
    setDraft(s);
    onChange?.(s);
  };

  const decrement = () => {
    const base = evalExpr(draft === '' ? '0' : draft);
    const n = Math.max(min, parseInt(base || '0', 10) - 1);
    const s = String(n);
    setDraft(s);
    onChange?.(s);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
      onEnter?.();
    }
  };

  const handleBlur = () => commit();

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
        inputMode={rest.inputMode ?? defaultInputMode}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        aria-label="Cantidad"
        {...rest} // ← seguimos permitiendo props extra (pero ya sin pattern)
      />
      <button type="button" className="plus-btn" onClick={increment}>+</button>
    </div>
  );
});

export default NumberInput;
