import { useState } from 'react';
import { usePrinters } from '../../hooks/usePrinters';
import { sendFile } from '../../api/files';

export default function SendToPrinterModal({ file, onClose }) {
  const { printers } = usePrinters();
  const [printerId, setPrinterId] = useState('');
  const [action, setAction] = useState('upload'); // 'upload' | 'queue' | 'start'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleSend() {
    if (!printerId) return;
    setBusy(true);
    setError(null);
    try {
      await sendFile(file.id, printerId, {
        autoStart:  action === 'start',
        addToQueue: action === 'queue',
      });
      onClose?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <h2>Send to Printer</h2>
        <p className="dialog-filename">{file.display_name}</p>

        <label className="form-label">
          Printer
          <select
            className="form-select"
            value={printerId}
            onChange={e => setPrinterId(e.target.value)}
          >
            <option value="">Select printer…</option>
            {printers.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>

        <fieldset className="form-fieldset">
          <legend>After upload</legend>
          {[
            { value: 'upload', label: 'Upload only' },
            { value: 'queue',  label: 'Add to print queue' },
            { value: 'start',  label: 'Start printing immediately' },
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
          <button className="btn btn-primary" onClick={handleSend} disabled={!printerId || busy}>
            {busy ? 'Sending…' : 'Send'}
          </button>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
