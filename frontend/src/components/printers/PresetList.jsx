import { useState, useEffect } from 'react';
import { getPresets, createPreset, updatePreset, deletePreset } from '../../api/presets';
import ConfirmDialog from '../common/ConfirmDialog';
import PresetForm from './PresetForm';

export default function PresetList() {
    const [presets, setPresets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingPreset, setEditingPreset] = useState(null);
    const [addingNew, setAddingNew] = useState(false);
    const [deletingId, setDeletingId] = useState(null);

    async function refresh() {
        try {
            setPresets(await getPresets());
        } catch (e) {
            console.error('Failed to load presets', e);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { refresh(); }, []);

    async function handleSave(data) {
        if (editingPreset) {
            await updatePreset(editingPreset.id, data);
        } else {
            await createPreset(data);
        }
        setEditingPreset(null);
        setAddingNew(false);
        refresh();
    }

    async function handleDelete(id) {
        try {
            await deletePreset(id);
            refresh();
        } catch (e) {
            alert(e.message);
        } finally {
            setDeletingId(null);
        }
    }

    if (loading) return <div className="loading">Loading presets…</div>;

    // Split into built-in and custom
    const builtIn = presets.filter(p => p.is_builtin);
    const custom = presets.filter(p => !p.is_builtin);

    return (
        <div>
            <div className="section-toolbar">
                <button className="btn btn-primary" onClick={() => setAddingNew(true)}>
                    + New Preset
                </button>
            </div>

            {presets.length === 0 ? (
                <p className="empty-state">No presets found.</p>
            ) : (
                <table className="file-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Bed Size</th>
                            <th>Max Height</th>
                            <th>Toolheads</th>
                            <th>Filaments</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {builtIn.map(p => (
                            <tr key={p.id}>
                                <td>
                                    <span className="preset-name">{p.name}</span>
                                    <span className="badge badge-muted" title="Built-in preset">🔒</span>
                                </td>
                                <td>{p.bed_width}×{p.bed_depth}mm</td>
                                <td>{p.bed_height}mm</td>
                                <td>{p.toolhead_count}</td>
                                <td><FilamentBadges types={p.filament_types} /></td>
                                <td className="file-actions">
                                    <span className="text-muted">Built-in</span>
                                </td>
                            </tr>
                        ))}
                        {custom.map(p => (
                            <tr key={p.id}>
                                <td><span className="preset-name">{p.name}</span></td>
                                <td>{p.bed_width}×{p.bed_depth}mm</td>
                                <td>{p.bed_height}mm</td>
                                <td>{p.toolhead_count}</td>
                                <td><FilamentBadges types={p.filament_types} /></td>
                                <td className="file-actions">
                                    <button className="btn btn-sm" onClick={() => setEditingPreset(p)}>Edit</button>
                                    <button className="btn btn-sm btn-danger" onClick={() => setDeletingId(p.id)}>Delete</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {(addingNew || editingPreset) && (
                <PresetForm
                    preset={editingPreset}
                    onSaved={handleSave}
                    onCancel={() => { setAddingNew(false); setEditingPreset(null); }}
                />
            )}

            {deletingId && (
                <ConfirmDialog
                    message={`Delete "${presets.find(p => p.id === deletingId)?.name}"?`}
                    onConfirm={() => handleDelete(deletingId)}
                    onCancel={() => setDeletingId(null)}
                />
            )}
        </div>
    );
}

function FilamentBadges({ types }) {
    if (!types || types.length === 0) return <span className="text-muted">—</span>;
    return (
        <div className="badge-row">
            {types.map(t => (
                <span key={t} className="badge badge-filament">{t}</span>
            ))}
        </div>
    );
}
