import { useState, useEffect } from 'react';
import { deleteFile } from '../../api/files';
import ConfirmDialog from '../common/ConfirmDialog';
import SendToPrinterModal from './SendToPrinterModal';
import { useRightPanel } from '../../contexts/RightPanelContext';

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString();
}

export default function FileList({ files, onDeleted, viewMode = 'list' }) {
  const [deletingId, setDeletingId] = useState(null);
  const [sendingFile, setSendingFile] = useState(null);
  const [fileStats, setFileStats] = useState({});
  const { selected, setSelected } = useRightPanel() || {};

  function selectFile(file) {
    setSelected?.({ file, stats: fileStats[file.filename] || null });
  }

  useEffect(() => {
    fetch('/api/stats/files')
      .then(r => r.json())
      .then(data => setFileStats(data))
      .catch(err => console.error('Failed to load file stats:', err));
  }, []);

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

      {viewMode === 'list' ? (
        <div className="file-table-wrap">
          <table className="file-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Target Printer</th>
                <th>Print Size</th>
                <th>File Size</th>
                <th>Source</th>
                <th>Uploaded</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {files.map(file => (
                <tr
                  key={file.id}
                  onClick={() => selectFile(file)}
                  className={`file-row-clickable${selected?.file?.id === file.id ? ' file-row-selected' : ''}`}
                  draggable="true"
                  onDragStart={(e) => {
                    const data = { type: 'file', id: file.id };
                    e.dataTransfer.setData('application/json', JSON.stringify(data));
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                >
                  <td>
                    <div className="file-name-cell">
                      {file.has_thumbnail ? (
                        <img src={`/api/files/thumb/${file.filename}`} alt="preview" className="file-list-thumb" />
                      ) : (
                        <div className="file-list-thumb" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ color: '#666', fontSize: '10px' }}>N/A</span>
                        </div>
                      )}
                      <span className="file-name">{file.display_name}</span>
                    </div>
                  </td>
                  <td>
                    {file.sliced_for ? (
                      <span className="badge badge-info" title="Sliced for this printer model">
                        {file.sliced_for}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                    {fileStats[file.filename] && (
                      <span className="badge badge-success" style={{ marginLeft: '4px' }} title={`Completed ${fileStats[file.filename].print_count} times`}>
                        ★ {fileStats[file.filename].print_count}
                      </span>
                    )}
                  </td>
                  <td>
                    {file.max_x != null && file.min_x != null ? (
                      <div className="print-dimensions">
                        <span>
                          {(file.max_x - file.min_x).toFixed(1)} × {(file.max_y - file.min_y).toFixed(1)} × {(file.max_z - (file.min_z || 0)).toFixed(1)}mm
                        </span>
                        {file.filament_type && (
                          <span className={`badge badge-filament filament-${file.filament_type}`}>{file.filament_type}</span>
                        )}
                      </div>
                    ) : file.max_z != null ? (
                      <div className="print-dimensions">
                        <span>H: {(file.max_z - (file.min_z || 0)).toFixed(1)}mm</span>
                        {file.filament_type && (
                          <span className={`badge badge-filament filament-${file.filament_type}`}>{file.filament_type}</span>
                        )}
                      </div>
                    ) : file.filament_type ? (
                      <div className="print-dimensions">
                        {file.filament_type && (
                          <span className={`badge badge-filament filament-${file.filament_type}`}>{file.filament_type}</span>
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
                  <td>
                    <div className="file-actions">
                      <button className="btn btn-sm btn-primary" onClick={() => setSendingFile(file)}>
                        Send
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => setDeletingId(file.id)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={`file-grid ${viewMode === 'grid-small' ? 'small' : 'large'}`}>
          {files.map(file => (
            <div
              className={`file-card${selected?.file?.id === file.id ? ' file-card-selected' : ''}`}
              key={file.id}
              onClick={() => selectFile(file)}
              draggable="true"
              onDragStart={(e) => {
                const data = { type: 'file', id: file.id };
                e.dataTransfer.setData('application/json', JSON.stringify(data));
                e.dataTransfer.effectAllowed = 'move';
              }}
            >
              <div className="file-card-thumb-wrap">
                {file.has_thumbnail ? (
                  <img src={`/api/files/thumb/${file.filename}`} alt="preview" className="file-card-thumb" loading="lazy" />
                ) : (
                  <div className="file-card-placeholder">No Preview</div>
                )}
              </div>
              <div className="file-card-body">
                <div className="file-card-title" title={file.display_name}>{file.display_name}</div>
                <div className="file-card-metrics">
                  <span>{formatBytes(file.size_bytes)} • {formatDate(file.created_at)}</span>
                  {file.max_x != null && file.min_x != null ? (
                    <span>{(file.max_x - file.min_x).toFixed(1)} × {(file.max_y - file.min_y).toFixed(1)} × {(file.max_z - (file.min_z || 0)).toFixed(1)}mm</span>
                  ) : file.max_z != null ? (
                    <span>H: {(file.max_z - (file.min_z || 0)).toFixed(1)}mm</span>
                  ) : null}
                </div>
                <div className="file-card-badges">
                  {file.filament_type && (
                    <span className={`badge badge-filament filament-${file.filament_type}`}>{file.filament_type}</span>
                  )}
                  {file.sliced_for && (
                    <span className="badge badge-info" title="Sliced for this printer model">{file.sliced_for}</span>
                  )}
                </div>
              </div>
              <div className="file-card-footer">
                <button className="btn btn-sm btn-primary" onClick={() => setSendingFile(file)}>Send</button>
                <button className="btn btn-sm btn-outline btn-danger" onClick={() => setDeletingId(file.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

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
