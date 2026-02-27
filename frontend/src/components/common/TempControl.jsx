import { useState } from 'react';

export default function TempControl({ label, actual, target, onSet }) {
  const [input, setInput] = useState('');

  const a = actual != null ? Math.round(actual) : '–';
  const t = target != null ? Math.round(target) : 0;
  const isHeating = target > 30 && actual < target - 2;

  function handleSet() {
    const temp = parseInt(input, 10);
    if (!isNaN(temp) && temp >= 0) {
      onSet(temp);
      setInput('');
    }
  }

  return (
    <div className="temp-control">
      <div className="temp-control-display">
        <span className="temp-label">{label}</span>
        <span className={`temp-value ${isHeating ? 'heating' : ''}`}>
          {a}°<span className="temp-target">/{t}°</span>
        </span>
      </div>
      <div className="temp-control-set">
        <input
          className="temp-input"
          type="number"
          min="0"
          max="350"
          placeholder="°C"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSet()}
        />
        <button className="btn btn-sm" onClick={handleSet} disabled={!input}>Set</button>
        {t > 0 && (
          <button className="btn btn-sm" onClick={() => onSet(0)} title="Turn off">Off</button>
        )}
      </div>
    </div>
  );
}
