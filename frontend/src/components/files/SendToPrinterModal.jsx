import { useState, useEffect } from 'react';
import { usePrinters } from '../../hooks/usePrinters';
import { sendFile } from '../../api/files';
import { checkCompatibility } from '../../api/presets';

export default function SendToPrinterModal({ file, onClose }) {
  const { printers } = usePrinters();
  const [printerId, setPrinterId] = useState('');
  const [action, setAction] = useState('upload');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [compat, setCompat] = useState(null);
  const [checkingCompat, setCheckingCompat] = useState(false);

  // Run compatibility check when printer is selected
  useEffect(() => {
    if (!printerId) { setCompat(null); return; }
    let cancelled = false;
    setCheckingCompat(true);
    checkCompatibility(file.id, printerId)
      .then(result => { if (!cancelled) setCompat(result); })
      .catch(() => { if (!cancelled) setCompat(null); })
      .finally(() => { if (!cancelled) setCheckingCompat(false); });
    return () => { cancelled = true; };
  }, [printerId, file.id]);

  async function handleSend() {
    if (!printerId) return;
    setBusy(true);
    setError(null);
    try {
      await sendFile(file.id, printerId, {
        autoStart: action === 'start',
        addToQueue: action === 'queue',
      });
      onClose?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const hasErrors = compat?.warnings?.some(w => w.severity === 'error');
  const hasWarnings = compat?.warnings?.some(w => w.severity === 'warning');

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <h2>Send to Printer</h2>
        <p className="dialog-filename">{file.display_name}</p>

        {/* File metadata summary */}
        {(file.filament_type || file.max_z != null) && (
          <div className="compat-file-info">
            {file.filament_type && <span className={`badge badge-filament filament-${file.filament_type}`}>{file.filament_type}</span>}
            {file.max_z != null && (
              <span className="text-muted" style={{ fontSize: '0.85em' }}>
                Height: {(file.max_z - (file.min_z || 0)).toFixed(1)}mm
              </span>
            )}
          </div>
        )}

        <label className="form-label">
          Printer
          <select
            className="form-select"
            value={printerId}
            onChange={e => setPrinterId(e.target.value)}
          >
            <option value="">Select printer…</option>
            {printers.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.bed_width ? ` (${p.bed_width}×${p.bed_depth}mm)` : ''}
              </option>
            ))}
          </select>
        </label>

        {/* Compatibility check results */}
        {checkingCompat && <p className="compat-checking">Checking compatibility…</p>}
        {compat && compat.warnings.length > 0 && (
          <div className="compat-warnings">
            {compat.warnings.map((w, i) => (
              <div key={i} className={`compat-warning compat-${w.severity}`}>
                <span className="compat-icon">
                  {w.severity === 'error' ? '🚫' : w.severity === 'warning' ? '⚠️' : 'ℹ️'}
                </span>
                {w.message}
              </div>
            ))}
          </div>
        )}
        {compat && compat.warnings.length === 0 && (
          <div className="compat-warning compat-ok">
            <span className="compat-icon">✅</span>
            File is compatible with this printer
          </div>
        )}

        <fieldset className="form-fieldset">
          <legend>After upload</legend>
          {[
            { value: 'upload', label: 'Upload only' },
            { value: 'queue', label: 'Add to print queue' },
            { value: 'start', label: 'Start printing immediately' },
          ].map(opt => (
            <label key={opt.value} className="radio-label">
              <input
                type="radio"
                name="action"
                value={opt.value}
                checked={action === opt.value}
                onChange={() => setAction(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </fieldset>

        {error && <p className="form-error">{error}</p>}

        <div className="dialog-actions">
          <button
            className={`btn ${hasErrors ? 'btn-danger' : 'btn-primary'}`}
            onClick={handleSend}
            disabled={!printerId || busy}
          >
            {busy ? 'Sending…' : hasErrors ? 'Send Anyway (Size Mismatch)' : 'Send'}
          </button>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
