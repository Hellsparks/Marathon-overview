import { useState, useCallback } from 'react';
import { usePrinters } from './usePrinters';
import { useStatus } from './useStatus';
import { getBambuWarnings } from '../api/spoolman';
import { normalizeFilamentType } from '../utils/materialUtils';

/**
 * Global hook to check if it's safe to assign a spool to a printer.
 * Returns { startGuard, renderGuardDialog, checkSpoolCompatibility, bambuWarnings, fetchWarningsIfNeeded, confirmGuard, cancelGuard }.
 */
export function useFilamentGuard({ onConfirm, onWeighSpool, onClearBambuWarning, onClearAndAssign }) {
    const { printers } = usePrinters();
    const { status: statuses } = useStatus();
    const [pendingAssignment, setPendingAssignment] = useState(null);
    const [bambuWarnings, setBambuWarnings] = useState([]);
    const [hasFetchedWarnings, setHasFetchedWarnings] = useState(false);

    // Fetch Bambu warnings once if needed
    const fetchWarningsIfNeeded = async () => {
        if (!hasFetchedWarnings) {
            try {
                const warnings = await getBambuWarnings();
                setBambuWarnings(warnings);
                setHasFetchedWarnings(true);
            } catch (err) {
                console.error("Failed to fetch Bambu warnings for guard:", err);
            }
        }
    };

    const checkSpoolCompatibility = useCallback(async (spool, printerId) => {
        await fetchWarningsIfNeeded();

        const printer = printers.find(p => p.id === printerId || p.id === parseInt(printerId));
        if (!spool || !printer) return { safe: true, warnings: [] };

        const warnings = [];

        // 1. Check material compatibility
        const rawMaterial = spool.filament?.material || '';
        const material = normalizeFilamentType(rawMaterial);
        let supported = [];
        if (Array.isArray(printer.filament_types)) {
            supported = printer.filament_types;
        } else if (typeof printer.filament_types === 'string') {
            try { supported = JSON.parse(printer.filament_types || '[]'); } catch { }
        }

        const supportedNormalized = supported.map(s => normalizeFilamentType(s));
        if (material && supportedNormalized.length > 0 && !supportedNormalized.includes(material)) {
            warnings.push({
                type: 'incompatible',
                message: `${printer.name} does not list "${rawMaterial}" as supported. Supported: ${supported.join(', ')}`
            });
        }

        // 2. Check if the printer is currently printing (and stealing an active spool)
        // This is a bit complex: if the spool is actively assigned to *another* printer that is currently printing.
        // For now, let's just check if the TARGET printer is printing to warn them about changing spool mid-print.
        const printerStatus = statuses?.printers?.[printer.id];
        const isPrinting = printerStatus?.print_stats?.state === 'printing';
        if (isPrinting) {
            warnings.push({
                type: 'printing',
                message: `${printer.name} is currently printing! Changing the active spool mid-print may affect your filament tracking.`
            });
        }

        // 2b. Check if the spool *itself* is already in use by another actively printing printer.
        const printerStatuses = statuses?.printers || {};
        for (const pid in printerStatuses) {
            if (parseInt(pid) === printer.id) continue;
            const pStatus = printerStatuses[pid];
            if (pStatus?._active_spool?.id === spool.id && pStatus?.print_stats?.state === 'printing') {
                const otherPrinter = printers.find(p => p.id === parseInt(pid));
                warnings.push({
                    type: 'in_use',
                    message: `This spool is currently in use by ${otherPrinter?.name || `Printer #${pid}`} which is actively printing!`
                });
            }
        }

        // 3. Check Bambu untracked usage
        const bambuEntry = bambuWarnings.find(w => w.spool_id === spool.id);
        if (bambuEntry && printer.firmware_type !== 'bambu') {
            warnings.push({
                type: 'bambu_used',
                message: `This spool was last used on "${bambuEntry.printer_name}" (untracked). Check remaining filament before continuing.`
            });
        }

        return {
            safe: warnings.length === 0,
            warnings
        };

    }, [printers, statuses, bambuWarnings, hasFetchedWarnings]);

    const startGuard = async (spool, printerId, trayId = undefined, extraContext = {}) => {
        const result = await checkSpoolCompatibility(spool, printerId);
        const printer = printers.find(p => p.id === printerId || p.id === parseInt(printerId));

        if (result.safe) {
            // Safe to proceed
            onConfirm(spool, printer, trayId, extraContext);
        } else {
            // Needs confirmation
            setPendingAssignment({
                spool,
                printer,
                trayId,
                extraContext,
                warnings: result.warnings,
                busy: false,
                acknowledgeAck: false // user must check a box if 'printing' or 'in_use' warnings are present
            });
        }
    };

    const confirmGuard = async () => {
        if (!pendingAssignment) return;
        setPendingAssignment(prev => ({ ...prev, busy: true }));
        try {
            await onConfirm(
                pendingAssignment.spool,
                pendingAssignment.printer,
                pendingAssignment.trayId,
                pendingAssignment.extraContext
            );
        } finally {
            setPendingAssignment(null);
        }
    };

    const cancelGuard = () => {
        setPendingAssignment(null);
    };

    const renderGuardDialog = () => {
        if (!pendingAssignment) return null;

        const hasCriticalWarning = pendingAssignment.warnings.some(w => w.type === 'printing' || w.type === 'in_use');

        const hasBambuWarning = pendingAssignment.warnings.some(w => w.type === 'bambu_used');

        return (
            <div className="spool-dialog-overlay" onClick={cancelGuard} style={{ zIndex: 9999 }}>
                <div className="spool-dialog pending-drop-dialog" onClick={e => e.stopPropagation()}>
                    <div className="spool-dialog-header">
                        <h3 className="spool-dialog-title">⚠️ Assignment Warning</h3>
                        <button className="spool-dialog-close" onClick={cancelGuard}>✕</button>
                    </div>
                    <div className="pending-drop-spool-info">
                        <span
                            className="spool-color-dot"
                            style={{ '--spool-color': `#${pendingAssignment.spool.filament?.color_hex || '888'}` }}
                        />
                        <span>
                            <strong>{pendingAssignment.spool.filament?.name || `Spool #${pendingAssignment.spool.id}`}</strong>
                            {' → '}
                            <strong>{pendingAssignment.printer?.name || 'Unknown Printer'}</strong>
                            {pendingAssignment.trayId !== undefined && ` (Slot ${pendingAssignment.trayId + 1})`}
                        </span>
                    </div>
                    <div className="pending-drop-warnings">
                        {pendingAssignment.warnings.map((w, i) => (
                            <div key={i} className={`pending-drop-warning pending-drop-warning--${w.type}`}>
                                {w.type === 'incompatible' && <span className="pending-drop-icon">🚫</span>}
                                {w.type === 'bambu_used' && <span className="pending-drop-icon">📦</span>}
                                {(w.type === 'printing' || w.type === 'in_use') && <span className="pending-drop-icon" style={{ animation: 'pulse 1s infinite' }}>🔥</span>}
                                <span>{w.message}</span>
                            </div>
                        ))}
                    </div>

                    {hasCriticalWarning && (
                        <label className="checkbox-label" style={{ marginTop: '12px', background: 'var(--surface2)', padding: '10px', borderRadius: '6px', border: '1px solid var(--danger)' }}>
                            <input
                                type="checkbox"
                                checked={pendingAssignment.acknowledgeAck}
                                onChange={e => setPendingAssignment(prev => ({ ...prev, acknowledgeAck: e.target.checked }))}
                            />
                            I understand this spool/printer is currently active and I want to assign it anyway.
                        </label>
                    )}

                    <div className="spool-dialog-actions" style={{ marginTop: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button className="btn v-btn" onClick={cancelGuard} disabled={pendingAssignment.busy}>Cancel</button>
                        {hasBambuWarning && onWeighSpool && (
                            <button
                                className="btn v-btn"
                                style={{ background: 'var(--surface2)', color: 'var(--text)' }}
                                onClick={() => {
                                    onWeighSpool(pendingAssignment.spool);
                                    cancelGuard();
                                }}
                                disabled={pendingAssignment.busy}
                            >
                                ⚖️ Weigh Spool
                            </button>
                        )}
                        {hasBambuWarning && (onClearBambuWarning || onClearAndAssign) && (
                            <button
                                className="btn v-btn"
                                style={{ background: 'var(--surface2)', color: 'var(--text)' }}
                                onClick={async () => {
                                    try {
                                        if (onClearAndAssign) {
                                            // Clear warning and proceed with assignment
                                            await onClearAndAssign(pendingAssignment.spool.id);
                                            setPendingAssignment(prev => ({ ...prev, busy: true }));
                                            await onConfirm(
                                                pendingAssignment.spool,
                                                pendingAssignment.printer,
                                                pendingAssignment.trayId,
                                                pendingAssignment.extraContext
                                            );
                                        } else if (onClearBambuWarning) {
                                            // Just clear and close
                                            onClearBambuWarning(pendingAssignment.spool.id);
                                        }
                                    } finally {
                                        cancelGuard();
                                    }
                                }}
                                disabled={pendingAssignment.busy}
                                title="Mark as unused, clear the warning, and assign the spool"
                            >
                                ✨ Unused & Assign
                            </button>
                        )}
                        <button
                            className="btn pending-drop-assign-btn v-btn"
                            style={{ marginLeft: 'auto' }}
                            onClick={confirmGuard}
                            disabled={pendingAssignment.busy || (hasCriticalWarning && !pendingAssignment.acknowledgeAck)}
                        >
                            {pendingAssignment.busy ? 'Assigning…' : 'Assign Anyway'}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return {
        startGuard,
        renderGuardDialog,
        checkSpoolCompatibility,
        pendingAssignment,
        confirmGuard, // expose so parent can confirm after external actions (e.g., weigh spool)
        cancelGuard,
        bambuWarnings,
        fetchWarningsIfNeeded
    };
}
