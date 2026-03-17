import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getExportPreview } from '../../api/spoolman';

export default function ExportSelectionDialog({ onExport, onCancel }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [vendors, setVendors] = useState([]);
    const [selected, setSelected] = useState(new Set());
    const [totalFilaments, setTotalFilaments] = useState(0);
    const [totalSpools, setTotalSpools] = useState(0);

    useEffect(() => {
        getExportPreview()
            .then(data => {
                setVendors(data.vendors || []);
                setTotalFilaments(data.total_filaments || 0);
                setTotalSpools(data.total_spools || 0);
            })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, []);

    const toggle = (id) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const selectAll = () => setSelected(new Set(vendors.map(v => v.id)));
    const selectNone = () => setSelected(new Set());

    const selectedFilaments = vendors
        .filter(v => selected.has(v.id))
        .reduce((sum, v) => sum + v.filament_count, 0);
    const selectedSpools = vendors
        .filter(v => selected.has(v.id))
        .reduce((sum, v) => sum + v.spool_count, 0);

    const isPartial = selected.size > 0 && selected.size < vendors.length;
    const isAll = selected.size === 0 || selected.size === vendors.length;

    return createPortal(
        <div className="dialog-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
            <div className="dialog" style={{ maxWidth: '540px', width: '90vw' }}>
                <h2 style={{ fontSize: '17px', marginBottom: '4px' }}>Export Spoolman Data</h2>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                    Select manufacturers to include, or export everything.
                </p>

                {loading && <p style={{ fontSize: '13px' }}>Loading...</p>}
                {error && <p style={{ fontSize: '13px', color: 'var(--danger)' }}>{error}</p>}

                {!loading && !error && (
                    <>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                            <button className="btn btn-sm" onClick={selectAll}>Select All</button>
                            <button className="btn btn-sm" onClick={selectNone}>Clear</button>
                        </div>

                        <div style={{
                            maxHeight: '320px', overflowY: 'auto',
                            border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                        }}>
                            {vendors.map(v => (
                                <label
                                    key={v.id}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '10px',
                                        padding: '8px 12px', cursor: 'pointer',
                                        borderBottom: '1px solid var(--border)',
                                        background: selected.has(v.id) ? 'var(--surface-hover, rgba(255,255,255,0.03))' : 'transparent',
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selected.has(v.id)}
                                        onChange={() => toggle(v.id)}
                                    />
                                    <span style={{ flex: 1, fontWeight: 500, fontSize: '13px' }}>{v.name}</span>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                        {v.filament_count} filament{v.filament_count !== 1 ? 's' : ''}
                                        {v.spool_count > 0 && <>, {v.spool_count} spool{v.spool_count !== 1 ? 's' : ''}</>}
                                    </span>
                                </label>
                            ))}
                        </div>

                        <div style={{
                            marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)',
                            display: 'flex', gap: '16px',
                        }}>
                            {isAll ? (
                                <span>Exporting all: {totalFilaments} filaments, {totalSpools} spools</span>
                            ) : isPartial ? (
                                <span>Exporting {selected.size} vendor{selected.size !== 1 ? 's' : ''}: {selectedFilaments} filaments, {selectedSpools} spools</span>
                            ) : (
                                <span>No vendors selected — will export all data</span>
                            )}
                        </div>
                    </>
                )}

                <div className="dialog-actions" style={{ marginTop: '16px' }}>
                    <button
                        className="btn btn-primary"
                        onClick={() => onExport(isPartial ? [...selected] : null)}
                        disabled={loading}
                    >
                        {isPartial ? 'Export Selected' : 'Export All'}
                    </button>
                    <button className="btn" onClick={onCancel}>Cancel</button>
                </div>
            </div>
        </div>,
        document.body
    );
}
