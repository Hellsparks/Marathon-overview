import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrinters } from '../hooks/usePrinters';
import PrinterList from '../components/printers/PrinterList';
import PresetList from '../components/printers/PresetList';
import { getSettings, updateSetting } from '../api/settings';
import { testConnection, testTeamsterConnection, detectTeamster, fetchTeamsterWeight, tareTeamster, calibrateTeamster, getFields, createField, exportSpoolman, importSpoolman, validateImport, getStorageLocation, setStorageLocation, getFilaments, getServicesStatus } from '../api/spoolman';
import { exportDatabase, importDatabase } from '../api/database';
import { checkForUpdate, getUpdateChannel, setUpdateChannel, getReleases, getDevCommits, applyUpdate, pullAndRestart, getApplyStatus } from '../api/updates';
import { getUpdateNotifsEnabled, setUpdateNotifsEnabled } from '../hooks/useUpdateCheck';
import { getMcpStatus, startMcp, stopMcp } from '../api/mcp';
import UpdateDialog from '../components/layout/UpdateDialog';
import ImportFieldMappingDialog from '../components/spoolman/ImportFieldMappingDialog';
import ExportSelectionDialog from '../components/spoolman/ExportSelectionDialog';
import CurrencyConvertDialog from '../components/spoolman/CurrencyConvertDialog';
import OrcaSlicerDefaultsDialog from '../components/spoolman/OrcaSlicerDefaultsDialog';
import JSZip from 'jszip';

