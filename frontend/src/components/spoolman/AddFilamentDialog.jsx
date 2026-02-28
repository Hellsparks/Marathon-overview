import { useState, useEffect } from 'react';
import { createFilament, getVendors, getFields } from '../../api/spoolman';

const COMMON_MATERIALS = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'PLA+', 'PA', 'PC', 'HIPS', 'PVA'];

// Default densities (g/cm³) by material — used to pre-fill the density field
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

export default function AddFilamentDialog({ onClose, onCreated, onAddVendor }) {
    const [vendors, setVendors] = useState([]);
    const [extraFields, setExtraFields] = useState([]);

    const [vendorId, setVendorId] = useState('');
    const [name, setName] = useState('');
    const [material, setMaterial] = useState('');
    const [density, setDensity] = useState('1.24');
    const [colorHex, setColorHex] = useState('#ffffff');
    const [diameter, setDiameter] = useState('1.75');
    const [weight, setWeight] = useState('1000');
    const [spoolWeight, setSpoolWeight] = useState('');
    const [comment, setComment] = useState('');
    const [extra, setExtra] = useState({});
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        Promise.all([getVendors(), getFields('filament')])
            .then(([v, f]) => { setVendors(v || []); setExtraFields(f || []); })
            .catch(() => {});
    }, []);

    function handleMaterialChange(val) {
        setMaterial(val);
        const known = MATERIAL_DENSITIES[val.toUpperCase()] || MATERIAL_DENSITIES[val];
        if (known) setDensity(String(known));
    }

    function setExtraVal(key, val) {
        setExtra(prev => ({ ...prev, [key]: val }));
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
            if (material.trim()) body.material = material.trim();
            // strip leading # for Spoolman
            if (colorHex) body.color_hex = colorHex.replace(/^#/, '');
            if (weight) body.weight = parseFloat(weight);
            if (spoolWeight) body.spool_weight = parseFloat(spoolWeight);
            if (comment.trim()) body.comment = comment.trim();

            // extra fields — coerce types
            const extraOut = {};
            for (const f of extraFields) {
                const val = extra[f.key];
                if (val === '' || val === undefined || val === null) continue;
                extraOut[f.key] = (f.field_type === 'float' || f.field_type === 'integer')
                    ? parseFloat(val)
                    : val;
            }
            if (Object.keys(extraOut).length) body.extra = extraOut;

            const created = await createFilament(body);
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
                    <h3 className="spool-dialog-title">Add Filament</h3>
                    <button className="spool-dialog-close" onClick={onClose}>✕</button>
                </div>

                <form onSubmit={handleSubmit} className="sm-form sm-form-grid">
                    {/* Name */}
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

                    {/* Vendor */}
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
                            <button
                                type="button"
                                className="sm-add-vendor-btn"
                                title="Add new manufacturer"
                                onClick={onAddVendor}
                            >+</button>
                        </div>
                    </div>

                    {/* Material */}
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

                    {/* Color */}
                    <div className="sm-field">
                        <label className="sm-label">Color</label>
                        <div className="sm-color-row">
                            <input
                                type="color"
                                className="sm-color-picker"
                                value={colorHex}
                                onChange={e => setColorHex(e.target.value)}
                            />
                            <input
                                className="sm-input sm-color-hex"
                                type="text"
                                maxLength={7}
                                value={colorHex}
                                onChange={e => setColorHex(e.target.value)}
                                placeholder="#ffffff"
                            />
                        </div>
                    </div>

                    {/* Diameter */}
                    <div className="sm-field">
                        <label className="sm-label">Diameter (mm) *</label>
                        <input
                            className="sm-input"
                            type="number"
                            step="0.01"
                            value={diameter}
                            onChange={e => setDiameter(e.target.value)}
                            placeholder="1.75"
                            required
                        />
                    </div>

                    {/* Density */}
                    <div className="sm-field">
                        <label className="sm-label">Density (g/cm³) *</label>
                        <input
                            className="sm-input"
                            type="number"
                            step="0.01"
                            value={density}
                            onChange={e => setDensity(e.target.value)}
                            placeholder="1.24"
                            required
                        />
                    </div>

                    {/* Weight */}
                    <div className="sm-field">
                        <label className="sm-label">Filament Weight (g)</label>
                        <input
                            className="sm-input"
                            type="number"
                            step="any"
                            value={weight}
                            onChange={e => setWeight(e.target.value)}
                            placeholder="1000"
                        />
                    </div>

                    {/* Spool tare weight */}
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

                    {/* Comment */}
                    <div className="sm-field sm-field-full">
                        <label className="sm-label">Comment</label>
                        <input
                            className="sm-input"
                            type="text"
                            placeholder="Optional"
                            value={comment}
                            onChange={e => setComment(e.target.value)}
                        />
                    </div>

                    {/* Dynamic extra fields */}
                    {extraFields.map(f => (
                        <div key={f.key} className="sm-field">
                            <label className="sm-label">
                                {f.name}{f.unit ? ` (${f.unit})` : ''}
                            </label>
                            <input
                                className="sm-input"
                                type={f.field_type === 'float' || f.field_type === 'integer' ? 'number' : 'text'}
                                step={f.field_type === 'float' ? 'any' : undefined}
                                placeholder={f.default_value ?? ''}
                                value={extra[f.key] ?? ''}
                                onChange={e => setExtraVal(f.key, e.target.value)}
                            />
                        </div>
                    ))}

                    <div className="spool-dialog-actions sm-field-full">
                        <button type="button" className="btn v-btn" onClick={onClose} disabled={busy}>Cancel</button>
                        <button type="submit" className="btn btn-primary v-btn" disabled={busy || !name.trim()}>
                            {busy ? 'Saving…' : 'Create'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
