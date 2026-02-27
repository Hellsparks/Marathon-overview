import { useState } from 'react';
import { createPrinter, updatePrinter } from '../../api/printers';

export default function PrinterForm({ printer, onSaved, onCancel }) {
  const [form, setForm] = useState({
    name:    printer?.name    ?? '',
    host:    printer?.host    ?? '',
    port:    printer?.port    ?? 7125,
    api_key: printer?.api_key ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = { ...form, api_key: form.api_key || null };
      if (printer) {
        await updatePrinter(printer.id, data);
      } else {
        await createPrinter(data);
      }
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <h2>{printer ? 'Edit Printer' : 'Add Printer'}</h2>
        <form onSubmit={handleSubmit}>
          <label className="form-label">
            Name
            <input
              className="form-input"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              required
              placeholder="e.g. Voron 2.4 #1"
            />
          </label>
          <label className="form-label">
            Host / IP Address
            <input
              className="form-input"
              value={form.host}
              onChange={e => set('host', e.target.value)}
              required
              placeholder="e.g. 192.168.1.101"
            />
          </label>
          <label className="form-label">
            Port
            <input
              className="form-input"
              type="number"
              value={form.port}
              onChange={e => set('port', Number(e.target.value))}
              required
              min={1}
              max={65535}
            />
          </label>
          <label className="form-label">
            API Key <span className="form-optional">(optional)</span>
            <input
              className="form-input"
              value={form.api_key}
              onChange={e => set('api_key', e.target.value)}
              placeholder="Leave empty if Moonraker API key is not set"
            />
          </label>

          {error && <p className="form-error">{error}</p>}

          <div className="dialog-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
