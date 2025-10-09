// src/components/NumberInput.jsx
import React, { forwardRef, useRef, useImperativeHandle } from 'react';
import '../styles.css';

const NumberInput = forwardRef(function NumberInput(
  { value, onChange, onEnter }, // mantenemos tu API
  ref
) {
  // value como string
  const displayValue = value ?? '';
  const inputRef = useRef(null);

  // Exponer el focus al padre
  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    blur: () => inputRef.current?.blur(),
    node: inputRef.current,
  }));

  const handleInputChange = (e) => {
    const text = e.target.value;
    if (/^\d*$/.test(text)) {
      onChange(text);
    }
  };

  const increment = () => {
    const num = parseInt(displayValue || '0', 10);
    onChange(String(num + 1));
  };

  const decrement = () => {
    const num = parseInt(displayValue || '0', 10);
    onChange(num > 0 ? String(num - 1) : '0');
  };

  // Bloquea letras en tipeo (incl. teclados “creativos”)
  const handleBeforeInput = (e) => {
    if (e.data == null) return; // teclas especiales/composición
    if (!/^\d$/.test(e.data)) e.preventDefault();
  };

  // Limpia el portapapeles a dígitos
  const handlePaste = (e) => {
    const text = (e.clipboardData || window.clipboardData)?.getData('text') || '';
    const cleaned = text.replace(/\D+/g, '');
    e.preventDefault();
    onChange(cleaned);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && onEnter) onEnter();
  };

  return (
    <div className="custom-number-input">
      <button type="button" className="minus-btn" onClick={decrement}>-</button>
      <input
        ref={inputRef}
        type="text"
        className="custom-input-field"
        value={displayValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onBeforeInput={handleBeforeInput}
        onPaste={handlePaste}

        // 👇 Fuerza keypad numérico en iOS/Android
        inputMode="numeric"
        pattern="\d*"
        autoComplete="one-time-code"
        aria-label="Cantidad"
      />
      <button type="button" className="plus-btn" onClick={increment}>+</button>
    </div>
  );
});

export default NumberInput;
