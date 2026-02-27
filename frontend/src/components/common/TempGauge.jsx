export default function TempGauge({ label, actual, target }) {
  const a = actual != null ? Math.round(actual) : '–';
  const t = target != null ? Math.round(target) : 0;
  const isHeating = target > 30 && actual < target - 2;

  return (
    <div className="temp-gauge">
      <span className="temp-label">{label}</span>
      <span className={`temp-value ${isHeating ? 'heating' : ''}`}>
        {a}°<span className="temp-target">/{t}°</span>
      </span>
    </div>
  );
}
