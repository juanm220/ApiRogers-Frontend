// src/components/NumberInput.jsx
import React from 'react';
import '../styles.css';

function NumberInput({ value, onChange, onEnter }) {
  // We'll treat 'value' as a string. 
  // If it's undefined or null, let's default to '' (empty).
  const displayValue = value ?? '';

  // Check for digits only (or you can allow decimals, etc.)
  const handleInputChange = (e) => {
    const text = e.target.value;
    if (/^\d*$/.test(text)) {
      onChange(text); // call parent's onChange with the raw string
    }
  };

  const increment = () => {
    const num = parseInt(displayValue || '0', 10);
    onChange(String(num + 1));
  };

  const decrement = () => {
    const num = parseInt(displayValue || '0', 10);
    if (num > 0) {
      onChange(String(num - 1));
    } else {
      onChange('0');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && onEnter) {
      onEnter(); // call a callback if you want to jump to next input
    }
  };

  return (
    <div className="custom-number-input">
      <button type="button" className="minus-btn" onClick={decrement}>-</button>
      <input
        type="text"
        className="custom-input-field"
        value={displayValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
      />
      <button type="button" className="plus-btn" onClick={increment}>+</button>
    </div>
  );
}

export default NumberInput;
