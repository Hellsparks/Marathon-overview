import { useState, useEffect, useRef } from 'react';
import { createFilament, updateFilament, getVendors, getFields } from '../../api/spoolman';
import { getSettings } from '../../api/settings';
import { RAL_COLORS, findClosestRal } from '../../utils/ralColors';
import { fetchSwatchStl, makeSwatchFilename, getSwatchLines, downloadBuffer } from '../../api/extras';
import { onReading as coloriometerOnReading, getLastReading, getStatus as coloriometerStatus } from '../../services/colorimeter';
import { buildColorStyle, isMultiColor } from '../../utils/colorUtils';

const COMMON_MATERIALS = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'PLA+', 'PA', 'PC', 'HIPS', 'PVA'];

function hexToRgb(hex) {
    const h = (hex || '').replace('#', '').slice(0, 6).padEnd(6, '0');
    return {
        r: parseInt(h.slice(0, 2), 16) || 0,
        g: parseInt(h.slice(2, 4), 16) || 0,
        b: parseInt(h.slice(4, 6), 16) || 0,
    };
}

/** TD (Transmission Distance) → translucency percentage (0 = opaque, higher = more see-through) */
function tdToTranslucency(td) {
    return Math.min(95, Math.round(parseFloat(td) * 5));
}

function CollapsibleSection({ title, children, defaultOpen = false }) {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div className={`sm-collapsible ${isOpen ? 'open' : ''}`}>
            <button type="button" className="sm-collapsible-header" onClick={() => setIsOpen(!isOpen)}>
                {title}
                <span className="sm-collapsible-chevron">▶</span>
            </button>
            <div className="sm-collapsible-content">
                {children}
            </div>
        </div>
    );
}

const OrcaField = ({ label, id, config, setConfig, type = "number", step, half = true }) => (
    <div className={half ? "sm-field" : "sm-field sm-field-full"}>
        <label className="sm-label" title={label}>{label}</label>
        <input 
            className="sm-input" 
            type={type} 
            step={step} 
            value={config[id] || ''} 
            onChange={e => setConfig({ ...config, [id]: e.target.value })} 
        />
    </div>
);

