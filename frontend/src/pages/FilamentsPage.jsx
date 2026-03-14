import { useState, useEffect, useCallback } from 'react';
import { getFilaments, deleteFilament, getFields } from '../api/spoolman';
import { getSettings } from '../api/settings';
import AddFilamentDialog from '../components/spoolman/AddFilamentDialog';
import ColoriometerPanel from '../components/spoolman/ColoriometerPanel';
import { findClosestRal } from '../utils/ralColors';
import ViewToggle from '../components/common/ViewToggle';

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
    const [showAdd, setShowAdd] = useState(false);
    const [editFilament, setEditFilament] = useState(null);
    const [cloneFilament, setCloneFilament] = useState(null);
    const [viewMode, setViewMode] = useState('list');
    const [swatchField, setSwatchField] = useState(null);
    const [urlField, setUrlField] = useState(null);

    const load = useCallback(async () => {
        try {
            const [f, fields, s] = await Promise.all([getFilaments(), getFields('filament'), getSettings()]);
            setFilaments(f || []);
            setExtraFields(fields || []);
            setSwatchField(s?.swatch_extra_field || null);
            setUrlField(s?.url_extra_field || null);
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

    const filtered = filaments.filter(f => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
            (f.name || '').toLowerCase().includes(q) ||
            (f.material || '').toLowerCase().includes(q) ||
            (f.vendor?.name || '').toLowerCase().includes(q)
        );
    });

    const displayExtraFields = extraFields.filter(f => f.key !== swatchField);

    return (
        <div className="page">
            <div className="sm-page-toolbar">
                <input
                    className="sm-input sm-page-search"
                    type="text"
                    placeholder="Search filaments…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ flex: 1, minWidth: '200px' }}
                />
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <ViewToggle viewMode={viewMode} onChange={setViewMode} />
                    <button className="btn btn-primary v-btn" onClick={() => setShowAdd(true)}>+ Add Filament</button>
                    <ColoriometerPanel />
                </div>
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
                                    const color = `#${f.color_hex || '888888'}`;
                                    const ralMatch = f.color_hex ? findClosestRal(f.color_hex) : null;
                                    return (
                                        <tr key={f.id} className="sm-catalogue-row" style={{ backgroundColor: 'var(--surface)' }}>
                                            <td>
                                                <div className="sm-filament-dot" style={{ '--spool-color': color }} />
                                            </td>
                                            <td className="sm-catalogue-name">{f.name}</td>
                                            <td className="sm-catalogue-muted">{f.vendor?.name || '—'}</td>
                                            <td className="sm-catalogue-muted">{f.material || '—'}</td>
                                            <td className="sm-catalogue-muted" style={{ fontFamily: 'monospace' }}>
                                                {f.color_hex ? `#${f.color_hex.toUpperCase()}` : '—'}
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
                            const color = `#${f.color_hex || '888888'}`;
                            const ralMatch = f.color_hex ? findClosestRal(f.color_hex) : null;
                            return (
                                <div key={f.id} className="spoolman-spool-card" style={{ backgroundColor: 'var(--surface)' }}>
                                    <div className="spool-card-header">
                                        <div className="spool-color-circle" style={{ '--spool-color': color }} />
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
                                        <button className="btn-icon" style={{ flex: 1, padding: '8px', color: 'var(--text-muted)' }} onClick={() => setEditFilament(f)} title="Edit">✎ Edit</button>
                                        <button className="btn-icon" style={{ flex: 1, padding: '8px', color: 'var(--text-muted)' }} onClick={() => setCloneFilament(f)} title="Clone">⎘ Clone</button>
                                        <button className="btn-icon text-danger" style={{ flex: 1, padding: '8px', color: '#ff4444' }} onClick={() => handleDelete(f)} title="Delete">🗑 Delete</button>
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
