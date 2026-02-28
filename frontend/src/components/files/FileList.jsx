import { useState } from 'react';
import { deleteFile } from '../../api/files';
import ConfirmDialog from '../common/ConfirmDialog';
import SendToPrinterModal from './SendToPrinterModal';

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString();
}

export default function FileList({ files, onDeleted }) {
  const [deletingId, setDeletingId] = useState(null);
  const [sendingFile, setSendingFile] = useState(null);

  async function handleDelete(file) {
    try {
      await deleteFile(file.id);
      onDeleted?.();
    } catch (e) {
      alert(e.message);
    } finally {
      setDeletingId(null);
    }
  }

  if (!files.length) {
    return <p className="empty-state">No G-code files uploaded yet.</p>;
  }

  return (
    <>
      <div className="file-table-wrap">
        <table className="file-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Print Size</th>
              <th>File Size</th>
              <th>Source</th>
              <th>Uploaded</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {files.map(file => (
              <tr key={file.id}>
                <td className="file-name">{file.display_name}</td>
                <td>
                  {file.max_x != null && file.min_x != null ? (
                    <div className="print-dimensions">
                      <span>
                        {(file.max_x - file.min_x).toFixed(1)} × {(file.max_y - file.min_y).toFixed(1)} × {(file.max_z - (file.min_z || 0)).toFixed(1)}mm
                      </span>
                      {file.filament_type && (
                        <span className={`badge badge-filament filament-${file.filament_type}`}>{file.filament_type}</span>
                      )}
                      {file.sliced_for && (
                        <span className="badge badge-info" style={{ marginLeft: '4px' }} title="Sliced for this printer model">
                          {file.sliced_for}
                        </span>
                      )}
                    </div>
                  ) : file.max_z != null ? (
                    <div className="print-dimensions">
                      <span>H: {(file.max_z - (file.min_z || 0)).toFixed(1)}mm</span>
                      {file.filament_type && (
                        <span className={`badge badge-filament filament-${file.filament_type}`}>{file.filament_type}</span>
                      )}
                      {file.sliced_for && (
                        <span className="badge badge-info" style={{ marginLeft: '4px' }} title="Sliced for this printer model">
                          {file.sliced_for}
                        </span>
                      )}
                    </div>
                  ) : file.filament_type || file.sliced_for ? (
                    <div className="print-dimensions">
                      {file.filament_type && (
                        <span className={`badge badge-filament filament-${file.filament_type}`}>{file.filament_type}</span>
                      )}
                      {file.sliced_for && (
                        <span className="badge badge-info" style={{ marginLeft: '4px' }} title="Sliced for this printer model">
                          {file.sliced_for}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td>{formatBytes(file.size_bytes)}</td>
                <td>
                  <span className="source-badge">{file.slicer_name || file.upload_source}</span>
                </td>
                <td>{formatDate(file.created_at)}</td>
                <td className="file-actions">
                  <button className="btn btn-sm btn-primary" onClick={() => setSendingFile(file)}>
                    Send to Printer
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => setDeletingId(file.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {deletingId && (
        <ConfirmDialog
          message={`Delete "${files.find(f => f.id === deletingId)?.display_name}"?`}
          onConfirm={() => handleDelete(files.find(f => f.id === deletingId))}
          onCancel={() => setDeletingId(null)}
        />
      )}

      {sendingFile && (
        <SendToPrinterModal
          file={sendingFile}
          onClose={() => setSendingFile(null)}
        />
      )}
    </>
  );
}
