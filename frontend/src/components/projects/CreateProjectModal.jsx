import { useState, useEffect } from 'react';
import { useFiles } from '../../hooks/useFiles';
import { useFolders } from '../../hooks/useFolders';
import { getFilaments, getSpools } from '../../api/spoolman';

export default function CreateProjectModal({ onClose, onSave, filaments = [] }) {
    const [step, setStep] = useState('build'); // 'build' | 'pickTemplate' | 'pickFiles'
    const [loading, setLoading] = useState(false);
    const [projectName, setProjectName] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [spools, setSpools] = useState([]);
    const [instances, setInstances] = useState([]);
    const [looseFiles, setLooseFiles] = useState([]);
    const [nextInstanceId, setNextInstanceId] = useState(1);
    const [templates, setTemplates] = useState([]);
    const [templateSearch, setTemplateSearch] = useState('');
    const { files } = useFiles();
    const { folders } = useFolders();
    const [currentFolderId, setCurrentFolderId] = useState(null);
    const [breadcrumb, setBreadcrumb] = useState([{ id: null, name: 'Root' }]);
    const [selectedFileIds, setSelectedFileIds] = useState([]);
    const [spoolSearch, setSpoolSearch] = useState('');
    const [materialFilter, setMaterialFilter] = useState([]);
    const [vendorFilter, setVendorFilter] = useState([]);
    const [expandedSlots, setExpandedSlots] = useState({});
    const [showFilterPopover, setShowFilterPopover] = useState(false);

    useEffect(() => {
        getSpools().then(setSpools).catch(console.error);
        fetch('/api/templates').then(r => r.json()).then(setTemplates).catch(console.error);
    }, []);

    // --- Instance management ---
    const addTemplateInstance = async (tpl) => {
        let fullTpl = tpl;
        try {
            const res = await fetch(`/api/templates/${tpl.id}`);
            if (res.ok) fullTpl = await res.json();
        } catch { }

        const choices = {};
        (fullTpl.categories || []).filter(c => c.type === 'choice').forEach(cat => {
            if (cat.options?.length > 0) choices[cat.id] = cat.options[0].id;
        });

        const assignments = {};
        fullTpl.color_slots?.forEach(slot => {
            const prefFilament = filaments.find(f => f.id === slot.pref_filament_id);
            const matchingSpool = spools.find(s => s.filament?.id === slot.pref_filament_id && (s.remaining_weight || 0) > 0);
            assignments[slot.slot_key] = {
                slot_key: slot.slot_key,
                spool_id: matchingSpool?.id || null,
                material: matchingSpool?.filament?.material || prefFilament?.material || '',
                color_hex: matchingSpool?.filament?.color_hex || slot.pref_hex || prefFilament?.color_hex || '#cccccc',
                vendor: matchingSpool?.filament?.vendor?.name || (typeof prefFilament?.vendor === 'string' ? prefFilament.vendor : prefFilament?.vendor?.name) || '',
                spool_name: matchingSpool?.filament?.name || matchingSpool?.name || ''
            };
        });

        setInstances(prev => [...prev, {
            id: nextInstanceId, template: fullTpl, label: fullTpl.name,
            choices, assignments, collapsed: false
        }]);
        setNextInstanceId(prev => prev + 1);
        if (!projectName) setProjectName(`${fullTpl.name} - ${new Date().toLocaleDateString()}`);
        setStep('build');
    };

    const removeInstance = (instId) => setInstances(prev => prev.filter(i => i.id !== instId));
    const updateInstanceChoice = (instId, catId, optId) => setInstances(prev => prev.map(i =>
        i.id === instId ? { ...i, choices: { ...i.choices, [catId]: Number(optId) } } : i
    ));
    const updateInstanceLabel = (instId, label) => setInstances(prev => prev.map(i =>
        i.id === instId ? { ...i, label } : i
    ));
    const toggleInstanceCollapsed = (instId) => setInstances(prev => prev.map(i =>
        i.id === instId ? { ...i, collapsed: !i.collapsed } : i
    ));

    // --- Spool assignment (supports bundled: assigns to multiple instances at once) ---
    const assignSpool = (instIds, slotKey, spoolId) => {
        const idSet = Array.isArray(instIds) ? new Set(instIds) : new Set([instIds]);
        if (!spoolId) {
            setInstances(prev => prev.map(i => !idSet.has(i.id) ? i : {
                ...i, assignments: { ...i.assignments, [slotKey]: { ...i.assignments[slotKey], spool_id: null, spool_name: '', material: '', vendor: '', color_hex: '#cccccc' } }
            }));
            return;
        }
        const spool = spools.find(s => s.id === parseInt(spoolId));
        if (!spool) return;
        setInstances(prev => prev.map(i => !idSet.has(i.id) ? i : {
            ...i, assignments: {
                ...i.assignments, [slotKey]: {
                    ...i.assignments[slotKey], spool_id: spool.id,
                    material: spool.filament?.material || '', color_hex: spool.filament?.color_hex || '#cccccc',
                    vendor: spool.filament?.vendor?.name || '', spool_name: spool.filament?.name || spool.name || `Spool #${spool.id}`
                }
            }
        }));
    };

    const assignSpoolLoose = (idx, spoolId) => {
        if (!spoolId) {
            setLooseFiles(prev => prev.map((lf, i) => i !== idx ? lf : { ...lf, spool_id: null, spool_name: '', material: '', vendor: '', color_hex: null }));
            return;
        }
        const spool = spools.find(s => s.id === parseInt(spoolId));
        if (!spool) return;
        setLooseFiles(prev => prev.map((lf, i) => i !== idx ? lf : {
            ...lf, spool_id: spool.id, material: spool.filament?.material || '', color_hex: spool.filament?.color_hex || '#cccccc',
            vendor: spool.filament?.vendor?.name || '', spool_name: spool.filament?.name || spool.name || `Spool #${spool.id}`
        }));
    };

    // --- Loose files ---
    const addLooseFiles = () => {
        const newFiles = selectedFileIds.map(fid => {
            const f = files.find(x => x.id === fid);
            return { file_id: fid, filename: f?.filename || '', display_name: f?.display_name || f?.filename || '', spool_id: null, material: '', color_hex: null, vendor: '', spool_name: '' };
        });
        setLooseFiles(prev => [...prev, ...newFiles]);
        setSelectedFileIds([]);
        setStep('build');
    };

    // --- Submit ---
    const handleSubmit = async () => {
        if (!projectName) return alert('Project name is required');
        if (instances.length === 0 && looseFiles.length === 0) return alert('Add at least one template or file');
        setLoading(true);
        try {
            const payload = {
                name: projectName, due_date: dueDate || null,
                instances: instances.map(inst => ({
                    template_id: inst.template.id, label: inst.label || inst.template.name,
                    choices: inst.choices, color_assignments: Object.values(inst.assignments)
                })),
                loose_files: looseFiles.map(lf => ({
                    file_id: lf.file_id, spool_id: lf.spool_id || null, material: lf.material || null,
                    color_hex: lf.color_hex || null, vendor: lf.vendor || null, spool_name: lf.spool_name || null
                }))
            };
            const res = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed'); }
            onSave();
        } catch (err) { alert(err.message); } finally { setLoading(false); }
    };

    // --- Filtered spools ---
    const uniqueMaterials = [...new Set(spools.map(s => s.filament?.material).filter(Boolean))].sort();
    const uniqueVendors = [...new Set(spools.map(s => s.filament?.vendor?.name).filter(Boolean))].sort();
    const filteredSpools = spools.filter(s => {
        const search = spoolSearch.toLowerCase();
        const f = s.filament || {};
        const matchesSearch = !search || f.name?.toLowerCase().includes(search) || f.material?.toLowerCase().includes(search) || f.vendor?.name?.toLowerCase().includes(search);
        return matchesSearch && (materialFilter.length === 0 || materialFilter.includes(f.material)) && (vendorFilter.length === 0 || vendorFilter.includes(f.vendor?.name));
    });
    const filteredTemplates = templates.filter(t => !templateSearch || t.name.toLowerCase().includes(templateSearch.toLowerCase()));

    // --- Collect and bundle color slots across instances by slot_key ---
    const bundledSlots = [];
    const slotKeyMap = {};
    instances.forEach(inst => {
        (inst.template?.color_slots || []).forEach(slot => {
            if (slotKeyMap[slot.slot_key]) {
                slotKeyMap[slot.slot_key].instIds.push(inst.id);
                slotKeyMap[slot.slot_key].instLabels.push(inst.label || inst.template.name);
            } else {
                const entry = {
                    slot_key: slot.slot_key,
                    slot,
                    instIds: [inst.id],
                    instLabels: [inst.label || inst.template.name],
                    assignment: inst.assignments[slot.slot_key]
                };
                slotKeyMap[slot.slot_key] = entry;
                bundledSlots.push(entry);
            }
        });
    });

    // ==================== RENDER ====================
    // Fixed modal: 1200px wide, 85vh tall. Header 60px, footer 56px, body = rest.
    // Body has position:relative, three columns use position:absolute to fill it exactly.
    const HEADER = 60;
    const FOOTER = 56;

    const renderTemplatePicker = () => (
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input type="text" className="input" placeholder="Search templates..." value={templateSearch} onChange={e => setTemplateSearch(e.target.value)} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', maxHeight: 'calc(85vh - 200px)', overflowY: 'auto', padding: '4px' }}>
                {filteredTemplates.map(tpl => (
                    <div key={tpl.id} className="file-card template-card-clickable" onClick={() => addTemplateInstance(tpl)} style={{ padding: '8px', cursor: 'pointer' }}>
                        {tpl.thumbnail_path && (
                            <div style={{ marginBottom: '6px', borderRadius: '8px', overflow: 'hidden', height: '80px', background: 'var(--surface2)' }}>
                                <img src={`/api/templates/thumb/${tpl.thumbnail_path.split('/').pop()}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                        )}
                        <div style={{ fontWeight: 600 }}>{tpl.name}</div>
                        <div style={{ fontSize: '12px', opacity: 0.7 }}>{tpl.plate_count} Plates</div>
                    </div>
                ))}
                {filteredTemplates.length === 0 && <p className="empty-state">No templates found.</p>}
            </div>
        </div>
    );

    const renderFilePicker = () => {
        const curFolders = folders.filter(f => f.parent_id === currentFolderId);
        const curFiles = files.filter(f => f.folder_id === currentFolderId);
        const alreadyAdded = new Set(looseFiles.map(lf => lf.file_id));
        return (
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ height: '380px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface)', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '8px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button className="btn btn-sm" onClick={() => { if (breadcrumb.length > 1) { setBreadcrumb(prev => prev.slice(0, -1)); setCurrentFolderId(breadcrumb[breadcrumb.length - 2].id); } }}>Up</button>
                        <span style={{ fontSize: '13px' }}>{breadcrumb[breadcrumb.length - 1].name} ({selectedFileIds.length} selected)</span>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                        {curFolders.map(f => (
                            <div key={f.id} className="btn" style={{ display: 'block', textAlign: 'left', marginBottom: '4px', border: 'none', width: '100%' }} onDoubleClick={() => { setCurrentFolderId(f.id); setBreadcrumb(prev => [...prev, { id: f.id, name: f.name }]); }}>{f.name}</div>
                        ))}
                        {curFiles.map(f => (
                            <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', borderBottom: '1px solid var(--border)', cursor: 'pointer', opacity: alreadyAdded.has(f.id) ? 0.4 : 1 }}>
                                <input type="checkbox" checked={selectedFileIds.includes(f.id)} disabled={alreadyAdded.has(f.id)} onChange={() => setSelectedFileIds(prev => prev.includes(f.id) ? prev.filter(id => id !== f.id) : [...prev, f.id])} />
                                <span style={{ fontSize: '13px' }}>{f.display_name || f.filename}</span>
                            </label>
                        ))}
                    </div>
                </div>
                <button className="btn btn-primary" onClick={addLooseFiles} disabled={selectedFileIds.length === 0}>Add {selectedFileIds.length} File{selectedFileIds.length !== 1 ? 's' : ''}</button>
            </div>
        );
    };

    const renderBuilder = () => (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex' }}>
            {/* COL 1: Project info + instances */}
            <div style={{ width: '40%', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
                {/* Fixed top: name, date, buttons */}
                <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ fontSize: '11px', fontWeight: 600 }}>Project Name</label>
                            <input type="text" value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="e.g. Anthead Build"
                                style={{ width: '100%', padding: '6px 8px', marginTop: '3px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '13px' }} />
                        </div>
                        <div style={{ width: '120px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 600 }}>Due Date</label>
                            <input type="date" className="input" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ marginTop: '3px', fontSize: '12px' }} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn btn-outline" onClick={() => setStep('pickTemplate')} style={{ flex: 1, padding: '8px', fontSize: '12px' }}>+ Add Template</button>
                        <button className="btn btn-outline" onClick={() => setStep('pickFiles')} style={{ flex: 1, padding: '8px', fontSize: '12px' }}>+ Add Files</button>
                    </div>
                </div>
                {/* Scrollable instances */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {instances.map(inst => {
                        const tpl = inst.template;
                        const choiceCats = (tpl.categories || []).filter(c => c.type === 'choice');
                        return (
                            <div key={inst.id} style={{ border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--surface)', overflow: 'hidden', flexShrink: 0 }}>
                                <div style={{ padding: '8px 12px', background: 'var(--surface2)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', borderBottom: inst.collapsed ? 'none' : '1px solid var(--border)' }}
                                    onClick={() => toggleInstanceCollapsed(inst.id)}>
                                    <span style={{ fontSize: '9px', opacity: 0.5 }}>{inst.collapsed ? '\u25B6' : '\u25BC'}</span>
                                    {tpl.thumbnail_path && <img src={`/api/templates/thumb/${tpl.thumbnail_path.split('/').pop()}`} alt="" style={{ width: '24px', height: '24px', borderRadius: '4px', objectFit: 'cover' }} />}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <input type="text" value={inst.label} onChange={e => updateInstanceLabel(inst.id, e.target.value)} onClick={e => e.stopPropagation()}
                                            style={{ background: 'transparent', border: 'none', fontWeight: 700, fontSize: '13px', color: 'var(--text)', width: '100%', padding: 0 }} />
                                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{tpl.name} &middot; {tpl.plate_count || 0} plates</div>
                                    </div>
                                    <button className="btn btn-sm" onClick={e => { e.stopPropagation(); removeInstance(inst.id); }}
                                        style={{ padding: '2px 6px', fontSize: '11px', background: 'rgba(255,60,60,0.1)', color: 'var(--danger)', border: '1px solid var(--danger)' }}>{'\u2715'}</button>
                                </div>
                                {!inst.collapsed && choiceCats.length > 0 && (
                                    <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {choiceCats.map(cat => (
                                            <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ fontSize: '11px', fontWeight: 600, minWidth: '70px' }}>{cat.name}</span>
                                                <select className="form-select" value={inst.choices[cat.id] || ''} onChange={e => updateInstanceChoice(inst.id, cat.id, e.target.value)}
                                                    style={{ flex: 1, fontSize: '11px', padding: '3px 6px' }}>
                                                    {cat.options?.map(opt => <option key={opt.id} value={opt.id}>{opt.name} ({opt.plates?.length || 0})</option>)}
                                                </select>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {looseFiles.length > 0 && (
                        <div style={{ border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--surface)', overflow: 'hidden', flexShrink: 0 }}>
                            <div style={{ padding: '8px 12px', background: 'var(--surface2)', fontWeight: 700, fontSize: '12px', borderBottom: '1px solid var(--border)' }}>Additional Files</div>
                            {looseFiles.map((lf, idx) => (
                                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderBottom: idx < looseFiles.length - 1 ? '1px solid var(--border)' : 'none' }}>
                                    <span style={{ fontSize: '12px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {(lf.display_name || lf.filename).replace(/\.(gcode|3mf)$/i, '').replace(/^\d{10,}_/, '')}
                                    </span>
                                    <button className="btn btn-sm" onClick={() => setLooseFiles(prev => prev.filter((_, i) => i !== idx))}
                                        style={{ padding: '1px 5px', fontSize: '10px', background: 'rgba(255,60,60,0.1)', color: 'var(--danger)', border: '1px solid var(--danger)' }}>{'\u2715'}</button>
                                </div>
                            ))}
                        </div>
                    )}

                    {instances.length === 0 && looseFiles.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: '13px' }}>
                            Add templates or files to get started
                        </div>
                    )}
                </div>
            </div>

            {/* COL 2: Color slot assignments */}
            <div style={{ width: '30%', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: '13px', fontWeight: 600, flexShrink: 0 }}>
                    Color Assignments
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
                    {bundledSlots.length === 0 && looseFiles.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '12px' }}>Add a template to assign colors</div>
                    )}
                    {bundledSlots.map(({ slot_key, slot, instIds, instLabels, assignment }) => {
                        const hex = assignment?.color_hex ? (assignment.color_hex.startsWith('#') ? assignment.color_hex : `#${assignment.color_hex}`) : '#444';
                        const isBundled = instIds.length > 1;
                        const isExpanded = expandedSlots[slot_key];
                        return (
                            <div key={slot_key} style={{ marginBottom: '4px' }}>
                                {/* Main bundled row — drag here to assign all */}
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '6px 8px', background: 'var(--surface)', borderRadius: isExpanded ? '8px 8px 0 0' : '8px', border: '2px dashed transparent', transition: 'border-color 0.15s' }}
                                    onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--primary)'; }}
                                    onDragLeave={e => { e.currentTarget.style.borderColor = 'transparent'; }}
                                    onDrop={e => { e.preventDefault(); assignSpool(instIds, slot_key, e.dataTransfer.getData('spoolId')); e.currentTarget.style.borderColor = 'transparent'; }}>
                                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: hex, border: '2px solid rgba(255,255,255,0.1)', flexShrink: 0 }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '11px', fontWeight: 700 }}>{slot_key}</div>
                                        <div style={{ fontSize: '10px', opacity: 0.6 }}>{slot.label || 'No label'}</div>
                                        {assignment?.spool_id && (
                                            <div style={{ fontSize: '10px', color: 'var(--primary)', fontWeight: 600 }}>
                                                {assignment.vendor && <span style={{ opacity: 0.8 }}>{assignment.vendor} &bull; </span>}
                                                {assignment.spool_name}
                                            </div>
                                        )}
                                    </div>
                                    {assignment?.spool_id && (
                                        <button className="btn btn-sm" onClick={() => assignSpool(instIds, slot_key, null)} style={{ padding: '1px 5px', fontSize: '9px' }}>Clear</button>
                                    )}
                                    {isBundled && (
                                        <button className="btn btn-sm" onClick={() => setExpandedSlots(prev => ({ ...prev, [slot_key]: !prev[slot_key] }))}
                                            title={isExpanded ? 'Collapse per-instance' : 'Expand per-instance'}
                                            style={{ padding: '1px 5px', fontSize: '9px', opacity: 0.6 }}>
                                            {isExpanded ? '\u25B2' : `\u00D7${instIds.length}`}
                                        </button>
                                    )}
                                </div>
                                {/* Per-instance overrides when expanded */}
                                {isBundled && isExpanded && (
                                    <div style={{ borderLeft: '2px solid var(--border)', marginLeft: '18px', paddingLeft: '8px', background: 'var(--surface)', borderRadius: '0 0 8px 8px', paddingBottom: '4px' }}>
                                        {instIds.map((iid, idx) => {
                                            const inst = instances.find(i => i.id === iid);
                                            if (!inst) return null;
                                            const perAssignment = inst.assignments[slot_key];
                                            const perHex = perAssignment?.color_hex ? (perAssignment.color_hex.startsWith('#') ? perAssignment.color_hex : `#${perAssignment.color_hex}`) : '#444';
                                            return (
                                                <div key={iid} style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '4px 6px', marginTop: '2px', borderRadius: '6px', border: '2px dashed transparent', transition: 'border-color 0.15s' }}
                                                    onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--primary)'; }}
                                                    onDragLeave={e => { e.currentTarget.style.borderColor = 'transparent'; }}
                                                    onDrop={e => { e.preventDefault(); assignSpool(iid, slot_key, e.dataTransfer.getData('spoolId')); e.currentTarget.style.borderColor = 'transparent'; }}>
                                                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: perHex, border: '2px solid rgba(255,255,255,0.1)', flexShrink: 0 }} />
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: '10px', fontWeight: 600 }}>{instLabels[idx]}</div>
                                                        {perAssignment?.spool_id ? (
                                                            <div style={{ fontSize: '9px', color: 'var(--primary)' }}>
                                                                {perAssignment.vendor && <span style={{ opacity: 0.8 }}>{perAssignment.vendor} &bull; </span>}
                                                                {perAssignment.spool_name}
                                                            </div>
                                                        ) : (
                                                            <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>Using bundled</div>
                                                        )}
                                                    </div>
                                                    {perAssignment?.spool_id && (
                                                        <button className="btn btn-sm" onClick={() => assignSpool(iid, slot_key, null)} style={{ padding: '0px 4px', fontSize: '8px' }}>Clear</button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {looseFiles.map((lf, idx) => (
                        <div key={`loose-${idx}`} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '6px 8px', marginBottom: '4px', background: 'var(--surface)', borderRadius: '8px', border: '2px dashed transparent', transition: 'border-color 0.15s' }}
                            onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--primary)'; }}
                            onDragLeave={e => { e.currentTarget.style.borderColor = 'transparent'; }}
                            onDrop={e => { e.preventDefault(); assignSpoolLoose(idx, e.dataTransfer.getData('spoolId')); e.currentTarget.style.borderColor = 'transparent'; }}>
                            <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: lf.color_hex ? (lf.color_hex.startsWith('#') ? lf.color_hex : `#${lf.color_hex}`) : '#444', border: '2px solid rgba(255,255,255,0.1)', flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '11px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {(lf.display_name || lf.filename).replace(/\.(gcode|3mf)$/i, '').replace(/^\d{10,}_/, '')}
                                </div>
                                {lf.spool_id ? (
                                    <div style={{ fontSize: '10px', color: 'var(--primary)', fontWeight: 600 }}>
                                        {lf.vendor && <span style={{ opacity: 0.8 }}>{lf.vendor} &bull; </span>}{lf.spool_name}
                                    </div>
                                ) : (
                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Drag spool to assign</div>
                                )}
                            </div>
                            {lf.spool_id && <button className="btn btn-sm" onClick={() => assignSpoolLoose(idx, null)} style={{ padding: '1px 5px', fontSize: '9px' }}>Clear</button>}
                        </div>
                    ))}
                </div>
            </div>

            {/* COL 3: Spool browser */}
            <div style={{ width: '30%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>Spoolman Browser</div>
                    <div style={{ position: 'relative' }}>
                        <input type="text" className="input" placeholder="Search spools..." value={spoolSearch} onChange={e => setSpoolSearch(e.target.value)} style={{ paddingRight: '32px', fontSize: '12px' }} />
                        <button className="btn btn-sm" onClick={() => setShowFilterPopover(!showFilterPopover)}
                            style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', padding: '4px 8px', fontSize: '13px', border: 'none', background: 'transparent', cursor: 'pointer', color: (materialFilter.length > 0 || vendorFilter.length > 0) ? 'var(--primary)' : 'var(--text-muted)' }}>{'\u2699'}</button>
                    </div>
                    {showFilterPopover && <div style={{ position: 'fixed', inset: 0, zIndex: 1099 }} onClick={() => setShowFilterPopover(false)} />}
                    {showFilterPopover && (
                        <div style={{ position: 'absolute', top: '100px', right: '16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', zIndex: 1100, minWidth: '200px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
                            <div style={{ marginBottom: '10px' }}>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-muted)' }}>Material</label>
                                <div style={{ maxHeight: '100px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '4px', padding: '4px' }}>
                                    {uniqueMaterials.map(m => (
                                        <label key={m} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 0', cursor: 'pointer', fontSize: '11px' }}>
                                            <input type="checkbox" checked={materialFilter.includes(m)} onChange={e => e.target.checked ? setMaterialFilter(p => [...p, m]) : setMaterialFilter(p => p.filter(x => x !== m))} /> {m}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div style={{ marginBottom: '10px' }}>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-muted)' }}>Vendor</label>
                                <div style={{ maxHeight: '100px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '4px', padding: '4px' }}>
                                    {uniqueVendors.map(v => (
                                        <label key={v} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 0', cursor: 'pointer', fontSize: '11px' }}>
                                            <input type="checkbox" checked={vendorFilter.includes(v)} onChange={e => e.target.checked ? setVendorFilter(p => [...p, v]) : setVendorFilter(p => p.filter(x => x !== v))} /> {v}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <button className="btn btn-sm" onClick={() => { setMaterialFilter([]); setVendorFilter([]); setShowFilterPopover(false); }} style={{ width: '100%', fontSize: '11px' }}>Clear Filters</button>
                        </div>
                    )}
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {filteredSpools.map(s => {
                        const f = s.filament || {};
                        const color = `#${f.color_hex || '888888'}`;
                        return (
                            <div key={s.id} draggable className="spoolman-spool-card"
                                onDragStart={e => { e.dataTransfer.setData('spoolId', s.id); e.currentTarget.style.opacity = '0.5'; }}
                                onDragEnd={e => { e.currentTarget.style.opacity = '1'; }}
                                style={{ padding: '8px', cursor: 'grab' }}>
                                <div className="spool-card-header">
                                    <div className="spool-color-circle" style={{ '--spool-color': color, width: '22px', height: '22px' }} />
                                    <div className="spool-card-info">
                                        <span className="spool-card-name" style={{ fontSize: '12px' }}>{f.name || `Spool #${s.id}`}</span>
                                        <span className="spool-card-material" style={{ fontSize: '10px' }}>
                                            {f.material || '\u2014'}
                                            {f.color_hex && <span className="spool-card-hex">#{f.color_hex.toUpperCase()}</span>}
                                        </span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '3px' }}>
                                    <span className="spool-card-vendor" style={{ fontSize: '10px', margin: 0 }}>{f.vendor?.name || 'Unknown'}</span>
                                    <span style={{ fontSize: '10px', opacity: 0.7 }}>{Math.round(s.remaining_weight || 0)}g</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div style={{ padding: '6px', fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center', flexShrink: 0 }}>Drag a spool onto a slot</div>
            </div>
        </div>
    );

    const titles = { build: 'Create New Project', pickTemplate: 'Add Template', pickFiles: 'Add G-code Files' };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, backdropFilter: 'blur(4px)' }}>
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '20px', width: '1200px', maxWidth: '95vw', height: '85vh', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ height: `${HEADER}px`, padding: '0 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                    <h2 style={{ margin: 0, fontSize: '20px' }}>{titles[step] || 'Create New Project'}</h2>
                    <button className="btn" onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: '24px', padding: 0 }}>{'\u2715'}</button>
                </div>

                {/* Body — takes all remaining space */}
                <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                    {step === 'build' && renderBuilder()}
                    {step === 'pickTemplate' && <div style={{ position: 'absolute', inset: 0, overflowY: 'auto' }}>{renderTemplatePicker()}</div>}
                    {step === 'pickFiles' && <div style={{ position: 'absolute', inset: 0, overflowY: 'auto' }}>{renderFilePicker()}</div>}
                </div>

                {/* Footer */}
                <div style={{ height: `${FOOTER}px`, padding: '0 24px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface2)', flexShrink: 0 }}>
                    <button className="btn btn-outline" onClick={() => step === 'build' ? onClose() : setStep('build')}>
                        {step === 'build' ? 'Cancel' : 'Back'}
                    </button>
                    {step === 'build' && (
                        <button className="btn btn-primary" onClick={handleSubmit} disabled={loading || !projectName || (instances.length === 0 && looseFiles.length === 0)}>
                            {loading ? 'Creating...' : 'Launch Project'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
