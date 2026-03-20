import { useState, useEffect, useMemo } from 'react';
import TemplateCard from '../components/templates/TemplateCard';
import CreateTemplateModal from '../components/templates/CreateTemplateModal';
import TemplatePreviewModal from '../components/templates/TemplatePreviewModal';
import ViewToggle from '../components/common/ViewToggle';
import FolderCard from '../components/files/FolderCard';
import { getFilaments } from '../api/spoolman';
import { useFolders } from '../hooks/useFolders';

export default function TemplatesPage() {
    const [templates, setTemplates] = useState([]);
    const [filaments, setFilaments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const { folders, loading: foldersLoading, error: foldersError, refresh: refreshFolders, createFolder, renameFolder, deleteFolder, moveFile, moveFolder } = useFolders('template', '/api/templates');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [previewTemplate, setPreviewTemplate] = useState(null);

    const [currentFolderId, setCurrentFolderId] = useState(null);
    const [breadcrumb, setBreadcrumb] = useState([{ id: null, name: 'Root' }]);

    const [viewMode, setViewMode] = useState(() => localStorage.getItem('marathon_template_view') || 'grid-large');
    const [sortBy, setSortBy] = useState('date');

    const updateViewMode = (mode) => {
        setViewMode(mode);
        localStorage.setItem('marathon_template_view', mode);
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const [templatesRes, filamentsData] = await Promise.all([
                fetch('/api/templates').then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to fetch templates'))),
                getFilaments().catch(() => []) // fail gracefully if Spoolman is down
            ]);
            setTemplates(templatesRes);
            setFilaments(filamentsData);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleEdit = (template) => {
        setEditingTemplate(template);
        setIsModalOpen(true);
    };

    const handleDelete = async (templateId) => {
        if (!confirm('Are you sure you want to delete this template? All copied plate files will be removed.')) return;
        try {
            const res = await fetch(`/api/templates/${templateId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete template');
            fetchData();
        } catch (err) {
            alert(err.message);
        }
    };

    const openNewModal = () => {
        setEditingTemplate(null);
        setIsModalOpen(true);
    };

    const closeModal = (wasSaved) => {
        setIsModalOpen(false);
        setEditingTemplate(null);
        if (wasSaved) fetchData();
    };

    const currentFolders = useMemo(() => {
        return folders.filter(f => f.parent_id === currentFolderId);
    }, [folders, currentFolderId]);

    const currentTemplates = useMemo(() => {
        return templates.filter(t => t.folder_id === currentFolderId);
    }, [templates, currentFolderId]);

    const sortedTemplates = [...currentTemplates].sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

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
        if (confirm(`Delete folder "${folder.name}" and ALL its subfolders? Templates inside will be moved to root.`)) {
            await deleteFolder(folder.id);
            fetchData();
        }
    };

    const handleDropItem = async (item, destinationFolderId) => {
        if (item.type === 'template') {
            await moveFile(item.id, destinationFolderId);
            fetchData();
        } else if (item.type === 'folder') {
            await moveFolder(item.id, destinationFolderId);
        }
    };

    const handleBackToRootDrop = async (e) => {
        e.preventDefault();
        if (currentFolderId === null) return;

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
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '24px' }}>

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
                                Drop items here to move them to root
                            </span>
                        )}
                    </div>

                    <select
                        className="input"
                        style={{ height: '40px', minWidth: '140px' }}
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                    >
                        <option value="date">Sort by Date</option>
                        <option value="name">Sort by Name</option>
                    </select>

                    <ViewToggle viewMode={viewMode} onChange={updateViewMode} />

                    <button className="btn btn-surface2" style={{ padding: '8px 16px', height: '40px', background: 'var(--surface2)', border: '1px solid var(--border)', whiteSpace: 'nowrap' }} onClick={handleNewFolder}>
                        New Folder
                    </button>
                    <button className="btn btn-primary" style={{ padding: '8px 16px', height: '40px', whiteSpace: 'nowrap' }} onClick={openNewModal}>
                        New Template
                    </button>
                </div>

                {(loading || foldersLoading) ? (
                    <div className="loading">Loading templates...</div>
                ) : (error || foldersError) ? (
                    <div className="error">{error || foldersError}</div>
                ) : (
                    <div className="folder-contents-area">
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

                        {currentFolders.length > 0 && currentTemplates.length > 0 && (
                            <hr style={{ borderColor: 'var(--border)', margin: '24px 0' }} />
                        )}

                        {currentTemplates.length > 0 && (
                            viewMode === 'list' ? (
                                <div>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid var(--border)', borderTop: '1px solid var(--border)', textAlign: 'left' }}>
                                                <th style={{ padding: '16px 8px', textTransform: 'uppercase', fontSize: '11px', fontWeight: 600, letterSpacing: '.05em', color: 'var(--text-muted)' }}>Template</th>
                                                <th style={{ padding: '16px 8px', textTransform: 'uppercase', fontSize: '11px', fontWeight: 600, letterSpacing: '.05em', color: 'var(--text-muted)' }}>Plates</th>
                                                <th style={{ padding: '16px 8px', textTransform: 'uppercase', fontSize: '11px', fontWeight: 600, letterSpacing: '.05em', color: 'var(--text-muted)' }}>Filaments</th>
                                                <th style={{ padding: '16px 8px', textTransform: 'uppercase', fontSize: '11px', fontWeight: 600, letterSpacing: '.05em', color: 'var(--text-muted)' }}>Printers</th>
                                                <th style={{ padding: '16px 8px', textTransform: 'uppercase', fontSize: '11px', fontWeight: 600, letterSpacing: '.05em', color: 'var(--text-muted)' }}>Date</th>
                                                <th style={{ padding: '16px 8px', textTransform: 'uppercase', fontSize: '11px', fontWeight: 600, letterSpacing: '.05em', color: 'var(--text-muted)' }}>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sortedTemplates.map(t => {
                                                const printerModels = [...new Set(t.plates?.map(p => p.sliced_for).filter(Boolean))];
                                                return (
                                                    <tr
                                                        key={t.id}
                                                        onClick={() => setPreviewTemplate(t)}
                                                        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background-color 0.2s' }}
                                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface)'}
                                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                                        draggable
                                                        onDragStart={(e) => {
                                                            const data = { type: 'template', id: t.id };
                                                            e.dataTransfer.setData('application/json', JSON.stringify(data));
                                                        }}
                                                    >
                                                        <td style={{ padding: '16px 8px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                                {t.thumbnail_path ? (
                                                                    <img src={`/api/templates/thumb/${t.thumbnail_path.split('/').pop()}`} alt="preview" style={{ width: '32px', height: '32px', borderRadius: '4px', objectFit: 'cover' }} />
                                                                ) : (
                                                                    <div style={{ width: '32px', height: '32px', borderRadius: '4px', backgroundColor: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                        <span style={{ fontSize: '16px' }}>📋</span>
                                                                    </div>
                                                                )}
                                                                <span style={{ fontWeight: 600, fontSize: '14px' }}>{t.name}</span>
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '16px 8px', fontWeight: 500, fontSize: '14px' }}>{t.plate_count || 0} Plates</td>
                                                        <td style={{ padding: '16px 8px' }}>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: 0 }}>
                                                                {t.color_slots?.map(slot => {
                                                                    const filament = filaments?.find(f => f.id === slot.pref_filament_id);
                                                                    let hexValue = 'var(--surface2)';
                                                                    if (slot.pref_hex) hexValue = slot.pref_hex.startsWith('#') ? slot.pref_hex : `#${slot.pref_hex}`;
                                                                    else if (filament && filament.color_hex) hexValue = filament.color_hex.startsWith('#') ? filament.color_hex : `#${filament.color_hex}`;
                                                                    return (
                                                                        <div key={slot.id} title={slot.label || slot.slot_key} style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: hexValue, border: '1px solid rgba(255,255,255,0.1)' }} />
                                                                    );
                                                                })}
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '16px 8px', fontWeight: 600, fontSize: '14px' }}>
                                                            {printerModels.length > 0 ? printerModels.join(', ') : <span className="text-muted">—</span>}
                                                        </td>
                                                        <td style={{ padding: '16px 8px', fontSize: '13px', color: 'var(--text-muted)' }}>
                                                            {new Date(t.created_at).toLocaleString()}
                                                        </td>
                                                        <td style={{ padding: '16px 8px' }}>
                                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                                <button className="btn btn-sm btn-outline" style={{ background: 'var(--surface2)', border: 'none' }} onClick={(e) => { e.stopPropagation(); handleEdit(t); }}>Edit</button>
                                                                <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}>Delete</button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className={`file-grid ${viewMode === 'grid-large' ? 'large' : 'small'}`}>
                                    {sortedTemplates.map(t => (
                                        <div
                                            key={t.id}
                                            draggable
                                            onDragStart={(e) => {
                                                const data = { type: 'template', id: t.id };
                                                e.dataTransfer.setData('application/json', JSON.stringify(data));
                                            }}
                                        >
                                            <TemplateCard
                                                template={t}
                                                filaments={filaments}
                                                onEdit={() => handleEdit(t)}
                                                onDelete={() => handleDelete(t.id)}
                                                onClick={() => setPreviewTemplate(t)}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )
                        )}

                        {currentFolders.length === 0 && currentTemplates.length === 0 && (
                            <div className="empty-state">
                                <p>{currentFolderId ? 'This folder is empty.' : 'No templates found.'}</p>
                                {!currentFolderId && <p style={{ fontSize: '13px', marginTop: '8px' }}>Create one to get started.</p>}
                            </div>
                        )}
                    </div>
                )}
            </section>

            {isModalOpen && (
                <CreateTemplateModal
                    onClose={() => closeModal(false)}
                    onSave={() => closeModal(true)}
                    existingTemplate={editingTemplate}
                    filaments={filaments}
                />
            )}

            {previewTemplate && (
                <TemplatePreviewModal
                    template={previewTemplate}
                    filaments={filaments}
                    onClose={() => setPreviewTemplate(null)}
                    onEdit={() => handleEdit(previewTemplate)}
                />
            )}
        </div>
    );
}
