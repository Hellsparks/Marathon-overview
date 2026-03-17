import { useState, useEffect } from 'react';
import { deletePrinter, getPrinterMmus } from '../../api/printers';
import { clearPrinterScrapeCache } from '../../services/themeScraper';
import ConfirmDialog from '../common/ConfirmDialog';
import PrinterForm from './PrinterForm';

export default function PrinterList({ printers, onRefresh }) {
  const [editingPrinter, setEditingPrinter] = useState(null);
  const [addingNew, setAddingNew] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [showSensitive, setShowSensitive] = useState(false);
  const [printerMmus, setPrinterMmus] = useState({}); // { printerId: [{ mmu_name, slot_count }] }

  useEffect(() => {
    if (printers.length === 0) return;
    Promise.all(printers.map(async p => {
      try { return { id: p.id, mmus: await getPrinterMmus(p.id) }; }
      catch { return { id: p.id, mmus: [] }; }
    })).then(results => {
      const map = {};
      for (const r of results) map[r.id] = r.mmus;
      setPrinterMmus(map);
    });
  }, [printers]);

  async function handleDelete(id) {
    const printer = printers.find(p => p.id === id);
    try {
      await deletePrinter(id);
      if (printer) clearPrinterScrapeCache(printer);
      onRefresh?.();
    } catch (e) {
      alert(e.message);
    } finally {
      setDeletingId(null);
    }
  }

  function handleSaved() {
    setEditingPrinter(null);
    setAddingNew(false);
    onRefresh?.();
  }

  return (
    <div>
      <div className="section-toolbar">
        <button className="btn btn-sm" onClick={() => setShowSensitive(s => !s)}
          title={showSensitive ? 'Hide sensitive info' : 'Show sensitive info'}
          style={{ fontSize: '16px', padding: '4px 8px', lineHeight: 1 }}>
          {showSensitive ? '\u{1F441}' : '\u{1F441}\u{200D}\u{1F5E8}'}
        </button>
        <button className="btn btn-primary" onClick={() => setAddingNew(true)}>
          + Add Printer
        </button>
      </div>

      {printers.length === 0 ? (
        <p className="empty-state">No printers yet. Click "Add Printer" to get started.</p>
      ) : (
        <table className="file-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Host</th>
              <th>Firmware</th>
              <th>Bed Size</th>
              <th>Filaments</th>
              <th>Toolheads</th>
              <th>MMU / Slots</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {printers.map(p => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td style={{ fontFamily: showSensitive ? 'inherit' : 'initial', letterSpacing: showSensitive ? 'normal' : '2px' }}>
                  {showSensitive ? `${p.host}:${p.port}` : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                </td>
                <td>
                  {p.firmware_type === 'octoprint' && 'OctoPrint'}
                  {p.firmware_type === 'duet' && 'Duet/RRF'}
                  {p.firmware_type === 'bambu' && 'Bambu Lab'}
                  {(!p.firmware_type || p.firmware_type === 'moonraker') && 'Klipper'}
                </td>
                <td>
                  {p.bed_width && p.bed_depth ? (
                    <span>{p.bed_width}×{p.bed_depth}×{p.bed_height || '?'}mm</span>
                  ) : (
                    <span className="text-muted">Not set</span>
                  )}
                </td>
                <td>
                  {Array.isArray(p.filament_types) && p.filament_types.length > 0 ? (
                    <div className="badge-row">
                      {p.filament_types.slice(0, 3).map(t => (
                        <span key={t} className={`badge badge-filament filament-${t}`}>{t}</span>
                      ))}
                      {p.filament_types.length > 3 && (
                        <span className="badge badge-muted">+{p.filament_types.length - 3}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td>{p.toolhead_count || 1}</td>
                <td>
                  {(printerMmus[p.id] || []).length > 0 ? (
                    <div className="badge-row">
                      {printerMmus[p.id].map(m => (
                        <span key={m.tool_index} className="badge badge-muted" title={`T${m.tool_index}: ${m.mmu_name}`}>
                          {m.mmu_name} ({m.slot_count})
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="file-actions">
                  <button className="btn btn-sm" onClick={() => setEditingPrinter(p)}>
                    Edit
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => setDeletingId(p.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(addingNew || editingPrinter) && (
        <PrinterForm
          printer={editingPrinter}
          onSaved={handleSaved}
          onCancel={() => { setAddingNew(false); setEditingPrinter(null); }}
        />
      )}

      {deletingId && (
        <ConfirmDialog
          message={`Delete "${printers.find(p => p.id === deletingId)?.name}"?`}
          onConfirm={() => handleDelete(deletingId)}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </div>
  );
}
