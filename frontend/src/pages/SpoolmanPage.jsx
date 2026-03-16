import { useState, useEffect, useCallback } from 'react';
import { usePrinters } from '../hooks/usePrinters';
import { getSpools, setActiveSpool, useFilament, measureFilament, deleteSpool, getAmsSlots, getToolSlots, setToolSlot, getBambuWarnings, dismissBambuWarning, getStorageLocation, patchSpool, fetchTeamsterWeight, tareTeamster } from '../api/spoolman';
import { groupSpoolsByFilament } from '../utils/spoolStorage';
import { useFilamentGuard } from '../hooks/useFilamentGuard';
import SpoolmanPrinterCard from '../components/spoolman/SpoolmanPrinterCard';
import AddSpoolDialog from '../components/spoolman/AddSpoolDialog';
import { useRightPanel } from '../contexts/RightPanelContext';
import ViewToggle from '../components/common/ViewToggle';
import { normalizeFilamentType, isAbrasiveFilament } from '../utils/materialUtils';
import { buildColorStyle, isMultiColor } from '../utils/colorUtils';

// Module-level drag source — lives outside React, no closure staleness possible
let _dragSlotSource = null;

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
    const { selected, setSelected } = useRightPanel() || {};
    const [spools, setSpools] = useState([]);
    const [search, setSearch] = useState('');
    const [viewMode, setViewMode] = useState('grid-small');
    const [statuses, setStatuses] = useState({});
    const [dragSpool, setDragSpool] = useState(null);
    const [dropTarget, setDropTarget] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [materialFilter, setMaterialFilter] = useState([]); // array of selected materials
    const [vendorFilter, setVendorFilter] = useState([]); // array of selected vendors
    const [trackedFilter, setTrackedFilter] = useState(['tracked', 'untracked']); // array: both checked by default
    const [showFilterPopover, setShowFilterPopover] = useState(false);

    // Adjust spool dialog
    const [adjustSpool, setAdjustSpool] = useState(null);
    const [adjustType, setAdjustType] = useState('length');
    const [adjustAmount, setAdjustAmount] = useState('');
    const [adjustBusy, setAdjustBusy] = useState(false);
    const [scaleFetching, setScaleFetching] = useState(false);
    const [scaleError, setScaleError] = useState('');
    const [scaleLive, setScaleLive] = useState(null);   // { weight_g, ready } from polling
    const [tareBusy, setTareBusy] = useState(false);

    const [showAddSpool, setShowAddSpool] = useState(false);
    const [storageLocation, setStorageLocationState] = useState('Storage');
    const [openBusy, setOpenBusy] = useState({});

    // AMS state for Bambu printers
    const [amsSlots, setAmsSlots] = useState({});       // { printerId: { 0: spoolId, 1: spoolId, ... } }
    const [amsSpools, setAmsSpools] = useState({});     // { spoolId: spoolObject } — resolved spool data
    const [dropTargetTray, setDropTargetTray] = useState(null); // { printerId, trayId }

    // Tool slot state for multi-toolhead Moonraker printers
    const [toolSlots, setToolSlots] = useState({});           // { printerId: { 0: spoolId|null, ... } }
    const [toolSlotSpools, setToolSlotSpools] = useState({}); // { spoolId: spoolObject }
    const [dropTargetToolSlot, setDropTargetToolSlot] = useState(null); // { printerId, toolIndex }

    // Extracted shared guard hook for compatibility & 'in use' warnings
    const { startGuard, renderGuardDialog, bambuWarnings, fetchWarningsIfNeeded, pendingAssignment, confirmGuard } = useFilamentGuard({
        onWeighSpool: (spool) => {
            setAdjustSpool(spool);
            setAdjustType('measured');
            setAdjustAmount('');
            setScaleError('');
        },
        onClearBambuWarning: (spoolId) => {
            dismissBambuWarning(spoolId).then(fetchWarningsIfNeeded).catch(() => { });
        },
        onClearAndAssign: (spoolId) => {
            return dismissBambuWarning(spoolId).then(fetchWarningsIfNeeded).catch(() => { });
        },
        onConfirm: async (spool, printer, trayId) => {
            try {
                if (trayId !== undefined) {
                    await setActiveSpool(printer.id, spool.id, trayId);
                    setAmsSlots(prev => ({
                        ...prev,
                        [printer.id]: { ...(prev[printer.id] || {}), [trayId]: spool.id },
                    }));
                    setAmsSpools(prev => ({ ...prev, [spool.id]: spool }));
                } else {
                    await setActiveSpool(printer.id, spool.id);
                    // Optimistic update — printerCache won't reflect the change until next poll
                    setStatuses(prev => ({
                        ...prev,
                        printers: {
                            ...(prev?.printers || {}),
                            [printer.id]: {
                                ...(prev?.printers?.[printer.id] || {}),
                                _active_spool: spool,
                            },
                        },
                    }));
                }
            } catch (err) {
                alert(`Failed to assign spool: ${err.message}`);
            }
        }
    });

    const fetchSpools = useCallback(async () => {
        try {
            const [data, locData] = await Promise.all([
                getSpools(),
                getStorageLocation().catch(() => ({ storage_location: 'Storage' })),
            ]);
            setSpools(data.filter(s => !s.archived));
            setStorageLocationState(locData.storage_location || 'Storage');
            setError(null);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch spools initially and then every 10 seconds
    useEffect(() => {
        fetchSpools();
        const interval = setInterval(fetchSpools, 10000);
        return () => clearInterval(interval);
    }, [fetchSpools]);

    // Fetch bambu warnings once on load
    useEffect(() => { fetchWarningsIfNeeded(); }, [fetchWarningsIfNeeded]);

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

    // Fetch AMS slot mappings for Bambu printers + resolve spool details
    const bambuPrinters = printers.filter(p => p.firmware_type === 'bambu');
    const bambuPrinterIds = bambuPrinters.map(p => p.id).join(',');
    useEffect(() => {
        if (bambuPrinters.length === 0) return;
        const spoolById = new Map(spools.map(s => [s.id, s]));
        async function fetchAms() {
            const results = await Promise.all(
                bambuPrinters.map(async p => {
                    try { return { id: p.id, slots: await getAmsSlots(p.id) }; }
                    catch { return { id: p.id, slots: {} }; }
                })
            );
            const slotMap = {};
            const spoolMap = {};
            for (const { id, slots } of results) {
                slotMap[id] = slots;
                for (const spoolId of Object.values(slots)) {
                    if (spoolId) { const s = spoolById.get(spoolId); if (s) spoolMap[spoolId] = s; }
                }
            }
            setAmsSlots(slotMap);
            setAmsSpools(spoolMap);
        }
        fetchAms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bambuPrinterIds, spools]);

    // Fetch tool slot mappings for multi-toolhead non-Bambu printers
    const multiToolPrinters = printers.filter(p => p.firmware_type !== 'bambu' && (p.toolhead_count || 1) > 1);
    const multiToolPrinterIds = multiToolPrinters.map(p => p.id).join(',');
    useEffect(() => {
        if (multiToolPrinters.length === 0) return;
        const spoolById = new Map(spools.map(s => [s.id, s]));
        async function fetchSlots() {
            const results = await Promise.all(
                multiToolPrinters.map(async p => {
                    try { return { id: p.id, slots: await getToolSlots(p.id) }; }
                    catch { return { id: p.id, slots: {} }; }
                })
            );
            const slotMap = {};
            const spoolMap = {};
            for (const { id, slots } of results) {
                slotMap[id] = slots;
                for (const spoolId of Object.values(slots)) {
                    if (spoolId) { const s = spoolById.get(spoolId); if (s) spoolMap[spoolId] = s; }
                }
            }
            setToolSlots(slotMap);
            setToolSlotSpools(spoolMap);
        }
        fetchSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [multiToolPrinterIds, spools]);



    // Live scale polling — active only while the measured-weight dialog is open
    useEffect(() => {
        if (!adjustSpool || adjustType !== 'measured') {
            setScaleLive(null);
            return;
        }
        let cancelled = false;
        async function poll() {
            try {
                const data = await fetchTeamsterWeight();
                if (!cancelled) setScaleLive(data);
            } catch {
                if (!cancelled) setScaleLive(null);
            }
        }
        poll();
        const id = setInterval(poll, 1500);
        return () => { cancelled = true; clearInterval(id); };
    }, [adjustSpool, adjustType]);

    const uniqueMaterials = Array.from(new Set(
        spools.map(s => normalizeFilamentType(s.filament?.material)).filter(Boolean)
    )).sort();
    const uniqueVendors = Array.from(new Set(spools.map(s => s.filament?.vendor?.name).filter(Boolean))).sort();

    const storageLoc = storageLocation.toLowerCase();
    // Storage spools are hidden from the main grid and shown separately below
    const activeSpools = spools.filter(s =>
        !(typeof s.location === 'string' && s.location.toLowerCase() === storageLoc)
    );
    const storageGroups = groupSpoolsByFilament(spools, storageLocation);

    const filtered = activeSpools.filter(s => {
        const f = s.filament || {};
        // If materials are selected, spool's material must be in the selected list
        if (materialFilter.length > 0 && !materialFilter.includes(normalizeFilamentType(f.material))) return false;
        // If vendors are selected, spool's vendor must be in the selected list
        if (vendorFilter.length > 0 && !vendorFilter.includes(f.vendor?.name)) return false;

        // Tracked filter: check if spool is in bambuWarnings (untracked/marked)
        const isMarked = bambuWarnings.some(w => w.spool_id === s.id);
        const showTracked = trackedFilter.includes('tracked');
        const showUntracked = trackedFilter.includes('untracked');
        if (!showTracked && !showUntracked) return false; // neither selected, hide all
        if (isMarked && !showUntracked) return false; // marked (untracked) but not selected
        if (!isMarked && !showTracked) return false; // not marked (tracked) but not selected

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
        _dragSlotSource = null; // dragging from inventory, not a slot
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', spool.id.toString());
    }

    // mousedown fires before dragstart — guarantees _dragSlotSource is set even if dragstart handler is skipped
    function onToolSlotMouseDown(printerId, toolIndex, spool) {
        _dragSlotSource = { printerId, toolIndex, spoolId: spool.id };
    }

    function onToolSlotDragStart(e, printerId, toolIndex, spool) {
        setDragSpool(spool);
        _dragSlotSource = { printerId, toolIndex, spoolId: spool.id };
        e.dataTransfer.effectAllowed = 'move';
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

        // Use global guard to handle all warnings and assignments
        startGuard(spool, printer.id);
    }

    // Bambu AMS tray drag-drop handlers
    function onTrayDragOver(e, printerId, trayId) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setDropTargetTray({ printerId, trayId });
    }

    function onTrayDragLeave() {
        setDropTargetTray(null);
    }

    async function onTrayDrop(e, printer, trayId) {
        e.preventDefault();
        setDropTargetTray(null);
        const spool = dragSpool;
        setDragSpool(null);
        if (!spool) return;

        // Use global guard for tray assignments too
        startGuard(spool, printer.id, trayId);
    }

    async function handleClearTray(printerId, trayId) {
        try {
            await setActiveSpool(printerId, null, trayId);
            setAmsSlots(prev => {
                const slots = { ...(prev[printerId] || {}) };
                delete slots[trayId];
                return { ...prev, [printerId]: slots };
            });
        } catch (err) {
            alert(`Failed to clear AMS tray: ${err.message}`);
        }
    }

    // Multi-toolhead tool slot drag-drop handlers
    function onToolSlotDragOver(e, printerId, toolIndex) {
        e.preventDefault();
        // Accept both 'move' (slot-to-slot) and 'copy' (inventory) drags
        e.dataTransfer.dropEffect = e.dataTransfer.effectAllowed === 'move' ? 'move' : 'copy';
        setDropTargetToolSlot({ printerId, toolIndex });
    }

    function onToolSlotDragLeave() {
        setDropTargetToolSlot(null);
    }

    async function onToolSlotDrop(e, printer, toolIndex) {
        e.preventDefault();
        setDropTargetToolSlot(null);

        const sourceSlot = _dragSlotSource;
        _dragSlotSource = null;

        // Prefer spoolId from dataTransfer; fall back to mousedown-recorded source
        let spoolId = parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (!spoolId && sourceSlot) spoolId = sourceSlot.spoolId;
        if (!spoolId) return;

        // Slot-to-slot: came from a recorded slot source on this printer
        if (sourceSlot && Number(sourceSlot.printerId) === Number(printer.id) && sourceSlot.toolIndex !== toolIndex) {
            const printerSlots = toolSlots[printer.id] || {};
            const displacedSpoolId = printerSlots[toolIndex] ?? null;
            try {
                await setToolSlot(printer.id, toolIndex, spoolId);
                await setToolSlot(printer.id, sourceSlot.toolIndex, displacedSpoolId);
                setToolSlots(prev => ({
                    ...prev,
                    [printer.id]: {
                        ...(prev[printer.id] || {}),
                        [toolIndex]: spoolId,
                        [sourceSlot.toolIndex]: displacedSpoolId,
                    },
                }));
            } catch (err) {
                alert(`Failed to move spool: ${err.message}`);
            }
            setDragSpool(null);
            return;
        }

        // Dragging from inventory — regular assign
        const spool = dragSpool || spools.find(s => s.id === spoolId) || toolSlotSpools[spoolId];
        setDragSpool(null);
        if (!spool) return;
        try {
            await setToolSlot(printer.id, toolIndex, spool.id);
            setToolSlots(prev => ({
                ...prev,
                [printer.id]: { ...(prev[printer.id] || {}), [toolIndex]: spool.id },
            }));
            setToolSlotSpools(prev => ({ ...prev, [spool.id]: spool }));
        } catch (err) {
            alert(`Failed to assign spool: ${err.message}`);
        }
    }

    async function handleClearToolSlot(printerId, toolIndex) {
        try {
            await setToolSlot(printerId, toolIndex, null);
            setToolSlots(prev => ({
                ...prev,
                [printerId]: { ...(prev[printerId] || {}), [toolIndex]: null },
            }));
        } catch (err) {
            alert(`Failed to clear tool slot: ${err.message}`);
        }
    }

    async function handleClearSpool(printerId) {
        try {
            await setActiveSpool(printerId, null);
            setStatuses(prev => ({
                ...prev,
                printers: {
                    ...(prev?.printers || {}),
                    [printerId]: {
                        ...(prev?.printers?.[printerId] || {}),
                        _active_spool: null,
                    },
                },
            }));
        } catch (err) {
            alert(`Failed to clear spool: ${err.message}`);
        }
    }



    async function handleDeleteSpool(spool) {
        const f = spool.filament || {};
        const name = f.name || `Spool #${spool.id}`;
        if (!confirm(`Delete spool "${name}"? This cannot be undone.`)) return;
        try {
            await deleteSpool(spool.id);
            await fetchSpools();
        } catch (err) {
            alert(`Failed to delete spool: ${err.message}`);
        }
    }

    async function handleFetchFromScale() {
        setScaleFetching(true);
        setScaleError('');
        try {
            const data = await fetchTeamsterWeight();
            if (!data.ready) {
                setScaleError('Scale not ready — check device');
            } else {
                setAdjustAmount(String(Math.round(data.weight_g * 10) / 10));
            }
        } catch (e) {
            setScaleError(e.message);
        } finally {
            setScaleFetching(false);
        }
    }

    async function handleTare() {
        setTareBusy(true);
        try {
            await tareTeamster();
        } catch (e) {
            setScaleError(e.message);
        } finally {
            setTareBusy(false);
        }
    }

    async function handleAdjustSubmit() {
        if (!adjustAmount || !adjustSpool) return;
        setAdjustBusy(true);
        try {
            await measureFilament(adjustSpool.id, parseFloat(adjustAmount), adjustType);
            await fetchSpools();

            // Auto-clear bambu warning if we just weighed it
            dismissBambuWarning(adjustSpool.id).then(fetchWarningsIfNeeded).catch(() => { });

            // If a guard dialog was waiting (user clicked "Weigh Spool"), proceed with assignment now
            if (pendingAssignment && pendingAssignment.spool.id === adjustSpool.id) {
                setTimeout(confirmGuard, 100);
            }

            setAdjustSpool(null);
            setAdjustAmount('');
        } catch (err) {
            alert(err.message);
        } finally {
            setAdjustBusy(false);
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

    async function handleOpenStorageSpool(group) {
        const spool = group.storageSpools[0];
        if (!spool) return;
        setOpenBusy(b => ({ ...b, [spool.id]: true }));
        try {
            await patchSpool(spool.id, { location: null });
            await fetchSpools();
        } catch (e) {
            alert(e.message);
        } finally {
            setOpenBusy(b => ({ ...b, [spool.id]: false }));
        }
    }

    return (
        <div className="page spoolman-page">
            <div className="spoolman-layout">
                {/* Center: Spool inventory */}
                <div className="spoolman-inventory">
                    <div className="spoolman-filters-bar" style={{ position: 'relative' }}>
                        <div className="spoolman-search-wrap" style={{ position: 'relative' }}>
                            <span className="spoolman-search-icon">🔍</span>
                            <input
                                type="text"
                                className="input spoolman-search-input"
                                placeholder="Search spools by name, color (e.g. 'yellow'), vendor..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                            <button
                                className="btn btn-sm"
                                onClick={() => setShowFilterPopover(!showFilterPopover)}
                                style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', padding: '6px 10px', fontSize: '13px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
                                title="Filter spools"
                            >
                                ⚙
                            </button>
                        </div>

                        {showFilterPopover && (
                            <div
                                style={{
                                    position: 'absolute',
                                    top: '100%',
                                    right: 0,
                                    marginTop: '8px',
                                    background: 'var(--surface)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '8px',
                                    padding: '12px',
                                    zIndex: 1000,
                                    minWidth: '240px',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                                }}
                                onClick={e => e.stopPropagation()}
                            >
                                <div style={{ marginBottom: '12px' }}>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-muted)' }}>Material</label>
                                    <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '4px', padding: '6px' }}>
                                        {uniqueMaterials.map(m => (
                                            <label key={m} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', cursor: 'pointer', fontSize: '13px' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={materialFilter.includes(m)}
                                                    onChange={e => {
                                                        if (e.target.checked) {
                                                            setMaterialFilter([...materialFilter, m]);
                                                        } else {
                                                            setMaterialFilter(materialFilter.filter(x => x !== m));
                                                        }
                                                    }}
                                                    style={{
                                                        appearance: 'none',
                                                        WebkitAppearance: 'none',
                                                        width: '16px',
                                                        height: '16px',
                                                        border: '2px solid var(--border)',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer',
                                                        backgroundColor: 'var(--surface)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        flexShrink: 0,
                                                        accentColor: 'var(--primary, #0ea5e9)'
                                                    }}
                                                />
                                                {m}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <div style={{ marginBottom: '12px' }}>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-muted)' }}>Vendor</label>
                                    <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '4px', padding: '6px' }}>
                                        {uniqueVendors.map(v => (
                                            <label key={v} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', cursor: 'pointer', fontSize: '13px' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={vendorFilter.includes(v)}
                                                    onChange={e => {
                                                        if (e.target.checked) {
                                                            setVendorFilter([...vendorFilter, v]);
                                                        } else {
                                                            setVendorFilter(vendorFilter.filter(x => x !== v));
                                                        }
                                                    }}
                                                    style={{
                                                        appearance: 'none',
                                                        WebkitAppearance: 'none',
                                                        width: '16px',
                                                        height: '16px',
                                                        border: '2px solid var(--border)',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer',
                                                        backgroundColor: 'var(--surface)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        flexShrink: 0,
                                                        accentColor: 'var(--primary, #0ea5e9)'
                                                    }}
                                                />
                                                {v}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <div style={{ marginBottom: '12px' }}>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-muted)' }}>Status</label>
                                    <div style={{ border: '1px solid var(--border)', borderRadius: '4px', padding: '6px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', cursor: 'pointer', fontSize: '13px' }}>
                                            <input
                                                type="checkbox"
                                                checked={trackedFilter.includes('tracked')}
                                                onChange={e => {
                                                    if (e.target.checked) {
                                                        setTrackedFilter([...trackedFilter, 'tracked']);
                                                    } else {
                                                        setTrackedFilter(trackedFilter.filter(x => x !== 'tracked'));
                                                    }
                                                }}
                                                style={{
                                                    appearance: 'none',
                                                    WebkitAppearance: 'none',
                                                    width: '16px',
                                                    height: '16px',
                                                    border: '2px solid var(--border)',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer',
                                                    backgroundColor: 'var(--surface)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    flexShrink: 0,
                                                    accentColor: 'var(--primary, #0ea5e9)'
                                                }}
                                            />
                                            Tracked
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', cursor: 'pointer', fontSize: '13px' }}>
                                            <input
                                                type="checkbox"
                                                checked={trackedFilter.includes('untracked')}
                                                onChange={e => {
                                                    if (e.target.checked) {
                                                        setTrackedFilter([...trackedFilter, 'untracked']);
                                                    } else {
                                                        setTrackedFilter(trackedFilter.filter(x => x !== 'untracked'));
                                                    }
                                                }}
                                                style={{
                                                    appearance: 'none',
                                                    WebkitAppearance: 'none',
                                                    width: '16px',
                                                    height: '16px',
                                                    border: '2px solid var(--border)',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer',
                                                    backgroundColor: 'var(--surface)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    flexShrink: 0,
                                                    accentColor: 'var(--primary, #0ea5e9)'
                                                }}
                                            />
                                            Untracked 📦
                                        </label>
                                    </div>
                                </div>
                                <button
                                    className="btn btn-sm"
                                    onClick={() => {
                                        setMaterialFilter([]);
                                        setVendorFilter([]);
                                        setTrackedFilter(['tracked', 'untracked']);
                                        setShowFilterPopover(false);
                                    }}
                                    style={{ width: '100%', fontSize: '12px' }}
                                >
                                    Clear Filters
                                </button>
                            </div>
                        )}

                        <div className="spoolman-add-btns" style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
                            <ViewToggle viewMode={viewMode} onChange={setViewMode} />
                            <button className="btn spoolman-add-btn" onClick={() => setShowAddSpool(true)} title="Add new spool" style={{ height: '40px', display: 'flex', alignItems: 'center' }}>+ Spool</button>
                        </div>
                    </div>

                    {showFilterPopover && (
                        <div
                            style={{
                                position: 'fixed',
                                inset: 0,
                                zIndex: 999,
                            }}
                            onClick={() => setShowFilterPopover(false)}
                        />
                    )}

                    <div className="spoolman-spool-list">
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
                        viewMode === 'list' ? (
                            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '16px' }}>
                                <thead>
                                    <tr>
                                        <th style={{ textAlign: 'left', padding: '10px 14px', borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.05em' }}>ID</th>
                                        <th style={{ textAlign: 'left', padding: '10px 14px', borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.05em' }}>Name</th>
                                        <th style={{ textAlign: 'left', padding: '10px 14px', borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.05em' }}>Material</th>
                                        <th style={{ textAlign: 'left', padding: '10px 14px', borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.05em' }}>Vendor</th>
                                        <th style={{ textAlign: 'left', padding: '10px 14px', borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.05em' }}>Weight</th>
                                        <th style={{ textAlign: 'left', padding: '10px 14px', borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.05em' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map(spool => {
                                        const f = spool.filament || {};
                                        const pct = getSpoolPercentage(spool);
                                        const color = `#${f.color_hex || '888888'}`;
                                        const isSelected = selected?.data?.id === spool.id;
                                        return (
                                            <tr
                                                key={spool.id}
                                                style={{ cursor: 'pointer', backgroundColor: isSelected ? 'var(--surface2)' : 'transparent' }}
                                                onClick={() => setSelected?.({ data: spool })}
                                                draggable
                                                onDragStart={e => onDragStart(e, spool)}
                                                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--surface2)'; }}
                                                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
                                            >
                                                <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <div className="spool-color-circle" style={{ ...buildColorStyle(f), width: '12px', height: '12px' }} />
                                                        {bambuWarnings?.some(w => w.spool_id === spool.id) && <span title="Bambu Warning">📦</span>}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontWeight: '500' }}>{f.name || `Spool #${spool.id}`}</td>
                                                <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                                                    {f.material || '—'} {f.multi_color_hexes
                                                        ? <span style={{ fontSize: '11px', opacity: 0.7 }}>({f.multi_color_hexes.split(',').length} colors, {f.multi_color_direction === 'coaxial' ? 'coaxial' : 'longitudinal'})</span>
                                                        : f.color_hex && <span style={{ fontSize: '11px', opacity: 0.7 }}>(#{f.color_hex.toUpperCase()})</span>
                                                    }
                                                </td>
                                                <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>{f.vendor?.name || '—'}</td>
                                                <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                                                    {Math.round(spool.remaining_weight ?? 0)}g / {Math.round(spool.initial_weight ?? 0)}g ({Math.round(pct)}%)
                                                </td>
                                                <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>
                                                    <div className="file-actions">
                                                        <button className="spool-list-icon-btn" onClick={e => { e.stopPropagation(); setAdjustSpool(spool); setAdjustType('length'); setAdjustAmount(''); setScaleError(''); }} title="Adjust">⚙</button>
                                                        <button className="spool-list-icon-btn" onClick={e => { e.stopPropagation(); handleDeleteSpool(spool); }} title="Delete">🗑</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        ) : (
                            <div className={`spoolman-grid ${viewMode === 'grid-large' ? 'large' : 'small'}`} style={{
                                display: 'grid',
                                gap: '16px',
                                gridTemplateColumns: viewMode === 'grid-large' ? 'repeat(auto-fill, minmax(320px, 1fr))' : 'repeat(auto-fill, minmax(220px, 1fr))',
                                marginTop: '16px'
                            }}>
                                {filtered.map(spool => {
                                    const f = spool.filament || {};
                                    const pct = getSpoolPercentage(spool);
                                    const color = `#${f.color_hex || '888888'}`;
                                    return (
                                        <div
                                            key={spool.id}
                                            className={`spoolman-spool-card${selected?.data?.id === spool.id ? ' spool-card-selected' : ''}`}
                                            draggable
                                            onDragStart={e => onDragStart(e, spool)}
                                            onClick={() => setSelected?.({ data: spool })}
                                            style={{ backgroundColor: 'var(--surface)' }}
                                        >
                                            <div className="spool-card-header">
                                                <div className="spool-color-circle" style={buildColorStyle(f)} />
                                                <div className="spool-card-info">
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span className="spool-card-name">{f.name || `Spool #${spool.id}`}</span>
                                                        {bambuWarnings?.some(w => w.spool_id === spool.id) && (
                                                            <div
                                                                className="spool-card-bambu-mark"
                                                                title="Used on Bambu recently. Needs checking/measuring. Click to dismiss."
                                                                onClick={e => {
                                                                    e.stopPropagation();
                                                                    dismissBambuWarning(spool.id).then(fetchWarningsIfNeeded).catch(() => { });
                                                                }}
                                                            >
                                                                📦
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span className="spool-card-material">
                                                        {f.material || '—'}
                                                        {isAbrasiveFilament(f.material) && (
                                                            <span className="spool-card-abrasive-badge" title="Abrasive filler — requires hardened nozzle">⬡ HN</span>
                                                        )}
                                                        {f.multi_color_hexes
                                                            ? <span className="spool-card-hex">{f.multi_color_hexes.split(',').length} colors · {f.multi_color_direction === 'coaxial' ? 'coaxial' : 'longitudinal'}</span>
                                                            : f.color_hex && <span className="spool-card-hex">#{f.color_hex.slice(0,6).toUpperCase()}</span>
                                                        }
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
                                            <button
                                                className="spool-adjust-btn"
                                                onClick={e => { e.stopPropagation(); setAdjustSpool(spool); setAdjustType('length'); setAdjustAmount(''); setScaleError(''); }}
                                                title="Adjust filament amount"
                                            >⚙</button>
                                            <button
                                                className="spool-delete-btn"
                                                onClick={e => { e.stopPropagation(); handleDeleteSpool(spool); }}
                                                title="Delete spool"
                                            >
                                                🗑
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )
                    )}
                    {/* Storage spools — one card per filament type, no weight tracking */}
                    {storageGroups.some(g => g.storageSpools.length > 0) && (
                        <div style={{ marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)', marginBottom: '12px' }}>
                                In Storage — {storageGroups.reduce((n, g) => n + g.storageSpools.length, 0)} sealed spool{storageGroups.reduce((n, g) => n + g.storageSpools.length, 0) !== 1 ? 's' : ''}
                            </div>
                            <div className={`spoolman-grid ${viewMode === 'grid-large' ? 'large' : 'small'}`} style={{
                                display: 'grid',
                                gap: '16px',
                                gridTemplateColumns: viewMode === 'list' ? '1fr' : viewMode === 'grid-large' ? 'repeat(auto-fill, minmax(320px, 1fr))' : 'repeat(auto-fill, minmax(220px, 1fr))',
                            }}>
                                {storageGroups.filter(g => g.storageSpools.length > 0).map(group => {
                                    const f = group.filament || {};
                                    const color = `#${f.color_hex || '888888'}`;
                                    const top = group.storageSpools[0];
                                    const isOpening = top && openBusy[top.id];
                                    return (
                                        <div
                                            key={f.id}
                                            className="spoolman-spool-card spool-card-storage"
                                            style={{ backgroundColor: 'var(--surface)' }}
                                        >
                                            <div className="spool-card-header">
                                                <div className="spool-color-circle" style={buildColorStyle(f)} />
                                                <div className="spool-card-info">
                                                    <span className="spool-card-name">{f.name || `Filament #${f.id}`}</span>
                                                    <span className="spool-card-material">
                                                        {f.material || '—'}
                                                        {isAbrasiveFilament(f.material) && (
                                                            <span className="spool-card-abrasive-badge" title="Abrasive filler — requires hardened nozzle">⬡ HN</span>
                                                        )}
                                                        {f.multi_color_hexes
                                                            ? <span className="spool-card-hex">{f.multi_color_hexes.split(',').length} colors · {f.multi_color_direction === 'coaxial' ? 'coaxial' : 'longitudinal'}</span>
                                                            : f.color_hex && <span className="spool-card-hex">#{f.color_hex.slice(0,6).toUpperCase()}</span>
                                                        }
                                                    </span>
                                                </div>
                                            </div>
                                            {f.vendor?.name && <span className="spool-card-vendor">{f.vendor.name}</span>}
                                            <div className="spool-card-storage-label">
                                                📦 {group.storageSpools.length} sealed in storage
                                            </div>
                                            <button
                                                className="btn btn-primary spool-card-open-btn"
                                                disabled={isOpening}
                                                onClick={() => handleOpenStorageSpool(group)}
                                                title={`Open spool #${top?.id} (oldest first)`}
                                            >
                                                {isOpening ? '…' : 'Open spool from storage'}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    </div>
                </div>

                {/* Right column: Printer list */}
                <div className="spoolman-printers">
                    <h3 className="spoolman-column-title">Printers</h3>
                    <p className="spoolman-hint">Drag a spool onto a printer to assign it</p>
                    {printers.map(p => {
                        const active = getActiveSpool(p.id);
                        const isTarget = dropTarget === p.id;
                        const pStatus = statuses?.printers?.[p.id] || p.status || {};
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
                                printerStatus={pStatus}
                                // Bambu AMS props
                                amsSlots={amsSlots[p.id] || {}}
                                amsSpools={amsSpools}
                                dropTargetTray={dropTargetTray}
                                onTrayDragOver={onTrayDragOver}
                                onTrayDragLeave={onTrayDragLeave}
                                onTrayDrop={onTrayDrop}
                                onClearTray={handleClearTray}
                                toolSlots={toolSlots[p.id] || {}}
                                toolSlotSpools={toolSlotSpools}
                                dropTargetToolSlot={dropTargetToolSlot}
                                onToolSlotMouseDown={onToolSlotMouseDown}
                                onToolSlotDragStart={onToolSlotDragStart}
                                onToolSlotDragOver={onToolSlotDragOver}
                                onToolSlotDragLeave={onToolSlotDragLeave}
                                onToolSlotDrop={onToolSlotDrop}
                                onClearToolSlot={handleClearToolSlot}
                            />
                        );
                    })}
                </div>
            </div>

            {/* ── Adjust Spool Dialog ─────────────────────────────── */}
            {adjustSpool && (
                <div className="spool-dialog-overlay" onClick={() => setAdjustSpool(null)}>
                    <div className="spool-dialog" onClick={e => e.stopPropagation()}>
                        <div className="spool-dialog-header">
                            <h3 className="spool-dialog-title">Adjust Spool Filament</h3>
                            <button className="spool-dialog-close" onClick={() => setAdjustSpool(null)}>✕</button>
                        </div>
                        <p className="spool-dialog-desc">
                            Directly add or subtract filament from the spool. A positive value consumes filament, a negative value adds it.
                        </p>
                        <div className="spool-dialog-field">
                            <label className="spool-dialog-label">Measurement Type</label>
                            <div className="spool-type-tabs">
                                {[['length', 'Length'], ['weight', 'Weight'], ['measured', 'Measured Weight']].map(([val, label]) => (
                                    <button
                                        key={val}
                                        className={`spool-type-tab${adjustType === val ? ' active' : ''}`}
                                        onClick={() => { setAdjustType(val); setAdjustAmount(''); setScaleError(''); }}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="spool-dialog-field">
                            <label className="spool-dialog-label">
                                {adjustType === 'measured' ? 'Current Spool Weight (on scale)' : 'Consume Amount'}
                            </label>
                            <div className="spool-dialog-input-row">
                                <input
                                    className="spool-dialog-input"
                                    type="number"
                                    step="any"
                                    placeholder={adjustType === 'measured' ? 'gross weight' : adjustType === 'length' ? 'e.g. 500' : 'e.g. 5.3'}
                                    value={adjustAmount}
                                    onChange={e => setAdjustAmount(e.target.value)}
                                    autoFocus
                                    onKeyDown={e => e.key === 'Enter' && handleAdjustSubmit()}
                                />
                                <span className="spool-dialog-unit">{adjustType === 'length' ? 'mm' : 'g'}</span>
                            </div>
                            {adjustType === 'measured' && (
                                <>
                                    {/* Live readout */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', padding: '8px 12px', background: 'var(--surface2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                                        <span style={{ fontSize: '13px', color: 'var(--text-muted)', flexShrink: 0 }}>Scale:</span>
                                        <span style={{ fontSize: '18px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: scaleLive?.ready ? (scaleLive.stable ? 'var(--text)' : '#f59e0b') : 'var(--text-muted)', minWidth: '70px' }}>
                                            {scaleLive ? (scaleLive.ready ? `${scaleLive.weight_g.toFixed(1)} g` : 'Not ready') : '—'}
                                        </span>
                                        {scaleLive?.ready && !scaleLive?.stable && (
                                            <span style={{ fontSize: '11px', color: '#f59e0b' }}>stabilising…</span>
                                        )}
                                        <button
                                            className="btn btn-sm"
                                            style={{ marginLeft: 'auto' }}
                                            onClick={() => scaleLive?.ready && setAdjustAmount(String(Math.round(scaleLive.weight_g * 10) / 10))}
                                            disabled={!scaleLive?.ready || !scaleLive?.stable || adjustBusy}
                                        >
                                            Use
                                        </button>
                                        <button
                                            className="btn btn-sm"
                                            onClick={handleTare}
                                            disabled={tareBusy || adjustBusy}
                                        >
                                            {tareBusy ? 'Taring…' : 'Tare'}
                                        </button>
                                    </div>
                                    {scaleError && <span style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '4px', display: 'block' }}>{scaleError}</span>}
                                    <p className="spool-dialog-hint">Place the spool on the scale, then click Use to copy the reading, or type the weight manually.</p>
                                </>
                            )}
                        </div>
                        <div className="spool-dialog-actions">
                            <button className="btn v-btn" onClick={() => setAdjustSpool(null)} disabled={adjustBusy}>Cancel</button>
                            <button
                                className="btn btn-primary v-btn"
                                onClick={handleAdjustSubmit}
                                disabled={adjustBusy || adjustAmount === ''}
                            >
                                {adjustBusy ? 'Saving…' : 'OK'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {renderGuardDialog()}

            {showAddSpool && (
                <AddSpoolDialog
                    onClose={() => setShowAddSpool(false)}
                    onCreated={() => { setShowAddSpool(false); fetchSpools(); }}
                />
            )}
        </div>
    );
}