const OrcaCheckbox = ({ label, id, config, setConfig }) => (
    <div className="sm-field">
        <label className="sm-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '4px' }}>
            <input 
                type="checkbox" 
                checked={config[id] === true || config[id] === 'true'} 
                onChange={e => setConfig({ ...config, [id]: e.target.checked })} 
            />
            {label}
        </label>
    </div>
);

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
    const [orcaslicerFieldKey, setOrcaslicerFieldKey] = useState('');

    const [showOrcaPanel, setShowOrcaPanel] = useState(false);
    const [orcaslicerDefaults, setOrcaslicerDefaults] = useState({});
    
    // OrcaSlicer config state
    const [orcaslicerConfig, setOrcaslicerConfig] = useState(() => {
        return {
            // Basic Material Info
            filament_vendor: '',
            is_soluble_filament: false,
            support_material_interface_filament: false,
            required_nozzle_hrc: '',
            adhesiveness_category: '',
            filament_softening_temperature: '',
            idle_temperature: '',
            shrinkage_xy: '',
            shrinkage_z: '',
            chamber_temperature: '',
            activate_temperature_control: false,

            // Print Temperatures & Speeds
            nozzle_temperature: '',
            nozzle_temp_initial_layer: '',
            nozzle_temp_min: '',
            nozzle_temp_max: '',
            bed_temp: '',
            bed_temp_initial_layer: '',
            max_volumetric_speed: '',
            flow_ratio: '',
            pressure_advance: '',
            enable_pressure_advance: false,

            // Cooling
            fan_min_speed: '',
            fan_max_speed: '',
            slowdown_for_layer_cooling: false,
            fan_below_layer_time: '',
            enable_overhang_fan: false,
            overhang_fan_speed: '',
            activate_air_filtration: false,
            exhaust_fan_speed: '',

            // Retraction Overrides
            retraction_length: '',
            z_hop: '',
            retraction_speed: '',
            deretraction_speed: '',
            retract_on_layer_change: false,
            wipe_on_retract: false,
            wipe_distance: '',

            // Advanced & Profiles
            inherits: '',
            compatible_printers: '',
            filament_ramming_length: '',
        };
    });

    const [vendorId, setVendorId] = useState(String(filament?.vendor?.id ?? ''));
    const [name, setName] = useState(filament?.name ?? '');
    const [material, setMaterial] = useState(filament?.material ?? '');
    const [density, setDensity] = useState(String(filament?.density ?? '1.24'));
    const [colorHex, setColorHex] = useState(filament?.color_hex ? `#${filament.color_hex.slice(0, 6)}` : '#ffffff');
    const [multiColorEnabled, setMultiColorEnabled] = useState(
        !!(filament?.multi_color_hexes)
    );
    const [multiColorHexes, setMultiColorHexes] = useState(() => {
        if (filament?.multi_color_hexes) {
            return filament.multi_color_hexes.split(',').map(h => `#${h.trim()}`);
        }
        return ['#0ea5e9', '#a855f7'];
    });
    const [multiColorDirection, setMultiColorDirection] = useState(
        filament?.multi_color_direction || 'longitudinal'
    );
    const [colorRal, setColorRal] = useState('');
    const [diameter, setDiameter] = useState(String(filament?.diameter ?? '1.75'));
    const [weight, setWeight] = useState(String(filament?.weight ?? '1000'));
    const [spoolWeight, setSpoolWeight] = useState(String(filament?.spool_weight ?? ''));
    const [price, setPrice] = useState(String(filament?.price ?? ''));
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
    // Translucency: 0 = fully opaque, up to 95 = very transparent
    const [translucency, setTranslucency] = useState(() => {
        const hex = filament?.color_hex || '';
        if (hex.length === 8) {
            const alpha = parseInt(hex.slice(6, 8), 16) / 255;
            return Math.round((1 - alpha) * 100);
        }
        return 0;
    });
    const [translucencyManual, setTranslucencyManual] = useState(() => (filament?.color_hex?.length === 8));
    const colorInputRef = useRef(null);
    const [busy, setBusy] = useState(false);
    const [tdFieldKey, setTdFieldKey] = useState('');
    const [td1Reading, setTd1Reading] = useState(() => getLastReading());

    // Track live TD1 readings while dialog is open
    useEffect(() => coloriometerOnReading(setTd1Reading), []);

    // Auto-infer translucency from TD extra field when not manually overridden
    useEffect(() => {
        if (!tdFieldKey || translucencyManual) return;
        const tdVal = parseFloat(extra[tdFieldKey]);
        if (!isNaN(tdVal) && tdVal > 0) {
            setTranslucency(tdToTranslucency(tdVal));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [extra, tdFieldKey]);

    useEffect(() => {
        Promise.all([getVendors(), getFields('filament'), getSettings()])
            .then(([v, f, s]) => {
                setVendors(v || []);
                setExtraFields(f || []);
                setTdFieldKey(s?.hueforge_td_field || '');
                setOrcaslicerFieldKey(s?.orcaslicer_config_field || '');
                
                if (s?.orcaslicer_defaults) {
                    try {
                        setOrcaslicerDefaults(JSON.parse(s.orcaslicer_defaults));
                    } catch (e) {
                         console.error('Failed to parse orcaslicer_defaults', e);
                    }
                }

                // If editing and we have the orca field, parse it
                if (s?.orcaslicer_config_field && filament?.extra?.[s.orcaslicer_config_field]) {
                    try {
                        const parsed = JSON.parse(filament.extra[s.orcaslicer_config_field]);
                        setOrcaslicerConfig(prev => ({ ...prev, ...parsed }));
                    } catch (e) {
                        console.error('Failed to parse orcaslicer_config', e);
                    }
                }
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

    const handleApplyOrcaDefaults = (force = false) => {
        if (!orcaslicerFieldKey) return;
        const defaults = orcaslicerDefaults[material] || orcaslicerDefaults['Global'] || {};
        
        setOrcaslicerConfig(prev => {
            const next = { ...prev };
            for (const key of Object.keys(next)) {
                if (defaults[key] !== undefined && defaults[key] !== '') {
                    if (force || next[key] === '') {
                        next[key] = defaults[key];
                    }
                }
            }
            return next;
        });
    };

    // Auto-fill OrcaSlicer config when material changes
    useEffect(() => {
        // Only auto-fill if we're creating OR if it's an explicit material change on a clone/new
        // For edits, we probably only want to auto-fill if fields are totally empty
        const defaults = orcaslicerDefaults[material] || orcaslicerDefaults['Global'] || {};
        if (!orcaslicerFieldKey || Object.keys(defaults).length === 0) return;

        setOrcaslicerConfig(prev => {
            let changed = false;
            const next = { ...prev };
            for (const key of Object.keys(next)) {
                if (defaults[key] !== undefined && defaults[key] !== '') {
                    if (next[key] === '') {
                        next[key] = defaults[key];
                        changed = true;
                    }
                }
            }
            return changed ? next : prev;
        });
    }, [material, orcaslicerDefaults, orcaslicerFieldKey]);

    function handleColoriometerReading({ hex, td }) {
        if (hex) setColorHex(`#${hex}`);
        if (td !== null && td !== undefined) {
            if (tdFieldKey) setExtraVal(tdFieldKey, String(td));
            if (!translucencyManual) setTranslucency(tdToTranslucency(td));
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
            if (multiColorEnabled && multiColorHexes.length > 1) {
                // Spoolman rejects color_hex when multi_color_hexes is set
                body.multi_color_hexes = multiColorHexes
                    .map(h => h.replace(/^#/, '').slice(0, 8))
                    .join(',');
                body.multi_color_direction = multiColorDirection;
            } else if (colorHex) {
                const baseHex = colorHex.replace(/^#/, '').slice(0, 6);
                if (translucency > 0) {
                    const alpha = Math.round((1 - translucency / 100) * 255);
                    body.color_hex = baseHex + alpha.toString(16).padStart(2, '0');
                } else {
                    body.color_hex = baseHex;
                }
            }
            if (weight) body.weight = parseFloat(weight);
            if (spoolWeight) body.spool_weight = parseFloat(spoolWeight);
            if (price) body.price = parseFloat(price);
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
            
            if (orcaslicerFieldKey) {
                const configToSave = {};
                for (const [k, v] of Object.entries(orcaslicerConfig)) {
                    if (v !== '') configToSave[k] = v;
                }
                if (Object.keys(configToSave).length > 0) {
                    // Must double-stringify to pass as Spoolman Text Extra Field
                    extraOut[orcaslicerFieldKey] = JSON.stringify(JSON.stringify(configToSave));
                } else {
                    extraOut[orcaslicerFieldKey] = null;
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
        <div className="spool-dialog-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className={`spool-dialog spool-dialog-wide ${showOrcaPanel ? 'spool-dialog-expanded' : ''}`}>
                <div className="spool-dialog-header">
                    <h3 className="spool-dialog-title">{isEdit ? 'Edit Filament' : isClone ? 'Clone Filament' : 'Add Filament'}</h3>
                    {orcaslicerFieldKey && (
                        <button
                            type="button"
                            className={`btn ${showOrcaPanel ? 'btn-primary' : 'btn-muted'}`}
                            onClick={() => setShowOrcaPanel(!showOrcaPanel)}
                            style={{ marginLeft: 'auto', marginRight: '32px', padding: '2px 8px', fontSize: '11px' }}
                        >
                            OrcaSlicer ⮞
                        </button>
                    )}
                    <button type="button" className="spool-dialog-close" onClick={onClose}>✕</button>
                </div>

                <form onSubmit={handleSubmit} className="dialog-split">
                    <div className="dialog-left sm-form sm-form-grid">
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

                    <div className="sm-field sm-field-full">
                        <label className="sm-label">Color</label>

                        {/* Multi-color toggle */}
                        <label className="sm-checkbox-label" style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                                type="checkbox"
                                checked={multiColorEnabled}
                                onChange={e => setMultiColorEnabled(e.target.checked)}
                            />
                            Multi-color filament
                        </label>

                        {!multiColorEnabled ? (
                            /* ── Single color ── */
                            <>
                                <div className="sm-color-row">
                                    <div className="sm-color-preview" onClick={() => colorInputRef.current?.click()}>
                                        <div
                                            className="sm-color-preview-fill"
                                            style={(() => {
                                                const { r, g, b } = hexToRgb(colorHex);
                                                return { background: `rgba(${r},${g},${b},${(100 - translucency) / 100})` };
                                            })()}
                                        />
                                        <input
                                            ref={colorInputRef}
                                            type="color"
                                            className="sm-color-picker-overlay"
                                            value={colorHex.match(/^#[0-9a-fA-F]{6}$/) ? colorHex : '#ffffff'}
                                            onChange={e => setColorHex(e.target.value)}
                                        />
                                    </div>
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
                                <div className="sm-translucency-row">
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Translucency</span>
                                    <input
                                        type="range"
                                        min="0" max="95" step="1"
                                        value={translucency}
                                        onChange={e => { setTranslucency(+e.target.value); setTranslucencyManual(true); }}
                                    />
                                    <span className="sm-translucency-val">{translucency}%</span>
                                    {translucencyManual && (
                                        <button
                                            type="button"
                                            className="sm-hint-use"
                                            title="Reset to TD-inferred value"
                                            onClick={() => {
                                                setTranslucencyManual(false);
                                                const tdVal = parseFloat(extra[tdFieldKey]);
                                                setTranslucency(!isNaN(tdVal) && tdVal > 0 ? tdToTranslucency(tdVal) : 0);
                                            }}
                                        >Reset</button>
                                    )}
                                </div>
                            </>
                        ) : (
                            /* ── Multi-color ── */
                            <div className="sm-multicolor-section">
                                {/* Direction */}
                                <div className="sm-multicolor-direction">
                                    <label className={`sm-multicolor-dir-btn${multiColorDirection === 'longitudinal' ? ' active' : ''}`}>
                                        <input type="radio" name="mc-direction" value="longitudinal"
                                            checked={multiColorDirection === 'longitudinal'}
                                            onChange={() => setMultiColorDirection('longitudinal')}
                                        />
                                        <span className="sm-multicolor-dir-preview" style={{
                                            ...buildColorStyle({ multi_color_hexes: multiColorHexes.map(h => h.replace('#', '')).join(','), multi_color_direction: 'longitudinal' }),
                                            borderRadius: '4px',
                                        }} />
                                        Longitudinal
                                    </label>
                                    <label className={`sm-multicolor-dir-btn${multiColorDirection === 'coaxial' ? ' active' : ''}`}>
                                        <input type="radio" name="mc-direction" value="coaxial"
                                            checked={multiColorDirection === 'coaxial'}
                                            onChange={() => setMultiColorDirection('coaxial')}
                                        />
                                        <span className="sm-multicolor-dir-preview" style={{
                                            ...buildColorStyle({ multi_color_hexes: multiColorHexes.map(h => h.replace('#', '')).join(','), multi_color_direction: 'coaxial' }),
                                            borderRadius: '50%',
                                        }} />
                                        Coextruded
                                    </label>
                                </div>

                                {/* Color swatches preview */}
                                <div className="sm-multicolor-preview">
                                    <div className="sm-color-preview" style={{ cursor: 'default', width: '48px', height: '48px' }}>
                                        <div className="sm-color-preview-fill" style={buildColorStyle({ multi_color_hexes: multiColorHexes.map(h => h.replace('#','')).join(','), multi_color_direction: multiColorDirection })} />
                                    </div>
                                </div>

                                {/* Per-color rows */}
                                <div className="sm-multicolor-list">
                                    {multiColorHexes.map((hex, idx) => (
                                        <div key={idx} className="sm-multicolor-row">
                                            <span className="sm-multicolor-idx">{idx + 1}</span>
                                            <input
                                                type="color"
                                                className="sm-color-picker"
                                                value={hex.match(/^#[0-9a-fA-F]{6}$/) ? hex : '#888888'}
                                                onChange={e => {
                                                    const next = [...multiColorHexes];
                                                    next[idx] = e.target.value;
                                                    setMultiColorHexes(next);
                                                    if (idx === 0) setColorHex(e.target.value);
                                                }}
                                            />
                                            <input
                                                className="sm-input sm-color-hex"
                                                type="text"
                                                maxLength={7}
                                                value={hex}
                                                onChange={e => {
                                                    const next = [...multiColorHexes];
                                                    next[idx] = e.target.value;
                                                    setMultiColorHexes(next);
                                                    if (idx === 0) setColorHex(e.target.value);
                                                }}
                                                style={{ width: '80px', textTransform: 'uppercase' }}
                                            />
                                            {td1Reading && (
                                                <button
                                                    type="button"
                                                    className="btn"
                                                    style={{ padding: '2px 7px', fontSize: 11, whiteSpace: 'nowrap' }}
                                                    title={`Apply TD1 reading (#${td1Reading.hex}) to color ${idx + 1}`}
                                                    onClick={() => {
                                                        const next = [...multiColorHexes];
                                                        next[idx] = `#${td1Reading.hex}`;
                                                        setMultiColorHexes(next);
                                                        if (idx === 0) setColorHex(`#${td1Reading.hex}`);
                                                    }}
                                                >
                                                    TD1
                                                </button>
                                            )}
                                            {multiColorHexes.length > 2 && (
                                                <button type="button" className="sm-action-btn sm-action-danger"
                                                    onClick={() => setMultiColorHexes(multiColorHexes.filter((_, i) => i !== idx))}>
                                                    ✕
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <button type="button" className="btn" style={{ marginTop: '6px', fontSize: '12px' }}
                                    onClick={() => setMultiColorHexes([...multiColorHexes, '#888888'])}>
                                    + Add Color
                                </button>
                            </div>
                        )}
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

                    <div className="sm-field">
                        <label className="sm-label">Price</label>
                        <input className="sm-input" type="number" step="any" min="0" value={price} onChange={e => setPrice(e.target.value)} placeholder="Optional" />
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

                        if (f.key === orcaslicerFieldKey) return null; // hide raw JSON from general tab
                        
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
                            {busy ? 'Saving…' : isEdit ? 'Save Changes' : isClone ? 'Clone Filament' : 'Add Filament'}
                        </button>
                    </div>
                    </div>

                    {orcaslicerFieldKey && showOrcaPanel && (
                        <div className="dialog-right sm-form" style={{ alignContent: 'start', padding: '24px' }}>
                            <div className="sm-field sm-field-full" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
                                <h4 style={{ margin: 0, color: 'var(--text)', fontSize: 14 }}>
                                    OrcaSlicer Settings
                                </h4>
                                <button 
                                    type="button" 
                                    className="btn btn-sm" 
                                    style={{ fontSize: 11, padding: '2px 8px' }}
                                    onClick={() => handleApplyOrcaDefaults(true)}
                                    title={`Apply defaults for ${material || 'Global'}`}
                                >
                                    Apply {material || 'Global'} Defaults
                                </button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <CollapsibleSection title="Basic Material Info" defaultOpen={true}>
                                    <div className="sm-form-grid">
                                        <OrcaField label="Vendor" id="filament_vendor" type="text" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                        <OrcaField label="Nozzle HRC" id="required_nozzle_hrc" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                        <OrcaField label="Softening Temp" id="filament_softening_temperature" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                        <OrcaField label="Idle Temp" id="idle_temperature" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                        <OrcaField label="Shrinkage XY (%)" id="shrinkage_xy" step="0.01" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                        <OrcaField label="Shrinkage Z (%)" id="shrinkage_z" step="0.01" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                        <OrcaField label="Chamber Temp" id="chamber_temperature" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                        <OrcaCheckbox label="Activate Chamber" id="activate_temperature_control" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                        <OrcaCheckbox label="Is Soluble" id="is_soluble_filament" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                        <OrcaCheckbox label="Is Support" id="support_material_interface_filament" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                    </div>
                                </CollapsibleSection>

                                <CollapsibleSection title="Temperatures & Speeds" defaultOpen={true}>
                                    <div className="sm-form-grid">
                                        <OrcaField label="Nozzle Temp" id="nozzle_temperature" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                        <OrcaField label="Nozzle Initial" id="nozzle_temp_initial_layer" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                        <OrcaField label="Bed Temp" id="bed_temp" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                        <OrcaField label="Bed Initial" id="bed_temp_initial_layer" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                        <OrcaField label="Nozzle Min" id="nozzle_temp_min" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                        <OrcaField label="Nozzle Max" id="nozzle_temp_max" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                        <OrcaField label="Flow Ratio" id="flow_ratio" step="0.001" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                        <OrcaField label="Max Vol. Speed" id="max_volumetric_speed" step="0.1" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                        <OrcaField label="Pressure Adv." id="pressure_advance" step="0.001" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                        <OrcaCheckbox label="Enable PA" id="enable_pressure_advance" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                    </div>
                                </CollapsibleSection>

                                <CollapsibleSection title="Cooling Settings">
                                    <div className="sm-form-grid">
                                        <OrcaField label="Min Fan (%)" id="fan_min_speed" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                        <OrcaField label="Max Fan (%)" id="fan_max_speed" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                        <OrcaField label="Exhaust (%)" id="exhaust_fan_speed" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                        <OrcaField label="Layer Time (s)" id="fan_below_layer_time" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                        <OrcaField label="Overhang (%)" id="overhang_fan_speed" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                        <OrcaCheckbox label="Slow for Cooling" id="slowdown_for_layer_cooling" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                        <OrcaCheckbox label="Overhang Fan" id="enable_overhang_fan" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                        <OrcaCheckbox label="Air Filtration" id="activate_air_filtration" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                    </div>
                                </CollapsibleSection>

                                <CollapsibleSection title="Retraction Overrides">
                                    <div className="sm-form-grid">
                                        <OrcaField label="Length (mm)" id="retraction_length" step="0.1" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                        <OrcaField label="Z-Hop (mm)" id="z_hop" step="0.1" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                        <OrcaField label="Retract Speed" id="retraction_speed" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                        <OrcaField label="Deretract Spd" id="deretraction_speed" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                        <OrcaField label="Wipe Dist (mm)" id="wipe_distance" step="0.1" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                        <OrcaCheckbox label="Layer Change" id="retract_on_layer_change" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                        <OrcaCheckbox label="Wipe" id="wipe_on_retract" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                    </div>
                                </CollapsibleSection>

                                <CollapsibleSection title="Advanced & Profiles">
                                    <div className="sm-form-grid">
                                        <OrcaField label="Compatible Printers" id="compatible_printers" type="text" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} half={false} />
                                        <OrcaField label="Inherits Profile" id="inherits" type="text" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} half={false} />
                                        <OrcaField label="Ramming (mm)" id="filament_ramming_length" config={orcaslicerConfig} setConfig={setOrcaslicerConfig} />
                                    </div>
                                </CollapsibleSection>
                            </div>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}
