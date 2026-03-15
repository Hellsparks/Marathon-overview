import { useState, useRef, useEffect } from 'react';
import Sparkline from 'sparklines';

export default function TempControl({ label, actual, target, onSet, history = [] }) {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);
  const sparklineRef = useRef(null);

  const a = actual != null ? Math.round(actual) : '–';
  const t = target != null ? Math.round(target) : 0;
  const isHeating = target > 30 && actual < target - 2;

  // Render sparkline when history changes
  useEffect(() => {
    if (sparklineRef.current && history.length > 1) {
      try {
        // Clear previous content
        sparklineRef.current.innerHTML = '';
        
        // Read colors from CSS variables
        const computedStyle = getComputedStyle(sparklineRef.current);
        const primaryColor = computedStyle.getPropertyValue('--primary').trim() || '#4f8ef7';
        const warningColor = computedStyle.getPropertyValue('--warning').trim() || '#f0a838';
        
        const spark = new Sparkline(sparklineRef.current);
        spark.draw(history, {
          stroke: isHeating ? warningColor : primaryColor,
          strokeWidth: 1,
        });
      } catch (err) {
        console.error('Sparkline error:', err);
      }
    }
  }, [history, isHeating, label]);

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
        {history.length > 1 && (
          <div ref={sparklineRef} className="temp-sparkline" title="Temperature history" />
        )}
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
