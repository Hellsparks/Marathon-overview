import { useState, useEffect } from 'react';
import { usePrinters } from '../hooks/usePrinters';
import PrinterList from '../components/printers/PrinterList';
import PresetList from '../components/printers/PresetList';
import { getSettings, updateSetting } from '../api/settings';
import { testConnection } from '../api/spoolman';

export default function SettingsPage() {
  const { printers, loading, error, refresh } = usePrinters();
  const [spoolmanUrl, setSpoolmanUrl] = useState('');
  const [spoolmanSaved, setSpoolmanSaved] = useState('');
  const [spoolmanStatus, setSpoolmanStatus] = useState(null); // 'ok' | 'error' | null
  const [spoolmanMsg, setSpoolmanMsg] = useState('');

  useEffect(() => {
    getSettings().then(s => {
      setSpoolmanUrl(s.spoolman_url || '');
      setSpoolmanSaved(s.spoolman_url || '');
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
            className="input"
            placeholder="http://10.0.0.24:32000"
            value={spoolmanUrl}
            onChange={e => setSpoolmanUrl(e.target.value)}
            style={{ flex: 1, minWidth: '200px' }}
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
        <h2 className="section-title">Printer Presets</h2>
        <p>Presets let you quickly configure printers with common build volumes and filament capabilities. Built-in presets cannot be edited or deleted.</p>
        <PresetList />
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
