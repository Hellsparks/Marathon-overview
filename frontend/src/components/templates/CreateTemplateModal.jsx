import { useState, useEffect } from 'react';
import { useFiles } from '../../hooks/useFiles';
import { useFolders } from '../../hooks/useFolders';

let _nextId = 1;
function localId() { return `_local_${_nextId++}_${Math.random().toString(36).slice(2, 6)}`; }

function cleanDisplayName(filename) {
    // Strip extension, then strip leading timestamp prefix (e.g. "1773782147411_")
    return filename.replace(/\.(gcode|3mf)$/i, '').replace(/^\d{10,}_/, '');
}

function makePlate(file) {
    return {
        _localId: localId(),
        file_id: file.id,
        filename: '',
        display_name: cleanDisplayName(file.filename),
        filament_type: file.metadata?.filament_type || null,
        sort_order: 0,
        slot_keys: []
    };
}

export default function CreateTemplateModal({ onClose, onSave, existingTemplate, filaments = [] }) {
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);

    // Form State
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [thumbFile, setThumbFile] = useState(null);
    const [thumbPreview, setThumbPreview] = useState(null);

    // Categories state — replaces flat plates
    const [categories, setCategories] = useState([]);
    const [selectedTarget, setSelectedTarget] = useState(null); // { catIdx, optIdx? } — where "Add Plate" drops files

    const [colorSlots, setColorSlots] = useState([
        { id: 'new_1', slot_key: 'PRIMARY', label: 'Main Color', pref_hex: '', pref_filament_id: null }
    ]);

    // Data fetching for file picker
    const { files } = useFiles();
    const { folders } = useFolders();
    const [currentFolderId, setCurrentFolderId] = useState(null);
    const [breadcrumb, setBreadcrumb] = useState([{ id: null, name: 'Root' }]);

    useEffect(() => {
        if (existingTemplate) {
            setName(existingTemplate.name || '');
            setDescription(existingTemplate.description || '');
            if (existingTemplate.thumbnail_path) {
                setThumbPreview(`/api/templates/thumb/${existingTemplate.thumbnail_path.split('/').pop()}`);
            }
            if (existingTemplate.color_slots && existingTemplate.color_slots.length > 0) {
                setColorSlots(existingTemplate.color_slots.map(s => ({ ...s, id: s.id || localId() })));
            }

            // Load categories if they exist, otherwise migrate flat plates into a single fixed group
            if (existingTemplate.categories && existingTemplate.categories.length > 0) {
                setCategories(existingTemplate.categories.map(cat => ({
                    _localId: localId(),
                    name: cat.name,
                    type: cat.type || 'fixed',
                    plates: (cat.plates || []).map(p => ({ ...p, _localId: localId(), slot_keys: p.slot_keys || [] })),
                    options: (cat.options || []).map(opt => ({
                        _localId: localId(),
                        name: opt.name,
                        plates: (opt.plates || []).map(p => ({ ...p, _localId: localId(), slot_keys: p.slot_keys || [] }))
                    }))
                })));
            } else if (existingTemplate.plates && existingTemplate.plates.length > 0) {
                // Migrate flat plates into a single fixed category
                setCategories([{
                    _localId: localId(),
                    name: 'Main',
                    type: 'fixed',
                    plates: existingTemplate.plates.map(p => ({ ...p, _localId: localId(), slot_keys: p.slot_keys || [] })),
                    options: []
                }]);
            }
        }
    }, [existingTemplate]);

    const handleNext = () => setStep(s => Math.min(s + 1, 4));
    const handleBack = () => setStep(s => Math.max(s - 1, 1));

    // ── Category helpers ──
    const addCategory = (type) => {
        const cat = {
            _localId: localId(),
            name: '',
            type,
            plates: [],
            options: type === 'choice' ? [{ _localId: localId(), name: 'Option A', plates: [] }, { _localId: localId(), name: 'Option B', plates: [] }] : []
        };
        setCategories(prev => [...prev, cat]);
        // Auto-select the new group as target
        const catIdx = categories.length;
        if (type === 'fixed') {
            setSelectedTarget({ catIdx });
        } else {
            setSelectedTarget({ catIdx, optIdx: 0 });
        }
    };

    const removeCategory = (catIdx) => {
        setCategories(prev => prev.filter((_, i) => i !== catIdx));
        setSelectedTarget(null);
    };

    const updateCategory = (catIdx, field, value) => {
        setCategories(prev => prev.map((c, i) => i === catIdx ? { ...c, [field]: value } : c));
    };

    const toggleCategoryType = (catIdx) => {
        setCategories(prev => prev.map((c, i) => {
            if (i !== catIdx) return c;
            if (c.type === 'fixed') {
                // Convert to choice: move existing plates into first option
                return {
                    ...c,
                    type: 'choice',
                    options: [
                        { _localId: localId(), name: 'Option A', plates: c.plates },
                        { _localId: localId(), name: 'Option B', plates: [] }
                    ],
                    plates: []
                };
            } else {
                // Convert to fixed: merge all option plates
                const allPlates = c.options.flatMap(o => o.plates);
                return { ...c, type: 'fixed', plates: allPlates, options: [] };
            }
        }));
    };

    // Option helpers
    const addOption = (catIdx) => {
        setCategories(prev => prev.map((c, i) => {
            if (i !== catIdx) return c;
            return { ...c, options: [...c.options, { _localId: localId(), name: `Option ${String.fromCharCode(65 + c.options.length)}`, plates: [] }] };
        }));
    };

    const removeOption = (catIdx, optIdx) => {
        setCategories(prev => prev.map((c, i) => {
            if (i !== catIdx) return c;
            return { ...c, options: c.options.filter((_, j) => j !== optIdx) };
        }));
    };

    const updateOption = (catIdx, optIdx, field, value) => {
        setCategories(prev => prev.map((c, i) => {
            if (i !== catIdx) return c;
            return { ...c, options: c.options.map((o, j) => j === optIdx ? { ...o, [field]: value } : o) };
        }));
    };

    // Plate helpers
    const addPlateToTarget = (file) => {
        if (!selectedTarget) return alert('Select a group or alternative first.');
        const plate = makePlate(file);
        const { catIdx, optIdx } = selectedTarget;
        setCategories(prev => prev.map((c, i) => {
            if (i !== catIdx) return c;
            if (c.type === 'choice' && optIdx !== undefined) {
                return { ...c, options: c.options.map((o, j) => j === optIdx ? { ...o, plates: [...o.plates, plate] } : o) };
            }
            return { ...c, plates: [...c.plates, plate] };
        }));
    };

    const removePlate = (catIdx, optIdx, plateLocalId) => {
        setCategories(prev => prev.map((c, i) => {
            if (i !== catIdx) return c;
            if (c.type === 'choice' && optIdx !== undefined) {
                return { ...c, options: c.options.map((o, j) => j === optIdx ? { ...o, plates: o.plates.filter(p => p._localId !== plateLocalId) } : o) };
            }
            return { ...c, plates: c.plates.filter(p => p._localId !== plateLocalId) };
        }));
    };

    const updatePlate = (catIdx, optIdx, plateLocalId, field, value) => {
        setCategories(prev => prev.map((c, i) => {
            if (i !== catIdx) return c;
            const updateFn = p => p._localId === plateLocalId ? { ...p, [field]: value } : p;
            if (c.type === 'choice' && optIdx !== undefined) {
                return { ...c, options: c.options.map((o, j) => j === optIdx ? { ...o, plates: o.plates.map(updateFn) } : o) };
            }
            return { ...c, plates: c.plates.map(updateFn) };
        }));
    };

    // Get all plates flat (for step 3 slot assignment)
    const getAllPlates = () => {
        const result = [];
        categories.forEach((cat, catIdx) => {
            if (cat.type === 'choice') {
                cat.options.forEach((opt, optIdx) => {
                    opt.plates.forEach(p => result.push({ ...p, _catIdx: catIdx, _optIdx: optIdx }));
                });
            } else {
                cat.plates.forEach(p => result.push({ ...p, _catIdx: catIdx, _optIdx: undefined }));
            }
        });
        return result;
    };

    const togglePlateSlot = (catIdx, optIdx, plateLocalId, slot_key) => {
        setCategories(prev => prev.map((c, i) => {
            if (i !== catIdx) return c;
            const toggleFn = p => {
                if (p._localId !== plateLocalId) return p;
                const keys = p.slot_keys || [];
                return { ...p, slot_keys: keys.includes(slot_key) ? keys.filter(k => k !== slot_key) : [...keys, slot_key] };
            };
            if (c.type === 'choice' && optIdx !== undefined) {
                return { ...c, options: c.options.map((o, j) => j === optIdx ? { ...o, plates: o.plates.map(toggleFn) } : o) };
            }
            return { ...c, plates: c.plates.map(toggleFn) };
        }));
    };

    // Step 3 Helper: Slots
    const addSlot = () => {
        setColorSlots(prev => [...prev, {
            id: localId(),
            slot_key: `SLOT_${prev.length + 1}`,
            label: '',
            pref_hex: '',
            pref_filament_id: null
        }]);
    };

    const removeSlot = (id) => {
        setColorSlots(prev => prev.filter(s => s.id !== id));
    };

    const updateSlot = (id, field, value) => {
        setColorSlots(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
    };

    // Step 4 Helper: Thumbnail
    const handleThumbSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setThumbFile(file);
            setThumbPreview(URL.createObjectURL(file));
        }
    };

    // Submit
    const handleSubmit = async () => {
        if (!name) return alert('Template name is required.');
        const allPlates = getAllPlates();
        if (allPlates.length === 0) return alert('At least one plate is required.');
        if (colorSlots.length === 0) return alert('At least one color slot is required.');

        setLoading(true);
        try {
            const serializePlate = (p, sortIdx) => ({
                file_id: p.file_id,
                filename: p.filename,
                display_name: p.display_name,
                filament_type: p.filament_type,
                sort_order: sortIdx,
                slot_keys: p.slot_keys || []
            });

            const payload = {
                name,
                description,
                plates: [], // all plates go through categories now
                categories: categories.map((cat, ci) => ({
                    name: cat.name || `Group ${ci + 1}`,
                    type: cat.type,
                    sort_order: ci,
                    plates: cat.type === 'fixed' ? cat.plates.map((p, pi) => serializePlate(p, pi)) : undefined,
                    options: cat.type === 'choice' ? cat.options.map((opt, oi) => ({
                        name: opt.name || `Option ${oi + 1}`,
                        sort_order: oi,
                        plates: opt.plates.map((p, pi) => serializePlate(p, pi))
                    })) : undefined
                })),
                color_slots: colorSlots.map(s => ({
                    slot_key: s.slot_key,
                    label: s.label,
                    pref_hex: s.pref_hex,
                    pref_filament_id: s.pref_filament_id
                }))
            };

            const url = existingTemplate ? `/api/templates/${existingTemplate.id}` : '/api/templates';
            const method = existingTemplate ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to save template');
            }

            const resData = await res.json();
            const templateId = existingTemplate ? existingTemplate.id : resData.id;

            // Upload thumbnail if we picked a new one
            if (thumbFile && templateId) {
                const formData = new FormData();
                formData.append('thumbnail', thumbFile);
                await fetch(`/api/templates/${templateId}/thumbnail`, {
                    method: 'POST',
                    body: formData
                });
            }

            onSave();
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };


    // ── Render Steps ──

    const renderStep1 = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
                <label>Template Name *</label>
                <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Flexi Rex"
                    style={{ width: '100%', padding: '8px', marginTop: '4px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box' }}
                />
            </div>
            <div>
                <label>Description (Optional)</label>
                <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Notes about printing this template..."
                    rows={4}
                    style={{ width: '100%', padding: '8px', marginTop: '4px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box', resize: 'vertical' }}
                />
            </div>
        </div>
    );

    const renderPlateItem = (plate, catIdx, optIdx) => (
        <div key={plate._localId} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: 'var(--bg)', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px' }}>
            <input
                type="text"
                value={plate.display_name}
                onChange={e => updatePlate(catIdx, optIdx, plate._localId, 'display_name', e.target.value)}
                style={{ flex: 1, padding: '2px 6px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box' }}
            />
            <button
                className="btn btn-sm"
                style={{ padding: '1px 5px', color: 'var(--error)', background: 'transparent', border: 'none', fontSize: '14px', lineHeight: 1 }}
                onClick={() => removePlate(catIdx, optIdx, plate._localId)}
                title="Remove plate"
            >
                ✕
            </button>
        </div>
    );

    const isTargetSelected = (catIdx, optIdx) => {
        if (!selectedTarget) return false;
        if (selectedTarget.catIdx !== catIdx) return false;
        if (optIdx !== undefined) return selectedTarget.optIdx === optIdx;
        return selectedTarget.optIdx === undefined;
    };

    const renderStep2 = () => {
        const currentFolders = folders.filter(f => f.parent_id === currentFolderId);
        const currentFiles = files.filter(f => f.folder_id === currentFolderId);

        return (
            <div style={{ display: 'flex', gap: '16px', height: '600px' }}>
                {/* Left: File Picker */}
                <div style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 'var(--radius)', display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
                    <div style={{ padding: '8px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <button className="btn btn-sm" onClick={() => {
                            if (breadcrumb.length > 1) {
                                setBreadcrumb(prev => prev.slice(0, -1));
                                setCurrentFolderId(breadcrumb[breadcrumb.length - 2].id);
                            }
                        }}>⬆ Up</button>
                        <span style={{ fontSize: '13px', fontWeight: 500 }}>{breadcrumb[breadcrumb.length - 1].name}</span>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                        {currentFolders.map(f => (
                            <div
                                key={f.id}
                                className="btn btn-outline"
                                style={{ display: 'block', textAlign: 'left', marginBottom: '4px', border: 'none' }}
                                onDoubleClick={() => {
                                    setCurrentFolderId(f.id);
                                    setBreadcrumb(prev => [...prev, { id: f.id, name: f.name }]);
                                }}
                            >
                                📁 {f.name}
                            </div>
                        ))}
                        {currentFiles.map(f => (
                            <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
                                <span style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={f.filename}>{f.filename}</span>
                                <button
                                    className="btn btn-sm btn-outline"
                                    onClick={() => addPlateToTarget(f)}
                                    disabled={!selectedTarget}
                                    title={selectedTarget ? 'Add to selected group' : 'Select a group first'}
                                    style={{ opacity: selectedTarget ? 1 : 0.4 }}
                                >
                                    Add
                                </button>
                            </div>
                        ))}
                        {currentFolders.length === 0 && currentFiles.length === 0 && (
                            <p className="empty-state" style={{ padding: '24px' }}>Folder is empty</p>
                        )}
                    </div>
                </div>

                {/* Right: Categories / Groups */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        <button className="btn btn-sm btn-outline" onClick={() => addCategory('fixed')}>+ Fixed Group</button>
                        <button className="btn btn-sm btn-outline" onClick={() => addCategory('choice')}>+ Choice Group</button>
                        <span style={{ flex: 1 }} />
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', alignSelf: 'center' }}>
                            {selectedTarget ? 'Click "Add" on files to add them' : 'Select a group target below'}
                        </span>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {categories.map((cat, catIdx) => (
                            <div
                                key={cat._localId}
                                style={{
                                    border: '1px solid var(--border)',
                                    borderRadius: 'var(--radius)',
                                    background: 'var(--surface)',
                                    overflow: 'hidden'
                                }}
                            >
                                {/* Category header */}
                                <div style={{
                                    padding: '6px 10px',
                                    background: 'var(--surface2)',
                                    borderBottom: '1px solid var(--border)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}>
                                    <span style={{
                                        fontSize: '10px',
                                        fontWeight: 700,
                                        textTransform: 'uppercase',
                                        letterSpacing: '.05em',
                                        padding: '1px 6px',
                                        borderRadius: '4px',
                                        background: cat.type === 'choice' ? 'color-mix(in srgb, var(--primary) 20%, transparent)' : 'color-mix(in srgb, var(--text-muted) 20%, transparent)',
                                        color: cat.type === 'choice' ? 'var(--primary)' : 'var(--text-muted)',
                                        flexShrink: 0
                                    }}>
                                        {cat.type === 'choice' ? 'Pick One' : 'Fixed'}
                                    </span>
                                    <input
                                        type="text"
                                        value={cat.name}
                                        onChange={e => updateCategory(catIdx, 'name', e.target.value)}
                                        placeholder={`Group ${catIdx + 1} name...`}
                                        style={{ flex: 1, padding: '2px 6px', fontSize: '13px', fontWeight: 600, border: '1px solid transparent', borderRadius: '4px', background: 'transparent', color: 'var(--text)', boxSizing: 'border-box' }}
                                        onFocus={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.background = 'var(--bg)'; }}
                                        onBlur={e => { e.target.style.borderColor = 'transparent'; e.target.style.background = 'transparent'; }}
                                    />
                                    <button
                                        className="btn btn-sm"
                                        onClick={() => toggleCategoryType(catIdx)}
                                        title={cat.type === 'fixed' ? 'Convert to choice group' : 'Convert to fixed group'}
                                        style={{ padding: '1px 6px', fontSize: '10px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                                    >
                                        {cat.type === 'fixed' ? 'Make Choice' : 'Make Fixed'}
                                    </button>
                                    <button
                                        className="btn btn-sm"
                                        style={{ padding: '1px 5px', color: 'var(--error)', background: 'transparent', border: 'none', fontSize: '14px' }}
                                        onClick={() => removeCategory(catIdx)}
                                        title="Remove group"
                                    >
                                        ✕
                                    </button>
                                </div>

                                {/* Category body */}
                                <div style={{ padding: '8px' }}>
                                    {cat.type === 'fixed' ? (
                                        /* Fixed: single plate list, clickable to select as target */
                                        <div
                                            onClick={() => setSelectedTarget({ catIdx })}
                                            style={{
                                                padding: '6px',
                                                borderRadius: '4px',
                                                border: `2px ${isTargetSelected(catIdx) ? 'solid var(--primary)' : 'dashed var(--border)'}`,
                                                background: isTargetSelected(catIdx) ? 'color-mix(in srgb, var(--primary) 5%, transparent)' : 'transparent',
                                                cursor: 'pointer',
                                                minHeight: '32px',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '4px',
                                                transition: 'all 0.15s'
                                            }}
                                        >
                                            {cat.plates.length === 0 && (
                                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '4px', textAlign: 'center' }}>
                                                    {isTargetSelected(catIdx) ? 'Now add files from the picker' : 'Click here, then add files'}
                                                </span>
                                            )}
                                            {cat.plates.map(p => renderPlateItem(p, catIdx, undefined))}
                                        </div>
                                    ) : (
                                        /* Choice: options (alternatives) */
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {cat.options.map((opt, optIdx) => (
                                                <div key={opt._localId} style={{ border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                                                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>ALT</span>
                                                        <input
                                                            type="text"
                                                            value={opt.name}
                                                            onChange={e => updateOption(catIdx, optIdx, 'name', e.target.value)}
                                                            placeholder={`Alternative ${optIdx + 1}...`}
                                                            style={{ flex: 1, padding: '1px 4px', fontSize: '12px', fontWeight: 500, border: '1px solid transparent', borderRadius: '3px', background: 'transparent', color: 'var(--text)', boxSizing: 'border-box' }}
                                                            onFocus={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.background = 'var(--bg)'; }}
                                                            onBlur={e => { e.target.style.borderColor = 'transparent'; e.target.style.background = 'transparent'; }}
                                                        />
                                                        {cat.options.length > 1 && (
                                                            <button
                                                                className="btn btn-sm"
                                                                style={{ padding: '0 4px', color: 'var(--error)', background: 'transparent', border: 'none', fontSize: '12px' }}
                                                                onClick={() => removeOption(catIdx, optIdx)}
                                                            >
                                                                ✕
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div
                                                        onClick={() => setSelectedTarget({ catIdx, optIdx })}
                                                        style={{
                                                            padding: '6px',
                                                            border: `2px ${isTargetSelected(catIdx, optIdx) ? 'solid var(--primary)' : 'dashed transparent'}`,
                                                            background: isTargetSelected(catIdx, optIdx) ? 'color-mix(in srgb, var(--primary) 5%, transparent)' : 'transparent',
                                                            cursor: 'pointer',
                                                            minHeight: '28px',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: '4px',
                                                            transition: 'all 0.15s'
                                                        }}
                                                    >
                                                        {opt.plates.length === 0 && (
                                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '2px', textAlign: 'center' }}>
                                                                {isTargetSelected(catIdx, optIdx) ? 'Add files from picker' : 'Click to select'}
                                                            </span>
                                                        )}
                                                        {opt.plates.map(p => renderPlateItem(p, catIdx, optIdx))}
                                                    </div>
                                                </div>
                                            ))}
                                            <button
                                                className="btn btn-sm"
                                                onClick={() => addOption(catIdx)}
                                                style={{ alignSelf: 'flex-start', fontSize: '11px', padding: '2px 8px', background: 'transparent', border: '1px dashed var(--border)', color: 'var(--text-muted)' }}
                                            >
                                                + Alternative
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {categories.length === 0 && (
                            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                <p style={{ fontSize: '14px', margin: '0 0 8px' }}>No groups yet</p>
                                <p style={{ fontSize: '12px', margin: 0 }}>
                                    <strong>Fixed Group</strong> = always printed.<br />
                                    <strong>Choice Group</strong> = pick one alternative when creating a project.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const renderStep3 = () => {
        const allPlates = getAllPlates();

        return (
            <div style={{ display: 'flex', gap: '16px', height: '600px' }}>
                {/* Defined Slots */}
                <div style={{ flex: '0 0 40%', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface)', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '8px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600 }}>Color Slots</span>
                        <button className="btn btn-sm btn-outline" onClick={addSlot}>+ Add Slot</button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {colorSlots.map((slot, i) => (
                            <div key={slot.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-muted)' }}>Slot {i + 1}</span>
                                    {colorSlots.length > 1 && (
                                        <button className="btn btn-sm" style={{ padding: '2px 6px', color: 'var(--error)', background: 'transparent', border: 'none' }} onClick={() => removeSlot(slot.id)}>✕</button>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input
                                        type="text"
                                        value={slot.slot_key}
                                        onChange={e => updateSlot(slot.id, 'slot_key', e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                                        placeholder="KEY (e.g. PRIMARY)" style={{ width: '100px', padding: '4px 8px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box' }}
                                    />
                                    <input
                                        type="text"
                                        value={slot.label || ''}
                                        onChange={e => updateSlot(slot.id, 'label', e.target.value)}
                                        placeholder="Label (e.g. Body Color)" style={{ flex: 1, padding: '4px 8px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <select
                                        value={slot.pref_filament_id || ''}
                                        onChange={e => updateSlot(slot.id, 'pref_filament_id', e.target.value ? parseInt(e.target.value, 10) : null)}
                                        style={{ flex: 1, padding: '4px 8px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box' }}
                                    >
                                        <option value="">No specific filament...</option>
                                        {filaments.map(f => (
                                            <option key={f.id} value={f.id}>
                                                {f.name || `Filament #${f.id}`} {f.material ? `(${f.material})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <label style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>Hex Override:</label>
                                        <input
                                            type="color"
                                            value={slot.pref_hex ? (slot.pref_hex.startsWith('#') ? slot.pref_hex : `#${slot.pref_hex}`) : (filaments.find(f => f.id === slot.pref_filament_id)?.color_hex ? `#${filaments.find(f => f.id === slot.pref_filament_id).color_hex}` : '#cccccc')}
                                            onChange={e => updateSlot(slot.id, 'pref_hex', e.target.value)}
                                            style={{ width: '32px', height: '28px', padding: 0, border: '1px solid var(--border)', borderRadius: '4px', background: 'none', cursor: 'pointer' }}
                                        />
                                    </div>
                                    {!slot.pref_hex && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>None</span>}
                                    {slot.pref_hex && (
                                        <button className="btn btn-sm btn-outline" style={{ padding: '2px 4px', fontSize: '10px' }} onClick={() => updateSlot(slot.id, 'pref_hex', '')}>Clear</button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Assign Slots to Plates */}
                <div style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface2)', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '8px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', fontWeight: 600 }}>
                        Assign Layers / Extruders to Slots (Optional)
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {allPlates.length === 0 ? (
                            <p className="empty-state" style={{ padding: '24px' }}>No plates defined. Go back to step 2.</p>
                        ) : (
                            allPlates.map(plate => (
                                <div key={plate._localId} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '8px', borderRadius: 'var(--radius)' }}>
                                    <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px' }}>{plate.display_name}</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {colorSlots.map(slot => (
                                            <label key={slot.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', cursor: 'pointer', opacity: (plate.slot_keys || []).includes(slot.slot_key) ? 1 : 0.6 }}>
                                                <input
                                                    type="checkbox"
                                                    checked={(plate.slot_keys || []).includes(slot.slot_key)}
                                                    onChange={() => togglePlateSlot(plate._catIdx, plate._optIdx, plate._localId, slot.slot_key)}
                                                    style={{ margin: 0 }}
                                                />
                                                <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: slot.pref_hex ? (slot.pref_hex.startsWith('#') ? slot.pref_hex : `#${slot.pref_hex}`) : 'var(--text-muted)' }} />
                                                {slot.slot_key}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const renderStep4 = () => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', paddingTop: '24px' }}>
            <div style={{ width: '200px', height: '200px', border: '2px dashed var(--border)', borderRadius: 'var(--radius)', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'var(--surface)', overflow: 'hidden', position: 'relative' }}>
                {thumbPreview ? (
                    <img src={thumbPreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                    <span style={{ color: 'var(--text-muted)' }}>No Thumbnail</span>
                )}
            </div>
            <div>
                <input type="file" accept="image/*" onChange={handleThumbSelect} id="thumb-upload" style={{ display: 'none' }} />
                <label htmlFor="thumb-upload" className="btn btn-outline" style={{ cursor: 'pointer' }}>
                    Select Image
                </label>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                Recommended size: 500x500<br />JPEG, PNG, or WebP
            </p>
        </div>
    );


    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', width: '1400px', maxWidth: '95vw', maxHeight: '95vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
                <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: '18px' }}>{existingTemplate ? 'Edit Template' : 'New Template'}</h2>
                    <button className="btn btn-sm" onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: '20px' }}>✕</button>
                </div>

                {/* Wizard Header Progress */}
                <div style={{ display: 'flex', padding: '16px 24px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', gap: '8px' }}>
                    {['Basics', 'Groups & Plates', 'Colors', 'Thumbnail'].map((label, idx) => (
                        <div key={label} style={{ flex: 1, textAlign: 'center', padding: '8px', borderBottom: `3px solid ${step >= idx + 1 ? 'var(--primary)' : 'var(--border)'}`, color: step >= idx + 1 ? 'var(--primary)' : 'var(--text-muted)', fontWeight: step >= idx + 1 ? 'bold' : 'normal', opacity: step >= idx + 1 ? 1 : 0.5 }}>
                            Step {idx + 1}: {label}
                        </div>
                    ))}
                </div>

                <div style={{ padding: '24px', minHeight: '650px' }}>
                    {step === 1 && renderStep1()}
                    {step === 2 && renderStep2()}
                    {step === 3 && renderStep3()}
                    {step === 4 && renderStep4()}
                </div>

                <div style={{ padding: '16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', background: 'var(--surface)' }}>
                    <button className="btn btn-outline" onClick={handleBack} disabled={step === 1 || loading}>
                        Back
                    </button>

                    {step < 4 ? (
                        <button className="btn btn-primary" onClick={handleNext} disabled={loading}>
                            Next
                        </button>
                    ) : (
                        <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
                            {loading ? 'Saving...' : 'Save Template'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
