import { useState, useEffect, useCallback } from 'react';
import { getFilaments, deleteFilament, getFields } from '../api/spoolman';
import AddFilamentDialog from '../components/spoolman/AddFilamentDialog';

export default function FilamentsPage() {
    const [filaments, setFilaments] = useState([]);
    const [extraFields, setExtraFields] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [showAdd, setShowAdd] = useState(false);
    const [editFilament, setEditFilament] = useState(null);

    const load = useCallback(async () => {
        try {
            const [f, fields] = await Promise.all([getFilaments(), getFields('filament')]);
            setFilaments(f || []);
            setExtraFields(fields || []);
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

    return (
        <div className="page">
            <div className="sm-page-toolbar">
                <input
                    className="sm-input sm-page-search"
                    type="text"
                    placeholder="Search filaments…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                <button className="btn btn-primary v-btn" onClick={() => setShowAdd(true)}>+ Add Filament</button>
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
                <div className="sm-catalogue-table-wrap">
                    <table className="sm-catalogue-table">
                        <thead>
                            <tr>
                                <th></th>
                                <th>Name</th>
                                <th>Manufacturer</th>
                                <th>Material</th>
                                <th>Diameter</th>
                                <th>Density</th>
                                <th>Weight</th>
                                {extraFields.map(f => (
                                    <th key={f.key}>{f.name}{f.unit ? ` (${f.unit})` : ''}</th>
                                ))}
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(f => {
                                const color = `#${f.color_hex || '888888'}`;
                                return (
                                    <tr key={f.id} className="sm-catalogue-row">
                                        <td>
                                            <div className="sm-filament-dot" style={{ backgroundColor: color }} />
                                        </td>
                                        <td className="sm-catalogue-name">{f.name}</td>
                                        <td className="sm-catalogue-muted">{f.vendor?.name || '—'}</td>
                                        <td className="sm-catalogue-muted">{f.material || '—'}</td>
                                        <td className="sm-catalogue-muted">{f.diameter ? `${f.diameter} mm` : '—'}</td>
                                        <td className="sm-catalogue-muted">{f.density ? `${f.density} g/cm³` : '—'}</td>
                                        <td className="sm-catalogue-muted">{f.weight ? `${f.weight} g` : '—'}</td>
                                        {extraFields.map(ef => (
                                            <td key={ef.key} className="sm-catalogue-muted">
                                                {ef.key === 'url' && f.extra?.[ef.key]
                                                    ? <a href={f.extra[ef.key]} target="_blank" rel="noopener noreferrer" className="sm-link">Link</a>
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
        </div>
    );
}
