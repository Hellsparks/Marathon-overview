import { useState, useEffect, useCallback, useMemo } from 'react';
import { getFilaments, deleteFilament, getFields } from '../api/spoolman';
import { getSettings } from '../api/settings';
import AddFilamentDialog from '../components/spoolman/AddFilamentDialog';
import ColoriometerPanel from '../components/spoolman/ColoriometerPanel';
import { findClosestRal } from '../utils/ralColors';
import ViewToggle from '../components/common/ViewToggle';
import { buildColorStyle } from '../utils/colorUtils';

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

function toAbsUrl(url) {
    if (!url) return null;
    const clean = url.replace(/^["'\s]+|["'\s]+$/g, '');
    if (!clean) return null;
    return /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
}

export default function FilamentsPage() {
    const [filaments, setFilaments] = useState([]);
    const [extraFields, setExtraFields] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [materialFilter, setMaterialFilter] = useState([]);
    const [vendorFilter, setVendorFilter] = useState([]);
    const [showFilterPopover, setShowFilterPopover] = useState(false);
    const [showAdd, setShowAdd] = useState(false);
    const [editFilament, setEditFilament] = useState(null);
    const [cloneFilament, setCloneFilament] = useState(null);
    const [viewMode, setViewMode] = useState('list');
    const [swatchField, setSwatchField] = useState(null);
    const [urlField, setUrlField] = useState(null);
    const [orcaslicerField, setOrcaslicerField] = useState(null);

    const load = useCallback(async () => {
        try {
            const [f, fields, s] = await Promise.all([getFilaments(), getFields('filament'), getSettings()]);
            setFilaments(f || []);
            setExtraFields(fields || []);
            setSwatchField(s?.swatch_extra_field || null);
            setUrlField(s?.url_extra_field || null);
            setOrcaslicerField(s?.orcaslicer_config_field || null);
            setError(null);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    async function handleDelete(f) {
        if (!confirm(`Delete filament "${f.name}"? This cannot be undone.`)) return;
        try {
            await deleteFilament(f.id);
            await load();
        } catch (e) {
            alert(e.message);
        }
    }

    async function handleExportOrcaSlicer(f) {
        try {
            // Generate basic template
            const profile = {
                "type": "filament",
                "name": `${f.vendor?.name || 'Generic'} ${f.material || 'PLA'} ${f.name}`,
                "from": "User",
                "instantiation": "true",
                "inherits": "My Generic PLA", // Fallback inherit
                "filament_settings_id": [
                    `${f.vendor?.name || 'Generic'} ${f.material || 'PLA'} ${f.name}`
                ],
                "filament_vendor": [
                    f.vendor?.name || "Generic"
                ],
                "filament_type": [
                    f.material || "PLA"
                ],
                "filament_diameter": [
                    f.diameter ? String(f.diameter) : "1.75"
                ],
                "filament_density": [
                    f.density ? String(f.density) : "1.24"
                ],
                "filament_color": [
                    f.color_hex ? `#${f.color_hex.slice(0, 6).toUpperCase()}` : "#FFFFFF"
                ]
            };

            // Apply overrides from extra field
            if (orcaslicerField && f.extra?.[orcaslicerField]) {
                try {
                    const overrides = JSON.parse(f.extra[orcaslicerField]);

                    // 1. Basic Material Info
                    if (overrides.filament_vendor) profile.filament_vendor = [overrides.filament_vendor];
                    if (overrides.required_nozzle_hrc) profile.required_nozzle_hrc = [String(overrides.required_nozzle_hrc)];
                    if (overrides.filament_softening_temperature) profile.filament_softening_temperature = [String(overrides.filament_softening_temperature)];
                    if (overrides.idle_temperature) profile.idle_temperature = [String(overrides.idle_temperature)];
                    if (overrides.shrinkage_xy) profile.filament_shrink = [`${overrides.shrinkage_xy}%`];
                    if (overrides.shrinkage_z) profile.filament_shrink_z = [`${overrides.shrinkage_z}%`];
                    if (overrides.chamber_temperature) profile.chamber_temperature = [String(overrides.chamber_temperature)];
                    if (overrides.activate_temperature_control !== undefined) profile.activate_temperature_control = [overrides.activate_temperature_control ? "true" : "false"];
                    if (overrides.is_soluble_filament !== undefined) profile.is_soluble_filament = [overrides.is_soluble_filament ? "true" : "false"];
                    if (overrides.support_material_interface_filament !== undefined) profile.support_material_interface_filament = [overrides.support_material_interface_filament ? "true" : "false"];

                    // 2. Print Temperatures & Speeds
                    if (overrides.nozzle_temperature) profile.nozzle_temperature = [String(overrides.nozzle_temperature)];
                    if (overrides.nozzle_temp_initial_layer) profile.nozzle_temperature_initial_layer = [String(overrides.nozzle_temp_initial_layer)];
                    if (overrides.nozzle_temp_min) profile.nozzle_temperature_range_low = [String(overrides.nozzle_temp_min)];
                    if (overrides.nozzle_temp_max) profile.nozzle_temperature_range_high = [String(overrides.nozzle_temp_max)];
                    if (overrides.bed_temp) profile.hot_plate_temp = [String(overrides.bed_temp)];
                    if (overrides.bed_temp_initial_layer) profile.hot_plate_temp_initial_layer = [String(overrides.bed_temp_initial_layer)];
                    if (overrides.max_volumetric_speed) profile.filament_max_volumetric_speed = [String(overrides.max_volumetric_speed)];
                    if (overrides.flow_ratio) profile.filament_flow_ratio = [String(overrides.flow_ratio)];
                    if (overrides.pressure_advance) profile.pressure_advance = [String(overrides.pressure_advance)];
                    if (overrides.enable_pressure_advance !== undefined) profile.enable_pressure_advance = [overrides.enable_pressure_advance ? "true" : "false"];

                    // 3. Cooling Settings
                    if (overrides.fan_min_speed) profile.fan_min_speed = [String(overrides.fan_min_speed)];
                    if (overrides.fan_max_speed) profile.fan_max_speed = [String(overrides.fan_max_speed)];
                    if (overrides.exhaust_fan_speed) profile.exhaust_fan_speed = [String(overrides.exhaust_fan_speed)];
                    if (overrides.fan_below_layer_time) profile.fan_below_layer_time = [String(overrides.fan_below_layer_time)];
                    if (overrides.overhang_fan_speed) profile.overhang_fan_speed = [String(overrides.overhang_fan_speed)];
                    if (overrides.slowdown_for_layer_cooling !== undefined) profile.slowdown_for_layer_cooling = [overrides.slowdown_for_layer_cooling ? "true" : "false"];
                    if (overrides.enable_overhang_fan !== undefined) profile.enable_overhang_fan = [overrides.enable_overhang_fan ? "true" : "false"];
                    if (overrides.activate_air_filtration !== undefined) profile.activate_air_filtration = [overrides.activate_air_filtration ? "true" : "false"];

                    // 4. Retraction Overrides
                    if (overrides.retraction_length) profile.retraction_length = [String(overrides.retraction_length)];
                    if (overrides.z_hop) profile.z_hop = [String(overrides.z_hop)];
                    if (overrides.retraction_speed) profile.retraction_speed = [String(overrides.retraction_speed)];
                    if (overrides.deretraction_speed) profile.deretraction_speed = [String(overrides.deretraction_speed)];
                    if (overrides.wipe_distance) profile.wipe_distance = [String(overrides.wipe_distance)];
                    if (overrides.retract_on_layer_change !== undefined) profile.retract_on_layer_change = [overrides.retract_on_layer_change ? "true" : "false"];
                    if (overrides.wipe_on_retract !== undefined) profile.wipe_on_retract = [overrides.wipe_on_retract ? "true" : "false"];

                    // 5. Advanced
                    if (overrides.inherits) profile.inherits = overrides.inherits;
                    if (overrides.compatible_printers) {
                        profile.compatible_printers = overrides.compatible_printers.split(',').map(p => p.trim().replace(/^"(.*)"$/, '$1'));
                    }
                    if (overrides.filament_ramming_length) profile.filament_ramming_length = [String(overrides.filament_ramming_length)];
                } catch (e) {
                    console.error("Failed to parse OrcaSlicer config", e);
                }
            }

            // Trigger download
            const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${(f.vendor?.name || 'Generic').replace(/ /g, '_')}_${(f.material || 'PLA').replace(/ /g, '_')}_${f.name.replace(/ /g, '_')}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            alert(e.message);
        }
    }

    const uniqueMaterials = useMemo(() => Array.from(new Set(filaments.map(f => f.material).filter(Boolean))).sort(), [filaments]);
    const uniqueVendors = useMemo(() => Array.from(new Set(filaments.map(f => f.vendor?.name).filter(Boolean))).sort(), [filaments]);

    const filtered = filaments.filter(f => {
        if (materialFilter.length > 0 && !materialFilter.includes(f.material)) return false;
        if (vendorFilter.length > 0 && !vendorFilter.includes(f.vendor?.name)) return false;
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        const tokens = q.split(/\s+/);
        return (
            (f.name || '').toLowerCase().includes(q) ||
            (f.material || '').toLowerCase().includes(q) ||
            (f.vendor?.name || '').toLowerCase().includes(q) ||
            matchesColor(f.color_hex, tokens)
        );
    });

    const displayExtraFields = extraFields.filter(f => f.key !== swatchField && f.key !== orcaslicerField);

    return (
        <div className="page">
            <div className="sm-page-toolbar" style={{ position: 'relative' }}>
                <div className="spoolman-search-wrap" style={{ position: 'relative', flex: 1, maxWidth: '420px' }}>
                    <span className="spoolman-search-icon">🔍</span>
                    <input
                        className="input spoolman-search-input"
                        type="text"
                        placeholder="Search filaments by name, color, vendor…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    <button
                        type="button"
                        onClick={() => setShowFilterPopover(!showFilterPopover)}
                        style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', padding: '6px 10px', fontSize: '13px', border: 'none', background: 'transparent', cursor: 'pointer', color: (materialFilter.length || vendorFilter.length) ? 'var(--primary)' : 'var(--text-muted)' }}
                        title="Filter filaments"
                    >⚙</button>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <ViewToggle viewMode={viewMode} onChange={setViewMode} />
                    <button className="btn btn-primary v-btn" onClick={() => setShowAdd(true)}>+ Add Filament</button>
                    <ColoriometerPanel />
                </div>
                {showFilterPopover && (
                    <>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setShowFilterPopover(false)} />
                        <div style={{
                            position: 'absolute', top: '100%', left: 0, marginTop: '8px',
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
            </div>

            {loading ? (
                <div className="loading">Loading filaments…</div>
            ) : error ? (
                <div className="error">{error}</div>
            ) : filtered.length === 0 ? (
                <div className="text-muted" style={{ padding: '20px', textAlign: 'center' }}>
                    {search ? 'No filaments match your search' : 'No filaments in Spoolman'}
                </div>
            ) : (
                viewMode === 'list' ? (
                    <div className="sm-catalogue-table-wrap">
                        <table className="sm-catalogue-table">
                            <thead>
                                <tr>
                                    <th></th>
                                    <th>Name</th>
                                    <th>Manufacturer</th>
                                    <th>Material</th>
                                    <th>Hex</th>
                                    <th>RAL</th>
                                    <th>Diameter</th>
                                    <th>Density</th>
                                    <th>Weight</th>
                                    {swatchField && <th style={{ textAlign: 'center' }} title="Swatch Printed">🎨</th>}
                                    {displayExtraFields.map(f => (
                                        <th key={f.key}>{f.name}{f.unit ? ` (${f.unit})` : ''}</th>
                                    ))}
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(f => {
                                    const ralMatch = f.color_hex ? findClosestRal(f.color_hex) : null;
                                    return (
                                        <tr key={f.id} className="sm-catalogue-row" style={{ backgroundColor: 'var(--surface)' }}>
                                            <td>
                                                <div className="sm-filament-dot" style={buildColorStyle(f)} />
                                            </td>
                                            <td className="sm-catalogue-name">{f.name}</td>
                                            <td className="sm-catalogue-muted">{f.vendor?.name || '—'}</td>
                                            <td className="sm-catalogue-muted">{f.material || '—'}</td>
                                            <td className="sm-catalogue-muted" style={{ fontFamily: 'monospace' }}>
                                                {f.color_hex ? `#${f.color_hex.slice(0, 6).toUpperCase()}` : '—'}
                                            </td>
                                            <td className="sm-catalogue-muted" style={{ whiteSpace: 'nowrap' }}>
                                                {ralMatch ? (ralMatch.exact ? `RAL ${ralMatch.ral}` : `~ RAL ${ralMatch.ral}`) : '—'}
                                            </td>
                                            <td className="sm-catalogue-muted">{f.diameter ? `${f.diameter} mm` : '—'}</td>
                                            <td className="sm-catalogue-muted">{f.density ? `${f.density} g/cm³` : '—'}</td>
                                            <td className="sm-catalogue-muted">{f.weight ? `${f.weight} g` : '—'}</td>
                                            {swatchField && (
                                                <td className="sm-catalogue-muted" style={{ textAlign: 'center' }}>
                                                    {(f.extra?.[swatchField] === true || f.extra?.[swatchField] === 'true') ? '✓' : ''}
                                                </td>
                                            )}
                                            {displayExtraFields.map(ef => (
                                                <td key={ef.key} className="sm-catalogue-muted">
                                                    {ef.key === 'url' && f.extra?.[ef.key]
                                                        ? <a href={toAbsUrl(f.extra[ef.key])} target="_blank" rel="noopener noreferrer" className="sm-link">Link</a>
                                                        : (f.extra?.[ef.key] ?? '—')}
                                                </td>
                                            ))}
                                            <td className="sm-catalogue-actions">
                                                <button
                                                    className="sm-action-btn sm-action-primary"
                                                    onClick={() => handleExportOrcaSlicer(f)}
                                                    title="Export to OrcaSlicer JSON"
                                                >⭳</button>
                                                <button
                                                    className="sm-action-btn"
                                                    onClick={() => setEditFilament(f)}
                                                    title="Edit"
                                                >✎</button>
                                                <button
                                                    className="sm-action-btn"
                                                    onClick={() => setCloneFilament(f)}
                                                    title="Clone"
                                                >⎘</button>
                                                <button
                                                    className="sm-action-btn sm-action-danger"
                                                    onClick={() => handleDelete(f)}
                                                    title="Delete"
                                                >✕</button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className={`spoolman-grid ${viewMode === 'grid-large' ? 'large' : 'small'}`} style={{
                        display: 'grid',
                        gap: '16px',
                        gridTemplateColumns: viewMode === 'grid-large' ? 'repeat(auto-fill, minmax(320px, 1fr))' : 'repeat(auto-fill, minmax(220px, 1fr))',
                        marginTop: '16px'
                    }}>
                        {filtered.map(f => {
                            const ralMatch = f.color_hex ? findClosestRal(f.color_hex) : null;
                            return (
                                <div key={f.id} className="spoolman-spool-card" style={{ backgroundColor: 'var(--surface)' }}>
                                    <div className="spool-card-header">
                                        <div className="spool-color-circle" style={buildColorStyle(f)} />
                                        <div className="spool-card-info">
                                            <span className="spool-card-name" style={{ fontSize: '15px' }}>{f.name}</span>
                                            <span className="spool-card-material">
                                                {f.material || '—'}
                                                {f.color_hex && (
                                                    <span className="spool-card-hex">#{f.color_hex.toUpperCase()}</span>
                                                )}
                                                {swatchField && (f.extra?.[swatchField] === true || f.extra?.[swatchField] === 'true') && (
                                                    <span title="Swatch Printed" style={{ marginLeft: '6px' }}>🎨</span>
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                    {f.vendor?.name && <span className="spool-card-vendor">{f.vendor.name}</span>}

                                    <div style={{ padding: '0 12px 12px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                            <div>
                                                <strong style={{ color: 'var(--text)', display: 'block' }}>RAL Match</strong>
                                                <span>{ralMatch ? (ralMatch.exact ? `RAL ${ralMatch.ral}` : `~ RAL ${ralMatch.ral}`) : '—'}</span>
                                            </div>
                                            <div>
                                                <strong style={{ color: 'var(--text)', display: 'block' }}>Weight</strong>
                                                <span>{f.weight ? `${f.weight} g` : '—'}</span>
                                            </div>
                                            <div>
                                                <strong style={{ color: 'var(--text)', display: 'block' }}>Diameter</strong>
                                                <span>{f.diameter ? `${f.diameter} mm` : '—'}</span>
                                            </div>
                                            <div>
                                                <strong style={{ color: 'var(--text)', display: 'block' }}>Density</strong>
                                                <span>{f.density ? `${f.density} g/cm³` : '—'}</span>
                                            </div>
                                            {urlField && f.extra?.[urlField] && (
                                                <div style={{ gridColumn: '1 / -1' }}>
                                                    <strong style={{ color: 'var(--text)', display: 'block' }}>Product Link</strong>
                                                    <a href={toAbsUrl(f.extra[urlField])} target="_blank" rel="noopener noreferrer" className="sm-link" onClick={e => e.stopPropagation()}>
                                                        View Product ↗
                                                    </a>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', borderTop: '1px solid var(--border)', padding: '6px' }}>
                                        <button className="btn-icon" style={{ flex: 1, padding: '8px', color: 'var(--primary)' }} onClick={() => handleExportOrcaSlicer(f)} title="Export to OrcaSlicer">⭳</button>
                                        <button className="btn-icon" style={{ flex: 1, padding: '8px', color: 'var(--text-muted)' }} onClick={() => setEditFilament(f)} title="Edit">✎</button>
                                        <button className="btn-icon" style={{ flex: 1, padding: '8px', color: 'var(--text-muted)' }} onClick={() => setCloneFilament(f)} title="Clone">⎘</button>
                                        <button className="btn-icon text-danger" style={{ flex: 1, padding: '8px', color: '#ff4444' }} onClick={() => handleDelete(f)} title="Delete">✕</button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )
            )}

            {showAdd && (
                <AddFilamentDialog
                    onClose={() => setShowAdd(false)}
                    onCreated={() => { setShowAdd(false); load(); }}
                />
            )}
            {editFilament && (
                <AddFilamentDialog
                    filament={editFilament}
                    onClose={() => setEditFilament(null)}
                    onCreated={() => { setEditFilament(null); load(); }}
                />
            )}
            {cloneFilament && (
                <AddFilamentDialog
                    filament={cloneFilament}
                    isClone={true}
                    onClose={() => setCloneFilament(null)}
                    onCreated={() => { setCloneFilament(null); load(); }}
                />
            )}
        </div>
    );
}
