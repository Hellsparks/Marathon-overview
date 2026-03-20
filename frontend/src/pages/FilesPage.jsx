import { useState, useMemo, useEffect } from 'react';
import { useFiles } from '../hooks/useFiles';
import { useFolders } from '../hooks/useFolders';
import FileList from '../components/files/FileList';
import FolderCard from '../components/files/FolderCard';
import ViewToggle from '../components/common/ViewToggle';

export default function FilesPage() {
  const { files, loading: filesLoading, error: filesError, refresh: refreshFiles } = useFiles();
  const { folders, loading: foldersLoading, error: foldersError, refresh: refreshFolders, createFolder, renameFolder, deleteFolder, moveFile, moveFolder } = useFolders();

  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [breadcrumb, setBreadcrumb] = useState([{ id: null, name: 'Root' }]);

  const [viewMode, setViewMode] = useState(() => localStorage.getItem('marathon_file_view') || 'list');

  useEffect(() => {
    const handleFilesUpdated = () => {
      refreshFiles();
      refreshFolders();
    };
    window.addEventListener('files_updated', handleFilesUpdated);
    return () => window.removeEventListener('files_updated', handleFilesUpdated);
  }, [refreshFiles, refreshFolders]);

  const updateViewMode = (mode) => {
    setViewMode(mode);
    localStorage.setItem('marathon_file_view', mode);
  };

  const currentFolders = useMemo(() => {
    return folders.filter(f => f.parent_id === currentFolderId);
  }, [folders, currentFolderId]);

  const currentFiles = useMemo(() => {
    return files.filter(f => f.folder_id === currentFolderId);
  }, [files, currentFolderId]);

  const handleNavigateFolder = (folder) => {
    setCurrentFolderId(folder.id);
    setBreadcrumb(prev => [...prev, { id: folder.id, name: folder.name }]);
  };

  const handleNavigateBreadcrumb = (index) => {
    const target = breadcrumb[index];
    setCurrentFolderId(target.id);
    setBreadcrumb(prev => prev.slice(0, index + 1));
  };

  const handleNewFolder = async () => {
    const name = prompt('Folder Name:');
    if (name) {
      await createFolder(name, currentFolderId);
    }
  };

  const handleRenameFolder = async (folder) => {
    const name = prompt('New name:', folder.name);
    if (name && name !== folder.name) {
      await renameFolder(folder.id, name);
    }
  };

  const handleDeleteFolder = async (folder) => {
    if (confirm(`Delete folder "${folder.name}" and ALL its subfolders? Files inside will be moved to root.`)) {
      await deleteFolder(folder.id);
      refreshFiles();
    }
  };

  const handleDropItem = async (item, destinationFolderId) => {
    if (item.type === 'file') {
      await moveFile(item.id, destinationFolderId);
      refreshFiles();
      refreshFolders();
    } else if (item.type === 'folder') {
      await moveFolder(item.id, destinationFolderId);
    }
  };

  const handleBackToRootDrop = async (e) => {
    e.preventDefault();
    if (currentFolderId === null) return; // already in root

    try {
      const dataStr = e.dataTransfer.getData('application/json');
      if (dataStr) {
        const item = JSON.parse(dataStr);
        handleDropItem(item, null);
      }
    } catch (err) { }
  };

  return (
    <div className="page">
      <section className="page-section" style={{ paddingTop: 0 }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
          {/* Breadcrumb Navigation */}
          <div
            className="breadcrumb-bar"
            style={{ flex: 1, display: 'flex', gap: '8px', padding: '8px 12px', background: 'var(--surface2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleBackToRootDrop}
          >
            {breadcrumb.map((crumb, idx) => {
              const isActive = idx === breadcrumb.length - 1;
              return (
                <span key={crumb.id || 'root'} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    className="btn btn-sm"
                    style={{
                      background: isActive ? 'color-mix(in srgb, var(--primary) 15%, transparent)' : 'var(--surface)',
                      color: isActive ? 'var(--primary)' : 'var(--text)',
                      border: '1px solid',
                      borderColor: isActive ? 'color-mix(in srgb, var(--primary) 30%, transparent)' : 'var(--border)',
                      borderRadius: '16px',
                      padding: '4px 14px',
                      fontWeight: isActive ? 600 : 500,
                      boxShadow: isActive ? 'none' : '0 1px 2px rgba(0,0,0,0.05)',
                      transition: 'all 0.15s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.borderColor = 'var(--primary)';
                        e.currentTarget.style.color = 'var(--primary)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.borderColor = 'var(--border)';
                        e.currentTarget.style.color = 'var(--text)';
                      }
                    }}
                    onClick={() => handleNavigateBreadcrumb(idx)}
                  >
                    {idx === 0 ? 'Root' : crumb.name}
                  </button>
                  {idx < breadcrumb.length - 1 && <span style={{ color: 'var(--text-muted)', fontSize: '18px', padding: '0 4px', lineHeight: 1 }}>›</span>}
                </span>
              );
            })}
            {currentFolderId !== null && (
              <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', alignSelf: 'center' }}>
                Drop files here to move them to root
              </span>
            )}
          </div>

          <button className="btn btn-primary" style={{ padding: '8px 16px', height: '40px' }} onClick={handleNewFolder}>
            + New Folder
          </button>

          <ViewToggle viewMode={viewMode} onChange={updateViewMode} />
        </div>

        {(filesLoading || foldersLoading) ? (
          <div className="loading">Loading contents…</div>
        ) : (filesError || foldersError) ? (
          <div className="error">Error loading contents.</div>
        ) : (
          <div className="folder-contents-area">
            {/* Folders List */}
            {currentFolders.length > 0 && (
              <div className="file-grid large" style={{ marginBottom: '24px' }}>
                {currentFolders.map(folder => (
                  <FolderCard
                    key={folder.id}
                    folder={folder}
                    onDoubleClick={handleNavigateFolder}
                    onRename={handleRenameFolder}
                    onDelete={handleDeleteFolder}
                    onDropItem={handleDropItem}
                  />
                ))}
              </div>
            )}

            {currentFolders.length > 0 && currentFiles.length > 0 && (
              <hr style={{ borderColor: 'var(--border)', margin: '24px 0' }} />
            )}

            {/* Files List */}
            <FileList files={currentFiles} onDeleted={() => { refreshFiles(); refreshFolders(); }} viewMode={viewMode} />

            {currentFolders.length === 0 && currentFiles.length === 0 && (
              <p className="empty-state">This folder is empty.</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
