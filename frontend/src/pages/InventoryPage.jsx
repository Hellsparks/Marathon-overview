import { useState, useEffect, useCallback, useRef } from 'react';
import { getFilaments, getSpools, getInventory, setInventoryTarget, removeInventoryTarget, getSpoolmanSettings, getStorageLocation, setStorageLocation, patchSpool } from '../api/spoolman';
import { groupSpoolsByFilament, isSpoolLow } from '../utils/spoolStorage';
import AddSpoolDialog from '../components/spoolman/AddSpoolDialog';
import ViewToggle from '../components/common/ViewToggle';

function countStock(spools, filamentId) {
    return spools.filter(s =>
        s.filament?.id === filamentId &&
        !s.archived &&
        (s.remaining_weight == null || s.remaining_weight > (s.initial_weight ?? 1000) * 0.05)
    ).length;
}

function toAbsUrl(url) {
    if (!url) return null;
    const clean = url.replace(/^["'\s]+|["'\s]+$/g, '');
    if (!clean) return null;
    return /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
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
    const [storageLocation, setStorageLocationState] = useState('Storage');
    const [storageOpen, setStorageOpen] = useState(true);
    const [editingLocation, setEditingLocation] = useState(false);
    const [locationInput, setLocationInput] = useState('');
    const [openBusy, setOpenBusy] = useState({});
    const [showAddSpool, setShowAddSpool] = useState(false);
    const [addSpoolFilamentId, setAddSpoolFilamentId] = useState(null);
    const [showTracker, setShowTracker] = useState(false);
    const [trackSearch, setTrackSearch] = useState('');
    const [search, setSearch] = useState('');
    const [viewMode, setViewMode] = useState('list');
    const [materialFilter, setMaterialFilter] = useState([]);
    const [vendorFilter, setVendorFilter] = useState([]);
    const [showFilter, setShowFilter] = useState(false);
    const filterRef = useRef(null);

    const load = useCallback(async () => {
        try {
            const [f, s, inv, settings, storageSetting] = await Promise.all([
                getFilaments(), getSpools(), getInventory(),
                getSpoolmanSettings().catch(() => ({})),
                getStorageLocation().catch(() => ({ storage_location: 'Storage' })),
            ]);
            setFilaments(f || []);
            setSpools(s || []);
            const invMap = {};
            for (const row of (inv || [])) invMap[row.filament_id] = row;
            setInventory(invMap);
            const c = settings?.currency;
            setCurrency(typeof c === 'string' ? c : (c?.value ?? ''));
            setStorageLocationState(storageSetting.storage_location || 'Storage');
            setError(null);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!showFilter) return;
        function handleClick(e) {
            if (filterRef.current && !filterRef.current.contains(e.target)) setShowFilter(false);
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [showFilter]);

    const allTracked = filaments.filter(f => inventory[f.id]);
    const allMaterials = [...new Set(allTracked.map(f => f.material).filter(Boolean))].sort();
    const allVendors = [...new Set(allTracked.map(f => f.vendor?.name).filter(Boolean))].sort();

    const tracked = allTracked.filter(f => {
        if (search.trim()) {
            const q = search.toLowerCase();
            const match = (
                (f.name || '').toLowerCase().includes(q) ||
                (f.material || '').toLowerCase().includes(q) ||
                (f.vendor?.name || '').toLowerCase().includes(q)
            );
            if (!match) return false;
        }
        if (materialFilter.length > 0 && !materialFilter.includes(f.material)) return false;
        if (vendorFilter.length > 0 && !vendorFilter.includes(f.vendor?.name)) return false;
        return true;
    });

    const activeFilterCount = materialFilter.length + vendorFilter.length;

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

    const storageGroups = groupSpoolsByFilament(spools, storageLocation);

    async function handleOpenSpool(group) {
        const spool = group.storageSpools[0];
        if (!spool) return;
        setOpenBusy(b => ({ ...b, [spool.id]: true }));
        try {
            await patchSpool(spool.id, { location: null });
            await load();
        } catch (e) {
            alert(e.message);
        } finally {
            setOpenBusy(b => ({ ...b, [spool.id]: false }));
        }
    }

    async function handleSaveStorageLocation() {
        if (!locationInput.trim()) return;
        try {
            await setStorageLocation(locationInput.trim());
            setStorageLocationState(locationInput.trim());
            setEditingLocation(false);
            await load();
        } catch (e) {
            alert(e.message);
        }
    }

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

            {/* ── Search + View Toggle ───────────────────────────────── */}
            <div style={{ display: 'flex', gap: '8px', margin: '12px 0', alignItems: 'center' }}>
                <div className="spoolman-search-wrap" style={{ flex: 1, position: 'relative' }} ref={filterRef}>
                    <span className="spoolman-search-icon">🔍</span>
                    <input
                        type="text"
                        className="input spoolman-search-input"
                        placeholder="Search tracked filaments…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ paddingRight: '36px' }}
                    />
                    <button
                        className="spoolman-filter-btn"
                        onClick={() => setShowFilter(v => !v)}
                        title="Filter"
                        style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)' }}
                    >
                        {activeFilterCount > 0 ? `⚙ ${activeFilterCount}` : '⚙'}
                    </button>
                    {showFilter && (
                        <div className="spoolman-filter-popover" style={{ position: 'absolute', top: '100%', right: 0, zIndex: 100 }}>
                            {allMaterials.length > 0 && (
                                <div className="spoolman-filter-group">
                                    <div className="spoolman-filter-label">Material</div>
                                    {allMaterials.map(mat => (
                                        <label key={mat} className="spoolman-filter-option">
                                            <input
                                                type="checkbox"
                                                checked={materialFilter.includes(mat)}
                                                onChange={() => setMaterialFilter(prev =>
                                                    prev.includes(mat) ? prev.filter(x => x !== mat) : [...prev, mat]
                                                )}
                                                style={{
                                                    appearance: 'none', WebkitAppearance: 'none',
                                                    width: '14px', height: '14px', borderRadius: '3px',
                                                    border: '1.5px solid var(--border)', background: 'var(--surface)',
                                                    cursor: 'pointer', flexShrink: 0,
                                                    accentColor: 'var(--primary, #0ea5e9)'
                                                }}
                                            />
                                            {mat}
                                        </label>
                                    ))}
                                </div>
                            )}
                            {allVendors.length > 0 && (
                                <div className="spoolman-filter-group">
                                    <div className="spoolman-filter-label">Vendor</div>
                                    {allVendors.map(v => (
                                        <label key={v} className="spoolman-filter-option">
                                            <input
                                                type="checkbox"
                                                checked={vendorFilter.includes(v)}
                                                onChange={() => setVendorFilter(prev =>
                                                    prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]
                                                )}
                                                style={{
                                                    appearance: 'none', WebkitAppearance: 'none',
                                                    width: '14px', height: '14px', borderRadius: '3px',
                                                    border: '1.5px solid var(--border)', background: 'var(--surface)',
                                                    cursor: 'pointer', flexShrink: 0,
                                                    accentColor: 'var(--primary, #0ea5e9)'
                                                }}
                                            />
                                            {v}
                                        </label>
                                    ))}
                                </div>
                            )}
                            {(materialFilter.length > 0 || vendorFilter.length > 0) && (
                                <button
                                    className="spoolman-filter-clear"
                                    onClick={() => { setMaterialFilter([]); setVendorFilter([]); }}
                                >
                                    Clear filters
                                </button>
                            )}
                        </div>
                    )}
                </div>
                <ViewToggle viewMode={viewMode} onChange={setViewMode} />
            </div>

            {/* ── Stock table / cards ────────────────────────────────── */}
            {tracked.length === 0 ? (
                <div className="text-muted" style={{ padding: '20px', textAlign: 'center' }}>
                    {search ? 'No filaments match your search' : 'No filaments tracked yet. Click "+ Track Filament" to get started.'}
                </div>
            ) : viewMode !== 'list' ? (
                <div style={{
                    display: 'grid',
                    gap: '12px',
                    gridTemplateColumns: viewMode === 'grid-large' ? 'repeat(auto-fill, minmax(280px, 1fr))' : 'repeat(auto-fill, minmax(200px, 1fr))',
                    marginBottom: '16px'
                }}>
                    {tracked.map(f => {
                        const inv = inventory[f.id];
                        const current = countStock(spools, f.id);
                        const status = current < inv.min_qty ? 'LOW' : 'OK';
                        const color = `#${f.color_hex || '888888'}`;
                        return (
                            <div key={f.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                    <div className="sm-filament-dot" style={{ backgroundColor: color, flexShrink: 0 }} />
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: '13px' }}>{f.name}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{[f.vendor?.name, f.material].filter(Boolean).join(' · ')}</div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>In stock: <strong style={{ color: current === 0 ? 'var(--danger)' : 'var(--text)' }}>{current}</strong> / {inv.target_qty}</span>
                                    <span className={`inv-status-badge ${status === 'LOW' ? 'inv-status-low' : 'inv-status-ok'}`}>{status}</span>
                                </div>
                            </div>
                        );
                    })}
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

            {/* ── Shopping list (always uses full tracked, not filtered) ── */}
            {shoppingList.length > 0 && (
                <div className="inv-shopping-section">
                    <h2 className="inv-shopping-title">Shopping List</h2>
                    <div className="inv-shopping-list">
                        {shoppingList.map(({ filament: f, current, buyCount }) => {
                            const color = `#${f.color_hex || '888888'}`;
                            const storeUrl = toAbsUrl(f.extra?.url);
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

            {/* ── Spool Storage ──────────────────────────────────────── */}
            {storageGroups.length > 0 && (
                <div className="inv-storage-section">
                    <button
                        className="inv-storage-toggle"
                        onClick={() => setStorageOpen(v => !v)}
                    >
                        <span className="inv-storage-toggle-label">
                            Spool Storage
                            <span className="inv-storage-count">{storageGroups.length}</span>
                        </span>
                        <span className="inv-storage-chevron">{storageOpen ? '▲' : '▼'}</span>
                    </button>

                    {storageOpen && (
                        <div>
                            <div className="inv-storage-location-row">
                                {editingLocation ? (
                                    <>
                                        <input
                                            className="input inv-storage-location-input"
                                            value={locationInput}
                                            onChange={e => setLocationInput(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') handleSaveStorageLocation(); if (e.key === 'Escape') setEditingLocation(false); }}
                                            autoFocus
                                        />
                                        <button className="btn btn-sm btn-primary" onClick={handleSaveStorageLocation}>Save</button>
                                        <button className="btn btn-sm" onClick={() => setEditingLocation(false)}>Cancel</button>
                                    </>
                                ) : (
                                    <>
                                        <span className="text-muted" style={{ fontSize: '12px' }}>
                                            Storage location: <strong style={{ color: 'var(--text)' }}>{storageLocation}</strong>
                                        </span>
                                        <button
                                            className="sm-action-btn"
                                            title="Change storage location name"
                                            onClick={() => { setLocationInput(storageLocation); setEditingLocation(true); }}
                                        >✏</button>
                                    </>
                                )}
                            </div>

                            <div className="inv-storage-list">
                                {storageGroups.map(({ filament: f, storageSpools, activeSpools }) => {
                                    const color = `#${f.color_hex || '888888'}`;
                                    const hasLowActive = activeSpools.some(isSpoolLow);
                                    const showAlert = hasLowActive && storageSpools.length > 0;
                                    const topStorageSpool = storageSpools[0];
                                    const isOpening = topStorageSpool && openBusy[topStorageSpool.id];
                                    return (
                                        <div key={f.id} className={`inv-storage-row${showAlert ? ' inv-storage-row-alert' : ''}`}>
                                            <div className="sm-filament-dot" style={{ backgroundColor: color, flexShrink: 0 }} />
                                            <div className="inv-storage-info">
                                                <span className="inv-storage-name">{f.name}</span>
                                                <span className="inv-storage-meta">
                                                    {[f.vendor?.name, f.material].filter(Boolean).join(' · ')}
                                                </span>
                                            </div>
                                            <div className="inv-storage-counts">
                                                <span className="inv-storage-stat" title="Sealed in storage">
                                                    <span className="inv-storage-stat-val">{storageSpools.length}</span>
                                                    <span className="inv-storage-stat-label">stored</span>
                                                </span>
                                                <span className="inv-storage-stat" title="Active (opened)">
                                                    <span className="inv-storage-stat-val">{activeSpools.length}</span>
                                                    <span className="inv-storage-stat-label">active</span>
                                                </span>
                                            </div>
                                            {showAlert && (
                                                <span className="inv-storage-alert-badge" title="Active spool running low — storage available">
                                                    ⚠ Low
                                                </span>
                                            )}
                                            <div className="inv-storage-actions">
                                                <button
                                                    className="btn inv-storage-open-btn"
                                                    disabled={storageSpools.length === 0 || isOpening}
                                                    title={storageSpools.length === 0 ? 'No spools in storage' : `Open spool #${topStorageSpool?.id} (oldest first)`}
                                                    onClick={() => handleOpenSpool({ storageSpools })}
                                                >
                                                    {isOpening ? '…' : 'Open Spool'}
                                                </button>
                                                <button
                                                    className="btn btn-primary inv-storage-add-btn"
                                                    title="Add a new sealed spool to storage"
                                                    onClick={() => { setAddSpoolFilamentId(f.id); setShowAddSpool(true); }}
                                                >
                                                    + Store
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Add Spool to storage dialog ─────────────────────────── */}
            {showAddSpool && (
                <AddSpoolDialog
                    storageLocation={storageLocation}
                    defaultInStorage={true}
                    preselectedFilamentId={addSpoolFilamentId}
                    onAddFilament={() => {}}
                    onClose={() => { setShowAddSpool(false); setAddSpoolFilamentId(null); }}
                    onCreated={() => { setShowAddSpool(false); setAddSpoolFilamentId(null); load(); }}
                />
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
