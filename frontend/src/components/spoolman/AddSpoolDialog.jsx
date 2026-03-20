import { useState, useEffect, useMemo } from 'react';
import { createSpool, getFilaments, updateFilament } from '../../api/spoolman';
import { getSettings } from '../../api/settings';
import { fetchSwatchStl, makeSwatchFilename, getSwatchLines, downloadBuffer } from '../../api/extras';
import { buildColorStyle } from '../../utils/colorUtils';

const COLOR_NAMES = {
    red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255], yellow: [255, 255, 0],
    orange: [255, 165, 0], purple: [128, 0, 128], pink: [255, 192, 203],
    black: [0, 0, 0], white: [255, 255, 255], gray: [128, 128, 128], grey: [128, 128, 128],
    silver: [192, 192, 192], cyan: [0, 255, 255], magenta: [255, 0, 255], brown: [165, 42, 42],
};
function hexToRgb(hex) {
    if (!hex) return null;
    const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}
function colorDistance(a, b) { return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2); }
function matchesColor(hex, tokens) {
    const rgb = hexToRgb(hex);
    if (!rgb) return false;
    return tokens.some(t => COLOR_NAMES[t] && colorDistance(rgb, COLOR_NAMES[t]) < 120);
}

export default function AddSpoolDialog({
    onClose, onCreated, onAddFilament,
    storageLocation = null,
    defaultInStorage = false,
    preselectedFilamentId = null,
}) {
    const [filaments, setFilaments] = useState([]);
    const [filamentId, setFilamentId] = useState('');
    const [initialWeight, setInitialWeight] = useState('');
    const [spoolWeight, setSpoolWeight] = useState('');
    const [lotNr, setLotNr] = useState('');
    const [comment, setComment] = useState('');
    const [inStorage, setInStorage] = useState(defaultInStorage);
    const [quantity, setQuantity] = useState(1);
    const [busy, setBusy] = useState(false);
    const [search, setSearch] = useState('');
    const [materialFilter, setMaterialFilter] = useState([]);
    const [vendorFilter, setVendorFilter] = useState([]);
    const [showFilterPopover, setShowFilterPopover] = useState(false);

    const [swatchField, setSwatchField] = useState(null);
    const [swatchPromptEnabled, setSwatchPromptEnabled] = useState(false);
    const [promptSpool, setPromptSpool] = useState(null);
    const [promptFilament, setPromptFilament] = useState(null);
    const [promptBusy, setPromptBusy] = useState(false);
    const [promptError, setPromptError] = useState(null);

    useEffect(() => {
        if (preselectedFilamentId != null) setFilamentId(String(preselectedFilamentId));
    }, [preselectedFilamentId]);

    useEffect(() => {
        getFilaments()
            .then(f => setFilaments(f || []))
            .catch(() => { });
        getSettings().then(s => {
            setSwatchField(s.swatch_extra_field || null);
            setSwatchPromptEnabled(s.swatch_prompt_enabled === 'true' || s.swatch_prompt_enabled === true);
        }).catch(() => { });
    }, []);

    const uniqueMaterials = useMemo(() => Array.from(new Set(filaments.map(f => f.material).filter(Boolean))).sort(), [filaments]);
    const uniqueVendors = useMemo(() => Array.from(new Set(filaments.map(f => f.vendor?.name).filter(Boolean))).sort(), [filaments]);

    const filtered = filaments.filter(f => {
        if (materialFilter.length > 0 && !materialFilter.includes(f.material)) return false;
        if (vendorFilter.length > 0 && !vendorFilter.includes(f.vendor?.name)) return false;
        const q = search.toLowerCase();
        if (!q) return true;
        const tokens = q.split(/\s+/);
        return (
            (f.name || '').toLowerCase().includes(q) ||
            (f.material || '').toLowerCase().includes(q) ||
            (f.vendor?.name || '').toLowerCase().includes(q) ||
            matchesColor(f.color_hex, tokens)
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
            if (inStorage && storageLocation) body.location = storageLocation;

            const qty = Math.max(1, parseInt(quantity) || 1);
            let created;
            for (let i = 0; i < qty; i++) created = await createSpool(body);

            // Only show swatch prompt for single-spool creation
            if (qty === 1 && swatchPromptEnabled && swatchField && selectedFilament) {
                const hasPrinted = selectedFilament.extra?.[swatchField] === true || selectedFilament.extra?.[swatchField] === 'true';
                if (!hasPrinted) {
                    setPromptSpool(created);
                    setPromptFilament(selectedFilament);
                    setBusy(false);
                    return;
                }
            }

            onCreated(created);
        } catch (err) {
            alert(err.message);
        } finally {
            setBusy(false);
        }
    }

    async function handleMarkPrinted() {
        setPromptBusy(true);
        try {
            await updateFilament(promptFilament.id, { extra: { [swatchField]: 'true' } });
            onCreated(promptSpool);
        } catch (e) {
            setPromptError(e.message);
            setPromptBusy(false);
        }
    }

    async function handleDownloadAndMark() {
        setPromptBusy(true);
        try {
            const { line1, line2 } = getSwatchLines(promptFilament);
            const buf = await fetchSwatchStl(line1, line2, null);
            downloadBuffer(buf, makeSwatchFilename(promptFilament));
            await updateFilament(promptFilament.id, { extra: { [swatchField]: 'true' } });
            onCreated(promptSpool);
        } catch (e) {
            setPromptError(e.message);
            setPromptBusy(false);
        }
    }

    function handleIgnore() {
        onCreated(promptSpool);
    }

    if (promptSpool && promptFilament) {
        return (
            <div className="spool-dialog-overlay" onMouseDown={e => { if (e.target === e.currentTarget) handleIgnore(); }}>
                <div className="spool-dialog" style={{ maxWidth: '400px' }}>
                    <div className="spool-dialog-header">
                        <h3 className="spool-dialog-title">Swatch Check</h3>
                        <button className="spool-dialog-close" onClick={handleIgnore}>✕</button>
                    </div>
                    <div style={{ padding: '20px 0', textAlign: 'center' }}>
                        <div style={{ fontSize: '32px', marginBottom: '12px' }}>🎨</div>
                        <p style={{ fontSize: '15px', fontWeight: 500, marginBottom: '8px', color: 'var(--text)' }}>
                            Have you printed a swatch for this filament?
                        </p>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '24px' }}>
                            {promptFilament.vendor?.name} {promptFilament.name || `Filament #${promptFilament.id}`}
                        </p>
                        {promptError && (
                            <div className="error" style={{ marginBottom: '16px', fontSize: '13px', textAlign: 'left' }}>{promptError}</div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <button className="btn btn-primary" onClick={handleMarkPrinted} disabled={promptBusy}>
                                {promptBusy ? 'Saving…' : 'Yes, mark as Printed'}
                            </button>
                            <button className="btn" onClick={handleDownloadAndMark} disabled={promptBusy}>
                                {promptBusy ? 'Downloading…' : 'No, Download STL & Mark'}
                            </button>
                            <button className="btn" onClick={handleIgnore} disabled={promptBusy} style={{ background: 'transparent', border: '1px solid transparent', color: 'var(--text-muted)' }}>
                                Ignore Setup (Ask Later)
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="spool-dialog-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="spool-dialog spool-dialog-wide">
                <div className="spool-dialog-header">
                    <h3 className="spool-dialog-title">Add Spool</h3>
                    <button className="spool-dialog-close" onClick={onClose}>✕</button>
                </div>

                <form onSubmit={handleSubmit} className="sm-form sm-form-grid">
                    {/* Filament picker */}
                    <div className="sm-field sm-field-full" style={{ position: 'relative' }}>
                        <label className="sm-label">Filament *</label>
                        <div className="sm-vendor-row">
                            <div style={{ position: 'relative', flex: 1 }}>
                                <input
                                    className="sm-input"
                                    type="text"
                                    placeholder="Search filaments by name, color, vendor…"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    style={{ paddingRight: '36px', width: '100%' }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowFilterPopover(!showFilterPopover)}
                                    style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', padding: '6px 10px', fontSize: '13px', border: 'none', background: 'transparent', cursor: 'pointer', color: (materialFilter.length || vendorFilter.length) ? 'var(--primary)' : 'var(--text-muted)' }}
                                    title="Filter filaments"
                                >⚙</button>
                            </div>
                            <button
                                type="button"
                                className="sm-add-vendor-btn"
                                title="Add new filament"
                                onClick={onAddFilament}
                            >+</button>
                        </div>
                        {showFilterPopover && (
                            <>
                                <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setShowFilterPopover(false)} />
                                <div style={{
                                    position: 'absolute', top: '100%', right: 0, marginTop: '4px',
                                    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px',
                                    padding: '12px', zIndex: 1000, minWidth: '240px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                                }} onClick={e => e.stopPropagation()}>
                                    <div style={{ marginBottom: '12px' }}>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-muted)' }}>Material</label>
                                        <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '4px', padding: '6px' }}>
                                            {uniqueMaterials.map(m => (
                                                <label key={m} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', cursor: 'pointer', fontSize: '13px' }}>
                                                    <input type="checkbox" checked={materialFilter.includes(m)}
                                                        onChange={e => e.target.checked ? setMaterialFilter([...materialFilter, m]) : setMaterialFilter(materialFilter.filter(x => x !== m))}
                                                    /> {m}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: '12px' }}>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-muted)' }}>Vendor</label>
                                        <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '4px', padding: '6px' }}>
                                            {uniqueVendors.map(v => (
                                                <label key={v} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', cursor: 'pointer', fontSize: '13px' }}>
                                                    <input type="checkbox" checked={vendorFilter.includes(v)}
                                                        onChange={e => e.target.checked ? setVendorFilter([...vendorFilter, v]) : setVendorFilter(vendorFilter.filter(x => x !== v))}
                                                    /> {v}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                    <button type="button" className="btn btn-sm"
                                        onClick={() => { setMaterialFilter([]); setVendorFilter([]); setShowFilterPopover(false); }}
                                        style={{ width: '100%', fontSize: '12px' }}>
                                        Clear Filters
                                    </button>
                                </div>
                            </>
                        )}
                        <div className="sm-filament-list">
                            {filtered.length === 0 && (
                                <div className="sm-filament-empty">No filaments found</div>
                            )}
                            {filtered.map(f => {
                                const selected = String(f.id) === String(filamentId);
                                return (
                                    <div
                                        key={f.id}
                                        className={`sm-filament-row${selected ? ' selected' : ''}`}
                                        onClick={() => setFilamentId(String(f.id))}
                                    >
                                        <div className="sm-filament-dot" style={buildColorStyle(f)} />
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

                    <div className="sm-field sm-field-full" style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                        {storageLocation && (
                            <label className="sm-checkbox-label">
                                <input
                                    type="checkbox"
                                    checked={inStorage}
                                    onChange={e => setInStorage(e.target.checked)}
                                />
                                Add to storage ({storageLocation})
                            </label>
                        )}
                        <label className="sm-checkbox-label" style={{ gap: '6px' }}>
                            Quantity
                            <input
                                className="sm-input"
                                type="number"
                                min="1"
                                max="50"
                                value={quantity}
                                onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                style={{ width: '60px', textAlign: 'center' }}
                            />
                        </label>
                    </div>

                    <div className="spool-dialog-actions sm-field-full">
                        <button type="button" className="btn v-btn" onClick={onClose} disabled={busy}>Cancel</button>
                        <button type="submit" className="btn btn-primary v-btn" disabled={busy || !filamentId}>
                            {busy ? 'Saving…' : quantity > 1 ? `Create ×${quantity}` : 'Create'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
