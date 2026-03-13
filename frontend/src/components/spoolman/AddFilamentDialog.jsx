import { useState, useEffect } from 'react';
import { createFilament, updateFilament, getVendors, getFields } from '../../api/spoolman';
import { getSettings } from '../../api/settings';
import { RAL_COLORS, findClosestRal } from '../../utils/ralColors';
import { fetchSwatchStl, makeSwatchFilename, getSwatchLines, downloadBuffer } from '../../api/extras';
import { onReading as coloriometerOnReading, getLastReading, getStatus as coloriometerStatus } from '../../services/colorimeter';

const COMMON_MATERIALS = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'PLA+', 'PA', 'PC', 'HIPS', 'PVA'];

const MATERIAL_DENSITIES = {
    PLA: 1.24, 'PLA+': 1.24,
    PETG: 1.27,
    ABS: 1.04, ASA: 1.05,
    TPU: 1.21,
    PA: 1.14,
    PC: 1.20,
    HIPS: 1.04,
    PVA: 1.23,
};

// filament prop = edit mode; undefined = create mode
export default function AddFilamentDialog({ onClose, onCreated, onAddVendor, filament, isClone }) {
    const isEdit = !!filament && !isClone;
    const [vendors, setVendors] = useState([]);
    const [extraFields, setExtraFields] = useState([]);

    const [vendorId, setVendorId] = useState(String(filament?.vendor?.id ?? ''));
    const [name, setName] = useState(filament?.name ?? '');
    const [material, setMaterial] = useState(filament?.material ?? '');
    const [density, setDensity] = useState(String(filament?.density ?? '1.24'));
    const [colorHex, setColorHex] = useState(filament?.color_hex ? `#${filament.color_hex}` : '#ffffff');
    const [colorRal, setColorRal] = useState('');
    const [diameter, setDiameter] = useState(String(filament?.diameter ?? '1.75'));
    const [weight, setWeight] = useState(String(filament?.weight ?? '1000'));
    const [spoolWeight, setSpoolWeight] = useState(String(filament?.spool_weight ?? ''));
    const [comment, setComment] = useState(filament?.comment ?? '');
    const [extra, setExtra] = useState(() => {
        const e = filament?.extra ? { ...filament.extra } : {};
        for (const k in e) {
            if (typeof e[k] === 'string' && e[k].startsWith('"') && e[k].endsWith('"')) {
                e[k] = e[k].slice(1, -1);
            }
        }
        return e;
    });
    const [busy, setBusy] = useState(false);
    const [tdFieldKey, setTdFieldKey] = useState('');
    const [td1Reading, setTd1Reading] = useState(() => getLastReading());

    // Track live TD1 readings while dialog is open
    useEffect(() => coloriometerOnReading(setTd1Reading), []);

    useEffect(() => {
        Promise.all([getVendors(), getFields('filament'), getSettings()])
            .then(([v, f, s]) => {
                setVendors(v || []);
                setExtraFields(f || []);
                setTdFieldKey(s?.hueforge_td_field || '');
            })
            .catch(() => { });
    }, []);

    // Sync RAL string whenever hex changes
    useEffect(() => {
        if (!colorHex) {
            setColorRal('');
            return;
        }
        const closest = findClosestRal(colorHex);
        if (closest) {
            setColorRal(closest.exact ? `RAL ${closest.ral}` : `~ RAL ${closest.ral}`);
        } else {
            setColorRal('');
        }
    }, [colorHex]);

    function handleMaterialChange(val) {
        setMaterial(val);
        if (!isEdit) {
            const known = MATERIAL_DENSITIES[val.toUpperCase()] || MATERIAL_DENSITIES[val];
            if (known) setDensity(String(known));
        }
    }

    function handleRalChange(val) {
        setColorRal(val);
        // Specifically check if they typed a valid RAL number (e.g. "RAL 1004" or "1004")
        const match = val.match(/\b(10[0-3]\d|20[0-1]\d|30[0-3]\d|40[0-1]\d|50[0-2]\d|60[0-3]\d|70[0-4]\d|80[0-2]\d|90[0-2]\d)\b/);
        if (match) {
            const ralCode = match[1];
            const ralColor = RAL_COLORS.find(r => r.ral === ralCode);
            if (ralColor) {
                setColorHex(ralColor.hex);
            }
        }
    }

    function setExtraVal(key, val) {
        setExtra(prev => ({ ...prev, [key]: val }));
    }

    function handleColoriometerReading({ hex, td }) {
        if (hex) setColorHex(`#${hex}`);
        if (td !== null && td !== undefined && tdFieldKey) {
            setExtraVal(tdFieldKey, String(td));
        }
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (!name.trim()) return;
        setBusy(true);
        try {
            const body = {
                name: name.trim(),
                diameter: parseFloat(diameter) || 1.75,
                density: parseFloat(density) || 1.24,
            };
            if (vendorId) body.vendor_id = parseInt(vendorId);
            else if (isEdit) body.vendor_id = null;
            if (material.trim()) body.material = material.trim();
            if (colorHex) body.color_hex = colorHex.replace(/^#/, '');
            if (weight) body.weight = parseFloat(weight);
            if (spoolWeight) body.spool_weight = parseFloat(spoolWeight);
            if (comment.trim()) body.comment = comment.trim();

            const extraOut = {};
            for (const f of extraFields) {
                let val = extra[f.key];
                if (f.field_type === 'boolean') {
                    // Boolean fields can be physically false, which fails the `!val` check below if we're not careful
                    if (val !== undefined && val !== null) {
                        extraOut[f.key] = (val === true || val === 'true') ? 'true' : 'false';
                    }
                    continue;
                }

                if (val === '' || val === undefined || val === null) {
                    continue; // Do not send empty extra fields at all (avoids 422 if it's float/int)
                }

                if (f.field_type === 'float' || f.field_type === 'integer') {
                    // Spoolman natively treats all extra fields as strings under the hood, but validating them
                    // depends on Pydantic correctly decoding the string.
                    extraOut[f.key] = String(parseFloat(val));
                } else {
                    if (typeof val === 'string' && !val.startsWith('"') && !val.startsWith('{') && !val.startsWith('[')) {
                        val = `"${val}"`;
                    }
                    extraOut[f.key] = val;
                }
            }
            body.extra = extraOut;

            const result = isEdit
                ? await updateFilament(filament.id, body)
                : await createFilament(body);
            onCreated(result);
        } catch (err) {
            alert(err.message);
        } finally {
            setBusy(false);
        }
    }

    async function handleDownloadSwatch() {
        setBusy(true);
        try {
            const fakeFilament = {
                id: filament?.id || 0,
                name: name.trim(),
                material: material.trim(),
                vendor: vendors.find(v => String(v.id) === vendorId)
            };
            const { line1, line2 } = getSwatchLines(fakeFilament);
            const buf = await fetchSwatchStl(line1, line2, null);
            downloadBuffer(buf, makeSwatchFilename(fakeFilament));
        } catch (e) {
            alert(e.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="spool-dialog-overlay" onClick={onClose}>
            <div className="spool-dialog spool-dialog-wide" onClick={e => e.stopPropagation()}>
                <div className="spool-dialog-header">
                    <h3 className="spool-dialog-title">{isEdit ? 'Edit Filament' : isClone ? 'Clone Filament' : 'Add Filament'}</h3>
                    <button className="spool-dialog-close" onClick={onClose}>✕</button>
                </div>

                <form onSubmit={handleSubmit} className="sm-form sm-form-grid">
                    <div className="sm-field sm-field-full">
                        <label className="sm-label">Name *</label>
                        <input
                            className="sm-input"
                            type="text"
                            placeholder="e.g. PLA+ Blue"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            autoFocus
                            required
                        />
                    </div>

                    <div className="sm-field">
                        <label className="sm-label">Manufacturer</label>
                        <div className="sm-vendor-row">
                            <select
                                className="sm-input sm-select"
                                value={vendorId}
                                onChange={e => setVendorId(e.target.value)}
                            >
                                <option value="">— None —</option>
                                {vendors.map(v => (
                                    <option key={v.id} value={v.id}>{v.name}</option>
                                ))}
                            </select>
                            {onAddVendor && (
                                <button type="button" className="sm-add-vendor-btn" title="Add new manufacturer" onClick={onAddVendor}>+</button>
                            )}
                        </div>
                    </div>

                    <div className="sm-field">
                        <label className="sm-label">Material</label>
                        <input
                            className="sm-input"
                            type="text"
                            list="sm-materials"
                            placeholder="e.g. PLA"
                            value={material}
                            onChange={e => handleMaterialChange(e.target.value)}
                        />
                        <datalist id="sm-materials">
                            {COMMON_MATERIALS.map(m => <option key={m} value={m} />)}
                        </datalist>
                    </div>

                    <div className="sm-field">
                        <label className="sm-label">Color</label>
                        <div className="sm-color-row">
                            <input
                                type="color"
                                className="sm-color-picker"
                                value={colorHex.match(/^#[0-9a-fA-F]{6}$/) ? colorHex : '#ffffff'}
                                onChange={e => setColorHex(e.target.value)}
                            />
                            <input
                                className="sm-input sm-color-hex"
                                type="text"
                                maxLength={7}
                                value={colorHex}
                                onChange={e => setColorHex(e.target.value)}
                                placeholder="#ffffff"
                                style={{ width: '80px', textTransform: 'uppercase' }}
                            />
                            <input
                                className="sm-input sm-color-ral"
                                type="text"
                                value={colorRal}
                                onChange={e => handleRalChange(e.target.value)}
                                placeholder="RAL code"
                                style={{ width: '100px' }}
                                title="e.g. 1004 or RAL 1004"
                            />
                        </div>
                    </div>

                    {/* TD1 colorimeter quick-apply */}
                    <div className="sm-field sm-field-full">
                        <div className="colorimeter-apply-row">
                            {td1Reading ? (
                                <>
                                    <span className="colorimeter-mini-swatch" style={{ background: `#${td1Reading.hex}`, width: 18, height: 18, borderRadius: 4, border: '1px solid var(--border)', flexShrink: 0 }} />
                                    <span style={{ fontFamily: 'monospace', fontSize: 13 }}>#{td1Reading.hex}</span>
                                    {td1Reading.td !== null && (
                                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                            TD: {td1Reading.td}{tdFieldKey ? ` → ${tdFieldKey}` : ''}
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        style={{ marginLeft: 'auto', padding: '3px 10px', fontSize: 12 }}
                                        onClick={() => handleColoriometerReading(td1Reading)}
                                    >
                                        Apply TD1
                                    </button>
                                </>
                            ) : (
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                    {coloriometerStatus() === 'connected'
                                        ? 'TD1 connected — scan a filament to get a reading'
                                        : 'Connect TD1 on the Filaments page to auto-fill color & TD'}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="sm-field">
                        <label className="sm-label">Diameter (mm) *</label>
                        <input className="sm-input" type="number" step="0.01" value={diameter} onChange={e => setDiameter(e.target.value)} placeholder="1.75" required />
                    </div>

                    <div className="sm-field">
                        <label className="sm-label">Density (g/cm³) *</label>
                        <input className="sm-input" type="number" step="0.01" value={density} onChange={e => setDensity(e.target.value)} placeholder="1.24" required />
                    </div>

                    <div className="sm-field">
                        <label className="sm-label">Filament Weight (g)</label>
                        <input className="sm-input" type="number" step="any" value={weight} onChange={e => setWeight(e.target.value)} placeholder="1000" />
                    </div>

                    <div className="sm-field">
                        <label className="sm-label">Empty Spool Weight (g)</label>
                        <input className="sm-input" type="number" step="any" value={spoolWeight} onChange={e => setSpoolWeight(e.target.value)} placeholder="Optional" />
                    </div>

                    <div className="sm-field sm-field-full">
                        <label className="sm-label">Comment</label>
                        <input className="sm-input" type="text" placeholder="Optional" value={comment} onChange={e => setComment(e.target.value)} />
                    </div>

                    {extraFields.map(f => {
                        if (f.field_type === 'boolean') {
                            const isChecked = extra[f.key] === true || extra[f.key] === 'true';
                            return (
                                <div key={f.key} className="sm-field sm-field-full" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={e => setExtraVal(f.key, e.target.checked)}
                                            style={{
                                                appearance: 'none', WebkitAppearance: 'none', width: '18px', height: '18px',
                                                border: '2px solid var(--border)', borderRadius: '4px', cursor: 'pointer',
                                                backgroundColor: 'var(--surface)', display: 'flex', alignItems: 'center',
                                                justifyContent: 'center', flexShrink: 0, accentColor: 'var(--primary, #0ea5e9)'
                                            }}
                                        />
                                        <label className="sm-label" style={{ marginBottom: 0, cursor: 'pointer', userSelect: 'none' }} onClick={() => setExtraVal(f.key, !isChecked)}>
                                            {f.name}
                                        </label>
                                    </div>
                                    {f.key === 'swatch' && (
                                        <button
                                            type="button"
                                            className="btn"
                                            style={{ padding: '4px 8px', fontSize: '12px' }}
                                            onClick={handleDownloadSwatch}
                                            disabled={busy || !name.trim()}
                                        >
                                            Generate & Download STL
                                        </button>
                                    )}
                                </div>
                            );
                        }

                        return (
                            <div key={f.key} className="sm-field">
                                <label className="sm-label">{f.name}{f.unit ? ` (${f.unit})` : ''}</label>
                                <input
                                    className="sm-input"
                                    type={f.field_type === 'float' || f.field_type === 'integer' ? 'number' : 'text'}
                                    step={f.field_type === 'float' ? 'any' : undefined}
                                    placeholder={f.default_value ?? ''}
                                    value={extra[f.key] ?? ''}
                                    onChange={e => setExtraVal(f.key, e.target.value)}
                                />
                            </div>
                        );
                    })}

                    <div className="spool-dialog-actions sm-field-full">
                        <button type="button" className="btn v-btn" onClick={onClose} disabled={busy}>Cancel</button>
                        <button type="submit" className="btn btn-primary v-btn" disabled={busy || !name.trim()}>
                            {busy ? 'Saving…' : isEdit ? 'Save' : 'Create'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
