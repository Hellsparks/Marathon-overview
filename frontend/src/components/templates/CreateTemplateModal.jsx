import { useState, useEffect } from 'react';
import { useFiles } from '../../hooks/useFiles';
import { useFolders } from '../../hooks/useFolders';

export default function CreateTemplateModal({ onClose, onSave, existingTemplate, filaments = [] }) {
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);

    // Form State
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [thumbFile, setThumbFile] = useState(null);
    const [thumbPreview, setThumbPreview] = useState(null);

    const [plates, setPlates] = useState([]);
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
            if (existingTemplate.plates) {
                setPlates(existingTemplate.plates.map(p => ({
                    ...p,
                    _localId: Math.random().toString(),
                    slot_keys: p.slot_keys || []
                })));
            }
            if (existingTemplate.color_slots && existingTemplate.color_slots.length > 0) {
                setColorSlots(existingTemplate.color_slots.map(s => ({ ...s, id: s.id || Math.random().toString() })));
            }
        }
    }, [existingTemplate]);

    const handleNext = () => setStep(s => Math.min(s + 1, 4));
    const handleBack = () => setStep(s => Math.max(s - 1, 1));

    const addPlate = (file) => {
        setPlates(prev => [...prev, {
            _localId: Math.random().toString(),
            file_id: file.id,
            filename: '', // backend will generate this or we keep it empty until save
            display_name: file.filename.replace('.gcode', ''),
            filament_type: file.metadata?.filament_type || null,
            sort_order: prev.length,
            slot_keys: []
        }]);
    };

    const removePlate = (localId) => {
        setPlates(prev => prev.filter(p => p._localId !== localId));
    };

    // Step 3 Helper: Slots
    const addSlot = () => {
        setColorSlots(prev => [...prev, {
            id: Math.random().toString(),
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

    const togglePlateSlot = (plateLocalId, slot_key) => {
        setPlates(prev => prev.map(p => {
            if (p._localId !== plateLocalId) return p;
            const keys = p.slot_keys || [];
            if (keys.includes(slot_key)) {
                return { ...p, slot_keys: keys.filter(k => k !== slot_key) };
            } else {
                return { ...p, slot_keys: [...keys, slot_key] };
            }
        }));
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
        if (plates.length === 0) return alert('At least one plate is required.');
        if (colorSlots.length === 0) return alert('At least one color slot is required.');

        setLoading(true);
        try {
            const payload = {
                name,
                description,
                plates: plates.map((p, i) => ({
                    file_id: p.file_id,         // new files
                    filename: p.filename,       // existing files edit
                    display_name: p.display_name,
                    filament_type: p.filament_type,
                    sort_order: i,
                    slot_keys: p.slot_keys || []
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


    // --- Render Steps ---
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

    const renderStep2 = () => {
        // Current dir view
        const currentFolders = folders.filter(f => f.parent_id === currentFolderId);
        const currentFiles = files.filter(f => f.folder_id === currentFolderId);

        return (
            <div style={{ display: 'flex', gap: '16px', height: '400px' }}>
                {/* Left: File Picker */}
                <div style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 'var(--radius)', display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
                    <div style={{ padding: '8px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <button className="btn btn-sm" onClick={() => {
                            if (breadcrumb.length > 1) {
                                setBreadcrumb(prev => prev.slice(0, -1));
                                setCurrentFolderId(breadcrumb[breadcrumb.length - 2].id);
                            }
                        }}>⬆ Up</button>
                        <span style={{ fontSize: '14px', fontWeight: 500 }}>{breadcrumb[breadcrumb.length - 1].name}</span>
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
                            <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', borderBottom: '1px solid var(--border)' }}>
                                <span style={{ fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.filename}>{f.filename}</span>
                                <button className="btn btn-sm btn-outline" onClick={() => addPlate(f)}>Add Plate</button>
                            </div>
                        ))}
                        {currentFolders.length === 0 && currentFiles.length === 0 && (
                            <p className="empty-state" style={{ padding: '24px' }}>Folder is empty</p>
                        )}
                    </div>
                </div>

                {/* Right: Selected Plates */}
                <div style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 'var(--radius)', display: 'flex', flexDirection: 'column', background: 'var(--surface2)' }}>
                    <div style={{ padding: '8px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', fontWeight: 600 }}>
                        Plates in Template ({plates.length})
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {plates.map((plate, i) => (
                            <div key={plate._localId} style={{ background: 'var(--surface)', padding: '8px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-muted)' }}>Plate {i + 1}</span>
                                    <button className="btn btn-sm" style={{ padding: '2px 6px', color: 'var(--error)' }} onClick={() => removePlate(plate._localId)}>✕</button>
                                </div>
                                <input
                                    type="text"
                                    value={plate.display_name}
                                    onChange={e => setPlates(prev => prev.map(p => p._localId === plate._localId ? { ...p, display_name: e.target.value } : p))}
                                    placeholder="Display Name"
                                    style={{ width: '100%', padding: '4px 8px', fontSize: '14px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box' }}
                                />
                                <div style={{ fontSize: '10px', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                                    {plate.filename ? `File: ${plate.filename}` : 'New File (from library)'}
                                </div>
                            </div>
                        ))}
                        {plates.length === 0 && <p className="empty-state" style={{ padding: '24px' }}>Add plates from the library</p>}
                    </div>
                </div>
            </div>
        );
    };

    const renderStep3 = () => (
        <div style={{ display: 'flex', gap: '16px', height: '400px' }}>
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
                                    <label style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>Hex Overide:</label>
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
                    {plates.length === 0 ? (
                        <p className="empty-state" style={{ padding: '24px' }}>No plates defined. Go back to step 2.</p>
                    ) : (
                        plates.map(plate => (
                            <div key={plate._localId} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '8px', borderRadius: 'var(--radius)' }}>
                                <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px' }}>{plate.display_name}</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {colorSlots.map(slot => (
                                        <label key={slot.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', cursor: 'pointer', opacity: (plate.slot_keys || []).includes(slot.slot_key) ? 1 : 0.6 }}>
                                            <input
                                                type="checkbox"
                                                checked={(plate.slot_keys || []).includes(slot.slot_key)}
                                                onChange={() => togglePlateSlot(plate._localId, slot.slot_key)}
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
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', width: '800px', maxWidth: '95vw', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
                <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: '18px' }}>{existingTemplate ? 'Edit Template' : 'New Template'}</h2>
                    <button className="btn btn-sm" onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: '20px' }}>✕</button>
                </div>

                {/* Wizard Header Progress */}
                <div style={{ display: 'flex', padding: '16px 24px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', gap: '8px' }}>
                    {['Basics', 'Plates', 'Colors', 'Thumbnail'].map((label, idx) => (
                        <div key={label} style={{ flex: 1, textAlign: 'center', padding: '8px', borderBottom: `3px solid ${step >= idx + 1 ? 'var(--primary)' : 'var(--border)'}`, color: step >= idx + 1 ? 'var(--primary)' : 'var(--text-muted)', fontWeight: step >= idx + 1 ? 'bold' : 'normal', opacity: step >= idx + 1 ? 1 : 0.5 }}>
                            Step {idx + 1}: {label}
                        </div>
                    ))}
                </div>

                <div style={{ padding: '24px', minHeight: '450px' }}>
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
