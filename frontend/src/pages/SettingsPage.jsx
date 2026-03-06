import { useState, useEffect } from 'react';
import { usePrinters } from '../hooks/usePrinters';
import PrinterList from '../components/printers/PrinterList';
import PresetList from '../components/printers/PresetList';
import { getSettings, updateSetting } from '../api/settings';
import { testConnection } from '../api/spoolman';
import { checkForUpdate } from '../api/updates';
import UpdateDialog from '../components/layout/UpdateDialog';

export default function SettingsPage() {
  const { printers, loading, error, refresh } = usePrinters();
  const [spoolmanUrl, setSpoolmanUrl] = useState('');
  const [spoolmanSaved, setSpoolmanSaved] = useState('');
  const [spoolmanStatus, setSpoolmanStatus] = useState(null); // 'ok' | 'error' | null
  const [spoolmanMsg, setSpoolmanMsg] = useState('');
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
    }).catch(() => { });
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
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
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
            marginTop: '6px',
            fontSize: '13px',
            color: spoolmanStatus === 'ok' ? 'var(--success)' : spoolmanStatus === 'error' ? 'var(--danger)' : 'var(--text-muted)',
          }}>
            {spoolmanMsg}
          </p>
        )}
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
