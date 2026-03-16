// ... existing imports
import { useState, useEffect, useRef } from 'react';
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
    firmware_type: printer?.firmware_type ?? 'moonraker',
    serial_number: printer?.serial_number ?? '',
    bed_width: printer?.bed_width ?? '',
    bed_depth: printer?.bed_depth ?? '',
    bed_height: printer?.bed_height ?? '',
    filament_types: printer?.filament_types ?? [],
    toolhead_count: printer?.toolhead_count ?? 1,
    abrasive_capable: printer?.abrasive_capable ? true : false,
    preset_id: printer?.preset_id ?? '',
    custom_css: printer?.custom_css ?? '',
    theme_mode: printer?.theme_mode ?? 'global',
    scrape_css_path: printer?.scrape_css_path ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('connection');
  const [showHost, setShowHost] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSerial, setShowSerial] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    getPresets().then(setPresets).catch(() => { });
  }, []);

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function setFirmwareType(type) {
    setForm(f => {
      const knownDefaults = [7125, 80, 8883];
      const autoPort = type === 'moonraker' ? 7125 : type === 'bambu' ? 8883 : 80;
      const port = knownDefaults.includes(f.port) ? autoPort : f.port;
      return { ...f, firmware_type: type, port };
    });
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

  function handleCssUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      set('custom_css', ev.target.result);
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input so same file can be selected again
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = {
        ...form,
        api_key: form.api_key || null,
        serial_number: form.serial_number || null,
        bed_width: form.bed_width || null,
        bed_depth: form.bed_depth || null,
        bed_height: form.bed_height || null,
        filament_types: JSON.stringify(form.filament_types || []),
        abrasive_capable: form.abrasive_capable ? 1 : 0,
        scrape_css_path: form.scrape_css_path || null,
        // If scrape mode was set but firmware changed away from Moonraker, reset to global
        theme_mode: form.firmware_type !== 'moonraker' && form.theme_mode === 'scrape'
          ? 'global'
          : form.theme_mode,
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
          <button type="button" className={`tab-btn ${tab === 'theme' ? 'active' : ''}`}
            onClick={() => setTab('theme')}>Theme (CSS)</button>
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
                Firmware / API Type
                <select
                  className="form-select"
                  value={form.firmware_type}
                  onChange={e => setFirmwareType(e.target.value)}
                >
                  <option value="moonraker">Klipper (Moonraker)</option>
                  <option value="octoprint">OctoPrint</option>
                  <option value="duet">Duet / RepRapFirmware</option>
                  <option value="bambu">Bambu Lab (LAN Developer Mode)</option>
                </select>
              </label>

              <label className="form-label">
                Host / IP Address
                <div style={{ position: 'relative' }}>
                  <input className="form-input" type={showHost ? 'text' : 'password'} value={form.host}
                    onChange={e => set('host', e.target.value)} required placeholder="e.g. 192.168.1.101 or https://shared-xxx.octoeverywhere.com/"
                    style={{ paddingRight: '36px' }} autoComplete="off" />
                  <button type="button" onClick={() => setShowHost(s => !s)}
                    style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '2px 4px', color: 'var(--text-muted)' }}>
                    {showHost ? '\u{1F441}' : '\u{1F441}\u{200D}\u{1F5E8}'}
                  </button>
                </div>
              </label>
              {/^https?:\/\//i.test(form.host) ? (
                <p className="text-muted" style={{ fontSize: '12px', marginTop: '-8px', marginBottom: '8px' }}>
                  Full URL detected — port field will be ignored.
                </p>
              ) : (
                <label className="form-label">
                  Port
                  <input className="form-input" type="number" value={form.port}
                    onChange={e => set('port', Number(e.target.value))} required min={1} max={65535} />
                </label>
              )}
              {form.firmware_type === 'bambu' && (
                <label className="form-label">
                  Serial Number
                  <div style={{ position: 'relative' }}>
                    <input className="form-input" type={showSerial ? 'text' : 'password'} value={form.serial_number}
                      onChange={e => set('serial_number', e.target.value)}
                      placeholder="e.g. 01P00A…  (shown in printer settings)"
                      style={{ paddingRight: '36px' }} autoComplete="off" />
                    <button type="button" onClick={() => setShowSerial(s => !s)}
                      style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '2px 4px', color: 'var(--text-muted)' }}>
                      {showSerial ? '\u{1F441}' : '\u{1F441}\u{200D}\u{1F5E8}'}
                    </button>
                  </div>
                </label>
              )}

              <label className="form-label">
                {form.firmware_type === 'duet' ? 'Password' : form.firmware_type === 'bambu' ? 'LAN Access Code' : 'API Key'}{' '}
                <span className="form-optional">(optional)</span>
                <div style={{ position: 'relative' }}>
                  <input className="form-input" type={showApiKey ? 'text' : 'password'} value={form.api_key}
                    onChange={e => set('api_key', e.target.value)}
                    placeholder={
                      form.firmware_type === 'duet' ? 'Leave empty if no password set' :
                      form.firmware_type === 'bambu' ? 'Access code shown in printer network settings' :
                      'Leave empty if not set'
                    }
                    style={{ paddingRight: '36px' }} autoComplete="off" />
                  <button type="button" onClick={() => setShowApiKey(s => !s)}
                    style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '2px 4px', color: 'var(--text-muted)' }}>
                    {showApiKey ? '\u{1F441}' : '\u{1F441}\u{200D}\u{1F5E8}'}
                  </button>
                </div>
              </label>

              {form.firmware_type !== 'moonraker' && (
                <p className="text-muted" style={{ fontSize: '12px', marginTop: '4px' }}>
                  {form.firmware_type === 'octoprint' && 'Job queue, Klipper macros, and Spoolman are not available for OctoPrint printers.'}
                  {form.firmware_type === 'duet' && 'Job queue, Klipper macros, and Spoolman are not available for Duet printers.'}
                  {form.firmware_type === 'bambu' && 'Connects via MQTT (LAN Developer Mode). Enable it in the printer\'s settings under Network → LAN Only Mode. Job queue, macros, file push, and Spoolman are not available. Pause/resume/cancel are supported.'}
                </p>
              )}
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

              <label className="checkbox-label" style={{ marginTop: '4px' }}>
                <input type="checkbox"
                  checked={form.abrasive_capable}
                  onChange={e => set('abrasive_capable', e.target.checked)} />
                Abrasive capable (hardened nozzle)
              </label>

              <fieldset className="form-fieldset">
                <legend>Supported Filaments</legend>
                <div className="filament-grid">
                  {ALL_FILAMENT_TYPES.map(type => (
                    <label key={type} className="checkbox-label">
                      <input type="checkbox"
                        checked={(form.filament_types || []).includes(type)}
                        onChange={() => toggleFilament(type)} />
                      <span className={`badge badge-filament filament-${type}`}>{type}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          )}

          {tab === 'theme' && (
            <>
              <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span className="form-label" style={{ marginBottom: '4px' }}>Dashboard Theme Mode</span>

                <label className="radio-label">
                  <input type="radio" name="theme_mode" value="global"
                    checked={form.theme_mode === 'global'}
                    onChange={() => set('theme_mode', 'global')} />
                  <strong>Global Theme</strong>
                  <span className="text-muted" style={{ fontSize: '12px', marginLeft: '6px' }}>— Follows the navbar theme.</span>
                </label>

                <label className="radio-label" style={{ opacity: form.firmware_type !== 'moonraker' ? 0.4 : 1 }}>
                  <input type="radio" name="theme_mode" value="scrape"
                    checked={form.theme_mode === 'scrape'}
                    disabled={form.firmware_type !== 'moonraker'}
                    onChange={() => set('theme_mode', 'scrape')} />
                  <strong>Auto-Scrape Klipper</strong>
                  <span className="text-muted" style={{ fontSize: '12px', marginLeft: '6px' }}>— Automatically synchronizes with Mainsail CSS in the background. (Moonraker only)</span>
                </label>

                <label className="radio-label">
                  <input type="radio" name="theme_mode" value="custom"
                    checked={form.theme_mode === 'custom'}
                    onChange={() => set('theme_mode', 'custom')} />
                  <strong>Custom CSS Editor</strong>
                  <span className="text-muted" style={{ fontSize: '12px', marginLeft: '6px' }}>— Enter or upload custom card styling manually.</span>
                </label>
              </div>

              {form.theme_mode === 'scrape' && (
                <label className="form-label" style={{ marginTop: '8px' }}>
                  CSS File Path
                  <input className="form-input" value={form.scrape_css_path}
                    onChange={e => set('scrape_css_path', e.target.value)}
                    placeholder=".theme/custom.css" />
                  <span className="text-muted" style={{ fontSize: '12px' }}>
                    Path relative to Moonraker's config root. Leave blank for the standard Mainsail location (<code>.theme/custom.css</code>). RatOS example: <code>RatOS/mainsail.cfg</code>
                  </span>
                </label>
              )}

              {form.theme_mode === 'custom' && (
                <div style={{ marginTop: '20px', padding: '16px', background: 'var(--surface2)', borderRadius: 'var(--radius)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span className="form-label" style={{ margin: 0 }}>Custom CSS Override</span>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => fileInputRef.current?.click()}>
                      Upload .css File
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleCssUpload} accept=".css" style={{ display: 'none' }} />
                  </div>
                  <textarea
                    className="form-input"
                    style={{ fontFamily: 'monospace', height: '200px', fontSize: '13px', resize: 'vertical' }}
                    value={form.custom_css}
                    onChange={e => set('custom_css', e.target.value)}
                    placeholder="/* Paste custom.css contents here */&#10;:root {&#10;  --primary: #ff00ff;&#10;}"
                  />
                  <p className="text-muted" style={{ fontSize: '12px', marginTop: '8px' }}>
                    Styles will be automatically scoped to this printer's card using CSS nesting.
                    Changes to `:root` will be mapped to the card.
                  </p>
                </div>
              )}
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
