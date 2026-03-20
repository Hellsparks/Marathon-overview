import { useState, useEffect, useMemo } from 'react';
import ProjectCard from '../components/projects/ProjectCard';
import CreateProjectModal from '../components/projects/CreateProjectModal';
import ProjectDetailView from '../components/projects/ProjectDetailView';
import ViewToggle from '../components/common/ViewToggle';
import FolderCard from '../components/files/FolderCard';
import { getFilaments } from '../api/spoolman';
import { useFolders } from '../hooks/useFolders';

export default function ProjectsPage() {
    const [projects, setProjects] = useState([]);
    const [filaments, setFilaments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const { folders, loading: foldersLoading, error: foldersError, refresh: refreshFolders, createFolder, renameFolder, deleteFolder, moveFile, moveFolder } = useFolders('project', '/api/projects');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedProjectId, setSelectedProjectId] = useState(null);

    const [currentFolderId, setCurrentFolderId] = useState(null);
    const [breadcrumb, setBreadcrumb] = useState([{ id: null, name: 'Root' }]);

    const [viewMode, setViewMode] = useState(() => localStorage.getItem('marathon_project_view') || 'grid-large');
    const [sortBy, setSortBy] = useState('date');

    const updateViewMode = (mode) => {
        setViewMode(mode);
        localStorage.setItem('marathon_project_view', mode);
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const [projectsRes, filamentsData] = await Promise.all([
                fetch('/api/projects?status=active').then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to fetch projects'))),
                getFilaments().catch(() => [])
            ]);
            setProjects(projectsRes);
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

    const handleDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this project?')) return;
        try {
            const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete project');
            fetchData();
        } catch (err) {
            alert(err.message);
        }
    };

    const closeModal = (wasSaved) => {
        setIsModalOpen(false);
        if (wasSaved) fetchData();
    };

    const currentFolders = useMemo(() => {
        return folders.filter(f => f.parent_id === currentFolderId);
    }, [folders, currentFolderId]);

    const currentProjects = useMemo(() => {
        return projects.filter(p => p.folder_id === currentFolderId);
    }, [projects, currentFolderId]);

    const sortedProjects = [...currentProjects].sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'progress') {
            const progA = a.total_plates > 0 ? a.completed_plates / a.total_plates : 0;
            const progB = b.total_plates > 0 ? b.completed_plates / b.total_plates : 0;
            return progB - progA;
        }
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
        if (confirm(`Delete folder "${folder.name}" and ALL its subfolders? Projects inside will be moved to root.`)) {
            await deleteFolder(folder.id);
            fetchData();
        }
    };

    const handleDropItem = async (item, destinationFolderId) => {
        if (item.type === 'project') {
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

    if (selectedProjectId) {
        return (
            <ProjectDetailView
                projectId={selectedProjectId}
                onBack={() => {
                    setSelectedProjectId(null);
                    fetchData();
                }}
                filaments={filaments}
            />
        );
    }

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
                        <option value="progress">Sort by Progress</option>
                    </select>

                    <ViewToggle viewMode={viewMode} onChange={updateViewMode} />

                    <button className="btn btn-surface2" style={{ padding: '8px 16px', height: '40px', background: 'var(--surface2)', border: '1px solid var(--border)', whiteSpace: 'nowrap' }} onClick={handleNewFolder}>
                        New Folder
                    </button>
                    <button className="btn btn-primary" style={{ padding: '8px 16px', height: '40px', whiteSpace: 'nowrap' }} onClick={() => setIsModalOpen(true)}>
                        New Project
                    </button>
                </div>

                {(loading || foldersLoading) ? (
                    <div className="loading">Loading projects...</div>
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

                        {currentFolders.length > 0 && currentProjects.length > 0 && (
                            <hr style={{ borderColor: 'var(--border)', margin: '24px 0' }} />
                        )}

                        {currentProjects.length > 0 && (
                            viewMode === 'list' ? (
                                <div>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid var(--border)', borderTop: '1px solid var(--border)', textAlign: 'left' }}>
                                                <th style={{ padding: '16px 8px', textTransform: 'uppercase', fontSize: '11px', fontWeight: 600, letterSpacing: '.05em', color: 'var(--text-muted)' }}>Project</th>
                                                <th style={{ padding: '16px 8px', textTransform: 'uppercase', fontSize: '11px', fontWeight: 600, letterSpacing: '.05em', color: 'var(--text-muted)' }}>Progress</th>
                                                <th style={{ padding: '16px 8px', textTransform: 'uppercase', fontSize: '11px', fontWeight: 600, letterSpacing: '.05em', color: 'var(--text-muted)' }}>Filaments</th>
                                                <th style={{ padding: '16px 8px', textTransform: 'uppercase', fontSize: '11px', fontWeight: 600, letterSpacing: '.05em', color: 'var(--text-muted)' }}>Date</th>
                                                <th style={{ padding: '16px 8px', textTransform: 'uppercase', fontSize: '11px', fontWeight: 600, letterSpacing: '.05em', color: 'var(--text-muted)' }}>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sortedProjects.map(p => {
                                                const progress = p.total_plates > 0 ? Math.round((p.completed_plates / p.total_plates) * 100) : 0;
                                                return (
                                                    <tr
                                                        key={p.id}
                                                        onClick={() => setSelectedProjectId(p.id)}
                                                        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background-color 0.2s' }}
                                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface)'}
                                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                                        draggable
                                                        onDragStart={(e) => {
                                                            const data = { type: 'project', id: p.id };
                                                            e.dataTransfer.setData('application/json', JSON.stringify(data));
                                                        }}
                                                    >
                                                        <td style={{ padding: '16px 8px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                                {p.thumbnail_path ? (
                                                                    <img src={`/api/templates/thumb/${p.thumbnail_path.split('/').pop()}`} alt="preview" style={{ width: '32px', height: '32px', borderRadius: '4px', objectFit: 'cover' }} />
                                                                ) : (
                                                                    <div style={{ width: '32px', height: '32px', borderRadius: '4px', backgroundColor: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                        <span style={{ fontSize: '16px' }}>📦</span>
                                                                    </div>
                                                                )}
                                                                <span style={{ fontWeight: 600, fontSize: '14px' }}>{p.name}</span>
                                                                {p.template_id && (
                                                                    <span className="badge badge-outline" style={{ opacity: 0.6, marginLeft: '8px' }}>Template</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '16px 8px' }}>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                <span style={{ fontSize: '13px', fontWeight: 500 }}>{p.completed_plates} / {p.total_plates} Plates Done</span>
                                                                <div className="progress-bar-wrap" style={{ marginTop: 0, width: '100px' }}>
                                                                    <div className="progress-bar-track" style={{ height: '4px' }}>
                                                                        <div className="progress-bar-fill" style={{ width: `${progress}%`, backgroundColor: 'var(--primary)' }} />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '16px 8px' }}>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: 0 }}>
                                                                {p.assignments?.map((a, i) => (
                                                                    <div
                                                                        key={i}
                                                                        title={`${a.material || 'Unknown'} - ${a.color_hex || '888888'}`}
                                                                        style={{
                                                                            width: '12px', height: '12px', borderRadius: '50%',
                                                                            backgroundColor: (a.color_hex && a.color_hex.startsWith('#')) ? a.color_hex : `#${a.color_hex || '888888'}`,
                                                                            border: '1px solid rgba(255,255,255,0.1)'
                                                                        }}
                                                                    />
                                                                ))}
                                                                {!p.assignments?.length && <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--surface2)', border: '1px solid rgba(255,255,255,0.1)' }} />}
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '16px 8px', fontSize: '13px', color: 'var(--text-muted)' }}>
                                                            {new Date(p.created_at).toLocaleString()}
                                                        </td>
                                                        <td style={{ padding: '16px 8px' }}>
                                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                                <button
                                                                    className="btn btn-sm btn-danger"
                                                                    onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                                                                >
                                                                    Delete
                                                                </button>
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
                                    {sortedProjects.map(p => (
                                        <div
                                            key={p.id}
                                            draggable
                                            onDragStart={(e) => {
                                                const data = { type: 'project', id: p.id };
                                                e.dataTransfer.setData('application/json', JSON.stringify(data));
                                            }}
                                        >
                                            <ProjectCard
                                                project={p}
                                                onClick={() => setSelectedProjectId(p.id)}
                                                onDelete={() => handleDelete(p.id)}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )
                        )}

                        {currentFolders.length === 0 && currentProjects.length === 0 && (
                            <div className="empty-state">
                                <p>{currentFolderId ? 'This folder is empty.' : 'No active projects.'}</p>
                                {!currentFolderId && <p style={{ fontSize: '13px', marginTop: '8px' }}>Create one from a template or by selecting G-code files.</p>}
                            </div>
                        )}
                    </div>
                )}
            </section>

            {isModalOpen && (
                <CreateProjectModal
                    onClose={() => closeModal(false)}
                    onSave={() => closeModal(true)}
                    filaments={filaments}
                />
            )}
        </div>
    );
}
