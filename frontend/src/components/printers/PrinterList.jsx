import { useState } from 'react';
import { deletePrinter } from '../../api/printers';
import ConfirmDialog from '../common/ConfirmDialog';
import PrinterForm from './PrinterForm';

export default function PrinterList({ printers, onRefresh }) {
  const [editingPrinter, setEditingPrinter] = useState(null);
  const [addingNew, setAddingNew] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  async function handleDelete(id) {
    try {
      await deletePrinter(id);
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
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {printers.map(p => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.host}:{p.port}</td>
                <td>
                  {p.firmware_type === 'octoprint' && 'OctoPrint'}
                  {p.firmware_type === 'duet' && 'Duet/RRF'}
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
