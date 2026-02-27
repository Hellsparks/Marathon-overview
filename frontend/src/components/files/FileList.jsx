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
              <th>Size</th>
              <th>Source</th>
              <th>Uploaded</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {files.map(file => (
              <tr key={file.id}>
                <td className="file-name">{file.display_name}</td>
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
