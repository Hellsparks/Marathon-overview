import { useState, useEffect } from 'react';
import { createPrinter, updatePrinter } from '../../api/printers';
import { getPresets } from '../../api/presets';

const ALL_FILAMENT_TYPES = ['PLA', 'PETG', 'ABS', 'ASA', 'Nylon', 'PC', 'TPU', 'HIPS', 'PVA'];

export default function PrinterForm({ printer, onSaved, onCancel }) {
  const [presets, setPresets] = useState([]);
  const [form, setForm] = useState({
    name: printer?.name ?? '',
    host: printer?.host ?? '',
    port: printer?.port ?? 7125,
    api_key: printer?.api_key ?? '',
    bed_width: printer?.bed_width ?? '',
    bed_depth: printer?.bed_depth ?? '',
    bed_height: printer?.bed_height ?? '',
    filament_types: printer?.filament_types ?? [],
    toolhead_count: printer?.toolhead_count ?? 1,
    preset_id: printer?.preset_id ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('connection');

  useEffect(() => {
    getPresets().then(setPresets).catch(() => { });
  }, []);

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function toggleFilament(type) {
    setForm(f => {
      const current = Array.isArray(f.filament_types) ? f.filament_types : [];
      return {
        ...f,
        filament_types: current.includes(type) ? current.filter(t => t !== type) : [...current, type],
      };
    });
  }

  function applyPreset(presetId) {
    const preset = presets.find(p => p.id === presetId);
    if (!preset) {
      set('preset_id', '');
      return;
    }
    setForm(f => ({
      ...f,
      preset_id: presetId,
      bed_width: preset.bed_width,
      bed_depth: preset.bed_depth,
      bed_height: preset.bed_height,
      filament_types: preset.filament_types,
      toolhead_count: preset.toolhead_count,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = {
        ...form,
        api_key: form.api_key || null,
        bed_width: form.bed_width || null,
        bed_depth: form.bed_depth || null,
        bed_height: form.bed_height || null,
        filament_types: JSON.stringify(form.filament_types || []),
      };
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
      <div className="dialog dialog-wide" onClick={e => e.stopPropagation()}>
        <h2>{printer ? 'Edit Printer' : 'Add Printer'}</h2>

        {/* Preset selector */}
        <label className="form-label">
          Apply Preset
          <select
            className="form-select"
            value={form.preset_id}
            onChange={e => applyPreset(e.target.value)}
          >
            <option value="">— None (manual config) —</option>
            {presets.filter(p => p.is_builtin).length > 0 && (
              <optgroup label="Built-in">
                {presets.filter(p => p.is_builtin).map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.bed_width}×{p.bed_depth}×{p.bed_height}mm)</option>
                ))}
              </optgroup>
            )}
            {presets.filter(p => !p.is_builtin).length > 0 && (
              <optgroup label="Custom">
                {presets.filter(p => !p.is_builtin).map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.bed_width}×{p.bed_depth}×{p.bed_height}mm)</option>
                ))}
              </optgroup>
            )}
          </select>
        </label>

        {/* Tabs */}
        <div className="tab-bar">
          <button type="button" className={`tab-btn ${tab === 'connection' ? 'active' : ''}`}
            onClick={() => setTab('connection')}>Connection</button>
          <button type="button" className={`tab-btn ${tab === 'capabilities' ? 'active' : ''}`}
            onClick={() => setTab('capabilities')}>Capabilities</button>
        </div>

        <form onSubmit={handleSubmit}>
          {tab === 'connection' && (
            <>
              <label className="form-label">
                Name
                <input className="form-input" value={form.name}
                  onChange={e => set('name', e.target.value)} required placeholder="e.g. Voron 2.4 #1" />
              </label>
              <label className="form-label">
                Host / IP Address
                <input className="form-input" value={form.host}
                  onChange={e => set('host', e.target.value)} required placeholder="e.g. 192.168.1.101" />
              </label>
              <label className="form-label">
                Port
                <input className="form-input" type="number" value={form.port}
                  onChange={e => set('port', Number(e.target.value))} required min={1} max={65535} />
              </label>
              <label className="form-label">
                API Key <span className="form-optional">(optional)</span>
                <input className="form-input" value={form.api_key}
                  onChange={e => set('api_key', e.target.value)} placeholder="Leave empty if not set" />
              </label>
            </>
          )}

          {tab === 'capabilities' && (
            <>
              <div className="form-row">
                <label className="form-label">
                  Bed Width (mm)
                  <input className="form-input" type="number" value={form.bed_width}
                    onChange={e => set('bed_width', Number(e.target.value))} min={1} placeholder="e.g. 250" />
                </label>
                <label className="form-label">
                  Bed Depth (mm)
                  <input className="form-input" type="number" value={form.bed_depth}
                    onChange={e => set('bed_depth', Number(e.target.value))} min={1} placeholder="e.g. 210" />
                </label>
                <label className="form-label">
                  Max Height (mm)
                  <input className="form-input" type="number" value={form.bed_height}
                    onChange={e => set('bed_height', Number(e.target.value))} min={1} placeholder="e.g. 220" />
                </label>
              </div>

              <label className="form-label">
                Toolheads
                <input className="form-input" type="number" value={form.toolhead_count}
                  onChange={e => set('toolhead_count', Number(e.target.value))} min={1} max={16} />
              </label>

              <fieldset className="form-fieldset">
                <legend>Supported Filaments</legend>
                <div className="filament-grid">
                  {ALL_FILAMENT_TYPES.map(type => (
                    <label key={type} className="checkbox-label">
                      <input type="checkbox"
                        checked={(form.filament_types || []).includes(type)}
                        onChange={() => toggleFilament(type)} />
                      {type}
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          )}

          {error && <p className="form-error">{error}</p>}

          <div className="dialog-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
