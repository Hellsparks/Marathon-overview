import { useState, useEffect } from 'react';
import { getSettings, updateSetting } from '../../api/settings';

const MATERIALS = ['Global', 'PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'PA', 'PC', 'PVA', 'HIPS'];

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

export default function OrcaSlicerDefaultsDialog({ onClose }) {
    const [defaultsMap, setDefaultsMap] = useState({});
    const [selectedMaterial, setSelectedMaterial] = useState('Global');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        getSettings().then(s => {
            if (s.orcaslicer_defaults) {
                try {
                    setDefaultsMap(JSON.parse(s.orcaslicer_defaults));
                } catch (e) {
                    console.error('Failed to parse orcaslicer_defaults', e);
                }
            }
        }).catch(err => {
            console.error('Failed to load settings', err);
        });
    }, []);

    const currentConfig = defaultsMap[selectedMaterial] || {};

    const setConfigField = (field, value) => {
        setDefaultsMap(prev => ({
            ...prev,
            [selectedMaterial]: {
                ...(prev[selectedMaterial] || {}),
                [field]: value
            }
        }));
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            await updateSetting('orcaslicer_defaults', JSON.stringify(defaultsMap));
            onClose();
        } catch (err) {
            alert(err.message);
        } finally {
            setBusy(false);
        }
    };

    const Field = ({ label, id, type = "number", step, placeholder, half = true }) => (
        <div className={half ? "sm-field" : "sm-field sm-field-full"}>
            <label className="sm-label" title={label}>{label}</label>
            <input 
                className="sm-input" 
                type={type} 
                step={step} 
                value={currentConfig[id] || ''} 
                onChange={e => setConfigField(id, (type === 'checkbox' ? e.target.checked : e.target.value))} 
                placeholder={placeholder}
                checked={type === 'checkbox' ? (currentConfig[id] === true || currentConfig[id] === 'true') : undefined}
            />
        </div>
    );

    const Checkbox = ({ label, id }) => (
        <div className="sm-field">
            <label className="sm-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '4px' }}>
                <input 
                    type="checkbox" 
                    checked={currentConfig[id] === true || currentConfig[id] === 'true'} 
                    onChange={e => setConfigField(id, e.target.checked)} 
                />
                {label}
            </label>
        </div>
    );

    return (
        <div className="spool-dialog-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="spool-dialog" style={{ width: '600px', maxWidth: '95vw' }}>
                <div className="spool-dialog-header">
                    <h3 className="spool-dialog-title">OrcaSlicer Defaults</h3>
                    <button className="spool-dialog-close" onClick={onClose}>✕</button>
                </div>

                <form onSubmit={handleSave} className="sm-form" style={{ maxHeight: '80vh', overflowY: 'auto', padding: '0 4px' }}>
                    <div className="sm-field sm-field-full" style={{ marginBottom: '8px' }}>
                        <label className="sm-label">Material Selector</label>
                        <select 
                            className="spoolman-filter-select"
                            value={selectedMaterial} 
                            onChange={e => setSelectedMaterial(e.target.value)}
                            style={{ width: '100%', padding: '8px 12px', fontSize: '14px' }}
                        >
                            {MATERIALS.map(m => (
                                <option key={m} value={m}>{m === 'Global' ? 'Global Default (Fallback)' : m}</option>
                            ))}
                        </select>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px' }}>
                            These defaults will auto-fill the OrcaSlicer panel when creating a new filament matching this material.
                        </p>
                    </div>

                    <CollapsibleSection title="Basic Material Info" defaultOpen={true}>
                        <div className="sm-form-grid">
                            <Field label="Vendor" id="filament_vendor" type="text" placeholder="e.g. Creality" />
                            <Field label="Required Nozzle HRC" id="required_nozzle_hrc" placeholder="0 = no check" />
                            <Field label="Softening Temp (°C)" id="filament_softening_temperature" placeholder="e.g. 110" />
                            <Field label="Idle Temp (°C)" id="idle_temperature" placeholder="e.g. 150" />
                            <Field label="Shrinkage XY (%)" id="shrinkage_xy" step="0.01" placeholder="100" />
                            <Field label="Shrinkage Z (%)" id="shrinkage_z" step="0.01" placeholder="100" />
                            <Field label="Chamber Temp (°C)" id="chamber_temperature" placeholder="e.g. 0" />
                            <Checkbox label="Activate Chamber Temp" id="activate_temperature_control" />
                            <Checkbox label="Is Soluble" id="is_soluble_filament" />
                            <Checkbox label="Is Support Material" id="support_material_interface_filament" />
                        </div>
                    </CollapsibleSection>

                    <CollapsibleSection title="Print Temperatures & Speeds" defaultOpen={true}>
                        <div className="sm-form-grid">
                            <Field label="Nozzle Temp (°C)" id="nozzle_temperature" placeholder="e.g. 210" />
                            <Field label="Nozzle Temp Initial (°C)" id="nozzle_temp_initial_layer" placeholder="e.g. 220" />
                            <Field label="Bed Temp (°C)" id="bed_temp" placeholder="e.g. 60" />
                            <Field label="Bed Temp Initial (°C)" id="bed_temp_initial_layer" placeholder="e.g. 65" />
                            <Field label="Nozzle Temp Min (°C)" id="nozzle_temp_min" placeholder="190" />
                            <Field label="Nozzle Temp Max (°C)" id="nozzle_temp_max" placeholder="230" />
                            <Field label="Flow Ratio" id="flow_ratio" step="0.001" placeholder="0.98" />
                            <Field label="Max Vol. Speed (mm³/s)" id="max_volumetric_speed" step="0.1" placeholder="15" />
                            <Field label="Pressure Advance" id="pressure_advance" step="0.001" placeholder="0.04" />
                            <Checkbox label="Enable Pressure Advance" id="enable_pressure_advance" />
                        </div>
                    </CollapsibleSection>

                    <CollapsibleSection title="Cooling Settings">
                        <div className="sm-form-grid">
                            <Field label="Min Fan Speed (%)" id="fan_min_speed" placeholder="10" />
                            <Field label="Max Fan Speed (%)" id="fan_max_speed" placeholder="100" />
                            <Field label="Exhaust Fan Speed (%)" id="exhaust_fan_speed" placeholder="0" />
                            <Field label="Fan Below Layer Time (s)" id="fan_below_layer_time" placeholder="30" />
                            <Field label="Overhang Fan Speed (%)" id="overhang_fan_speed" placeholder="100" />
                            <Checkbox label="Slow Down for Cooling" id="slowdown_for_layer_cooling" />
                            <Checkbox label="Enable Overhang Fan" id="enable_overhang_fan" />
                            <Checkbox label="Activate Air Filtration" id="activate_air_filtration" />
                        </div>
                    </CollapsibleSection>

                    <CollapsibleSection title="Retraction Overrides">
                        <div className="sm-form-grid">
                            <Field label="Retraction Length (mm)" id="retraction_length" step="0.1" placeholder="0.8" />
                            <Field label="Z-Hop (mm)" id="z_hop" step="0.1" placeholder="0.4" />
                            <Field label="Retract Speed (mm/s)" id="retraction_speed" placeholder="30" />
                            <Field label="Deretract Speed (mm/s)" id="deretraction_speed" placeholder="30" />
                            <Field label="Wipe Distance (mm)" id="wipe_distance" step="0.1" placeholder="1" />
                            <Checkbox label="Retract on Layer Change" id="retract_on_layer_change" />
                            <Checkbox label="Wipe on Retract" id="wipe_on_retract" />
                        </div>
                    </CollapsibleSection>

                    <CollapsibleSection title="Advanced & Profiles">
                        <div className="sm-form-grid">
                            <Field label="Compatible Printers" id="compatible_printers" type="text" placeholder='e.g. "Voron 0.1 0.4 nozzle"' half={false} />
                            <Field label="Inherits Profile" id="inherits" type="text" placeholder="e.g. Generic ASA @System" half={false} />
                            <Field label="Ramming Length (mm)" id="filament_ramming_length" placeholder="e.g. 15" />
                        </div>
                    </CollapsibleSection>

                    <div className="spool-dialog-actions sm-field-full" style={{ marginTop: '24px', position: 'sticky', bottom: 0, background: 'var(--surface)', padding: '12px 0', borderTop: '1px solid var(--border)' }}>
                        <button type="button" className="btn btn-muted" onClick={onClose} disabled={busy}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={busy}>
                            {busy ? 'Saving...' : 'Save Defaults'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
