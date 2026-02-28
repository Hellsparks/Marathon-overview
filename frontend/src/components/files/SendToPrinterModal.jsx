import { useState, useEffect } from 'react';
import { usePrinters } from '../../hooks/usePrinters';
import { useStatus } from '../../hooks/useStatus';
import { sendFile } from '../../api/files';
import { checkCompatibility } from '../../api/presets';
import { getSpools, setActiveSpool } from '../../api/spoolman';

export default function SendToPrinterModal({ file, onClose }) {
  const { printers } = usePrinters();
  const { status: statuses } = useStatus();
  const [printerId, setPrinterId] = useState('');
  const [action, setAction] = useState('upload');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [compat, setCompat] = useState(null);
  const [checkingCompat, setCheckingCompat] = useState(false);

  const [spools, setSpools] = useState([]);
  const [spoolsLoaded, setSpoolsLoaded] = useState(false);
  const [spoolAction, setSpoolAction] = useState('ignore'); // 'ignore', 'clear', 'active', or spool.id

  // Run compatibility check when printer is selected
  useEffect(() => {
    if (!printerId) { setCompat(null); return; }
    let cancelled = false;
    setCheckingCompat(true);
    checkCompatibility(file.id, printerId)
      .then(result => { if (!cancelled) setCompat(result); })
      .catch(() => { if (!cancelled) setCompat(null); })
      .finally(() => { if (!cancelled) setCheckingCompat(false); });

    // Fetch spools when a printer is first selected (if not already fetched)
    if (!spoolsLoaded) {
      getSpools()
        .then(data => { if (!cancelled) { setSpools(data || []); setSpoolsLoaded(true); } })
        .catch(() => { });
    }

    // Reset spool action when changing printer
    setSpoolAction('ignore');

    return () => { cancelled = true; };
  }, [printerId, file.id, spoolsLoaded]);

  async function handleSend() {
    if (!printerId) return;
    setBusy(true);
    setError(null);
    try {
      // Pre-print spool Hook
      if (spoolAction === 'clear') {
        await setActiveSpool(printerId, null);
      } else if (typeof spoolAction === 'number') {
        await setActiveSpool(printerId, spoolAction);
      }

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

  const status = statuses[printerId];
  const activeSpool = status?._active_spool;

  // Filter spools to only show ones matching the file's material
  const targetMaterial = (file.filament_type || '').toUpperCase();
  const compatibleSpools = spools.filter(s =>
    s.filament?.material?.toUpperCase() === targetMaterial && s.remaining_weight > 0
  ).sort((a, b) => b.remaining_weight - a.remaining_weight); // sort with most remaining first

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className={`dialog ${printerId ? 'dialog-expanded' : ''}`} onClick={e => e.stopPropagation()}>
        <div className={printerId ? 'dialog-split-pane' : ''}>

          <div className="dialog-left">
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

          {printerId && (
            <div className="dialog-right">
              <div className="dialog-right-title">Spool Selection</div>
              <p className="text-muted" style={{ fontSize: '13px', marginBottom: '16px' }}>
                Choose which filament spool to use for this print, or ignore Spoolman tracking.
              </p>

              <div className="mini-spools-list">
                <button
                  className={`spool-action-btn ${spoolAction === 'ignore' ? 'selected' : ''}`}
                  onClick={() => setSpoolAction('ignore')}
                >
                  <span>➖</span> Ignore Spool Tracking
                </button>
                <button
                  className={`spool-action-btn ${spoolAction === 'clear' ? 'selected' : ''}`}
                  onClick={() => setSpoolAction('clear')}
                >
                  <span>🧹</span> Clear Active Spool
                </button>
                <button
                  className={`spool-action-btn ${spoolAction === 'active' ? 'selected' : ''}`}
                  onClick={() => setSpoolAction('active')}
                  disabled={!activeSpool}
                >
                  <span>♻️</span> Use Currently Active Spool {activeSpool ? `(${activeSpool.filament_name})` : '(None active)'}
                </button>

                {targetMaterial && compatibleSpools.length > 0 && (
                  <div style={{ marginTop: '12px', marginBottom: '8px', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>
                    COMPATIBLE INVENTORY ({targetMaterial})
                  </div>
                )}

                {compatibleSpools.map(spool => (
                  <div
                    key={spool.id}
                    className={`mini-spool-card ${spoolAction === spool.id ? 'selected' : ''} ${activeSpool?.id === spool.id && spoolAction !== spool.id ? 'active-spool-marker' : ''}`}
                    onClick={() => setSpoolAction(spool.id)}
                  >
                    <div className="spool-color-dot" style={{ backgroundColor: `#${spool.filament?.color_hex || '888'}` }}></div>
                    <div className="mini-spool-info">
                      <div className="mini-spool-name">{spool.filament?.name || 'Unnamed Filament'}</div>
                      <div className="mini-spool-vendor">{spool.filament?.vendor?.name || 'Unknown Vendor'}</div>
                    </div>
                    <div className="mini-spool-weight">
                      {spool.remaining_weight ? `${Math.round(spool.remaining_weight)}g` : '?'}
                    </div>
                  </div>
                ))}

                {targetMaterial && compatibleSpools.length === 0 && (
                  <p className="text-muted" style={{ fontSize: '12px', textAlign: 'center', marginTop: '16px' }}>
                    No spools matching '{targetMaterial}' found in Spoolman with weight remaining.
                  </p>
                )}
              </div>
            </div>
          )}

        </div> {/* end of split-pane wrapper */}

      </div>
    </div>
  );
}
