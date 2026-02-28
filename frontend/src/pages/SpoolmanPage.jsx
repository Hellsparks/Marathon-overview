import { useState, useEffect, useCallback } from 'react';
import { usePrinters } from '../hooks/usePrinters';
import { getSpools, setActiveSpool } from '../api/spoolman';
import SpoolmanPrinterCard from '../components/spoolman/SpoolmanPrinterCard';

const COLOR_NAMES = {
    red: [255, 0, 0],
    green: [0, 128, 0],
    blue: [0, 0, 255],
    yellow: [255, 255, 0],
    orange: [255, 165, 0],
    purple: [128, 0, 128],
    pink: [255, 192, 203],
    black: [0, 0, 0],
    white: [255, 255, 255],
    gray: [128, 128, 128],
    grey: [128, 128, 128],
    silver: [192, 192, 192],
    cyan: [0, 255, 255],
    magenta: [255, 0, 255],
    brown: [165, 42, 42]
};

function hexToRgb(hex) {
    if (!hex) return null;
    const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}

function colorDistance(rgb1, rgb2) {
    return Math.sqrt(
        Math.pow(rgb1[0] - rgb2[0], 2) +
        Math.pow(rgb1[1] - rgb2[1], 2) +
        Math.pow(rgb1[2] - rgb2[2], 2)
    );
}

function matchesColor(hex, queryTokens) {
    if (!hex || queryTokens.length === 0) return false;
    const rgb = hexToRgb(hex);
    if (!rgb) return false;

    for (const token of queryTokens) {
        if (COLOR_NAMES[token]) {
            const dist = colorDistance(rgb, COLOR_NAMES[token]);
            if (dist < 120) return true;
        }
    }
    return false;
}

