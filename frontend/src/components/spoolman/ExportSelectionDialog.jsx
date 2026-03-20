import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getExportPreview } from '../../api/spoolman';

export default function ExportSelectionDialog({ onExport, onCancel }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filaments, setFilaments] = useState([]);
    const [vendors, setVendors] = useState([]);
    const [materials, setMaterials] = useState([]);
    const [modifiers, setModifiers] = useState([]);
    const [selected, setSelected] = useState(new Set());
    const [search, setSearch] = useState('');
    const [filterVendor, setFilterVendor] = useState('');
    const [filterMaterial, setFilterMaterial] = useState('');
    const [filterModifier, setFilterModifier] = useState('');
    const [includeSpools, setIncludeSpools] = useState(false);

    useEffect(() => {
        getExportPreview()
            .then(data => {
                setFilaments(data.filaments || []);
                setVendors(data.vendors || []);
                setMaterials(data.materials || []);
                setModifiers(data.modifiers || []);
            })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, []);

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return filaments.filter(f => {
            if (filterVendor && f.vendor_name !== filterVendor) return false;
            if (filterMaterial && f.material_base !== filterMaterial) return false;
            if (filterModifier && f.material_modifier !== filterModifier) return false;
            if (q) {
                const hay = `${f.name} ${f.vendor_name} ${f.material} ${f.material_modifier}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [filaments, search, filterVendor, filterMaterial, filterModifier]);

    const toggle = (id) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const selectAllVisible = () => {
        setSelected(prev => {
            const next = new Set(prev);
            for (const f of filtered) next.add(f.id);
            return next;
        });
    };

    const deselectAllVisible = () => {
        setSelected(prev => {
            const next = new Set(prev);
            for (const f of filtered) next.delete(f.id);
            return next;
        });
    };

    const clearAll = () => setSelected(new Set());

    const selectedSpools = filaments
        .filter(f => selected.has(f.id))
        .reduce((sum, f) => sum + f.spool_count, 0);

    const isPartial = selected.size > 0;

    const colorSwatch = (f) => {
        if (f.multi_color_hexes) {
            const cols = f.multi_color_hexes.split(',').map(c => `#${c.trim()}`);
            const grad = cols.length > 1
                ? `linear-gradient(135deg, ${cols.join(', ')})`
                : cols[0];
            return <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, border: '1px solid var(--border)', background: grad, verticalAlign: 'middle' }} />;
        }
        if (f.color_hex) {
            return <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, border: '1px solid var(--border)', background: `#${f.color_hex}`, verticalAlign: 'middle' }} />;
        }
        return null;
    };

    return createPortal(
        <div className="dialog-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
            <div className="dialog" style={{ maxWidth: '680px', width: '95vw' }}>
                <h2 style={{ fontSize: '17px', marginBottom: '4px' }}>Export Filament Data</h2>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                    Search and select filaments to export. Manufacturers are included automatically.
                </p>

                {loading && <p style={{ fontSize: '13px' }}>Loading...</p>}
                {error && <p style={{ fontSize: '13px', color: 'var(--danger)' }}>{error}</p>}

                {!loading && !error && (
                    <>
                        {/* Search + filters */}
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="Search filaments..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                style={{ flex: '1 1 180px', fontSize: '13px', padding: '6px 10px' }}
                            />
                            <select
                                className="form-input"
                                value={filterVendor}
                                onChange={e => setFilterVendor(e.target.value)}
                                style={{ fontSize: '12px', padding: '5px 8px' }}
                            >
                                <option value="">All Manufacturers</option>
                                {vendors.map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                            <select
                                className="form-input"
                                value={filterMaterial}
                                onChange={e => setFilterMaterial(e.target.value)}
                                style={{ fontSize: '12px', padding: '5px 8px' }}
                            >
                                <option value="">All Materials</option>
                                {materials.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                            {modifiers.length > 0 && (
                                <select
                                    className="form-input"
                                    value={filterModifier}
                                    onChange={e => setFilterModifier(e.target.value)}
                                    style={{ fontSize: '12px', padding: '5px 8px' }}
                                >
                                    <option value="">All Variants</option>
                                    {modifiers.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            )}
                        </div>

                        {/* Bulk actions */}
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                            <button className="btn btn-sm" onClick={selectAllVisible}>Select Visible ({filtered.length})</button>
                            <button className="btn btn-sm" onClick={deselectAllVisible}>Deselect Visible</button>
                            {selected.size > 0 && (
                                <button className="btn btn-sm" onClick={clearAll}>Clear All ({selected.size})</button>
                            )}
                        </div>

                        {/* Filament list */}
                        <div style={{
                            maxHeight: '340px', overflowY: 'auto',
                            border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                        }}>
                            {filtered.length === 0 && (
                                <div style={{ padding: '20px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
                                    No filaments match the current filters.
                                </div>
                            )}
                            {filtered.map(f => (
                                <label
                                    key={f.id}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        padding: '6px 12px', cursor: 'pointer',
                                        borderBottom: '1px solid var(--border)',
                                        background: selected.has(f.id) ? 'var(--surface-hover, rgba(255,255,255,0.03))' : 'transparent',
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selected.has(f.id)}
                                        onChange={() => toggle(f.id)}
                                    />
                                    {colorSwatch(f)}
                                    <span style={{ flex: 1, fontSize: '13px', minWidth: 0 }}>
                                        <span style={{ fontWeight: 500 }}>{f.vendor_name}</span>
                                        {f.vendor_name && f.name ? ' ' : ''}
                                        {f.name}
                                    </span>
                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                        {f.material_base}
                                        {f.material_modifier && (
                                            <span style={{ marginLeft: '4px', padding: '1px 5px', borderRadius: '3px', background: 'var(--surface, rgba(255,255,255,0.05))', fontSize: '10px' }}>
                                                {f.material_modifier}
                                            </span>
                                        )}
                                    </span>
                                    {f.spool_count > 0 && (
                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                            {f.spool_count} spool{f.spool_count !== 1 ? 's' : ''}
                                        </span>
                                    )}
                                </label>
                            ))}
                        </div>

                        {/* Options + summary */}
                        <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={includeSpools}
                                    onChange={e => setIncludeSpools(e.target.checked)}
                                />
                                Include spools
                                {includeSpools && selectedSpools > 0 && (
                                    <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>({selectedSpools})</span>
                                )}
                            </label>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                {isPartial
                                    ? `${selected.size} filament${selected.size !== 1 ? 's' : ''} selected`
                                    : `All ${filaments.length} filaments`
                                }
                            </span>
                        </div>
                    </>
                )}

                <div className="dialog-actions" style={{ marginTop: '14px' }}>
                    <button
                        className="btn btn-primary"
                        onClick={() => onExport({
                            filament_ids: isPartial ? [...selected] : null,
                            include_spools: includeSpools,
                        })}
                        disabled={loading}
                    >
                        {isPartial ? `Export ${selected.size} Filament${selected.size !== 1 ? 's' : ''}` : 'Export All'}
                    </button>
                    <button className="btn" onClick={onCancel}>Cancel</button>
                </div>
            </div>
        </div>,
        document.body
    );
}
