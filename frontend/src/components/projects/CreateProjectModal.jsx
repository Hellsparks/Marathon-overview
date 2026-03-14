import { useState, useEffect } from 'react';
import { useFiles } from '../../hooks/useFiles';
import { useFolders } from '../../hooks/useFolders';
import { getFilaments, getSpools } from '../../api/spoolman';

export default function CreateProjectModal({ onClose, onSave, filaments = [] }) {
    const [mode, setMode] = useState(null); // 'template' or 'files'
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);

    // Common State
    const [projectName, setProjectName] = useState('');
    const [dueDate, setDueDate] = useState('');

    // Spoolman Data
    const [spools, setSpools] = useState([]);

    // Template Flow State
    const [templates, setTemplates] = useState([]);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [assignments, setAssignments] = useState({}); // { slot_key: { spool_id, etc } }
    const [spoolSearch, setSpoolSearch] = useState('');

    // Files Flow State
    const [selectedFileIds, setSelectedFileIds] = useState([]);
    const { files } = useFiles();
    const { folders } = useFolders();
    const [currentFolderId, setCurrentFolderId] = useState(null);
    const [breadcrumb, setBreadcrumb] = useState([{ id: null, name: 'Root' }]);

    useEffect(() => {
        getSpools().then(setSpools).catch(e => console.error('Failed to fetch spools', e));

        if (mode === 'template') {
            fetch('/api/templates')
                .then(r => r.json())
                .then(data => setTemplates(data))
                .catch(err => console.error(err));
        }
    }, [mode]);

    const handleSelectTemplate = (tpl) => {
        setSelectedTemplate(tpl);
        setProjectName(`${tpl.name} - ${new Date().toLocaleDateString()}`);

        // Initialize assignments from template preferred filaments
        const initial = {};
        tpl.color_slots?.forEach(slot => {
            const prefFilament = filaments.find(f => f.id === slot.pref_filament_id);

            // Try to find a matching spool for this filament preference
            const matchingSpool = spools.find(s => s.filament?.id === slot.pref_filament_id && (s.remaining_weight || 0) > 0);

            initial[slot.slot_key] = {
                slot_key: slot.slot_key,
                spool_id: matchingSpool?.id || null,
                material: matchingSpool?.filament?.material || prefFilament?.material || '',
                color_hex: matchingSpool?.filament?.color_hex || slot.pref_hex || prefFilament?.color_hex || '#cccccc',
                vendor: matchingSpool?.filament?.vendor?.name || (typeof prefFilament?.vendor === 'string' ? prefFilament.vendor : prefFilament?.vendor?.name) || '',
                spool_name: matchingSpool?.filament?.name || matchingSpool?.name || ''
            };
        });
        setAssignments(initial);
        setStep(2);
    };

    const handleSpoolSelect = (slotKey, spoolId) => {
        if (!spoolId) {
            setAssignments(prev => ({
                ...prev,
                [slotKey]: {
                    ...prev[slotKey],
                    spool_id: null,
                    spool_name: '',
                    material: '',
                    vendor: '',
                    color_hex: '#cccccc'
                }
            }));
            return;
        }

        const spool = spools.find(s => s.id === parseInt(spoolId));
        if (!spool) return;

        setAssignments(prev => ({
            ...prev,
            [slotKey]: {
                ...prev[slotKey],
                spool_id: spool.id,
                material: spool.filament?.material || '',
                color_hex: spool.filament?.color_hex || '#cccccc',
                vendor: spool.filament?.vendor?.name || '',
                spool_name: spool.filament?.name || spool.name || `Spool #${spool.id}`
            }
        }));
    };

    const handleSubmit = async () => {
        if (!projectName) return alert('Project name is required');

        setLoading(true);
        try {
            const payload = {
                name: projectName,
                due_date: dueDate || null,
                template_id: selectedTemplate?.id || null,
                file_ids: mode === 'files' ? selectedFileIds : [],
                color_assignments: Object.values(assignments)
            };

            const res = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to create project');
            }

            onSave();
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    const renderModeSelection = () => (
        <div style={{ display: 'flex', gap: '20px', padding: '20px' }}>
            <button
                className="btn"
                style={{ flex: 1, height: '120px', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', justifyContent: 'center', background: 'var(--surface2)', fontSize: '16px' }}
                onClick={() => { setMode('template'); setStep(1); }}
            >
                <span style={{ fontSize: '32px' }}>📋</span>
                Start from Template
            </button>
            <button
                className="btn"
                style={{ flex: 1, height: '120px', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', justifyContent: 'center', background: 'var(--surface2)', fontSize: '16px' }}
                onClick={() => { setMode('files'); setStep(1); }}
            >
                <span style={{ fontSize: '32px' }}>📁</span>
                Create from G-code Files
            </button>
        </div>
    );

    const renderTemplateList = () => (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', maxHeight: '400px', overflowY: 'auto', padding: '4px' }}>
            {templates.map(tpl => (
                <div
                    key={tpl.id}
                    className="file-card template-card-clickable"
                    onClick={() => handleSelectTemplate(tpl)}
                    style={{ padding: '8px' }}
                >
                    <div style={{ fontWeight: 600 }}>{tpl.name}</div>
                    <div style={{ fontSize: '12px', opacity: 0.7 }}>{tpl.plate_count} Plates</div>
                </div>
            ))}
            {templates.length === 0 && <p className="empty-state">No templates found.</p>}
        </div>
    );

    const renderAssignmentStep = () => {
        const filteredSpools = spools.filter(s => {
            const search = spoolSearch.toLowerCase();
            return (s.name?.toLowerCase().includes(search) ||
                s.filament?.material?.toLowerCase().includes(search) ||
                s.filament?.vendor?.name?.toLowerCase().includes(search));
        });

        return (
            <div style={{ display: 'flex', flexDirection: 'row', gap: '20px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 600 }}>Project Name</label>
                        <input
                            type="text"
                            value={projectName}
                            onChange={e => setProjectName(e.target.value)}
                            style={{ width: '100%', padding: '10px', marginTop: '4px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
                        />
                    </div>

                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 600 }}>Due Date (Optional)</label>
                        <input
                            type="date"
                            className="input"
                            value={dueDate}
                            onChange={e => setDueDate(e.target.value)}
                            style={{ marginTop: '4px' }}
                        />
                    </div>

                    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', background: 'var(--surface)' }}>
                        <div style={{ padding: '8px 12px', background: 'var(--surface2)', fontSize: '13px', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>
                            Color Slots ({selectedTemplate?.name})
                        </div>
                        <div style={{ maxHeight: '400px', overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {selectedTemplate?.color_slots?.map(slot => {
                                const assignment = assignments[slot.slot_key];
                                return (
                                    <div
                                        key={slot.slot_key}
                                        style={{
                                            display: 'flex',
                                            gap: '12px',
                                            alignItems: 'center',
                                            background: 'var(--surface2)',
                                            padding: '10px',
                                            borderRadius: '12px',
                                            border: '2px dashed transparent',
                                            transition: 'all 0.2s'
                                        }}
                                        onDragOver={e => {
                                            e.preventDefault();
                                            e.currentTarget.style.borderColor = 'var(--primary)';
                                            e.currentTarget.style.background = 'var(--surface3)';
                                        }}
                                        onDragLeave={e => {
                                            e.currentTarget.style.borderColor = 'transparent';
                                            e.currentTarget.style.background = 'var(--surface2)';
                                        }}
                                        onDrop={e => {
                                            e.preventDefault();
                                            const spoolId = e.dataTransfer.getData('spoolId');
                                            handleSpoolSelect(slot.slot_key, spoolId);
                                            e.currentTarget.style.borderColor = 'transparent';
                                            e.currentTarget.style.background = 'var(--surface2)';
                                        }}
                                    >
                                        <div style={{
                                            width: '32px',
                                            height: '32px',
                                            borderRadius: '50%',
                                            background: assignment?.color_hex ? (assignment.color_hex.startsWith('#') ? assignment.color_hex : `#${assignment.color_hex}`) : '#444',
                                            border: '2px solid rgba(255,255,255,0.1)',
                                            flexShrink: 0
                                        }} />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '12px', fontWeight: 800 }}>{slot.slot_key}</div>
                                            <div style={{ fontSize: '11px', opacity: 0.7 }}>{slot.label || 'No label'}</div>
                                            {assignment?.spool_id && (
                                                <div style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 600, marginTop: '2px' }}>
                                                    {assignment.vendor && <span style={{ opacity: 0.8 }}>{assignment.vendor} • </span>}
                                                    {assignment.spool_name} ({assignment.material})
                                                </div>
                                            )}
                                        </div>
                                        {assignment?.spool_id && (
                                            <button
                                                className="btn btn-sm"
                                                onClick={() => handleSpoolSelect(slot.slot_key, null)}
                                                style={{ padding: '2px 8px', fontSize: '10px', background: 'rgba(255,255,255,0.05)' }}
                                            >
                                                Clear
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div style={{ width: '280px', display: 'flex', flexDirection: 'column', gap: '12px', borderLeft: '1px solid var(--border)', paddingLeft: '20px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>Spoolman Browser</div>
                    <input
                        type="text"
                        className="input"
                        placeholder="Search spools..."
                        value={spoolSearch}
                        onChange={e => setSpoolSearch(e.target.value)}
                    />
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '500px', paddingRight: '4px' }}>
                        {filteredSpools.map(s => {
                            const f = s.filament || {};
                            const color = `#${f.color_hex || '888888'}`;
                            return (
                                <div
                                    key={s.id}
                                    draggable
                                    className="spoolman-spool-card"
                                    onDragStart={e => {
                                        e.dataTransfer.setData('spoolId', s.id);
                                        e.currentTarget.style.opacity = '0.5';
                                    }}
                                    onDragEnd={e => {
                                        e.currentTarget.style.opacity = '1';
                                    }}
                                    onClick={() => {
                                        const slots = selectedTemplate?.color_slots || [];
                                        const firstEmpty = slots.find(slot => !assignments[slot.slot_key]?.spool_id);
                                        const targetSlot = firstEmpty || slots[0];
                                        if (targetSlot) handleSpoolSelect(targetSlot.slot_key, s.id);
                                    }}
                                    style={{
                                        padding: '10px',
                                        marginBottom: '4px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <div className="spool-card-header">
                                        <div className="spool-color-circle" style={{ '--spool-color': color, width: '24px', height: '24px' }} />
                                        <div className="spool-card-info">
                                            <span className="spool-card-name" style={{ fontSize: '13px' }}>{f.name || `Spool #${s.id}`}</span>
                                            <span className="spool-card-material" style={{ fontSize: '10px' }}>
                                                {f.material || '—'}
                                                {f.color_name && (
                                                    <span style={{ marginLeft: '4px', opacity: 0.8 }}>({f.color_name})</span>
                                                )}
                                                {f.color_hex && (
                                                    <span className="spool-card-hex">#{f.color_hex.toUpperCase()}</span>
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                                        <span className="spool-card-vendor" style={{ fontSize: '11px', margin: 0 }}>{f.vendor?.name || 'Unknown Vendor'}</span>
                                        <span style={{ fontSize: '11px', opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>{Math.round(s.remaining_weight || 0)}g</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <p style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center' }}>Drag a spool onto a slot to assign</p>
                </div>
            </div>
        );
    };

    const renderFilePickerStep = () => {
        const currentFolders = folders.filter(f => f.parent_id === currentFolderId);
        const currentFiles = files.filter(f => f.folder_id === currentFolderId);

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                    <label style={{ fontSize: '13px', fontWeight: 600 }}>Project Name</label>
                    <input
                        type="text"
                        value={projectName}
                        onChange={e => setProjectName(e.target.value)}
                        placeholder="e.g. My Custom Project"
                        style={{ width: '100%', padding: '10px', marginTop: '4px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
                    />
                </div>

                <div>
                    <label style={{ fontSize: '13px', fontWeight: 600 }}>Due Date (Optional)</label>
                    <input
                        type="date"
                        className="input"
                        value={dueDate}
                        onChange={e => setDueDate(e.target.value)}
                        style={{ marginTop: '4px' }}
                    />
                </div>

                <div style={{ height: '350px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface)', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '8px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button className="btn btn-sm" onClick={() => {
                            if (breadcrumb.length > 1) {
                                setBreadcrumb(prev => prev.slice(0, -1));
                                setCurrentFolderId(breadcrumb[breadcrumb.length - 2].id);
                            }
                        }}>⬆ Up</button>
                        <span style={{ fontSize: '13px' }}>{breadcrumb[breadcrumb.length - 1].name} ({selectedFileIds.length} selected)</span>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                        {currentFolders.map(f => (
                            <div key={f.id} className="btn" style={{ display: 'block', textAlign: 'left', marginBottom: '4px', border: 'none', width: '100%' }} onDoubleClick={() => {
                                setCurrentFolderId(f.id);
                                setBreadcrumb(prev => [...prev, { id: f.id, name: f.name }]);
                            }}>
                                📁 {f.name}
                            </div>
                        ))}
                        {currentFiles.map(f => (
                            <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={selectedFileIds.includes(f.id)}
                                    onChange={() => {
                                        setSelectedFileIds(prev => prev.includes(f.id) ? prev.filter(id => id !== f.id) : [...prev, f.id]);
                                    }}
                                />
                                <span style={{ fontSize: '13px' }}>{f.filename}</span>
                            </label>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, backdropFilter: 'blur(4px)' }}>
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '20px', width: '850px', maxWidth: '95vw', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
                <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: '20px' }}>Create New Project</h2>
                    <button className="btn" onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: '24px', padding: 0 }}>✕</button>
                </div>

                <div style={{ padding: '24px', minHeight: '300px' }}>
                    {!mode && renderModeSelection()}
                    {mode === 'template' && step === 1 && renderTemplateList()}
                    {mode === 'template' && step === 2 && renderAssignmentStep()}
                    {mode === 'files' && renderFilePickerStep()}
                </div>

                <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', background: 'var(--surface2)' }}>
                    <button className="btn btn-outline" onClick={() => mode && step === 1 ? setMode(null) : setStep(1)} disabled={!mode}>
                        Back
                    </button>
                    {((mode === 'template' && step === 2) || mode === 'files') ? (
                        <button className="btn btn-primary" onClick={handleSubmit} disabled={loading || !projectName || (mode === 'files' && selectedFileIds.length === 0)}>
                            {loading ? 'Creating...' : 'Launch Project'}
                        </button>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
