export default function ProgressBar({ value, filename }) {
  const pct = Math.round((value || 0) * 100);
  return (
    <div className="progress-bar-wrap">
      {filename && <div className="progress-filename" title={filename}>{filename}</div>}
      <div className="progress-bar-track">
        <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-pct">{pct}%</div>
    </div>
  );
}
