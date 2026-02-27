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
              <th>Port</th>
              <th>API Key</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {printers.map(p => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.host}</td>
                <td>{p.port}</td>
                <td>{p.api_key ? '••••••' : '—'}</td>
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
