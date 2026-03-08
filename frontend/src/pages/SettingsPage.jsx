import { useState, useEffect } from 'react';
import { usePrinters } from '../hooks/usePrinters';
import PrinterList from '../components/printers/PrinterList';
import PresetList from '../components/printers/PresetList';
import { getSettings, updateSetting } from '../api/settings';
import { testConnection, getFields, createField } from '../api/spoolman';
import { checkForUpdate } from '../api/updates';
import UpdateDialog from '../components/layout/UpdateDialog';

export default function SettingsPage() {
  const { printers, loading, error, refresh } = usePrinters();
  const [spoolmanUrl, setSpoolmanUrl] = useState('');
  const [spoolmanSaved, setSpoolmanSaved] = useState('');
  const [spoolmanStatus, setSpoolmanStatus] = useState(null); // 'ok' | 'error' | null
  const [spoolmanMsg, setSpoolmanMsg] = useState('');
  const [urlField, setUrlField] = useState('');
  const [urlFieldSaved, setUrlFieldSaved] = useState('');
  const [hueforgeField, setHueforgeField] = useState('');
  const [hueforgeFieldSaved, setHueforgeFieldSaved] = useState('');
  const [extraFields, setExtraFields] = useState([]);
  const [swatchField, setSwatchField] = useState('');
  const [swatchFieldSaved, setSwatchFieldSaved] = useState('');
  const [swatchPromptEnabled, setSwatchPromptEnabled] = useState(false);
  const [swatchPromptSaved, setSwatchPromptSaved] = useState(false);
  const [projectWarning, setProjectWarning] = useState('50');
  const [projectSaved, setProjectSaved] = useState('50');
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateChecked, setUpdateChecked] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);

  useEffect(() => {
    getSettings().then(s => {
      setSpoolmanUrl(s.spoolman_url || '');
      setSpoolmanSaved(s.spoolman_url || '');
      setProjectWarning(s.project_deadline_warning_percent || '50');
      setProjectSaved(s.project_deadline_warning_percent || '50');
      setUrlField(s.url_extra_field || '');
      setUrlFieldSaved(s.url_extra_field || '');
      setHueforgeField(s.hueforge_td_field || '');
      setHueforgeFieldSaved(s.hueforge_td_field || '');
      setSwatchField(s.swatch_extra_field || '');
      setSwatchFieldSaved(s.swatch_extra_field || '');
      setSwatchPromptEnabled(s.swatch_prompt_enabled === 'true' || s.swatch_prompt_enabled === true);
      setSwatchPromptSaved(s.swatch_prompt_enabled === 'true' || s.swatch_prompt_enabled === true);
    }).catch(() => { });
    getFields('filament').then(fields => setExtraFields(fields || [])).catch(() => { });
  }, []);

  async function handleSpoolmanSave() {
    try {
      await updateSetting('spoolman_url', spoolmanUrl.replace(/\/+$/, '')); // strip trailing slash
      setSpoolmanSaved(spoolmanUrl);
      setSpoolmanStatus('ok');
      setSpoolmanMsg('Saved');
      setTimeout(() => setSpoolmanStatus(null), 2000);
    } catch (e) {
      setSpoolmanStatus('error');
      setSpoolmanMsg(e.message);
    }
  }

  async function handleUrlFieldSave(val) {
    try {
      await updateSetting('url_extra_field', val);
      setUrlFieldSaved(val);
    } catch (e) {
      alert(e.message);
    }
  }

  async function handleHueforgeFieldSave(val) {
    try {
      await updateSetting('hueforge_td_field', val);
      setHueforgeFieldSaved(val);
    } catch (e) {
      alert(e.message);
    }
  }

  async function handleSwatchSettingsSave() {
    try {
      await updateSetting('swatch_extra_field', swatchField);
      await updateSetting('swatch_prompt_enabled', String(swatchPromptEnabled));
      setSwatchFieldSaved(swatchField);
      setSwatchPromptSaved(swatchPromptEnabled);
    } catch (e) {
      alert(e.message);
    }
  }

  async function handleSpoolmanTest() {
    setSpoolmanStatus(null);
    setSpoolmanMsg('Testing...');
    try {
      if (spoolmanUrl !== spoolmanSaved) {
        await updateSetting('spoolman_url', spoolmanUrl.replace(/\/+$/, ''));
        setSpoolmanSaved(spoolmanUrl);
      }
      const result = await testConnection();
      if (result.ok) {
        setSpoolmanStatus('ok');
        setSpoolmanMsg('Connected to Spoolman ✓');
      } else {
        setSpoolmanStatus('error');
        setSpoolmanMsg(`Connection failed: ${result.error || `HTTP ${result.status}`}`);
      }
    } catch (e) {
      setSpoolmanStatus('error');
      setSpoolmanMsg(e.message);
    }
  }

  async function handleCheckUpdate() {
    setUpdateChecking(true);
    setUpdateChecked(false);
    try {
      const info = await checkForUpdate();
      setUpdateInfo(info.available ? info : null);
      setUpdateChecked(true);
    } catch { /* ignore */ } finally {
      setUpdateChecking(false);
    }
  }

  async function handleProjectSave() {
    try {
      await updateSetting('project_deadline_warning_percent', projectWarning);
      setProjectSaved(projectWarning);
    } catch (e) {
      alert(e.message);
    }
  }

  async function handleAutoCreateField(type) {
    try {
      let payload;
      let settingKey;
      let setterFunc;

      switch (type) {
        case 'url':
          payload = { name: 'Link', key: 'url', field_type: 'text', default_value: '""', entity_type: 'filament' };
          settingKey = 'url_extra_field';
          setterFunc = val => { setUrlField(val); setUrlFieldSaved(val); };
          break;
        case 'hueforge':
          payload = { name: 'Hueforge TD', key: 'hue_td', field_type: 'float', unit: 'TD', entity_type: 'filament' };
          settingKey = 'hueforge_td_field';
          setterFunc = val => { setHueforgeField(val); setHueforgeFieldSaved(val); };
          break;
        case 'swatch':
          payload = { name: 'Has printed swatch', key: 'swatch', field_type: 'boolean', entity_type: 'filament' };
          settingKey = 'swatch_extra_field';
          setterFunc = val => { setSwatchField(val); setSwatchFieldSaved(val); };
          break;
        default:
          return;
      }

      const created = await createField('filament', payload);
      // Refresh fields list
      const updatedFields = await getFields('filament');
      setExtraFields(updatedFields || []);

      // Select it and save
      setterFunc(created.key);
      await updateSetting(settingKey, created.key);

    } catch (e) {
      alert('Failed to create field: ' + e.message);
    }
  }

  return (
    <div className="page">
      <h1 className="page-title">Settings</h1>

      <section className="page-section">
        <h2 className="section-title">Printers</h2>
        {loading ? (
          <div className="loading">Loading…</div>
        ) : error ? (
          <div className="error">Error: {error}</div>
        ) : (
          <PrinterList printers={printers} onRefresh={refresh} />
        )}
      </section>

      <section className="page-section">
        <h2 className="section-title">Spoolman</h2>
        <p>Connect to a <a href="https://github.com/Donkie/Spoolman" target="_blank" rel="noopener noreferrer">Spoolman</a> instance to track filament spools on each printer.</p>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '12px' }}>
          <input
            type="url"
            className="form-input"
            placeholder="http://10.0.0.24:32000"
            value={spoolmanUrl}
            onChange={e => setSpoolmanUrl(e.target.value)}
            style={{ flex: 1, minWidth: '200px', maxWidth: '400px', fontSize: '14px', padding: '10px 14px' }}
          />
          <button className="btn btn-sm btn-primary" onClick={handleSpoolmanSave}>
            Save
          </button>
          <button className="btn btn-sm" onClick={handleSpoolmanTest}>
            Test Connection
          </button>
        </div>
        {spoolmanMsg && (
          <p style={{
            marginTop: '8px',
            fontSize: '13px',
            fontWeight: 500,
            color: spoolmanStatus === 'ok' ? 'var(--success)' : spoolmanStatus === 'error' ? 'var(--danger)' : 'var(--text-muted)',
          }}>
            {spoolmanMsg}
          </p>
        )}

        {/* ── Extra Fields Card ── */}
        <div style={{
          marginTop: '24px',
          padding: '20px',
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
        }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>Filament Extra Fields mapping</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
            Map Spoolman custom fields to the application's interface features.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* URL Field */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                Product Link (URL)
              </label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select
                  className="spoolman-filter-select"
                  style={{ minWidth: '240px', padding: '8px 32px 8px 12px', fontSize: '13px' }}
                  value={urlField}
                  onChange={e => {
                    setUrlField(e.target.value);
                    handleUrlFieldSave(e.target.value);
                  }}
                >
                  <option value="">— not set —</option>
                  {extraFields.map(f => (
                    <option key={f.key} value={f.key}>{f.name} ({f.key})</option>
                  ))}
                </select>
                {urlField === urlFieldSaved && urlField && (
                  <span style={{ fontSize: '12px', color: 'var(--success)' }}>Saved ✓</span>
                )}
                {!urlField && (
                  <button className="btn btn-sm" style={{ padding: '6px 12px' }} onClick={() => handleAutoCreateField('url')}>
                    Auto-Create Text Field
                  </button>
                )}
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                Provides click-to-buy links in the Filaments grid.
              </p>
            </div>

            {/* Hueforge Field */}
            <div style={{ borderTop: '1px solid var(--border-light, rgba(255,255,255,0.05))', paddingTop: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                HueForge Transmissivity (TD)
              </label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select
                  className="spoolman-filter-select"
                  style={{ minWidth: '240px', padding: '8px 32px 8px 12px', fontSize: '13px' }}
                  value={hueforgeField}
                  onChange={e => {
                    setHueforgeField(e.target.value);
                    handleHueforgeFieldSave(e.target.value);
                  }}
                >
                  <option value="">— not set (default 1) —</option>
                  {extraFields.map(f => (
                    <option key={f.key} value={f.key}>{f.name} ({f.key})</option>
                  ))}
                </select>
                {hueforgeField === hueforgeFieldSaved && hueforgeField && (
                  <span style={{ fontSize: '12px', color: 'var(--success)' }}>Saved ✓</span>
                )}
                {!hueforgeField && (
                  <button className="btn btn-sm" style={{ padding: '6px 12px' }} onClick={() => handleAutoCreateField('hueforge')}>
                    Auto-Create Float Field
                  </button>
                )}
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                Allows HueForge TD tracking for lithophanes and blends.
              </p>
            </div>

            {/* Swatch Tracking */}
            <div style={{ borderTop: '1px solid var(--border-light, rgba(255,255,255,0.05))', paddingTop: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                Color Swatch Tracking
              </label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
                <select
                  className="spoolman-filter-select"
                  style={{ minWidth: '240px', padding: '8px 32px 8px 12px', fontSize: '13px' }}
                  value={swatchField}
                  onChange={e => setSwatchField(e.target.value)}
                >
                  <option value="">— disabled —</option>
                  {extraFields.map(f => (
                    <option key={f.key} value={f.key}>{f.name} ({f.key})</option>
                  ))}
                </select>
                {!swatchField && (
                  <button className="btn btn-sm" style={{ padding: '6px 12px' }} onClick={() => handleAutoCreateField('swatch')}>
                    Auto-Create Boolean Field
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <input
                  type="checkbox"
                  id="swatchPrompt"
                  checked={swatchPromptEnabled}
                  onChange={e => setSwatchPromptEnabled(e.target.checked)}
                  style={{
                    appearance: 'none', WebkitAppearance: 'none', width: '20px', height: '20px',
                    border: '2px solid var(--border)', borderRadius: '4px', cursor: 'pointer',
                    backgroundColor: 'var(--surface)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', flexShrink: 0, accentColor: 'var(--primary, #0ea5e9)'
                  }}
                />
                <label htmlFor="swatchPrompt" style={{ fontSize: '13px', cursor: 'pointer', userSelect: 'none' }}>
                  Prompt to print/download an STL Swatch when a new color spool is added.
                </label>
              </div>

              <button
                className="btn btn-sm btn-primary"
                onClick={handleSwatchSettingsSave}
                disabled={swatchField === swatchFieldSaved && swatchPromptEnabled === swatchPromptSaved}
                style={{ padding: '6px 16px' }}
              >
                {(swatchField === swatchFieldSaved && swatchPromptEnabled === swatchPromptSaved) ? 'Saved' : 'Save Swatch Settings'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="page-section">
        <h2 className="section-title">Project Settings</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', marginBottom: '4px' }}>Deadline Warning Threshold (%)</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="number"
                className="form-input"
                value={projectWarning}
                onChange={e => setProjectWarning(e.target.value)}
                style={{ width: '100px', padding: '8px 12px' }}
              />
              <span style={{ fontSize: '14px', opacity: 0.7 }}>% buffer on estimated print time</span>
              <button className="btn btn-sm btn-primary" onClick={handleProjectSave} disabled={projectWarning === projectSaved}>
                {projectWarning === projectSaved ? 'Saved' : 'Save'}
              </button>
            </div>
            <p style={{ fontSize: '13px', opacity: 0.6, marginTop: '6px' }}>
              Example: If set to 50%, you'll get a warning if 1.5x the remaining print time puts you past the deadline.
            </p>
          </div>
        </div>
      </section>

      <section className="page-section">
        <h2 className="section-title">Printer Presets</h2>
        <p>Presets let you quickly configure printers with common build volumes and filament capabilities. Built-in presets cannot be edited or deleted.</p>
        <PresetList />
      </section>

      <section className="page-section">
        <h2 className="section-title">About &amp; Updates</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '16px', fontSize: '14px' }}>
            <span><strong>Version:</strong> {__APP_VERSION__}</span>
            <span style={{ opacity: 0.6 }}>
              Deploy mode: {import.meta.env.MODE === 'production' ? 'production' : 'development'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              className="btn btn-sm"
              onClick={handleCheckUpdate}
              disabled={updateChecking}
            >
              {updateChecking ? 'Checking…' : 'Check for Updates'}
            </button>
            {updateChecked && !updateInfo && (
              <span style={{ fontSize: '13px', color: 'var(--success)' }}>You are up to date ✓</span>
            )}
            {updateInfo && (
              <button className="btn btn-sm btn-primary" onClick={() => setUpdateDialogOpen(true)}>
                v{updateInfo.latest} available — Update Now
              </button>
            )}
          </div>
        </div>
        {updateDialogOpen && updateInfo && (
          <UpdateDialog
            updateInfo={updateInfo}
            onDismiss={() => { setUpdateDialogOpen(false); setUpdateInfo(null); }}
          />
        )}
      </section>

      <section className="page-section">
        <h2 className="section-title">Bambu Connect</h2>
        <div style={{
          display: 'flex', gap: '16px', alignItems: 'flex-start',
          padding: '16px', background: 'var(--surface2)', borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: '28px', lineHeight: 1 }}>🐼</div>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 600, marginBottom: '4px' }}>Bambu Connect Integration</p>
            <p style={{ fontSize: '13px', opacity: 0.7, marginBottom: '8px' }}>
              Cloud-based integration via the Bambu Connect desktop app is planned for a future release.
              For now, connect your Bambu Lab printers directly using <strong>LAN Developer Mode</strong>
              — enable it in the printer's settings under <em>Network → LAN Only Mode</em>, then add the
              printer from the Printers section above and select "Bambu Lab (LAN Developer Mode)".
            </p>
            <span style={{
              display: 'inline-block', fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em',
              padding: '2px 8px', borderRadius: '9999px',
              background: 'var(--warning, #f59e0b)', color: '#fff', opacity: 0.8,
            }}>
              Coming soon
            </span>
          </div>
        </div>
      </section>

      <section className="page-section">
        <h2 className="section-title">Slicer Integration</h2>
        <p>
          Configure your slicer to upload G-code to this server using the OctoPrint preset.
          Point it at <code>{window.location.origin}</code> — no API key required by default.
        </p>
        <ul>
          <li><strong>PrusaSlicer / SuperSlicer:</strong> Physical Printer → Host type: OctoPrint → Host: <code>{window.location.origin}</code></li>
          <li><strong>OrcaSlicer:</strong> Printer Settings → "Send to" → OctoPrint → URL: <code>{window.location.origin}</code></li>
          <li><strong>Cura:</strong> Marketplace → OctoPrint plugin → OctoPrint URL: <code>{window.location.origin}</code></li>
        </ul>
        <p>Uploaded files will appear in the <a href="/files">Files</a> page.</p>
      </section>
    </div>
  );
}
