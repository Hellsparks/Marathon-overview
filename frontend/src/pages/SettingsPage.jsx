import { useState, useEffect } from 'react';
import { usePrinters } from '../hooks/usePrinters';
import PrinterList from '../components/printers/PrinterList';
import PresetList from '../components/printers/PresetList';
import { getSettings, updateSetting } from '../api/settings';
import { testConnection, testTeamsterConnection, fetchTeamsterWeight, tareTeamster, calibrateTeamster, getFields, createField, exportSpoolman, importSpoolman, validateImport, getDockerStatus, installSpoolman, uninstallSpoolman, getNativeStatus, installNative, startNative, stopNative, uninstallNative } from '../api/spoolman';
import { exportDatabase, importDatabase } from '../api/database';
import { checkForUpdate } from '../api/updates';
import { getMcpStatus, startMcp, stopMcp } from '../api/mcp';
import UpdateDialog from '../components/layout/UpdateDialog';
import ImportFieldMappingDialog from '../components/spoolman/ImportFieldMappingDialog';

export default function SettingsPage() {
  const { printers, loading, error, refresh } = usePrinters();
  const [spoolmanUrl, setSpoolmanUrl] = useState('');
  const [spoolmanSaved, setSpoolmanSaved] = useState('');
  const [spoolmanStatus, setSpoolmanStatus] = useState(null); // 'ok' | 'error' | null
  const [spoolmanMsg, setSpoolmanMsg] = useState('');
  const [teamsterUrl, setTeamsterUrl] = useState('');
  const [teamsterSaved, setTeamsterSaved] = useState('');
  const [teamsterStatus, setTeamsterStatus] = useState(null);
  const [teamsterMsg, setTeamsterMsg] = useState('');
  const [teamsterLive, setTeamsterLive] = useState(null);
  const [teamsterPolling, setTeamsterPolling] = useState(false);
  const [teamsterTareBusy, setTeamsterTareBusy] = useState(false);
  const [teamsterCalGrams, setTeamsterCalGrams] = useState('');
  const [teamsterCalBusy, setTeamsterCalBusy] = useState(false);
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

  // Marathon DB backup
  const [dbExportBusy, setDbExportBusy] = useState(false);
  const [dbExportError, setDbExportError] = useState('');
  const [dbImportFile, setDbImportFile] = useState(null);
  const [dbImportBusy, setDbImportBusy] = useState(false);
  const [dbImportResult, setDbImportResult] = useState(null); // { ok, backedUpTo } | { error }

  // Backup / Restore
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState('');
  const [importFile, setImportFile] = useState(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importLog, setImportLog] = useState([]);
  const [importError, setImportError] = useState('');
  const [importMappingData, setImportMappingData] = useState(null); // { data, missing, existing }

  // Docker setup
  const [dockerStatus, setDockerStatus] = useState(null); // null = loading
  const [dockerBusy, setDockerBusy] = useState(false);
  const [dockerLog, setDockerLog] = useState([]);
  const [dockerError, setDockerError] = useState('');
  const [installPort, setInstallPort] = useState('7912');
  const [removeData, setRemoveData] = useState(false);

  // MCP server
  const [mcpStatus, setMcpStatus] = useState(null);
  const [mcpBusy, setMcpBusy] = useState(false);
  const [mcpError, setMcpError] = useState('');
  const [mcpPort, setMcpPort] = useState('3001');
  const [mcpMarathonUrl, setMcpMarathonUrl] = useState('http://localhost:3000');
  const [mcpCopied, setMcpCopied] = useState(false);

  // Native (Python venv) setup
  const [nativeStatus, setNativeStatus] = useState(null);
  const [nativeBusy, setNativeBusy] = useState(false);
  const [nativeLog, setNativeLog] = useState([]);
  const [nativeError, setNativeError] = useState('');
  const [nativePort, setNativePort] = useState('7912');
  const [nativeRemoveData, setNativeRemoveData] = useState(false);

  useEffect(() => {
    getSettings().then(s => {
      setSpoolmanUrl(s.spoolman_url || '');
      setSpoolmanSaved(s.spoolman_url || '');
      setTeamsterUrl(s.teamster_url || '');
      setTeamsterSaved(s.teamster_url || '');
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
    getDockerStatus().then(setDockerStatus).catch(() => { });
    getNativeStatus().then(setNativeStatus).catch(() => { });
    getMcpStatus().then(s => {
      setMcpStatus(s);
      if (s.port) setMcpPort(String(s.port));
      if (s.marathonUrl) setMcpMarathonUrl(s.marathonUrl);
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

  async function handleTeamsterSave() {
    await updateSetting('teamster_url', teamsterUrl.replace(/\/+$/, ''));
    setTeamsterSaved(teamsterUrl);
    setTeamsterStatus(null);
    setTeamsterMsg('Saved.');
  }

  async function handleTeamsterTest() {
    setTeamsterStatus(null);
    setTeamsterMsg('Testing...');
    try {
      if (teamsterUrl !== teamsterSaved) {
        await updateSetting('teamster_url', teamsterUrl.replace(/\/+$/, ''));
        setTeamsterSaved(teamsterUrl);
      }
      const result = await testTeamsterConnection();
      if (result.ok) {
        setTeamsterStatus('ok');
        setTeamsterMsg(`Connected ✓  Weight: ${result.weight_g?.toFixed(1) ?? '?'} g`);
      } else {
        setTeamsterStatus('error');
        setTeamsterMsg(`Connection failed: ${result.error || 'Unknown error'}`);
      }
    } catch (e) {
      setTeamsterStatus('error');
      setTeamsterMsg(e.message);
    }
  }

  // Live scale polling in settings — controlled by teamsterPolling toggle
  useEffect(() => {
    if (!teamsterPolling) { setTeamsterLive(null); return; }
    let cancelled = false;
    async function poll() {
      try {
        const data = await fetchTeamsterWeight();
        if (!cancelled) setTeamsterLive(data);
      } catch {
        if (!cancelled) setTeamsterLive(null);
      }
    }
    poll();
    const id = setInterval(poll, 1500);
    return () => { cancelled = true; clearInterval(id); };
  }, [teamsterPolling]);

  async function handleTeamsterTare() {
    setTeamsterTareBusy(true);
    try { await tareTeamster(); } catch { /* ignore */ } finally { setTeamsterTareBusy(false); }
  }

  async function handleTeamsterCalibrate() {
    const g = parseFloat(teamsterCalGrams);
    if (!g || g <= 0) return;
    setTeamsterCalBusy(true);
    try {
      await calibrateTeamster(g);
      setTeamsterMsg('Calibration saved ✓');
      setTeamsterStatus('ok');
    } catch (e) {
      setTeamsterMsg(`Calibration failed: ${e.message}`);
      setTeamsterStatus('error');
    } finally {
      setTeamsterCalBusy(false);
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
          payload = { name: 'Link', key: 'url', field_type: 'text' };
          settingKey = 'url_extra_field';
          setterFunc = val => { setUrlField(val); setUrlFieldSaved(val); };
          break;
        case 'hueforge':
          payload = { name: 'Hueforge TD', key: 'hue_td', field_type: 'float', unit: 'TD' };
          settingKey = 'hueforge_td_field';
          setterFunc = val => { setHueforgeField(val); setHueforgeFieldSaved(val); };
          break;
        case 'swatch':
          payload = { name: 'Has printed swatch', key: 'swatch', field_type: 'boolean' };
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

  async function handleDbExport() {
    setDbExportBusy(true);
    setDbExportError('');
    try {
      await exportDatabase();
    } catch (e) {
      setDbExportError(e.message);
    } finally {
      setDbExportBusy(false);
    }
  }

  async function handleDbImport() {
    if (!dbImportFile) return;
    if (!confirm('This will replace the entire Marathon database with the uploaded file.\n\nA backup of the current database will be saved alongside it before replacing.\n\nContinue?')) return;
    setDbImportBusy(true);
    setDbImportResult(null);
    try {
      const result = await importDatabase(dbImportFile);
      setDbImportResult(result);
      setDbImportFile(null);
    } catch (e) {
      setDbImportResult({ error: e.message });
    } finally {
      setDbImportBusy(false);
    }
  }

  async function handleExport() {
    setExportBusy(true);
    setExportError('');
    try {
      await exportSpoolman();
    } catch (e) {
      setExportError(e.message);
    } finally {
      setExportBusy(false);
    }
  }

  async function handleImport() {
    if (!importFile) return;
    setImportBusy(true);
    setImportLog([]);
    setImportError('');
    try {
      const text = await importFile.text();
      const data = JSON.parse(text);
      // Validate fields first
      const validation = await validateImport(data);
      if (!validation.fieldsOk) {
        // Show mapping dialog — pause import
        setImportMappingData({ data, missing: validation.missing, existing: validation.existing });
        setImportBusy(false);
        return;
      }
      // Fields are OK, proceed directly
      const result = await importSpoolman(data);
      setImportLog(result.log || []);
    } catch (e) {
      setImportError(e.message);
    } finally {
      setImportBusy(false);
    }
  }

  async function handleImportWithMappings(createFields, fieldMappings) {
    const { data } = importMappingData;
    setImportMappingData(null);
    setImportBusy(true);
    try {
      data._createFields = createFields;
      data._fieldMappings = fieldMappings;
      const result = await importSpoolman(data);
      setImportLog(result.log || []);
    } catch (e) {
      setImportError(e.message);
    } finally {
      setImportBusy(false);
    }
  }

  async function handleDockerInstall() {
    setDockerBusy(true);
    setDockerLog([]);
    setDockerError('');
    try {
      const result = await installSpoolman(parseInt(installPort) || 7912);
      setDockerLog(result.log || []);
      // Refresh URL field and docker status
      if (result.spoolmanUrl) {
        setSpoolmanUrl(result.spoolmanUrl);
        setSpoolmanSaved(result.spoolmanUrl);
      }
      const status = await getDockerStatus();
      setDockerStatus(status);
    } catch (e) {
      setDockerError(e.message);
    } finally {
      setDockerBusy(false);
    }
  }

  async function handleDockerUninstall() {
    if (!confirm(`Remove the Spoolman container?${removeData ? '\n\nThis will also delete all Spoolman data (volume). This cannot be undone.' : ''}`)) return;
    setDockerBusy(true);
    setDockerLog([]);
    setDockerError('');
    try {
      const result = await uninstallSpoolman(removeData);
      setDockerLog(result.log || []);
      const status = await getDockerStatus();
      setDockerStatus(status);
    } catch (e) {
      setDockerError(e.message);
    } finally {
      setDockerBusy(false);
    }
  }

  async function handleNativeInstall() {
    setNativeBusy(true);
    setNativeLog([]);
    setNativeError('');
    try {
      const result = await installNative(parseInt(nativePort) || 7912);
      setNativeLog(result.log || []);
      if (result.spoolmanUrl) { setSpoolmanUrl(result.spoolmanUrl); setSpoolmanSaved(result.spoolmanUrl); }
      setNativeStatus(await getNativeStatus());
    } catch (e) {
      setNativeError(e.message);
    } finally {
      setNativeBusy(false);
    }
  }

  async function handleNativeStart() {
    setNativeBusy(true);
    setNativeLog([]);
    setNativeError('');
    try {
      const result = await startNative();
      setNativeLog(result.log || [result.message || 'Started']);
      setNativeStatus(await getNativeStatus());
    } catch (e) {
      setNativeError(e.message);
    } finally {
      setNativeBusy(false);
    }
  }

  async function handleNativeStop() {
    setNativeBusy(true);
    setNativeLog([]);
    setNativeError('');
    try {
      const result = await stopNative();
      setNativeLog([result.message || 'Stopped']);
      setNativeStatus(await getNativeStatus());
    } catch (e) {
      setNativeError(e.message);
    } finally {
      setNativeBusy(false);
    }
  }

  async function handleNativeUninstall() {
    if (!confirm(`Remove Spoolman?${nativeRemoveData ? '\n\nThis will also delete all Spoolman data. This cannot be undone.' : ''}`)) return;
    setNativeBusy(true);
    setNativeLog([]);
    setNativeError('');
    try {
      const result = await uninstallNative(nativeRemoveData);
      setNativeLog(result.log || []);
      setNativeStatus(await getNativeStatus());
    } catch (e) {
      setNativeError(e.message);
    } finally {
      setNativeBusy(false);
    }
  }

  async function handleMcpStart() {
    setMcpBusy(true);
    setMcpError('');
    try {
      const result = await startMcp(parseInt(mcpPort) || 3001, mcpMarathonUrl);
      setMcpStatus(result);
    } catch (e) {
      setMcpError(e.message);
    } finally {
      setMcpBusy(false);
    }
  }

  async function handleMcpStop() {
    setMcpBusy(true);
    setMcpError('');
    try {
      await stopMcp();
      setMcpStatus(await getMcpStatus());
    } catch (e) {
      setMcpError(e.message);
    } finally {
      setMcpBusy(false);
    }
  }

  function handleMcpCopy() {
    const port = parseInt(mcpPort) || 3001;
    const snippet = JSON.stringify({
      mcpServers: {
        marathon: {
          command: 'node',
          args: ['PATH_TO/mcp-server/src/index.js'],
          env: { MARATHON_URL: mcpMarathonUrl },
        },
      },
    }, null, 2);
    navigator.clipboard.writeText(snippet).then(() => {
      setMcpCopied(true);
      setTimeout(() => setMcpCopied(false), 2000);
    });
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

        {/* ── Backup & Restore ── */}
        <div style={{
          marginTop: '24px',
          padding: '20px',
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
        }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>Backup &amp; Restore</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Export all vendors, filaments, and spools to a JSON file, or restore from a previous export.
          </p>

          {/* Export */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>Export</label>
            <button
              className="btn btn-sm btn-primary"
              onClick={handleExport}
              disabled={exportBusy || !spoolmanSaved}
            >
              {exportBusy ? 'Exporting…' : 'Download Backup JSON'}
            </button>
            {!spoolmanSaved && (
              <span style={{ marginLeft: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>
                Configure Spoolman URL above first.
              </span>
            )}
            {exportError && (
              <p style={{ marginTop: '6px', fontSize: '12px', color: 'var(--danger)' }}>{exportError}</p>
            )}
          </div>

          {/* Import */}
          <div style={{ borderTop: '1px solid var(--border-light, rgba(255,255,255,0.05))', paddingTop: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>Import</label>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
              Imports will add new entries — existing data is not deleted or overwritten.
            </p>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="file"
                accept=".json"
                onChange={e => setImportFile(e.target.files?.[0] || null)}
                style={{ fontSize: '13px' }}
              />
              <button
                className="btn btn-sm btn-primary"
                onClick={handleImport}
                disabled={importBusy || !importFile || !spoolmanSaved}
              >
                {importBusy ? 'Importing…' : 'Import'}
              </button>
            </div>
            {importError && (
              <p style={{ marginTop: '8px', fontSize: '12px', color: 'var(--danger)' }}>{importError}</p>
            )}
            {importLog.length > 0 && (
              <div style={{
                marginTop: '10px', padding: '10px 14px',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', fontFamily: 'monospace', fontSize: '12px',
                maxHeight: '160px', overflowY: 'auto', whiteSpace: 'pre-wrap',
              }}>
                {importLog.join('\n')}
              </div>
            )}
          </div>
        </div>

        {/* ── Docker Setup ── */}
        {dockerStatus?.reason === 'docker_not_found' ? (
          <div style={{
            marginTop: '24px', padding: '16px 20px',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', fontSize: '13px', color: 'var(--text-muted)',
          }}>
            <strong style={{ color: 'var(--text)' }}>Docker Setup</strong>
            <p style={{ marginTop: '6px' }}>
              Docker was not found on this system. Install{' '}
              <a href="https://docs.docker.com/get-docker/" target="_blank" rel="noopener noreferrer">Docker Desktop</a>{' '}
              and restart Marathon to enable one-click Spoolman install.
            </p>
          </div>
        ) : dockerStatus?.available && (
          <div style={{
            marginTop: '24px',
            padding: '20px',
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
          }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>Docker Setup</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Install and manage a Spoolman container directly from Marathon.
              {dockerStatus.mode === 'docker'
                ? <> The container joins the <code>marathon_net</code> network and exposes a port for browser access.</>
                : <> The container is managed via the Docker CLI and will be accessible at <code>localhost:{installPort}</code>.</>
              }
            </p>

            {/* Status badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span style={{ fontSize: '13px', fontWeight: 500 }}>Status:</span>
              {!dockerStatus.created ? (
                <span style={{ fontSize: '12px', padding: '2px 10px', borderRadius: '9999px', background: 'var(--surface)', border: '1px solid var(--border)' }}>Not installed</span>
              ) : dockerStatus.running ? (
                <span style={{ fontSize: '12px', padding: '2px 10px', borderRadius: '9999px', background: 'rgba(16,185,129,0.15)', color: 'var(--success)', border: '1px solid var(--success)' }}>Running</span>
              ) : (
                <span style={{ fontSize: '12px', padding: '2px 10px', borderRadius: '9999px', background: 'rgba(245,158,11,0.15)', color: 'var(--warning,#f59e0b)', border: '1px solid var(--warning,#f59e0b)' }}>{dockerStatus.status}</span>
              )}
            </div>

            {!dockerStatus.created ? (
              /* Install form */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <label style={{ fontSize: '13px', whiteSpace: 'nowrap' }}>External port:</label>
                  <input
                    type="number"
                    className="form-input"
                    value={installPort}
                    onChange={e => setInstallPort(e.target.value)}
                    style={{ width: '90px', padding: '6px 10px', fontSize: '13px' }}
                    min="1024" max="65535"
                  />
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Spoolman will be accessible at <code>http://&lt;host&gt;:{installPort}</code>
                  </span>
                </div>
                <div>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={handleDockerInstall}
                    disabled={dockerBusy}
                    style={{ minWidth: '140px' }}
                  >
                    {dockerBusy ? 'Installing…' : 'Install Spoolman'}
                  </button>
                </div>
              </div>
            ) : (
              /* Uninstall form */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="checkbox"
                    id="removeData"
                    checked={removeData}
                    onChange={e => setRemoveData(e.target.checked)}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <label htmlFor="removeData" style={{ fontSize: '13px', cursor: 'pointer', color: 'var(--danger)' }}>
                    Also delete all Spoolman data (volume) — irreversible
                  </label>
                </div>
                <div>
                  <button
                    className="btn btn-sm"
                    onClick={handleDockerUninstall}
                    disabled={dockerBusy}
                    style={{ minWidth: '160px', borderColor: 'var(--danger)', color: 'var(--danger)' }}
                  >
                    {dockerBusy ? 'Uninstalling…' : 'Uninstall Spoolman'}
                  </button>
                </div>
              </div>
            )}

            {dockerError && (
              <p style={{ marginTop: '10px', fontSize: '12px', color: 'var(--danger)' }}>{dockerError}</p>
            )}
            {dockerLog.length > 0 && (
              <div style={{
                marginTop: '12px', padding: '10px 14px',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', fontFamily: 'monospace', fontSize: '12px',
                maxHeight: '160px', overflowY: 'auto', whiteSpace: 'pre-wrap',
              }}>
                {dockerLog.join('\n')}
              </div>
            )}
          </div>
        )}

        {/* ── Native (Python) Install ── */}
        {nativeStatus && nativeStatus.platform === 'win32' && (
          <div style={{
            marginTop: '24px', padding: '14px 20px',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', fontSize: '13px', color: 'var(--text-muted)',
          }}>
            <strong style={{ color: 'var(--text)' }}>Native Install</strong>
            <p style={{ marginTop: '4px' }}>
              Native Install is only available on Linux. Use Docker instead.
            </p>
          </div>
        )}
        {nativeStatus && nativeStatus.platform !== 'win32' && (nativeStatus.pythonAvailable || nativeStatus.installed) && (
          <div style={{
            marginTop: '24px', padding: '20px',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
          }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>Native Install (Python)</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Install Spoolman directly alongside Marathon using a Python virtual environment.
              No Docker required — data lives in <code style={{ fontSize: '11px' }}>{nativeStatus.installDir}/data/</code>
            </p>

            {/* Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span style={{ fontSize: '13px', fontWeight: 500 }}>Status:</span>
              {!nativeStatus.installed ? (
                <span style={{ fontSize: '12px', padding: '2px 10px', borderRadius: '9999px', background: 'var(--surface)', border: '1px solid var(--border)' }}>Not installed</span>
              ) : nativeStatus.running ? (
                <span style={{ fontSize: '12px', padding: '2px 10px', borderRadius: '9999px', background: 'rgba(16,185,129,0.15)', color: 'var(--success)', border: '1px solid var(--success)' }}>Running (PID {nativeStatus.pid}, port {nativeStatus.port})</span>
              ) : (
                <span style={{ fontSize: '12px', padding: '2px 10px', borderRadius: '9999px', background: 'rgba(245,158,11,0.15)', color: 'var(--warning,#f59e0b)', border: '1px solid var(--warning,#f59e0b)' }}>Installed, not running</span>
              )}
              {nativeStatus.pythonVersion && (
                <span style={{ fontSize: '11px', opacity: 0.5 }}>Python {nativeStatus.pythonVersion}</span>
              )}
            </div>

            {!nativeStatus.installed ? (
              /* Install form */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <label style={{ fontSize: '13px', whiteSpace: 'nowrap' }}>Port:</label>
                  <input
                    type="number"
                    className="form-input"
                    value={nativePort}
                    onChange={e => setNativePort(e.target.value)}
                    style={{ width: '90px', padding: '6px 10px', fontSize: '13px' }}
                    min="1024" max="65535"
                  />
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Accessible at <code>http://localhost:{nativePort}</code>
                  </span>
                </div>
                <div>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={handleNativeInstall}
                    disabled={nativeBusy}
                    style={{ minWidth: '160px' }}
                  >
                    {nativeBusy ? 'Installing…' : 'Install Spoolman'}
                  </button>
                </div>
              </div>
            ) : (
              /* Manage form */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {nativeStatus.running ? (
                    <button className="btn btn-sm" onClick={handleNativeStop} disabled={nativeBusy}>
                      {nativeBusy ? 'Stopping…' : 'Stop'}
                    </button>
                  ) : (
                    <button className="btn btn-sm btn-primary" onClick={handleNativeStart} disabled={nativeBusy}>
                      {nativeBusy ? 'Starting…' : 'Start'}
                    </button>
                  )}
                </div>
                <div style={{ borderTop: '1px solid var(--border-light, rgba(255,255,255,0.05))', paddingTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <input
                      type="checkbox"
                      id="nativeRemoveData"
                      checked={nativeRemoveData}
                      onChange={e => setNativeRemoveData(e.target.checked)}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <label htmlFor="nativeRemoveData" style={{ fontSize: '13px', cursor: 'pointer', color: 'var(--danger)' }}>
                      Also delete all Spoolman data — irreversible
                    </label>
                  </div>
                  <button
                    className="btn btn-sm"
                    onClick={handleNativeUninstall}
                    disabled={nativeBusy}
                    style={{ minWidth: '140px', borderColor: 'var(--danger)', color: 'var(--danger)' }}
                  >
                    {nativeBusy ? 'Uninstalling…' : 'Uninstall Spoolman'}
                  </button>
                </div>
              </div>
            )}

            {nativeError && (
              <p style={{ marginTop: '10px', fontSize: '12px', color: 'var(--danger)' }}>{nativeError}</p>
            )}
            {nativeLog.length > 0 && (
              <div style={{
                marginTop: '12px', padding: '10px 14px',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', fontFamily: 'monospace', fontSize: '12px',
                maxHeight: '200px', overflowY: 'auto', whiteSpace: 'pre-wrap',
              }}>
                {nativeLog.join('\n')}
              </div>
            )}
          </div>
        )}

        {/* Python not found note */}
        {nativeStatus && nativeStatus.platform !== 'win32' && !nativeStatus.pythonAvailable && !nativeStatus.installed && (
          <div style={{
            marginTop: '24px', padding: '14px 20px',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', fontSize: '13px', color: 'var(--text-muted)',
          }}>
            <strong style={{ color: 'var(--text)' }}>Native Install</strong>
            <p style={{ marginTop: '4px' }}>
              Python 3.8+ was not found on this system.{' '}
              <a href="https://www.python.org/downloads/" target="_blank" rel="noopener noreferrer">Install Python</a>{' '}
              to enable a Docker-free Spoolman install.
            </p>
          </div>
        )}
      </section>

      <section className="page-section">
        <h2 className="section-title">Teamster Scale</h2>
        <p>Connect to a <strong>Teamster</strong> ESP32 load cell device to auto-measure spool weights.</p>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '12px' }}>
          <input
            type="url"
            className="form-input"
            placeholder="http://192.168.1.50"
            value={teamsterUrl}
            onChange={e => setTeamsterUrl(e.target.value)}
            style={{ flex: 1, minWidth: '200px', maxWidth: '400px', fontSize: '14px', padding: '10px 14px' }}
          />
          <button className="btn btn-sm btn-primary" onClick={handleTeamsterSave}>Save</button>
          <button className="btn btn-sm" onClick={handleTeamsterTest}>Test Connection</button>
        </div>
        {teamsterMsg && (
          <p style={{
            marginTop: '8px',
            fontSize: '13px',
            fontWeight: 500,
            color: teamsterStatus === 'ok' ? 'var(--success)' : teamsterStatus === 'error' ? 'var(--danger)' : 'var(--text-muted)',
          }}>
            {teamsterMsg}
          </p>
        )}

        {/* Live readout + controls */}
        <div style={{ marginTop: '20px', padding: '16px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', minWidth: '130px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Scale:</span>
              <span style={{ fontSize: '22px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: teamsterLive?.ready ? 'var(--text)' : 'var(--text-muted)' }}>
                {teamsterLive ? (teamsterLive.ready ? `${teamsterLive.weight_g.toFixed(1)} g` : 'Not ready') : '—'}
              </span>
            </div>
            <button
              className={`btn btn-sm${teamsterPolling ? ' btn-primary' : ''}`}
              onClick={() => setTeamsterPolling(p => !p)}
            >
              {teamsterPolling ? 'Stop' : 'Live Read'}
            </button>
            <button className="btn btn-sm" onClick={handleTeamsterTare} disabled={teamsterTareBusy}>
              {teamsterTareBusy ? 'Taring…' : 'Tare'}
            </button>
          </div>

          {/* Calibrate */}
          <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '13px', color: 'var(--text-muted)', flexShrink: 0 }}>Calibrate with known weight:</label>
            <input
              type="number"
              className="form-input"
              placeholder="grams"
              value={teamsterCalGrams}
              onChange={e => setTeamsterCalGrams(e.target.value)}
              style={{ width: '100px', padding: '6px 10px', fontSize: '13px' }}
            />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>g</span>
            <button className="btn btn-sm" onClick={handleTeamsterCalibrate} disabled={teamsterCalBusy || !teamsterCalGrams}>
              {teamsterCalBusy ? 'Calibrating…' : 'Calibrate'}
            </button>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
            Place a known-weight object on the scale, enter its weight, then click Calibrate.
          </p>
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
        <h2 className="section-title">Marathon Database</h2>
        <p>Export or restore the entire Marathon database — includes all printers, print history, maintenance records, files metadata, settings, and more.</p>

        <div style={{
          marginTop: '16px', padding: '20px',
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
        }}>
          {/* Export */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>Export</label>
            <button
              className="btn btn-sm btn-primary"
              onClick={handleDbExport}
              disabled={dbExportBusy}
            >
              {dbExportBusy ? 'Exporting…' : 'Download Database Backup'}
            </button>
            {dbExportError && (
              <p style={{ marginTop: '6px', fontSize: '12px', color: 'var(--danger)' }}>{dbExportError}</p>
            )}
          </div>

          {/* Import */}
          <div style={{ borderTop: '1px solid var(--border-light, rgba(255,255,255,0.05))', paddingTop: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Import</label>
            <p style={{ fontSize: '12px', color: 'var(--danger)', marginBottom: '10px', fontWeight: 500 }}>
              Warning: this replaces ALL current data. A backup of the current database will be saved first.
            </p>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="file"
                accept=".db"
                onChange={e => { setDbImportFile(e.target.files?.[0] || null); setDbImportResult(null); }}
                style={{ fontSize: '13px' }}
              />
              <button
                className="btn btn-sm"
                onClick={handleDbImport}
                disabled={dbImportBusy || !dbImportFile}
                style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
              >
                {dbImportBusy ? 'Restoring…' : 'Restore'}
              </button>
            </div>
            {dbImportResult?.ok && (
              <p style={{ marginTop: '8px', fontSize: '12px', color: 'var(--success)' }}>
                Database restored. Backup saved to <code style={{ fontSize: '11px' }}>{dbImportResult.backedUpTo}</code>.
                Reload the page to see updated data.
              </p>
            )}
            {dbImportResult?.error && (
              <p style={{ marginTop: '8px', fontSize: '12px', color: 'var(--danger)' }}>{dbImportResult.error}</p>
            )}
          </div>
        </div>
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

      {/* ── MCP Server ── */}
      <section className="page-section">
        <h2 className="section-title">MCP Server</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Expose Marathon as an MCP tool server so Claude Desktop or other AI clients can control your printers directly.
        </p>

        {!mcpStatus?.installed && (
          <div style={{ fontSize: '13px', color: 'var(--danger)', marginBottom: '12px' }}>
            MCP server not found. Make sure <code>mcp-server/src/index.js</code> exists and run <code>npm install</code> inside <code>mcp-server/</code>.
          </div>
        )}

        {/* Status row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
            background: mcpStatus?.running ? 'var(--success, #22c55e)' : 'var(--text-muted)',
          }} />
          <span style={{ fontSize: '13px' }}>
            {mcpStatus === null ? 'Checking…' : mcpStatus.running ? `Running — port ${mcpStatus.port}` : 'Stopped'}
          </span>
          {mcpStatus?.running ? (
            <button className="btn btn-sm" onClick={handleMcpStop} disabled={mcpBusy}>
              {mcpBusy ? 'Stopping…' : 'Stop'}
            </button>
          ) : (
            <button className="btn btn-sm btn-primary" onClick={handleMcpStart} disabled={mcpBusy || !mcpStatus?.installed}>
              {mcpBusy ? 'Starting…' : 'Start'}
            </button>
          )}
        </div>

        {/* Config inputs */}
        {!mcpStatus?.running && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Port</label>
              <input
                className="form-input"
                type="number"
                value={mcpPort}
                onChange={e => setMcpPort(e.target.value)}
                style={{ width: '90px', fontSize: '13px', padding: '6px 10px' }}
                placeholder="3001"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '200px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Marathon backend URL</label>
              <input
                className="form-input"
                type="url"
                value={mcpMarathonUrl}
                onChange={e => setMcpMarathonUrl(e.target.value)}
                style={{ fontSize: '13px', padding: '6px 10px' }}
                placeholder="http://localhost:3000"
              />
            </div>
          </div>
        )}

        {mcpError && <div style={{ fontSize: '13px', color: 'var(--danger)', marginBottom: '12px' }}>{mcpError}</div>}

        {/* Connection info */}
        {mcpStatus?.running && (
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px', fontSize: '13px' }}>
            <div style={{ marginBottom: '10px' }}>
              <span style={{ color: 'var(--text-muted)' }}>HTTP endpoint: </span>
              <code style={{ userSelect: 'all' }}>{mcpStatus.endpoint}</code>
            </div>
            <div style={{ marginBottom: '14px' }}>
              <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Claude Desktop config (<code>%APPDATA%\Claude\claude_desktop_config.json</code>):</span>
              <pre style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px',
                padding: '10px', fontSize: '12px', overflowX: 'auto', margin: 0, userSelect: 'all',
              }}>{`"marathon": {
  "command": "node",
  "args": ["D:/Github/Marathon-overview/mcp-server/src/index.js"],
  "env": { "MARATHON_URL": "${mcpStatus.marathonUrl}" }
}`}</pre>
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
              For HTTP clients: use <code>{mcpStatus.endpoint}</code> as the connector URL.
              For Claude Desktop: edit the config file above and restart Claude Desktop.
            </div>
          </div>
        )}
      </section>

      {importMappingData && (
        <ImportFieldMappingDialog
          missing={importMappingData.missing}
          existing={importMappingData.existing}
          onConfirm={handleImportWithMappings}
          onCancel={() => setImportMappingData(null)}
        />
      )}
    </div>
  );
}
