import { useState, useEffect } from 'react';
import { createSpool, getFilaments } from '../../api/spoolman';

export default function AddSpoolDialog({ onClose, onCreated, onAddFilament }) {
    const [filaments, setFilaments] = useState([]);
    const [filamentId, setFilamentId] = useState('');
    const [initialWeight, setInitialWeight] = useState('');
    const [spoolWeight, setSpoolWeight] = useState('');
    const [lotNr, setLotNr] = useState('');
    const [comment, setComment] = useState('');
    const [busy, setBusy] = useState(false);
    const [search, setSearch] = useState('');

    useEffect(() => {
        getFilaments()
            .then(f => setFilaments(f || []))
            .catch(() => {});
    }, []);

    const filtered = filaments.filter(f => {
        const q = search.toLowerCase();
        if (!q) return true;
        return (
            (f.name || '').toLowerCase().includes(q) ||
            (f.material || '').toLowerCase().includes(q) ||
            (f.vendor?.name || '').toLowerCase().includes(q)
        );
    });

    const selectedFilament = filaments.find(f => f.id === parseInt(filamentId));

    async function handleSubmit(e) {
        e.preventDefault();
        if (!filamentId) return;
        setBusy(true);
        try {
            const body = { filament_id: parseInt(filamentId) };
            if (initialWeight) body.initial_weight = parseFloat(initialWeight);
            if (spoolWeight) body.spool_weight = parseFloat(spoolWeight);
            if (lotNr.trim()) body.lot_nr = lotNr.trim();
            if (comment.trim()) body.comment = comment.trim();
            const created = await createSpool(body);
            onCreated(created);
        } catch (err) {
            alert(err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="spool-dialog-overlay" onClick={onClose}>
            <div className="spool-dialog spool-dialog-wide" onClick={e => e.stopPropagation()}>
                <div className="spool-dialog-header">
                    <h3 className="spool-dialog-title">Add Spool</h3>
                    <button className="spool-dialog-close" onClick={onClose}>✕</button>
                </div>

                <form onSubmit={handleSubmit} className="sm-form sm-form-grid">
                    {/* Filament picker */}
                    <div className="sm-field sm-field-full">
                        <label className="sm-label">Filament *</label>
                        <div className="sm-vendor-row">
                            <input
                                className="sm-input"
                                type="text"
                                placeholder="Search filaments…"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                            <button
                                type="button"
                                className="sm-add-vendor-btn"
                                title="Add new filament"
                                onClick={onAddFilament}
                            >+</button>
                        </div>
                        <div className="sm-filament-list">
                            {filtered.length === 0 && (
                                <div className="sm-filament-empty">No filaments found</div>
                            )}
                            {filtered.map(f => {
                                const color = `#${f.color_hex || '888888'}`;
                                const selected = String(f.id) === String(filamentId);
                                return (
                                    <div
                                        key={f.id}
                                        className={`sm-filament-row${selected ? ' selected' : ''}`}
                                        onClick={() => setFilamentId(String(f.id))}
                                    >
                                        <div className="sm-filament-dot" style={{ backgroundColor: color }} />
                                        <div className="sm-filament-info">
                                            <span className="sm-filament-name">{f.name}</span>
                                            <span className="sm-filament-meta">
                                                {[f.vendor?.name, f.material].filter(Boolean).join(' · ')}
                                            </span>
                                        </div>
                                        {selected && <span className="sm-filament-check">✓</span>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Auto-populate empty spool weight from filament definition */}
                    {selectedFilament?.spool_weight && !spoolWeight && (
                        <div className="sm-field-full sm-hint">
                            Filament defines empty spool weight: {selectedFilament.spool_weight}g
                            <button type="button" className="sm-hint-use" onClick={() => setSpoolWeight(String(selectedFilament.spool_weight))}>
                                Use
                            </button>
                        </div>
                    )}

                    <div className="sm-field">
                        <label className="sm-label">Filament Weight (g)</label>
                        <input
                            className="sm-input"
                            type="number"
                            step="any"
                            value={initialWeight}
                            onChange={e => setInitialWeight(e.target.value)}
                            placeholder={selectedFilament?.weight ? String(selectedFilament.weight) : 'e.g. 1000'}
                        />
                    </div>

                    <div className="sm-field">
                        <label className="sm-label">Empty Spool Weight (g)</label>
                        <input
                            className="sm-input"
                            type="number"
                            step="any"
                            value={spoolWeight}
                            onChange={e => setSpoolWeight(e.target.value)}
                            placeholder="Optional"
                        />
                    </div>

                    <div className="sm-field">
                        <label className="sm-label">Lot / Batch Number</label>
                        <input
                            className="sm-input"
                            type="text"
                            value={lotNr}
                            onChange={e => setLotNr(e.target.value)}
                            placeholder="Optional"
                        />
                    </div>

                    <div className="sm-field">
                        <label className="sm-label">Comment</label>
                        <input
                            className="sm-input"
                            type="text"
                            value={comment}
                            onChange={e => setComment(e.target.value)}
                            placeholder="Optional"
                        />
                    </div>

                    <div className="spool-dialog-actions sm-field-full">
                        <button type="button" className="btn v-btn" onClick={onClose} disabled={busy}>Cancel</button>
                        <button type="submit" className="btn btn-primary v-btn" disabled={busy || !filamentId}>
                            {busy ? 'Saving…' : 'Create'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
