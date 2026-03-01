import { useState, useEffect, useCallback } from 'react';
import { getFilaments, getSpools, getInventory, setInventoryTarget, removeInventoryTarget, getSpoolmanSettings } from '../api/spoolman';

function countStock(spools, filamentId) {
    return spools.filter(s =>
        s.filament?.id === filamentId &&
        !s.archived &&
        (s.remaining_weight == null || s.remaining_weight > (s.initial_weight ?? 1000) * 0.05)
    ).length;
}

function sizeLabel(weight) {
    if (!weight) return '—';
    return weight >= 1000 ? `${weight / 1000}kg` : `${weight}g`;
}

export default function InventoryPage() {
    const [filaments, setFilaments] = useState([]);
    const [spools, setSpools] = useState([]);
    const [inventory, setInventory] = useState({});
    const [currency, setCurrency] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [pending, setPending] = useState({});
    const [busy, setBusy] = useState({});
    const [showTracker, setShowTracker] = useState(false);
    const [trackSearch, setTrackSearch] = useState('');

    const load = useCallback(async () => {
        try {
            const [f, s, inv, settings] = await Promise.all([
                getFilaments(), getSpools(), getInventory(),
                getSpoolmanSettings().catch(() => ({})),
            ]);
            setFilaments(f || []);
            setSpools(s || []);
            const invMap = {};
            for (const row of (inv || [])) invMap[row.filament_id] = row;
            setInventory(invMap);
            // Spoolman returns { currency: { value: "NOK", is_set: true, type: "str" }, ... }
            const c = settings?.currency;
            setCurrency(typeof c === 'string' ? c : (c?.value ?? ''));
            setError(null);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const tracked = filaments.filter(f => inventory[f.id]);

    async function handleSave(filamentId) {
        const p = pending[filamentId] || {};
        const inv = inventory[filamentId] || {};
        const target = parseInt(p.target_qty ?? inv.target_qty ?? 1);
        const min = parseInt(p.min_qty ?? inv.min_qty ?? 0);
        if (isNaN(target)) return;
        setBusy(b => ({ ...b, [filamentId]: true }));
        try {
            await setInventoryTarget(filamentId, target, min);
            setPending(p => { const n = { ...p }; delete n[filamentId]; return n; });
            await load();
        } catch (e) {
            alert(e.message);
        } finally {
            setBusy(b => ({ ...b, [filamentId]: false }));
        }
    }

    async function handleRemove(filamentId) {
        if (!confirm('Stop tracking this filament?')) return;
        try {
            await removeInventoryTarget(filamentId);
            await load();
        } catch (e) {
            alert(e.message);
        }
    }

    async function handleTrack(filament) {
        setBusy(b => ({ ...b, [filament.id]: true }));
        try {
            await setInventoryTarget(filament.id, 1, 0);
            await load();
            setShowTracker(false);
        } catch (e) {
            alert(e.message);
        } finally {
            setBusy(b => ({ ...b, [filament.id]: false }));
        }
    }

    function setPendingVal(filamentId, key, val) {
        setPending(p => ({ ...p, [filamentId]: { ...(p[filamentId] || {}), [key]: val } }));
    }

    const shoppingList = tracked
        .map(f => {
            const inv = inventory[f.id];
            const current = countStock(spools, f.id);
            const target = inv.target_qty;
            const min = inv.min_qty;
            const needsBuy = current < min;
            const buyCount = needsBuy ? Math.max(0, target - current) : 0;
            return { filament: f, current, target, min, needsBuy, buyCount };
        })
        .filter(r => r.needsBuy);

    const totalCost = shoppingList.reduce((sum, r) => {
        const price = r.filament.price ?? null;
        return price != null ? sum + price * r.buyCount : sum;
    }, 0);
    const hasCost = shoppingList.some(r => r.filament.price != null);

    const untracked = filaments.filter(f => !inventory[f.id]);
    const filteredUntracked = untracked.filter(f => {
        if (!trackSearch.trim()) return true;
        const q = trackSearch.toLowerCase();
        return (
            (f.name || '').toLowerCase().includes(q) ||
            (f.material || '').toLowerCase().includes(q) ||
            (f.vendor?.name || '').toLowerCase().includes(q)
        );
    });

    if (loading) return <div className="loading">Loading inventory…</div>;
    if (error) return <div className="error">{error}</div>;

    return (
        <div className="page inv-page">

            {/* ── Summary cards ──────────────────────────────────────── */}
            <div className="inv-summary-bar">
                <div className="inv-summary-card">
                    <span className="inv-summary-value">{tracked.length}</span>
                    <span className="inv-summary-label">Tracked filaments</span>
                </div>
                <div className="inv-summary-card">
                    <span className="inv-summary-value">{shoppingList.length}</span>
                    <span className="inv-summary-label">Need restocking</span>
                </div>
                {hasCost && (
                    <div className="inv-summary-card">
                        <span className="inv-summary-value">{currency} {totalCost.toFixed(2)}</span>
                        <span className="inv-summary-label">Est. restock cost</span>
                    </div>
                )}
                <button className="btn btn-primary v-btn inv-track-btn" onClick={() => setShowTracker(true)}>
                    + Track Filament
                </button>
            </div>

            {/* ── Stock table ────────────────────────────────────────── */}
            {tracked.length === 0 ? (
                <div className="text-muted" style={{ padding: '20px', textAlign: 'center' }}>
                    No filaments tracked yet. Click "+ Track Filament" to get started.
                </div>
            ) : (
                <div className="sm-catalogue-table-wrap">
                    <table className="sm-catalogue-table">
                        <thead>
                            <tr>
                                <th></th>
                                <th>Filament</th>
                                <th>Manufacturer</th>
                                <th>Material</th>
                                <th>Size</th>
                                <th style={{ textAlign: 'center' }}>In Stock</th>
                                <th style={{ textAlign: 'center' }}>Target</th>
                                <th style={{ textAlign: 'center' }}>Buy Below</th>
                                <th style={{ textAlign: 'center' }}>Status</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {tracked.map(f => {
                                const inv = inventory[f.id];
                                const current = countStock(spools, f.id);
                                const p = pending[f.id] || {};
                                const isDirty = pending[f.id] !== undefined;
                                const color = `#${f.color_hex || '888888'}`;
                                const status = current < inv.min_qty ? 'LOW' : 'OK';
                                const statusClass = status === 'LOW' ? 'inv-status-low' : 'inv-status-ok';

                                return (
                                    <tr key={f.id} className="sm-catalogue-row">
                                        <td><div className="sm-filament-dot" style={{ backgroundColor: color }} /></td>
                                        <td className="sm-catalogue-name">{f.name}</td>
                                        <td className="sm-catalogue-muted">{f.vendor?.name || '—'}</td>
                                        <td className="sm-catalogue-muted">{f.material || '—'}</td>
                                        <td className="sm-catalogue-muted">{sizeLabel(f.weight)}</td>
                                        <td style={{ textAlign: 'center' }}>
                                            <span className={`inv-stock-count${current === 0 ? ' inv-stock-zero' : ''}`}>{current}</span>
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <input className="inv-qty-input" type="number" min="0"
                                                value={p.target_qty ?? inv.target_qty}
                                                onChange={e => setPendingVal(f.id, 'target_qty', e.target.value)} />
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <input className="inv-qty-input" type="number" min="0"
                                                value={p.min_qty ?? inv.min_qty}
                                                onChange={e => setPendingVal(f.id, 'min_qty', e.target.value)} />
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <span className={`inv-status-badge ${statusClass}`}>{status}</span>
                                        </td>
                                        <td className="sm-catalogue-actions">
                                            {isDirty && (
                                                <button className="sm-action-btn" onClick={() => handleSave(f.id)}
                                                    disabled={busy[f.id]} title="Save">
                                                    {busy[f.id] ? '…' : '✓'}
                                                </button>
                                            )}
                                            <button className="sm-action-btn sm-action-danger"
                                                onClick={() => handleRemove(f.id)} title="Stop tracking">✕</button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ── Shopping list ──────────────────────────────────────── */}
            {shoppingList.length > 0 && (
                <div className="inv-shopping-section">
                    <h2 className="inv-shopping-title">Shopping List</h2>
                    <div className="inv-shopping-list">
                        {shoppingList.map(({ filament: f, current, buyCount }) => {
                            const color = `#${f.color_hex || '888888'}`;
                            const storeUrl = f.extra?.url;
                            const price = f.price;
                            return (
                                <div key={f.id} className="inv-shopping-item">
                                    <div className="sm-filament-dot" style={{ backgroundColor: color, flexShrink: 0 }} />
                                    <div className="inv-shopping-info">
                                        <span className="inv-shopping-name">
                                            {f.name}
                                            {f.weight && <span className="inv-shopping-size"> — {sizeLabel(f.weight)}</span>}
                                        </span>
                                        <span className="inv-shopping-meta">
                                            {[f.vendor?.name, f.material].filter(Boolean).join(' · ')}
                                            {' · '}
                                            <span className="inv-stock-count inv-stock-zero">{current} in stock</span>
                                        </span>
                                    </div>
                                    <div className="inv-shopping-right">
                                        <span className="inv-shopping-qty">× {buyCount}</span>
                                        {price != null && (
                                            <span className="inv-shopping-cost">{currency} {(price * buyCount).toFixed(2)}</span>
                                        )}
                                        {storeUrl ? (
                                            <a href={storeUrl} target="_blank" rel="noopener noreferrer"
                                                className="btn spoolman-add-btn"
                                                style={{ padding: '4px 10px', fontSize: '12px' }}>Buy →</a>
                                        ) : (
                                            <span className="inv-shopping-nolink">No store link</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        {hasCost && (
                            <div className="inv-shopping-total">
                                Total: <strong>{currency} {totalCost.toFixed(2)}</strong>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Track filament picker ──────────────────────────────── */}
            {showTracker && (
                <div className="spool-dialog-overlay" onClick={() => setShowTracker(false)}>
                    <div className="spool-dialog spool-dialog-wide" onClick={e => e.stopPropagation()}>
                        <div className="spool-dialog-header">
                            <h3 className="spool-dialog-title">Track Filament</h3>
                            <button className="spool-dialog-close" onClick={() => setShowTracker(false)}>✕</button>
                        </div>
                        <input className="sm-input" type="text" placeholder="Search filaments…"
                            value={trackSearch} onChange={e => setTrackSearch(e.target.value)}
                            autoFocus style={{ marginBottom: '10px' }} />
                        <div className="sm-filament-list">
                            {filteredUntracked.length === 0 && (
                                <div className="sm-filament-empty">
                                    {untracked.length === 0 ? 'All filaments are already tracked' : 'No filaments match your search'}
                                </div>
                            )}
                            {filteredUntracked.map(f => {
                                const color = `#${f.color_hex || '888888'}`;
                                return (
                                    <div key={f.id} className="sm-filament-row" onClick={() => handleTrack(f)}>
                                        <div className="sm-filament-dot" style={{ backgroundColor: color }} />
                                        <div className="sm-filament-info">
                                            <span className="sm-filament-name">
                                                {f.name}{f.weight ? ` — ${sizeLabel(f.weight)}` : ''}
                                            </span>
                                            <span className="sm-filament-meta">
                                                {[f.vendor?.name, f.material].filter(Boolean).join(' · ')}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
