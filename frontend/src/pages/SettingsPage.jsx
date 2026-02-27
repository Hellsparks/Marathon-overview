import { usePrinters } from '../hooks/usePrinters';
import PrinterList from '../components/printers/PrinterList';
import PresetList from '../components/printers/PresetList';

export default function SettingsPage() {
  const { printers, loading, error, refresh } = usePrinters();

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