function Section({ title, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="settings-section">
      <button className="settings-section-toggle" onClick={() => setOpen(o => !o)}>
        <h2 className="settings-section-title">{title}</h2>
        <span className={`settings-section-chevron${open ? ' open' : ''}`}>&#9654;</span>
      </button>
      {open && <div className="settings-section-body">{children}</div>}
    </section>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { printers, loading, error, refresh } = usePrinters();
  const [spoolmanUrl, setSpoolmanUrl] = useState('');
  const [spoolmanSaved, setSpoolmanSaved] = useState('');
  const [spoolmanStatus, setSpoolmanStatus] = useState(null); // 'ok' | 'error' | null
  const [spoolmanMsg, setSpoolmanMsg] = useState('');
  const [teamsterUrl, setTeamsterUrl] = useState('');
  const [teamsterSaved, setTeamsterSaved] = useState('');
  const [teamsterStatus, setTeamsterStatus] = useState(null);
  const [teamsterMsg, setTeamsterMsg] = useState('');
  const [teamsterDetecting, setTeamsterDetecting] = useState(false);
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
  const [orcaslicerField, setOrcaslicerField] = useState('');
  const [orcaslicerFieldSaved, setOrcaslicerFieldSaved] = useState('');
  const [modifierField, setModifierField] = useState('');
  const [modifierFieldSaved, setModifierFieldSaved] = useState('');
  const [storageLocationVal, setStorageLocationVal] = useState('Storage');
  const [storageLocationSaved, setStorageLocationSaved] = useState('Storage');
  const [storageLocationBusy, setStorageLocationBusy] = useState(false);
  const [projectWarning, setProjectWarning] = useState('50');
  const [projectSaved, setProjectSaved] = useState('50');
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateChecked, setUpdateChecked] = useState(false);
  const [showOrcaDefaults, setShowOrcaDefaults] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [updateChannel, setUpdateChannelState] = useState('release');
  const [releases, setReleases] = useState([]);
  const [devCommits, setDevCommits] = useState([]);
  const [devGitInfo, setDevGitInfo] = useState(null);
  const [updateApplying, setUpdateApplying] = useState(false);
  const [updateLog, setUpdateLog] = useState([]);
  const [notifsEnabled, setNotifsEnabledState] = useState(getUpdateNotifsEnabled);

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
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [currencyData, setCurrencyData] = useState(null); // { data, source, target }

  // Services status (bundled/external Spoolman + Swatch)
  const [servicesStatus, setServicesStatus] = useState(null);

  // Marathon backend port
  const [backendPort, setBackendPort] = useState('');


  // MCP server
  const [mcpStatus, setMcpStatus] = useState(null);
  const [mcpBusy, setMcpBusy] = useState(false);
  const [mcpError, setMcpError] = useState('');
  const [mcpPort, setMcpPort] = useState('3001');
  const [mcpMarathonUrl, setMcpMarathonUrl] = useState('http://localhost:3000');
  const [mcpCopied, setMcpCopied] = useState(false);

  // GitHub integration
  const [githubToken, setGithubToken] = useState('');
  const [githubTokenSaved, setGithubTokenSaved] = useState('');
  const [directReportsEnabled, setDirectReportsEnabled] = useState(false);
  const [directReportsSaved, setDirectReportsSaved] = useState(false);

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
      setOrcaslicerField(s.orcaslicer_config_field || '');
      setOrcaslicerFieldSaved(s.orcaslicer_config_field || '');
      setModifierField(s.material_modifier_field || '');
      setModifierFieldSaved(s.material_modifier_field || '');
    }).catch(() => { });
    getStorageLocation().then(r => {
      const loc = r.storage_location || 'Storage';
      setStorageLocationVal(loc);
      setStorageLocationSaved(loc);
    }).catch(() => { });
    getFields('filament').then(fields => setExtraFields(fields || [])).catch(() => { });
    setBackendPort(window.location.port || (window.location.protocol === 'https:' ? '443' : '80'));
    getMcpStatus().then(s => {
      setMcpStatus(s);
      if (s.port) setMcpPort(String(s.port));
      if (s.marathonUrl) setMcpMarathonUrl(s.marathonUrl);
    }).catch(() => { });
    getUpdateChannel().then(r => setUpdateChannelState(r.channel || 'release')).catch(() => { });

    getSettings().then(s => {
      setGithubToken(s.github_token || '');
      setGithubTokenSaved(s.github_token || '');
      setDirectReportsEnabled(s.direct_reports_enabled === 'true' || s.direct_reports_enabled === true);
      setDirectReportsSaved(s.direct_reports_enabled === 'true' || s.direct_reports_enabled === true);
    }).catch(() => { });
  }, []);

  useEffect(() => {
    getServicesStatus().then(setServicesStatus).catch(() => {});
    const iv = setInterval(() => getServicesStatus().then(setServicesStatus).catch(() => {}), 10000);
    return () => clearInterval(iv);
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


  async function handleOrcaslicerFieldSave(val) {
    try {
      await updateSetting('orcaslicer_config_field', val);
      setOrcaslicerFieldSaved(val);
    } catch (e) {
      alert(e.message);
    }
  }

  async function handleModifierFieldSave(val) {
    try {
      await updateSetting('material_modifier_field', val);
      setModifierFieldSaved(val);
    } catch (e) {
      alert(e.message);
    }
  }

  async function handleGithubSettingsSave() {
    try {
      await updateSetting('github_token', githubToken);
      await updateSetting('direct_reports_enabled', String(directReportsEnabled));
      setGithubTokenSaved(githubToken);
      setDirectReportsSaved(directReportsEnabled);
    } catch (e) {
      alert(e.message);
    }
  }

  async function handleExportAllOrcaSlicer() {
    try {
      const allFilaments = await getFilaments();
      if (!allFilaments || allFilaments.length === 0) {
        alert("No filaments found to export.");
        return;
      }

      const zip = new JSZip();

      for (const f of allFilaments) {
        // Find overrides from Spoolman extra field (slicer)
        let orcaOverrides = {};
        if (orcaslicerField && f.extra?.[orcaslicerField]) {
            try {
                orcaOverrides = JSON.parse(f.extra[orcaslicerField]);
            } catch (e) {
                console.error(`Failed to parse OrcaSlicer config for ${f.name}`, e);
            }
        }

        // Default density to 1.24 if not set, as it's required for accurate weight calculation
        const density = f.density || 1.24;
        
        // OrcaSlicer JSON structure
        const orcaJson = {
            "type": "filament",
            "setting_id": `marathon_${f.id}`,
            "name": f.name,
            "from": "system",
            "instantiation": "true",
            "inherits": "fdm_filament_common", // A safe base class in OrcaSlicer
            
            // Map Basic Spoolman Data
            "filament_vendor": [ f.vendor?.name || "Unknown" ],
            "filament_type": [ f.material || "PLA" ],
            "filament_diameter": [ f.diameter || 1.75 ],
            "filament_density": [ density ],
            "filament_cost": [ f.price || 0 ],
            "filament_spool_weight": [ f.spool_weight || 0 ],

            // Only map color if we have one
            ...(f.color_hex && { "filament_color": [ `#${f.color_hex.slice(0,6)}` ] }),

            // Apply overrides from "OrcaSlicer Settings" panel
            ...(orcaOverrides.shrinkage_xy !== undefined && orcaOverrides.shrinkage_xy !== '' && { "filament_shrink": [ (parseFloat(orcaOverrides.shrinkage_xy) / 100).toFixed(3) ] }),
            ...(orcaOverrides.shrinkage_z !== undefined && orcaOverrides.shrinkage_z !== '' && { "filament_z_shrink": [ (parseFloat(orcaOverrides.shrinkage_z) / 100).toFixed(3) ] }),
            ...(orcaOverrides.nozzle_temp_min !== undefined && orcaOverrides.nozzle_temp_min !== '' && { "nozzle_temperature": [ parseInt(orcaOverrides.nozzle_temp_min) ] }),
            ...(orcaOverrides.nozzle_temp_max !== undefined && orcaOverrides.nozzle_temp_max !== '' && { "temperature_vitrification": [ parseInt(orcaOverrides.nozzle_temp_max) ] }),
            ...(orcaOverrides.bed_temp !== undefined && orcaOverrides.bed_temp !== '' && { "hot_plate_temp": [ parseInt(orcaOverrides.bed_temp) ] }),
            ...(orcaOverrides.flow_ratio !== undefined && orcaOverrides.flow_ratio !== '' && { "filament_flow_ratio": [ parseFloat(orcaOverrides.flow_ratio) ] }),
            ...(orcaOverrides.pressure_advance !== undefined && orcaOverrides.pressure_advance !== '' && { "pressure_advance": [ parseFloat(orcaOverrides.pressure_advance) ] })
        };

        const safeName = f.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        zip.file(`${safeName}.json`, JSON.stringify(orcaJson, null, 4));
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'orcaslicer_filaments.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert("Failed to export: " + e.message);
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

  async function handleTeamsterDetect() {
    setTeamsterDetecting(true);
    setTeamsterMsg('Scanning network...');
    setTeamsterStatus(null);
    try {
      const result = await detectTeamster();
      if (result.found) {
        setTeamsterUrl(result.url);
        setTeamsterSaved(result.url);
        await updateSetting('teamster_url', result.url);
        setTeamsterStatus('ok');
        setTeamsterMsg(`Found at ${result.url}`);
      } else {
        setTeamsterStatus('error');
        setTeamsterMsg('No Teamster found. Is it on the same network?');
      }
    } catch (e) {
      setTeamsterStatus('error');
      setTeamsterMsg(e.message);
    } finally {
      setTeamsterDetecting(false);
    }
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
      // Load release list or dev commits depending on channel
      if (updateChannel === 'dev') {
        const dc = await getDevCommits();
        setDevCommits(dc.commits || []);
        setDevGitInfo(dc.gitInfo || null);
      } else {
        const rl = await getReleases();
        setReleases(rl.releases || []);
      }
    } catch { /* ignore */ } finally {
      setUpdateChecking(false);
    }
  }

  async function handleChannelChange(ch) {
    setUpdateChannelState(ch);
    setUpdateChecked(false);
    setUpdateInfo(null);
    setReleases([]);
    setDevCommits([]);
    try { await setUpdateChannel(ch); } catch { /* ignore */ }
  }

  async function handleApplyTag(tag) {
    setUpdateApplying(true);
    setUpdateLog(['Starting update...']);
    try {
      await applyUpdate(tag);
      // Poll status
      const poll = setInterval(async () => {
        try {
          const s = await getApplyStatus();
          setUpdateLog(s.log || []);
          if (!s.running && s.log?.length > 0) {
            setUpdateApplying(false);
            clearInterval(poll);
          }
        } catch { /* ignore */ }
      }, 1000);
    } catch (e) {
      setUpdateLog([`Failed: ${e.message}`]);
      setUpdateApplying(false);
    }
  }

  async function handlePullRestart() {
    setUpdateApplying(true);
    setUpdateLog(['Pulling latest changes...']);
    try {
      await pullAndRestart();
      const poll = setInterval(async () => {
        try {
          const s = await getApplyStatus();
          setUpdateLog(s.log || []);
          if (!s.running && s.log?.length > 0) {
            setUpdateApplying(false);
            clearInterval(poll);
          }
        } catch { /* ignore */ }
      }, 1000);
    } catch (e) {
      setUpdateLog([`Failed: ${e.message}`]);
      setUpdateApplying(false);
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
        case 'orcaslicer':
          payload = { name: 'OrcaSlicer Config', key: 'orcaslicer_config', field_type: 'text' };
          settingKey = 'orcaslicer_config_field';
          setterFunc = val => { setOrcaslicerField(val); setOrcaslicerFieldSaved(val); };
          break;
        case 'material_modifier':
          payload = { name: 'Material Modifier', key: 'material_modifier', field_type: 'text' };
          settingKey = 'material_modifier_field';
          setterFunc = val => { setModifierField(val); setModifierFieldSaved(val); };
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
    if (!confirm('This will replace the entire Marathon database and gcode files with the uploaded backup.\n\nA backup of the current data will be saved first.\n\nContinue?')) return;
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

  async function handleExport(opts) {
    setShowExportDialog(false);
    setExportBusy(true);
    setExportError('');
    try {
      await exportSpoolman(opts);
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
        setImportMappingData({ data, missing: validation.missing, existing: validation.existing, currencyInfo: validation.currencyInfo });
        setImportBusy(false);
        return;
      }
      // Check currency mismatch
      if (validation.currencyInfo) {
        setCurrencyData({ data, source: validation.currencyInfo.source, target: validation.currencyInfo.target });
        setImportBusy(false);
        return;
      }
      // Fields are OK and no currency mismatch, proceed directly
      const result = await importSpoolman(data);
      setImportLog(result.log || []);
    } catch (e) {
      setImportError(e.message);
    } finally {
      setImportBusy(false);
    }
  }

  // After a Spoolman import with field mappings, sync Marathon's own settings so they
  // point to the correct (possibly remapped) field keys in the target Spoolman instance.
  async function syncSettingsAfterImport(fieldMappings) {
    const filamentMappings = fieldMappings?.filament || {};
    const settingsToSync = [
      { settingKey: 'url_extra_field',         currentVal: urlField,        setter: v => { setUrlField(v); setUrlFieldSaved(v); } },
      { settingKey: 'hueforge_td_field',        currentVal: hueforgeField,   setter: v => { setHueforgeField(v); setHueforgeFieldSaved(v); } },
      { settingKey: 'swatch_extra_field',       currentVal: swatchField,     setter: v => { setSwatchField(v); setSwatchFieldSaved(v); } },
      { settingKey: 'orcaslicer_config_field',  currentVal: orcaslicerField, setter: v => { setOrcaslicerField(v); setOrcaslicerFieldSaved(v); } },
      { settingKey: 'material_modifier_field',  currentVal: modifierField,   setter: v => { setModifierField(v); setModifierFieldSaved(v); } },
    ];
    for (const { settingKey, currentVal, setter } of settingsToSync) {
      if (currentVal && filamentMappings[currentVal] !== undefined) {
        const newVal = filamentMappings[currentVal] === '__skip__' ? '' : filamentMappings[currentVal];
        try {
          await updateSetting(settingKey, newVal);
          setter(newVal);
        } catch { /* non-fatal */ }
      }
    }
  }

  async function handleImportWithMappings(createFields, fieldMappings) {
    const { data, currencyInfo } = importMappingData;
    setImportMappingData(null);
    // Apply field mappings
    data._createFields = createFields;
    data._fieldMappings = fieldMappings;
    // Check currency mismatch after field mapping
    if (currencyInfo) {
      setCurrencyData({ data, source: currencyInfo.source, target: currencyInfo.target });
      return;
    }
    setImportBusy(true);
    try {
      const result = await importSpoolman(data);
      setImportLog(result.log || []);
      await syncSettingsAfterImport(fieldMappings);
    } catch (e) {
      setImportError(e.message);
    } finally {
      setImportBusy(false);
    }
  }

  async function handleCurrencyConfirm(rate) {
    const { data } = currencyData;
    setCurrencyData(null);
    if (rate) data._currencyRate = rate;
    setImportBusy(true);
    try {
      const result = await importSpoolman(data);
      setImportLog(result.log || []);
      await syncSettingsAfterImport(data._fieldMappings);
    } catch (e) {
      setImportError(e.message);
    } finally {
      setImportBusy(false);
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
          args: [mcpStatus?.mcpEntry || 'PATH_TO/mcp-server/src/index.js'],
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

      {/* ════════════════════ 1. Printers ════════════════════ */}
      <Section title="Printers" defaultOpen={true}>
        {loading ? (
          <div className="loading">Loading…</div>
        ) : error ? (
          <div className="error">Error: {error}</div>
        ) : (
          <PrinterList printers={printers} onRefresh={refresh} />
        )}
        <div style={{ marginTop: '16px' }}>
          <h3 className="settings-card-title" style={{ marginBottom: '8px' }}>Printer Presets</h3>
          <p className="settings-card-desc">Presets let you quickly configure printers with common build volumes and filament capabilities. Built-in presets cannot be edited or deleted.</p>
          <PresetList />
        </div>
      </Section>

      {/* ════════════════════ 2. Connections ════════════════════ */}
      <Section title="Connections" defaultOpen={true}>
        <div className="settings-2col">
          {/* Spoolman URL */}
          <div className="settings-card">
            <h3 className="settings-card-title">Spoolman</h3>
            <p className="settings-card-desc">
              Track filament spools on each printer via <a href="https://github.com/Donkie/Spoolman" target="_blank" rel="noopener noreferrer">Spoolman</a>.
            </p>

            {servicesStatus?.deployMode === 'docker' && (
              <div className="settings-row" style={{ marginBottom: '8px' }}>
                <button
                  className={`btn btn-sm${spoolmanUrl === 'http://marathon-spoolman:8000' ? ' btn-primary' : ''}`}
                  onClick={async () => {
                    setSpoolmanUrl('http://marathon-spoolman:8000');
                    await updateSetting('spoolman_url', 'http://marathon-spoolman:8000');
                    setSpoolmanSaved('http://marathon-spoolman:8000');
                    setSpoolmanMsg('Using bundled Spoolman');
                    setSpoolmanStatus('ok');
                    getServicesStatus().then(setServicesStatus).catch(() => {});
                  }}
                >Bundled</button>
                <button
                  className={`btn btn-sm${spoolmanUrl !== 'http://marathon-spoolman:8000' ? ' btn-primary' : ''}`}
                  onClick={() => { setSpoolmanUrl(''); setSpoolmanSaved(''); setSpoolmanStatus(null); setSpoolmanMsg(''); }}
                >External</button>
                {servicesStatus?.spoolman && (
                  <span className={`status-pill ${servicesStatus.spoolman.reachable ? 'running' : 'stopped'}`}>
                    {servicesStatus.spoolman.reachable ? 'Connected' : 'Not reachable'}
                  </span>
                )}
              </div>
            )}

            {(servicesStatus?.deployMode !== 'docker' || spoolmanUrl !== 'http://marathon-spoolman:8000') && (
              <div className="settings-row">
                <input
                  type="url"
                  className="form-input"
                  placeholder="http://10.0.0.24:7912"
                  value={spoolmanUrl}
                  onChange={e => setSpoolmanUrl(e.target.value)}
                  style={{ flex: 1, minWidth: '140px' }}
                />
                <button className="btn btn-sm btn-primary" onClick={handleSpoolmanSave}>Save</button>
                <button className="btn btn-sm" onClick={handleSpoolmanTest}>Test</button>
              </div>
            )}

            {spoolmanMsg && (
              <p className={`settings-status ${spoolmanStatus || ''}`} style={{ marginTop: '6px' }}>{spoolmanMsg}</p>
            )}
          </div>

          {/* Teamster URL */}
          <div className="settings-card">
            <h3 className="settings-card-title">Teamster Scale URL</h3>
            <p className="settings-card-desc">
              Connect to a <strong>Teamster</strong> ESP32 load cell to auto-measure spool weights.
            </p>
            <div className="settings-row">
              <input
                type="url"
                className="form-input"
                placeholder="http://192.168.1.50"
                value={teamsterUrl}
                onChange={e => setTeamsterUrl(e.target.value)}
                style={{ flex: 1, minWidth: '140px' }}
              />
              <button className="btn btn-sm btn-primary" onClick={handleTeamsterSave}>Save</button>
              <button className="btn btn-sm" onClick={handleTeamsterTest}>Test</button>
              <button className="btn btn-sm" onClick={handleTeamsterDetect} disabled={teamsterDetecting}>
                {teamsterDetecting ? 'Scanning…' : 'Detect'}
              </button>
            </div>
            {teamsterMsg && (
              <p className={`settings-status ${teamsterStatus || ''}`} style={{ marginTop: '6px' }}>{teamsterMsg}</p>
            )}
          </div>
        </div>

        {/* Slicer Integration */}
        <div className="settings-card">
          <h3 className="settings-card-title">Slicer Integration</h3>
          <p className="settings-card-desc">
            Configure your slicer to upload G-code to this server using the OctoPrint preset.
            Point it at <code>{window.location.origin}</code> — no API key required by default.
          </p>
          <ul style={{ paddingLeft: '20px', fontSize: '13px', marginBottom: '8px' }}>
            <li><strong>PrusaSlicer / SuperSlicer:</strong> Physical Printer &rarr; Host type: OctoPrint &rarr; Host: <code>{window.location.origin}</code></li>
            <li><strong>OrcaSlicer:</strong> Printer Settings &rarr; "Send to" &rarr; OctoPrint &rarr; URL: <code>{window.location.origin}</code></li>
            <li><strong>Cura:</strong> Marketplace &rarr; OctoPrint plugin &rarr; OctoPrint URL: <code>{window.location.origin}</code></li>
          </ul>
          <p style={{ fontSize: '13px' }}>Uploaded files will appear in the <a href="/files">Files</a> page.</p>
        </div>
      </Section>

      {/* ════════════════════ 3. Spoolman ════════════════════ */}
      <Section title="Spoolman" defaultOpen={false}>
        {/* Storage Location */}
        <div className="settings-card">
          <h3 className="settings-card-title">Storage Location</h3>
          <p className="settings-card-desc">
            The Spoolman location tag used to identify spools that are sealed in storage.
            Type a new name to create a location, or change the existing one.
          </p>
          <div className="settings-row">
            <input
              className="form-input"
              value={storageLocationVal}
              onChange={e => setStorageLocationVal(e.target.value)}
              placeholder="e.g. Storage, Shelf A, Dry Box"
              style={{ maxWidth: '280px', fontSize: '13px' }}
              onKeyDown={e => { if (e.key === 'Enter' && storageLocationVal !== storageLocationSaved) {
                e.preventDefault();
                if (!storageLocationVal.trim()) return;
                setStorageLocationBusy(true);
                setStorageLocation(storageLocationVal.trim())
                  .then(() => setStorageLocationSaved(storageLocationVal.trim()))
                  .catch(err => alert(err.message))
                  .finally(() => setStorageLocationBusy(false));
              }}}
            />
            {storageLocationVal !== storageLocationSaved ? (
              <button className="btn btn-sm btn-primary" disabled={storageLocationBusy}
                onClick={async () => {
                  if (!storageLocationVal.trim()) return;
                  setStorageLocationBusy(true);
                  try {
                    await setStorageLocation(storageLocationVal.trim());
                    setStorageLocationSaved(storageLocationVal.trim());
                  } catch (e) { alert(e.message); }
                  finally { setStorageLocationBusy(false); }
                }}>
                {storageLocationBusy ? 'Saving…' : storageLocationSaved ? 'Save' : 'Create'}
              </button>
            ) : storageLocationVal ? (
              <span style={{ fontSize: '13px', color: 'var(--success, #22c55e)' }}>&#10003; Saved</span>
            ) : null}
          </div>
        </div>

        {/* Extra Fields */}
        <div className="settings-card">
          <h3 className="settings-card-title">Filament Extra Fields</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <tbody>
              {[
                { label: 'Product Link',      field: urlField,       saved: urlFieldSaved,       onChange: v => { setUrlField(v); handleUrlFieldSave(v); },      createType: 'url',               defaultOpt: '— not set —',        actions: null },
                { label: 'HueForge TD',       field: hueforgeField,  saved: hueforgeFieldSaved,  onChange: v => { setHueforgeField(v); handleHueforgeFieldSave(v); }, createType: 'hueforge',       defaultOpt: '— not set —',        actions: null },
                { label: 'OrcaSlicer Config', field: orcaslicerField,saved: orcaslicerFieldSaved, onChange: v => { setOrcaslicerField(v); handleOrcaslicerFieldSave(v); }, createType: 'orcaslicer', defaultOpt: '— not set —',     actions: orcaslicerField ? [{ label: 'Export ZIP', onClick: handleExportAllOrcaSlicer, primary: true }, { label: 'Defaults', onClick: () => setShowOrcaDefaults(true) }] : null },
                { label: 'Material Modifier', field: modifierField,  saved: modifierFieldSaved,  onChange: v => { setModifierField(v); handleModifierFieldSave(v); }, createType: 'material_modifier', defaultOpt: '— not set —',  actions: null },
                { label: 'Swatch Tracking',   field: swatchField,    saved: swatchFieldSaved,    onChange: v => setSwatchField(v),                                createType: 'swatch',            defaultOpt: '— disabled —',       actions: null },
              ].map(({ label, field, saved, onChange, createType, defaultOpt, actions }) => (
                <tr key={label} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px 8px 0', fontWeight: 500, whiteSpace: 'nowrap', width: '160px', color: 'var(--text-muted)', fontSize: '12px' }}>{label}</td>
                  <td style={{ padding: '6px 8px 6px 0' }}>
                    <select className="spoolman-filter-select" style={{ width: '100%', padding: '5px 28px 5px 10px', fontSize: '13px' }}
                      value={field} onChange={e => onChange(e.target.value)}>
                      <option value="">{defaultOpt}</option>
                      {extraFields.map(f => <option key={f.key} value={f.key}>{f.name} ({f.key})</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '6px 0', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {(!field || !extraFields.some(f => f.key === field)) && (
                        <button className="btn btn-sm" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => handleAutoCreateField(createType)}>
                          {field ? 'Re-Create' : 'Auto-Create'}
                        </button>
                      )}
                      {field && field === saved && <span style={{ fontSize: '12px', color: 'var(--success)' }}>✓</span>}
                      {actions?.map(a => (
                        <button key={a.label} className={`btn btn-sm${a.primary ? ' btn-primary' : ''}`} style={{ padding: '4px 10px', fontSize: '12px' }} onClick={a.onClick}>{a.label}</button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {/* Swatch prompt toggle — sub-row under Swatch Tracking */}
              <tr>
                <td />
                <td colSpan={2} style={{ padding: '4px 0 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '12px', cursor: 'pointer', color: 'var(--text-muted)' }}>
                      <input type="checkbox" checked={swatchPromptEnabled} onChange={e => setSwatchPromptEnabled(e.target.checked)} />
                      Prompt to print swatch when adding a spool
                    </label>
                    <button className="btn btn-sm btn-primary" style={{ padding: '3px 12px', fontSize: '12px' }}
                      onClick={handleSwatchSettingsSave}
                      disabled={swatchField === swatchFieldSaved && swatchPromptEnabled === swatchPromptSaved}>
                      {swatchField === swatchFieldSaved && swatchPromptEnabled === swatchPromptSaved ? 'Saved' : 'Save'}
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {showOrcaDefaults && (
            <OrcaSlicerDefaultsDialog onClose={() => setShowOrcaDefaults(false)} />
        )}

        {/* Spoolman Backup & Restore */}
        <div className="settings-card">
          <h3 className="settings-card-title">Spoolman Backup &amp; Restore</h3>
          <div className="settings-2col" style={{ gap: '16px' }}>
            {/* Export */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>Export</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button className="btn btn-sm btn-primary" onClick={() => handleExport(null)} disabled={exportBusy || !spoolmanSaved}>
                  {exportBusy ? 'Exporting…' : 'Export All'}
                </button>
                <button className="btn btn-sm" onClick={() => setShowExportDialog(true)} disabled={exportBusy || !spoolmanSaved}>
                  Select Manufacturers…
                </button>
              </div>
              {!spoolmanSaved && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Configure Spoolman URL first.</span>}
              {exportError && <p style={{ marginTop: '6px', fontSize: '12px', color: 'var(--danger)' }}>{exportError}</p>}
            </div>

            {/* Import */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>Import</label>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>Adds new entries — existing data is not overwritten.</p>
              <div className="settings-row">
                <input type="file" accept=".json" onChange={e => setImportFile(e.target.files?.[0] || null)} style={{ fontSize: '13px' }} />
                <button className="btn btn-sm btn-primary" onClick={handleImport} disabled={importBusy || !importFile || !spoolmanSaved}>
                  {importBusy ? 'Importing…' : 'Import'}
                </button>
              </div>
              {importError && <p style={{ marginTop: '8px', fontSize: '12px', color: 'var(--danger)' }}>{importError}</p>}
              {importLog.length > 0 && <div className="log-output">{importLog.join('\n')}</div>}
            </div>
          </div>
        </div>
      </Section>

      {/* ════════════════════ 4. Scale ════════════════════ */}
      <Section title="Scale" defaultOpen={false}>
        <div className="settings-card">
          <h3 className="settings-card-title">Teamster Live Weight</h3>
          <p className="settings-card-desc">Live readout, tare, and calibration controls for the Teamster load cell.</p>

          <div className="settings-row" style={{ marginBottom: '14px' }}>
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
          <div className="settings-row">
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
      </Section>

      {/* ════════════════════ 5. Projects ════════════════════ */}
      <Section title="Projects" defaultOpen={false}>
        <div className="settings-card">
          <h3 className="settings-card-title">Deadline Warning Threshold</h3>
          <p className="settings-card-desc">
            Set the percentage buffer on estimated print time before a deadline warning is shown.
          </p>
          <div className="settings-row">
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
      </Section>

      {/* ════════════════════ 6. Backup & Restore ════════════════════ */}
      <Section title="Backup & Restore" defaultOpen={false}>
        <div className="settings-card">
          <h3 className="settings-card-title">Marathon Database</h3>
          <p className="settings-card-desc">Export or restore the entire Marathon database — printers, print history, maintenance, settings, and more.</p>
          <div className="settings-2col" style={{ gap: '16px' }}>
            {/* Export */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>Export</label>
              <button className="btn btn-sm btn-primary" onClick={handleDbExport} disabled={dbExportBusy}>
                {dbExportBusy ? 'Exporting…' : 'Download Database Backup'}
              </button>
              {dbExportError && <p style={{ marginTop: '6px', fontSize: '12px', color: 'var(--danger)' }}>{dbExportError}</p>}
            </div>

            {/* Import */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Import</label>
              <p style={{ fontSize: '12px', color: 'var(--danger)', marginBottom: '8px', fontWeight: 500 }}>
                Replaces ALL current data. A backup is saved first.
              </p>
              <div className="settings-row">
                <input
                  type="file"
                  accept=".zip,.db"
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
        </div>
      </Section>

      {/* ════════════════════ 7. Integrations ════════════════════ */}
      <Section title="Integrations" defaultOpen={false}>
        <div className="settings-card">
          <h3 className="settings-card-title">MCP Server</h3>
          <p className="settings-card-desc">
            Expose Marathon as an MCP tool server so Claude Desktop or other AI clients can control your printers directly.
          </p>

          {!mcpStatus?.installed && (
            <div style={{ fontSize: '13px', color: 'var(--danger)', marginBottom: '12px' }}>
              MCP server not found. Make sure <code>mcp-server/src/index.js</code> exists and run <code>npm install</code> inside <code>mcp-server/</code>.
            </div>
          )}

          {/* Status row */}
          <div className="settings-row" style={{ marginBottom: '16px' }}>
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
            <div className="settings-row" style={{ marginBottom: '16px' }}>
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
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px', fontSize: '13px' }}>
              <div style={{ marginBottom: '10px' }}>
                <span style={{ color: 'var(--text-muted)' }}>HTTP endpoint: </span>
                <code style={{ userSelect: 'all' }}>{mcpStatus.endpoint}</code>
              </div>
              <div style={{ marginBottom: '14px' }}>
                <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Claude Desktop config — Linux: <code>~/.config/Claude/claude_desktop_config.json</code> &nbsp;|&nbsp; Windows: <code>%APPDATA%\Claude\claude_desktop_config.json</code>
                </span>
                <pre style={{
                  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px',
                  padding: '10px', fontSize: '12px', overflowX: 'auto', margin: 0, userSelect: 'all',
                }}>{`"marathon": {
  "command": "node",
  "args": ["${mcpStatus.mcpEntry || '/path/to/mcp-server/src/index.js'}"],
  "env": { "MARATHON_URL": "${mcpStatus.marathonUrl}" }
}`}</pre>
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                For HTTP clients: use <code>{mcpStatus.endpoint}</code> as the connector URL.
                For Claude Desktop: edit the config file above and restart Claude Desktop.
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* ════════════════════ 7. GitHub Integration ════════════════════ */}
      <Section title="GitHub Integration" defaultOpen={false}>
        <div className="settings-card">
          <h3 className="settings-card-title">Bug Reporting</h3>
          <p className="settings-card-desc">GitHub PAT for one-click bug reporting from the navbar.</p>
          <div className="settings-row" style={{ marginBottom: '10px' }}>
            <input
              className="form-input"
              type="password"
              value={githubToken}
              onChange={e => setGithubToken(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              style={{ flex: 1, maxWidth: '360px' }}
            />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              Requires <code>public_repo</code> or <code>repo</code> scope.
            </span>
          </div>
          <div className="settings-row">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
              <input type="checkbox" id="direct_reports" checked={directReportsEnabled}
                onChange={e => setDirectReportsEnabled(e.target.checked)} />
              Enable Direct Bug Reporting (no GitHub redirect)
            </label>
            {(githubToken !== githubTokenSaved || directReportsEnabled !== directReportsSaved) && (
              <button className="btn btn-sm btn-primary" onClick={handleGithubSettingsSave}>Save</button>
            )}
          </div>
        </div>
      </Section>

      {/* ════════════════════ 8. Setup ════════════════════ */}
      <Section title="Setup" defaultOpen={false}>
        <div className="settings-card">
          <h3 className="settings-card-title">Setup Wizard</h3>
          <p style={{ fontSize: '13px', opacity: 0.7, margin: '0 0 10px' }}>
            Re-run the first-time setup wizard to reconfigure Spoolman, features, and printers.
          </p>
          <button
            className="btn btn-sm"
            onClick={async () => {
              await fetch('/api/setup/reset', { method: 'POST' });
              navigate('/setup');
            }}
          >
            Run Setup Wizard
          </button>
        </div>
      </Section>

      <Section title="Updates" defaultOpen={false}>
        <div className="settings-card">
          <h3 className="settings-card-title">About &amp; Updates</h3>

          {/* Version + channel + notif all in one compact row area */}
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Version</div>
              <strong style={{ fontSize: '14px' }}>{__APP_VERSION__}</strong>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                {import.meta.env.MODE === 'production' ? 'production' : 'development'}
              </span>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Channel</div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <label className="radio-label" style={{ fontSize: '13px' }}>
                  <input type="radio" name="update_channel" value="release"
                    checked={updateChannel === 'release'}
                    onChange={() => handleChannelChange('release')} />
                  Releases
                </label>
                <label className="radio-label" style={{ fontSize: '13px' }}>
                  <input type="radio" name="update_channel" value="dev"
                    checked={updateChannel === 'dev'}
                    onChange={() => handleChannelChange('dev')} />
                  Main
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '2px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                <input type="checkbox" checked={notifsEnabled}
                  onChange={e => {
                    setUpdateNotifsEnabled(e.target.checked);
                    setNotifsEnabledState(e.target.checked);
                  }} />
                Navbar update notifications
              </label>
            </div>
          </div>

          <div className="settings-row" style={{ marginBottom: '12px' }}>
            <button
              className="btn btn-sm"
              onClick={handleCheckUpdate}
              disabled={updateChecking || updateApplying}
            >
              {updateChecking ? 'Checking…' : 'Check for Updates'}
            </button>
            {updateChecked && !updateInfo && updateChannel === 'release' && (
              <span style={{ fontSize: '13px', color: 'var(--success)' }}>You are up to date &#10003;</span>
            )}
            {updateChecked && !updateInfo && updateChannel === 'dev' && (
              <span style={{ fontSize: '13px', color: 'var(--success)' }}>Up to date with main &#10003;</span>
            )}
            {updateInfo && updateChannel === 'release' && (
              <button className="btn btn-sm btn-primary" onClick={() => setUpdateDialogOpen(true)}>
                v{updateInfo.latest} available — Update Now
              </button>
            )}
            {updateInfo && updateChannel === 'dev' && updateInfo.devStatus && (
              <span style={{ fontSize: '13px', color: 'var(--warning, #f59e0b)' }}>
                {updateInfo.devStatus.ahead} new commit{updateInfo.devStatus.ahead !== 1 ? 's' : ''} available
              </span>
            )}
          </div>

          {/* Dev channel: pull & restart button + commit list */}
          {updateChannel === 'dev' && (
            <>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={handlePullRestart}
                  disabled={updateApplying}
                >
                  {updateApplying ? 'Updating…' : 'Pull & Restart'}
                </button>
                {devGitInfo && (
                  <span style={{ fontSize: '12px', opacity: 0.6 }}>
                    Current: <code style={{ fontSize: '11px' }}>{devGitInfo.sha}</code> on <code style={{ fontSize: '11px' }}>{devGitInfo.branch}</code>
                  </span>
                )}
              </div>
              {devCommits.length > 0 && (
                <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '12px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--surface2)' }}>
                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>SHA</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Message</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {devCommits.map(c => (
                        <tr key={c.sha} style={{
                          borderBottom: '1px solid var(--border)',
                          background: devGitInfo?.sha === c.sha ? 'rgba(59,130,246,0.1)' : undefined,
                        }}>
                          <td style={{ padding: '4px 8px', fontFamily: 'monospace' }}>
                            {c.sha}
                            {devGitInfo?.sha === c.sha && <span style={{ marginLeft: '4px', color: 'var(--primary)', fontFamily: 'inherit' }}>(you)</span>}
                          </td>
                          <td style={{ padding: '4px 8px', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.message}</td>
                          <td style={{ padding: '4px 8px', whiteSpace: 'nowrap', opacity: 0.6 }}>{c.date ? new Date(c.date).toLocaleDateString() : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Release channel: release list */}
          {updateChannel === 'release' && releases.length > 0 && (
            <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '12px' }}>
              {releases.map(r => {
                const isCurrent = r.tag.replace(/^v/, '') === __APP_VERSION__;
                return (
                  <div key={r.tag} style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: isCurrent ? 'rgba(59,130,246,0.1)' : undefined,
                  }}>
                    <div>
                      <strong>{r.tag}</strong>
                      {r.prerelease && <span style={{ marginLeft: '6px', fontSize: '10px', padding: '1px 6px', borderRadius: '9999px', background: 'rgba(245,158,11,0.2)', color: 'var(--warning, #f59e0b)' }}>pre-release</span>}
                      {isCurrent && <span style={{ marginLeft: '6px', fontSize: '10px', padding: '1px 6px', borderRadius: '9999px', background: 'rgba(34,197,94,0.2)', color: 'var(--success)' }}>current</span>}
                      <span style={{ marginLeft: '8px', opacity: 0.5 }}>{r.published ? new Date(r.published).toLocaleDateString() : ''}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {r.url && (
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="btn btn-sm" style={{ fontSize: '11px', padding: '2px 8px' }}>Notes</a>
                      )}
                      {!isCurrent && (
                        <button
                          className="btn btn-sm btn-primary"
                          style={{ fontSize: '11px', padding: '2px 8px' }}
                          onClick={() => handleApplyTag(r.tag)}
                          disabled={updateApplying}
                        >
                          {updateApplying ? '…' : 'Install'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Update log */}
          {updateLog.length > 0 && (
            <div className="log-output" style={{ maxHeight: '200px' }}>
              {updateLog.map((line, i) => <div key={i}>{line}</div>)}
              {updateApplying && <div style={{ opacity: 0.5 }}>_</div>}
              {!updateApplying && updateLog.some(l => l.includes('Restarting')) && (
                <div style={{ marginTop: '8px' }}>
                  <button className="btn btn-sm btn-primary" onClick={() => window.location.reload()}>Reload Page</button>
                </div>
              )}
            </div>
          )}
        </div>

        {updateDialogOpen && updateInfo && updateChannel === 'release' && (
          <UpdateDialog
            updateInfo={updateInfo}
            onDismiss={() => { setUpdateDialogOpen(false); setUpdateInfo(null); }}
          />
        )}
      </Section>

      {importMappingData && (
        <ImportFieldMappingDialog
          missing={importMappingData.missing}
          existing={importMappingData.existing}
          onConfirm={handleImportWithMappings}
          onCancel={() => setImportMappingData(null)}
        />
      )}

      {showExportDialog && (
        <ExportSelectionDialog
          onExport={handleExport}
          onCancel={() => setShowExportDialog(false)}
        />
      )}

      {currencyData && (
        <CurrencyConvertDialog
          source={currencyData.source}
          target={currencyData.target}
          onConfirm={handleCurrencyConfirm}
          onCancel={() => setCurrencyData(null)}
        />
      )}
    </div>
  );
}
