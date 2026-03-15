import { useState, useRef } from 'react';

export default function TempControl({ label, actual, target, onSet }) {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);

  const a = actual != null ? Math.round(actual) : '–';
  const t = target != null ? Math.round(target) : 0;
  const isHeating = target > 30 && actual < target - 2;

  function handleFocus() {
    setValue(String(t));
    setFocused(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function handleBlur() {
    setFocused(false);
    setValue('');
  }

  function handleSet() {
    const temp = parseInt(value, 10);
    if (!isNaN(temp) && temp >= 0) onSet(temp);
    inputRef.current?.blur();
  }

  function handleKey(e) {
    if (e.key === 'Enter') handleSet();
    if (e.key === 'Escape') inputRef.current?.blur();
  }

  return (
    <div className="temp-control">
      <span className="temp-label">{label}</span>
      <div className="temp-control-row">
        <span className={`temp-value${isHeating ? ' heating' : ''}`}>
          {a}°<span className="temp-target-sep">/</span>
          <input
            ref={inputRef}
            className={`temp-target-input${focused ? ' focused' : ''}`}
            type="number"
            min="0"
            max="500"
            value={focused ? value : t}
            title="Click to set target"
            readOnly={!focused}
            onChange={e => setValue(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKey}
          />
          °
        </span>
        {t > 0 && (
          <button
            className="btn btn-sm v-btn temp-off-btn"
            onMouseDown={e => { e.preventDefault(); onSet(0); }}
            title="Turn off"
          >
            Off
          </button>
        )}
      </div>
    </div>
  );
}
