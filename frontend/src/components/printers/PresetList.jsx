import { useState, useEffect, useMemo } from 'react';
import { getPresets } from '../../api/presets';

export default function PresetList() {
    const [presets, setPresets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [brandFilter, setBrandFilter] = useState([]);
    const [filamentFilter, setFilamentFilter] = useState([]);
    const [showFilter, setShowFilter] = useState(false);

    useEffect(() => {
        getPresets()
            .then(p => setPresets(p || []))
            .catch(e => console.error('Failed to load presets', e))
            .finally(() => setLoading(false));
    }, []);

    const brands = useMemo(() => {
        const b = new Set();
        for (const p of presets) {
            const brand = p.name.split(' ')[0]; // first word = brand
            if (brand) b.add(brand);
        }
        return [...b].sort();
    }, [presets]);

    const allFilaments = useMemo(() => {
        const f = new Set();
        for (const p of presets) (p.filament_types || []).forEach(t => f.add(t));
        return [...f].sort();
    }, [presets]);

    const filtered = useMemo(() => {
        return presets.filter(p => {
            if (brandFilter.length > 0) {
                const brand = p.name.split(' ')[0];
                if (!brandFilter.includes(brand)) return false;
            }
            if (filamentFilter.length > 0) {
                const types = p.filament_types || [];
                if (!filamentFilter.every(f => types.includes(f))) return false;
            }
            if (search.trim()) {
                const q = search.toLowerCase();
                const sizeStr = `${p.bed_width}x${p.bed_depth}x${p.bed_height}`;
                return (
                    p.name.toLowerCase().includes(q) ||
                    sizeStr.includes(q) ||
                    (p.filament_types || []).some(t => t.toLowerCase().includes(q))
                );
            }
            return true;
        });
    }, [presets, search, brandFilter, filamentFilter]);

    const activeFilterCount = brandFilter.length + filamentFilter.length;

    if (loading) return <div className="loading">Loading presets…</div>;

    return (
        <div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center', position: 'relative' }}>
                <div className="spoolman-search-wrap" style={{ width: '100%', maxWidth: '420px', position: 'relative' }}>
                    <span className="spoolman-search-icon">🔍</span>
                    <input
                        type="text"
                        className="input spoolman-search-input"
                        placeholder="Search by name, bed size (e.g. 250x250), filament…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ paddingRight: '36px' }}
                    />
                    <button
                        onClick={() => setShowFilter(v => !v)}
                        style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', padding: '6px 10px', fontSize: '13px', border: 'none', background: 'transparent', cursor: 'pointer', color: activeFilterCount > 0 ? 'var(--primary)' : 'var(--text-muted)' }}
                        title="Filter presets"
                    >
                        {activeFilterCount > 0 ? `⚙ ${activeFilterCount}` : '⚙'}
                    </button>
                </div>
                {showFilter && (
                    <>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setShowFilter(false)} />
                        <div style={{
                            position: 'absolute', top: '100%', right: 0, marginTop: '4px',
                            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px',
                            padding: '12px', zIndex: 1000, minWidth: '260px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                        }} onClick={e => e.stopPropagation()}>
                            <div style={{ marginBottom: '12px' }}>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-muted)' }}>Brand</label>
                                <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '4px', padding: '6px' }}>
                                    {brands.map(b => (
                                        <label key={b} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', cursor: 'pointer', fontSize: '13px' }}>
                                            <input type="checkbox" checked={brandFilter.includes(b)}
                                                onChange={e => e.target.checked ? setBrandFilter([...brandFilter, b]) : setBrandFilter(brandFilter.filter(x => x !== b))}
                                            /> {b}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div style={{ marginBottom: '12px' }}>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-muted)' }}>Supports Filament</label>
                                <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '4px', padding: '6px' }}>
                                    {allFilaments.map(f => (
                                        <label key={f} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', cursor: 'pointer', fontSize: '13px' }}>
                                            <input type="checkbox" checked={filamentFilter.includes(f)}
                                                onChange={e => e.target.checked ? setFilamentFilter([...filamentFilter, f]) : setFilamentFilter(filamentFilter.filter(x => x !== f))}
                                            /> {f}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <button className="btn btn-sm"
                                onClick={() => { setBrandFilter([]); setFilamentFilter([]); setShowFilter(false); }}
                                style={{ width: '100%', fontSize: '12px' }}>
                                Clear Filters
                            </button>
                        </div>
                    </>
                )}
            </div>

            {filtered.length === 0 ? (
                <p className="text-muted" style={{ padding: '20px', textAlign: 'center' }}>
                    {search || activeFilterCount > 0 ? 'No presets match your search' : 'No presets found.'}
                </p>
            ) : (
                <table className="file-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Bed Size</th>
                            <th>Max Height</th>
                            <th>Toolheads</th>
                            <th>Filaments</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map(p => (
                            <tr key={p.id}>
                                <td><span className="preset-name">{p.name}</span></td>
                                <td>{p.bed_width}×{p.bed_depth}mm</td>
                                <td>{p.bed_height}mm</td>
                                <td>{p.toolhead_count}</td>
                                <td><FilamentBadges types={p.filament_types} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            <p className="text-muted" style={{ fontSize: '11px', marginTop: '8px', paddingBottom: '4px' }}>
                {filtered.length} of {presets.length} presets
            </p>
        </div>
    );
}

function FilamentBadges({ types }) {
    if (!types || types.length === 0) return <span className="text-muted">—</span>;
    return (
        <div className="badge-row">
            {types.map(t => (
                <span key={t} className={`badge badge-filament filament-${t}`}>{t}</span>
            ))}
        </div>
    );
}