export default function SpoolmanPage() {
    const { printers } = usePrinters();
    const [spools, setSpools] = useState([]);
    const [search, setSearch] = useState('');
    const [statuses, setStatuses] = useState({});
    const [dragSpool, setDragSpool] = useState(null);
    const [dropTarget, setDropTarget] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [materialFilter, setMaterialFilter] = useState('');
    const [vendorFilter, setVendorFilter] = useState('');

    const fetchSpools = useCallback(async () => {
        try {
            const data = await getSpools();
            setSpools(data.filter(s => !s.archived));
            setError(null);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch spools
    useEffect(() => { fetchSpools(); }, [fetchSpools]);

    // Fetch printer statuses for active spool display
    useEffect(() => {
        async function fetchStatuses() {
            try {
                const r = await fetch('/api/status');
                if (r.ok) setStatuses(await r.json());
            } catch { }
        }
        fetchStatuses();
        const interval = setInterval(fetchStatuses, 5000);
        return () => clearInterval(interval);
    }, []);

    const uniqueMaterials = Array.from(new Set(spools.map(s => s.filament?.material).filter(Boolean))).sort();
    const uniqueVendors = Array.from(new Set(spools.map(s => s.filament?.vendor?.name).filter(Boolean))).sort();

    const filtered = spools.filter(s => {
        const f = s.filament || {};
        if (materialFilter && f.material !== materialFilter) return false;
        if (vendorFilter && f.vendor?.name !== vendorFilter) return false;

        if (!search.trim()) return true;
        const q = search.toLowerCase();
        const qTokens = q.split(/\s+/);

        const textMatch =
            (f.name || '').toLowerCase().includes(q) ||
            (f.material || '').toLowerCase().includes(q) ||
            (f.vendor?.name || '').toLowerCase().includes(q) ||
            (f.color_hex || '').toLowerCase().includes(q);

        const colorMatch = matchesColor(f.color_hex, qTokens);

        return textMatch || colorMatch;
    });

    // Drag handlers
    function onDragStart(e, spool) {
        setDragSpool(spool);
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', spool.id.toString());
    }

    function onDragOver(e, printerId) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setDropTarget(printerId);
    }

    function onDragLeave() {
        setDropTarget(null);
    }

    async function onDrop(e, printer) {
        e.preventDefault();
        setDropTarget(null);
        const spool = dragSpool;
        setDragSpool(null);
        if (!spool) return;

        // Check filament compatibility
        const material = (spool.filament?.material || '').toUpperCase();
        let supported = [];
        try { supported = JSON.parse(printer.filament_types || '[]'); } catch { }
        const supportedUpper = supported.map(s => s.toUpperCase());

        if (material && supportedUpper.length > 0 && !supportedUpper.includes(material)) {
            const proceed = confirm(
                `⚠️ ${printer.name} does not list "${spool.filament?.material}" as a supported filament.\n\n` +
                `Supported: ${supported.join(', ')}\n\n` +
                `Assign anyway?`
            );
            if (!proceed) return;
        }

        try {
            await setActiveSpool(printer.id, spool.id);
            const r = await fetch('/api/status');
            if (r.ok) setStatuses(await r.json());
        } catch (err) {
            alert(`Failed to set spool: ${err.message}`);
        }
    }

    async function handleClearSpool(printerId) {
        try {
            await setActiveSpool(printerId, null);
            const r = await fetch('/api/status');
            if (r.ok) setStatuses(await r.json());
        } catch (err) {
            alert(`Failed to clear spool: ${err.message}`);
        }
    }

    function getActiveSpool(printerId) {
        if (statuses?.printers && statuses.printers[printerId]) {
            return statuses.printers[printerId]._active_spool || null;
        }

        // Fallback to initial printer object array, which holds status when loaded
        const printer = printers.find(p => p.id === printerId);
        if (!printer || !printer.status || !printer.status._active_spool) return null;
        return printer.status._active_spool;
    }

    function getSpoolPercentage(spool) {
        if (!spool.initial_weight || spool.initial_weight === 0) return 100;
        return Math.min(100, (spool.remaining_weight / spool.initial_weight) * 100);
    }

    return (
        <div className="page spoolman-page">
            <h1 className="page-title">Spoolman</h1>

            <div className="spoolman-layout">
                {/* Center: Spool inventory */}
                <div className="spoolman-inventory">
                    <div className="spoolman-filters-bar">
                        <div className="spoolman-search-wrap">
                            <span className="spoolman-search-icon">🔍</span>
                            <input
                                type="text"
                                className="input spoolman-search-input"
                                placeholder="Search spools by name, color (e.g. 'yellow'), vendor..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                        <select
                            className="input spoolman-filter-select"
                            value={materialFilter}
                            onChange={e => setMaterialFilter(e.target.value)}
                        >
                            <option value="">All Materials</option>
                            {uniqueMaterials.map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                        <select
                            className="input spoolman-filter-select"
                            value={vendorFilter}
                            onChange={e => setVendorFilter(e.target.value)}
                        >
                            <option value="">All Vendors</option>
                            {uniqueVendors.map(v => (
                                <option key={v} value={v}>{v}</option>
                            ))}
                        </select>
                    </div>

                    {loading ? (
                        <div className="loading">Loading spools…</div>
                    ) : error ? (
                        <div className="error">
                            <p>Failed to load spools: {error}</p>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                                Configure your Spoolman URL in <a href="/settings">Settings</a>.
                            </p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="text-muted" style={{ padding: '20px', textAlign: 'center' }}>
                            {search ? 'No spools match your search' : 'No spools found in Spoolman'}
                        </div>
                    ) : (
                        <div className="spoolman-grid">
                            {filtered.map(spool => {
                                const f = spool.filament || {};
                                const pct = getSpoolPercentage(spool);
                                const color = `#${f.color_hex || '888888'}`;
                                return (
                                    <div
                                        key={spool.id}
                                        className="spoolman-spool-card"
                                        draggable
                                        onDragStart={e => onDragStart(e, spool)}
                                    >
                                        <div className="spool-card-header">
                                            <div className="spool-color-circle" style={{ backgroundColor: color }} />
                                            <div className="spool-card-info">
                                                <span className="spool-card-name">{f.name || `Spool #${spool.id}`}</span>
                                                <span className="spool-card-material">
                                                    {f.material || '—'}
                                                    {f.color_hex && (
                                                        <span className="spool-card-hex">#{f.color_hex.toUpperCase()}</span>
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                        {f.vendor?.name && (
                                            <span className="spool-card-vendor">{f.vendor.name}</span>
                                        )}
                                        <div className="spool-card-weight">
                                            <span>{Math.round(spool.remaining_weight ?? 0)}g / {Math.round(spool.initial_weight ?? 0)}g</span>
                                            <span className="spool-card-pct">{Math.round(pct)}%</span>
                                        </div>
                                        <div className="spool-weight-bar">
                                            <div
                                                className="spool-weight-fill"
                                                style={{ width: `${pct}%`, backgroundColor: color }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Right column: Printer list */}
                <div className="spoolman-printers">
                    <h3 className="spoolman-column-title">Printers</h3>
                    <p className="spoolman-hint">Drag a spool onto a printer to assign it</p>
                    {printers.map(p => {
                        const active = getActiveSpool(p.id);
                        const isTarget = dropTarget === p.id;
                        return (
                            <SpoolmanPrinterCard
                                key={p.id}
                                printer={p}
                                activeSpool={active}
                                isTarget={isTarget}
                                onDragOver={e => onDragOver(e, p.id)}
                                onDragLeave={onDragLeave}
                                onDrop={e => onDrop(e, p)}
                                onClearSpool={() => handleClearSpool(p.id)}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
