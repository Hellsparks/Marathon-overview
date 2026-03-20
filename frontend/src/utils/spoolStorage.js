/**
 * Pure utility functions for spool storage management.
 *
 * A spool is "in storage" when its location field matches the configured
 * storage location name (case-insensitive). A spool is "active" otherwise.
 */

/**
 * Group non-archived spools by filament, separating storage vs active.
 * Returns an array sorted alphabetically by filament name.
 * Within each group, storageSpools are sorted oldest-first (FIFO open order).
 *
 * @param {object[]} spools   - Raw Spoolman spool array
 * @param {string}   storageLoc - Storage location name (e.g. "Storage")
 * @returns {{ filament, storageSpools, activeSpools }[]}
 */
export function groupSpoolsByFilament(spools, storageLoc) {
    const loc = (storageLoc || 'Storage').toLowerCase();
    const map = new Map();

    for (const spool of spools) {
        if (spool.archived) continue;
        const filament = spool.filament;
        if (!filament) continue;
        const fid = filament.id;
        if (!map.has(fid)) map.set(fid, { filament, storageSpools: [], activeSpools: [] });
        const entry = map.get(fid);
        if (typeof spool.location === 'string' && spool.location.toLowerCase() === loc) {
            entry.storageSpools.push(spool);
        } else {
            entry.activeSpools.push(spool);
        }
    }

    for (const entry of map.values()) {
        // FIFO: oldest registered date first → open that one when "Open Spool" is clicked
        entry.storageSpools.sort(
            (a, b) => new Date(a.registered || 0) - new Date(b.registered || 0)
        );
    }

    return [...map.values()].sort(
        (a, b) => (a.filament.name || '').localeCompare(b.filament.name || '')
    );
}

/**
 * Returns true when a spool is considered "low" on filament:
 *   - remaining_weight < 100 g, OR
 *   - remaining_weight < 15% of initial weight
 *
 * Returns false when remaining_weight is null/undefined (weight unknown).
 *
 * @param {object} spool - Spoolman spool object
 * @returns {boolean}
 */
export function isSpoolLow(spool) {
    const remaining = spool.remaining_weight;
    if (remaining == null) return false;
    if (remaining < 100) return true;
    const initial = spool.initial_weight ?? spool.filament?.weight;
    if (initial && initial > 0 && remaining / initial < 0.15) return true;
    return false;
}
