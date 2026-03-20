import { useState } from 'react';

const ALL_FILAMENT_TYPES = ['PLA', 'PETG', 'ABS', 'ASA', 'Nylon', 'PC', 'TPU', 'HIPS', 'PVA'];

export default function PresetForm({ preset, onSaved, onCancel }) {
    const [form, setForm] = useState({
        name: preset?.name ?? '',
        bed_width: preset?.bed_width ?? 220,
        bed_depth: preset?.bed_depth ?? 220,
        bed_height: preset?.bed_height ?? 250,
        filament_types: preset?.filament_types ?? ['PLA', 'PETG'],
        toolhead_count: preset?.toolhead_count ?? 1,
    });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    function set(field, value) {
        setForm(f => ({ ...f, [field]: value }));
    }

    function toggleFilament(type) {
        setForm(f => {
            const current = f.filament_types;
            return {
                ...f,
                filament_types: current.includes(type)
                    ? current.filter(t => t !== type)
                    : [...current, type],
            };
        });
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await onSaved(form);
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    }

    return (
        <div className="dialog-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
            <div className="dialog dialog-wide">
                <h2>{preset ? 'Edit Preset' : 'New Preset'}</h2>
                <form onSubmit={handleSubmit}>
                    <label className="form-label">
                        Preset Name
                        <input
                            className="form-input"
                            value={form.name}
                            onChange={e => set('name', e.target.value)}
                            required
                            placeholder="e.g. My Custom Voron"
                        />
                    </label>

                    <div className="form-row">
                        <label className="form-label">
                            Bed Width (mm)
                            <input className="form-input" type="number" value={form.bed_width}
                                onChange={e => set('bed_width', Number(e.target.value))} required min={1} />
                        </label>
                        <label className="form-label">
                            Bed Depth (mm)
                            <input className="form-input" type="number" value={form.bed_depth}
                                onChange={e => set('bed_depth', Number(e.target.value))} required min={1} />
                        </label>
                        <label className="form-label">
                            Max Height (mm)
                            <input className="form-input" type="number" value={form.bed_height}
                                onChange={e => set('bed_height', Number(e.target.value))} required min={1} />
                        </label>
                    </div>

                    <label className="form-label">
                        Toolheads
                        <input className="form-input" type="number" value={form.toolhead_count}
                            onChange={e => set('toolhead_count', Number(e.target.value))} required min={1} max={16} />
                    </label>

                    <fieldset className="form-fieldset">
                        <legend>Supported Filaments</legend>
                        <div className="filament-grid">
                            {ALL_FILAMENT_TYPES.map(type => (
                                <label key={type} className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={form.filament_types.includes(type)}
                                        onChange={() => toggleFilament(type)}
                                    />
                                    <span className={`badge badge-filament filament-${type}`}>{type}</span>
                                </label>
                            ))}
                        </div>
                    </fieldset>

                    {error && <p className="form-error">{error}</p>}

                    <div className="dialog-actions">
                        <button type="submit" className="btn btn-primary" disabled={busy}>
                            {busy ? 'Saving…' : 'Save'}
                        </button>
                        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    );
}
