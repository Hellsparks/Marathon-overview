const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { getDb } = require('../db');
const MoonrakerClient = require('../services/moonraker');
const BambuClient = require('../services/bambu');
const printerCache = require('../services/printerCache');
const { clearSpoolCache } = require('../services/poller');

const router = express.Router();

/**
 * Extract a human-readable error string from a Spoolman API error response.
 * FastAPI/Pydantic returns { detail: [...] } (422), simple errors use { message: "..." }.
 */
function spoolmanErrorText(err, statusText) {
    if (Array.isArray(err.detail)) {
        return err.detail.map(d => {
            const loc = Array.isArray(d.loc) && d.loc.length > 1 ? d.loc.slice(1).join('.') + ': ' : '';
            return loc + (d.msg || JSON.stringify(d));
        }).join('; ');
    }
    if (typeof err.detail === 'string') return err.detail;
    if (typeof err.message === 'string') return err.message;
    return statusText;
}

/** Helper: get Spoolman URL from settings */
function getSpoolmanUrl() {
    const db = getDb();
    const row = db.prepare("SELECT value FROM settings WHERE key = 'spoolman_url'").get();
    return row?.value || '';
}

const BAMBU_COLORS = [
    { name: 'Black', hex: '000000' },
    { name: 'White', hex: 'FFFFFF' },
    { name: 'Red', hex: 'C12E1F' },
    { name: 'Blue', hex: '0A2989' },
    { name: 'Gray', hex: '8E9089' },
    { name: 'Green', hex: '00AE42' },
    { name: 'Yellow', hex: 'FEC600' },
    { name: 'Orange', hex: 'FF9016' },
    { name: 'Pink', hex: 'F5547C' },
    { name: 'Cyan', hex: '489FDF' },
    { name: 'Purple', hex: 'AF1685' },
    { name: 'Brown', hex: '5C4738' }
];

// Bambu filament profile IDs sourced from OrcaSlicer BBL profile JSONs +
// live MQTT sniff. tray_info_idx = setting_id with 'S' removed (GFS_L99 → GFL99).
// PETG uses GFG02/GFSG02_03 confirmed from live MQTT sniff on A1 with dev mode.
const MATERIAL_PROFILES = {
    'PLA': { tray_info_idx: 'GFL99', setting_id: 'GFSL99' },
    'PLA+': { tray_info_idx: 'GFL99', setting_id: 'GFSL99' },
    'PLA-CF': { tray_info_idx: 'GFL99', setting_id: 'GFSL99' },
    'PLA SILK': { tray_info_idx: 'GFL99', setting_id: 'GFSL99' },
    'MATTE PLA': { tray_info_idx: 'GFL99', setting_id: 'GFSL99' },
    'PETG': { tray_info_idx: 'GFG02', setting_id: 'GFSG02_03' },
    'PETG-CF': { tray_info_idx: 'GFG02', setting_id: 'GFSG02_03' },
    'PETG-HF': { tray_info_idx: 'GFG02', setting_id: 'GFSG02_03' },
    'ABS': { tray_info_idx: 'GFB99', setting_id: 'GFSB99' },
    'ASA': { tray_info_idx: 'GFB98', setting_id: 'GFSB98' },
    'TPU': { tray_info_idx: 'GFR99', setting_id: 'GFSR99' },
    'TPE': { tray_info_idx: 'GFR99', setting_id: 'GFSR99' },
    'NYLON': { tray_info_idx: 'GFN98', setting_id: 'GFSN98' },
    'PA': { tray_info_idx: 'GFN98', setting_id: 'GFSN98' },
    'PA-CF': { tray_info_idx: 'GFN98', setting_id: 'GFSN98' },
    'PC': { tray_info_idx: 'GFL99', setting_id: 'GFSL99' },
    'PVA': { tray_info_idx: 'GFL99', setting_id: 'GFSL99' },
    'HIPS': { tray_info_idx: 'GFL99', setting_id: 'GFSL99' },
};
const DEFAULT_PROFILE = { tray_info_idx: 'GFL99', setting_id: 'GFSL99' };

/** Map every color in a comma-separated multi_color_hexes string to its nearest Bambu color.
 *  Returns an array of 8-char RRGGBBFF strings, one per input color. */
function getNearestBambuColors(multiHexStr) {
    if (!multiHexStr) return [];
    return multiHexStr.split(',').map(h => getNearestBambuColor(h.trim()));
}

function getNearestBambuColor(hexStr) {
    if (!hexStr) return 'FFFFFFFF';

    // Convert a hex string to an [r, g, b] array.
    // Handles 3-char, 6-char, and 8-char (RRGGBBAA) inputs — alpha is always ignored.
    const hexToRgb = (h) => {
        h = String(h).replace(/^#/, '').trim();
        if (h.length === 3) h = h.split('').map(c => c + c).join('');
        // Truncate to 6 chars so an alpha byte is never included in the comparison
        h = h.slice(0, 6);
        const arr = [...h.matchAll(/[a-f0-9]{2}/gi)].map(m => parseInt(m[0], 16));
        return arr.length >= 3 ? arr : [255, 255, 255];
    };

    const targetRgb = hexToRgb(hexStr);
    let bestDist = Infinity;
    let bestHex = 'FFFFFF';

    for (const bc of BAMBU_COLORS) {
        const cRgb = hexToRgb(bc.hex);
        const dist = Math.sqrt(
            Math.pow(targetRgb[0] - cRgb[0], 2) +
            Math.pow(targetRgb[1] - cRgb[1], 2) +
            Math.pow(targetRgb[2] - cRgb[2], 2)
        );
        if (dist < bestDist) {
            bestDist = dist;
            bestHex = bc.hex;
        }
    }
    return bestHex.toUpperCase() + 'FF';
}

/** Helper: fetch a single spool from Spoolman */
async function fetchSpool(spoolId) {
    const url = getSpoolmanUrl();
    if (!url) return null;
    const r = await fetch(`${url}/api/v1/spool/${spoolId}`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    return r.json();
}

// GET /api/spoolman/spools — list all spools from Spoolman
router.get('/spools', async (_req, res) => {
    const url = getSpoolmanUrl();
    if (!url) return res.status(400).json({ error: 'Spoolman URL not configured' });
    try {
        const r = await fetch(`${url}/api/v1/spool`, { signal: AbortSignal.timeout(5000) });
        if (!r.ok) throw new Error(`Spoolman ${r.status}`);
        res.json(await r.json());
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// GET /api/spoolman/spool/:id/qr — proxy Spoolman QR code image (SVG/PNG)
router.get('/spool/:id/qr', async (req, res) => {
    const url = getSpoolmanUrl();
    if (!url) return res.status(400).json({ error: 'Spoolman URL not configured' });
    try {
        const r = await fetch(`${url}/api/v1/spool/${req.params.id}/qr_code`, { signal: AbortSignal.timeout(5000) });
        if (!r.ok) throw new Error(`Spoolman ${r.status}`);
        const contentType = r.headers.get('content-type') || 'image/svg+xml';
        res.set('Content-Type', contentType);
        res.send(Buffer.from(await r.arrayBuffer()));
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// GET /api/spoolman/spool/:id — single spool details
router.get('/spool/:id', async (req, res) => {
    const url = getSpoolmanUrl();
    if (!url) return res.status(400).json({ error: 'Spoolman URL not configured' });
    try {
        const r = await fetch(`${url}/api/v1/spool/${req.params.id}`, { signal: AbortSignal.timeout(5000) });
        if (!r.ok) throw new Error(`Spoolman ${r.status}`);
        res.json(await r.json());
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// POST /api/spoolman/set-active — set active spool on a printer
// For Moonraker printers: sets via Moonraker API
// For Bambu printers: requires trayId (0-3), updates AMS via MQTT
router.post('/set-active', async (req, res) => {
    const { printerId, spoolId, trayId } = req.body;
    if (!printerId) return res.status(400).json({ error: 'printerId required' });
    const db = getDb();
    const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(printerId);
    if (!printer) return res.status(404).json({ error: 'Printer not found' });

    try {
        if (printer.firmware_type === 'bambu') {
            // Bambu AMS spool assignment
            if (trayId === undefined || trayId === null)
                return res.status(400).json({ error: 'trayId (0-3) required for Bambu printers' });

            const tray = parseInt(trayId, 10);
            if (tray < 0 || tray > 3)
                return res.status(400).json({ error: 'trayId must be 0-3' });

            const client = new BambuClient(printer);

            if (spoolId) {
                // Fetch spool details from Spoolman for color/material/nozzle temps
                const spool = await fetchSpool(spoolId);
                if (!spool) return res.status(404).json({ error: 'Spool not found in Spoolman' });

                const filament = spool.filament || {};
                // For multicolor filaments: prefer first color from multi_color_hexes (color_hex may be
                // absent OR a meaningless placeholder like "000000" when multi_color_hexes is set).
                const resolvedColorHex = (filament.multi_color_hexes
                    ? filament.multi_color_hexes.split(',')[0].trim()
                    : null) || filament.color_hex || null;
                const colorHex = getNearestBambuColor(resolvedColorHex);
                const rawMaterial = (filament.material || 'PLA').toUpperCase();
                // Strip trailing digits/variants so e.g. "TPU95A" → "TPU", "PA12" → "PA12" (kept if in map)
                const material = MATERIAL_PROFILES[rawMaterial]
                    ? rawMaterial
                    : rawMaterial.replace(/\d+[A-Z]*$/, '').trim() || rawMaterial;
                const profile = MATERIAL_PROFILES[material] || DEFAULT_PROFILE;
                const nozzleTempMin = filament.settings_nozzle_temperature
                    ? Math.max(150, filament.settings_nozzle_temperature - 20)
                    : 190;
                const nozzleTempMax = filament.settings_nozzle_temperature
                    ? Math.min(300, filament.settings_nozzle_temperature + 20)
                    : 230;

                console.log(`[Bambu] set-active: printerId=${printerId} spoolId=${spoolId} trayId=${tray} color=${colorHex} material=${material} idx=${profile.tray_info_idx}`);
                await client.setAmsTray(tray, {
                    tray_type: material,
                    tray_color: colorHex,
                    tray_info_idx: profile.tray_info_idx,
                    setting_id: profile.setting_id,
                    nozzle_temp_min: nozzleTempMin,
                    nozzle_temp_max: nozzleTempMax,
                });
                console.log(`[Bambu] setAmsTray completed for printer ${printerId} tray ${tray} colors=${filament.multi_color_hexes ? getNearestBambuColors(filament.multi_color_hexes).join(',') : colorHex}`);

                // Save slot mapping
                db.prepare(`
                    INSERT INTO ams_slots (printer_id, tray_id, spool_id)
                    VALUES (?, ?, ?)
                    ON CONFLICT(printer_id, tray_id) DO UPDATE SET spool_id = excluded.spool_id
                `).run(printer.id, tray, spoolId);

                // Flag spool as Bambu-used (untracked)
                db.prepare(`
                    INSERT INTO bambu_used_spools (spool_id, printer_id)
                    VALUES (?, ?)
                    ON CONFLICT(spool_id) DO UPDATE SET printer_id = excluded.printer_id, assigned_at = datetime('now')
                `).run(spoolId, printer.id);

                clearSpoolCache(spoolId);

                const bambuColors = filament.multi_color_hexes
                    ? getNearestBambuColors(filament.multi_color_hexes)
                    : [colorHex];
                return res.json({ ok: true, bambu_colors: bambuColors });
            } else {
                // Clear the slot
                await client.clearAmsTray(tray);
                db.prepare('DELETE FROM ams_slots WHERE printer_id = ? AND tray_id = ?').run(printer.id, tray);
            }

            res.json({ ok: true });
        } else {
            // Moonraker printer — original behavior
            const client = new MoonrakerClient(printer);
            let r;
            if (spoolId) {
                // Assign a spool
                r = await fetch(
                    `${client.baseUrl}/server/spoolman/spool_id`,
                    {
                        method: 'POST',
                        headers: client._headers(),
                        body: JSON.stringify({ spool_id: spoolId }),
                        signal: AbortSignal.timeout(5000),
                    }
                );
            } else {
                // Clear the active spool by passing an empty body
                // (Older Moonraker versions lack DELETE and crash if passing null for spool_id)
                r = await fetch(
                    `${client.baseUrl}/server/spoolman/spool_id`,
                    {
                        method: 'POST',
                        headers: client._headers(),
                        body: JSON.stringify({}),
                        signal: AbortSignal.timeout(5000),
                    }
                );
            }
            if (!r.ok) {
                const text = await r.text().catch(() => '');
                console.error(`Moonraker set-spool failed (${r.status}): ${text}`);
                throw new Error(`Moonraker ${r.status}`);
            }

            // If this spool was previously used on Bambu, clear the warning
            // (user is now putting it on a tracked printer)
            if (spoolId) {
                db.prepare('DELETE FROM bambu_used_spools WHERE spool_id = ?').run(spoolId);
                clearSpoolCache(spoolId);

                // Auto-apply pressure advance if stored in filament extra field
                try {
                    const spool = await fetchSpool(spoolId);
                    const extra = spool?.filament?.extra || {};
                    const paRaw = extra.pressure_advance ?? extra.pa;
                    const pa = paRaw !== undefined ? parseFloat(String(paRaw).replace(/^"|"$/g, '')) : NaN;
                    if (!isNaN(pa) && pa >= 0) {
                        await client.sendGcode(`SET_PRESSURE_ADVANCE ADVANCE=${pa.toFixed(4)}`);
                        console.log(`[Moonraker] Set pressure advance ${pa} on printer ${printerId}`);
                    }
                } catch (paErr) {
                    console.warn(`[Moonraker] Could not set pressure advance: ${paErr.message}`);
                }
            }

            res.json(await r.json());
        }
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// GET /api/spoolman/ams-slots/:printerId — current spool→slot mapping for a Bambu printer
router.get('/ams-slots/:printerId', (req, res) => {
    try {
        const db = getDb();
        const slots = db.prepare('SELECT tray_id, spool_id FROM ams_slots WHERE printer_id = ?')
            .all(parseInt(req.params.printerId, 10));
        // Return as object: { 0: spoolId, 1: spoolId, ... }
        const map = {};
        for (const s of slots) {
            map[s.tray_id] = s.spool_id;
        }
        res.json(map);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Multi-tool slot management (Klipper/Moonraker multi-toolhead) ─────────────

// GET /api/spoolman/tool-slots/:printerId — { 0: spoolId|null, 1: spoolId|null, … }
// Slot count is derived from MMU assignments (sum of all MMU slot_counts) or falls back to toolhead_count
router.get('/tool-slots/:printerId', (req, res) => {
    try {
        const db = getDb();
        const printerId = parseInt(req.params.printerId, 10);
        const printer = db.prepare('SELECT toolhead_count FROM printers WHERE id = ?').get(printerId);
        if (!printer) return res.status(404).json({ error: 'Printer not found' });

        // Check MMU assignments to determine total slot count
        const mmus = db.prepare('SELECT tool_index, slot_count FROM printer_mmus WHERE printer_id = ? ORDER BY tool_index').all(printerId);
        let totalSlots;
        if (mmus.length > 0) {
            totalSlots = mmus.reduce((sum, m) => sum + m.slot_count, 0);
        } else {
            totalSlots = printer.toolhead_count || 1;
        }

        const rows = db.prepare('SELECT tool_index, spool_id FROM printer_tool_slots WHERE printer_id = ?').all(printerId);
        const map = {};
        for (let i = 0; i < totalSlots; i++) map[i] = null;
        for (const r of rows) map[r.tool_index] = r.spool_id;
        res.json(map);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/spoolman/tool-slots/:printerId — { toolIndex, spoolId } assign or clear a slot
router.post('/tool-slots/:printerId', async (req, res) => {
    const printerId = parseInt(req.params.printerId, 10);
    const { toolIndex, spoolId } = req.body;
    if (toolIndex === undefined) return res.status(400).json({ error: 'toolIndex required' });
    const db = getDb();
    const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(printerId);
    if (!printer) return res.status(404).json({ error: 'Printer not found' });

    // Resolve which toolhead and lane this slot belongs to (for MMU/AFC gcode)
    const mmus = db.prepare('SELECT tool_index, slot_count FROM printer_mmus WHERE printer_id = ? ORDER BY tool_index').all(printerId);
    let gcodeCmd;
    if (mmus.length > 0) {
        // MMU mode: map flat slotIndex to toolhead + lane
        let remaining = toolIndex;
        let toolhead = 0;
        let lane = 0;
        for (const mmu of mmus) {
            if (remaining < mmu.slot_count) {
                toolhead = mmu.tool_index;
                lane = remaining;
                break;
            }
            remaining -= mmu.slot_count;
        }
        // AFC/MMU: SET_SPOOL_ID LANE=<lane> SPOOL_ID=<id> (common AFC pattern)
        // Also set Spoolman active spool via SET_ACTIVE_SPOOL if available
        const val = spoolId || 0;
        gcodeCmd = `SET_ACTIVE_SPOOL ID=${val}`;
    } else {
        // Traditional multi-toolhead: T0, T1, etc.
        const val = spoolId || 'None';
        gcodeCmd = `SET_GCODE_VARIABLE MACRO=T${toolIndex} VARIABLE=spool_id VALUE=${val}`;
    }

    try {
        const client = new MoonrakerClient(printer);
        if (spoolId) {
            db.prepare(`
                INSERT INTO printer_tool_slots (printer_id, tool_index, spool_id)
                VALUES (?, ?, ?)
                ON CONFLICT(printer_id, tool_index) DO UPDATE SET spool_id = excluded.spool_id
            `).run(printerId, toolIndex, spoolId);
        } else {
            db.prepare('DELETE FROM printer_tool_slots WHERE printer_id = ? AND tool_index = ?').run(printerId, toolIndex);
        }

        // Send gcode — printer may be offline, slot assignment is still saved
        try {
            await client.sendGcode(gcodeCmd);
        } catch { /* offline ok */ }

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/spoolman/activate-tool — { printerId, toolIndex }
// Switches Moonraker's active spool to whichever spool is in that tool's slot.
// Called by Klipper macros or Marathon UI on tool change.
router.post('/activate-tool', async (req, res) => {
    const { printerId, toolIndex } = req.body;
    if (printerId === undefined || toolIndex === undefined)
        return res.status(400).json({ error: 'printerId and toolIndex required' });
    const db = getDb();
    const pid = parseInt(printerId, 10);
    const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(pid);
    if (!printer) return res.status(404).json({ error: 'Printer not found' });
    const row = db.prepare('SELECT spool_id FROM printer_tool_slots WHERE printer_id = ? AND tool_index = ?')
        .get(pid, parseInt(toolIndex, 10));
    const spoolId = row?.spool_id ?? null;
    try {
        const client = new MoonrakerClient(printer);
        const r = await fetch(`${client.baseUrl}/server/spoolman/spool_id`, {
            method: 'POST',
            headers: client._headers(),
            body: JSON.stringify(spoolId ? { spool_id: spoolId } : {}),
            signal: AbortSignal.timeout(5000),
        });
        if (!r.ok) throw new Error(`Moonraker ${r.status}`);
        res.json({ ok: true, spoolId });
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// GET /api/spoolman/bambu-warnings — spools with untracked Bambu usage
// Returns spool IDs + printer name for displaying warnings
router.get('/bambu-warnings', (req, res) => {
    try {
        const db = getDb();
        const rows = db.prepare(`
            SELECT b.spool_id, b.printer_id, b.assigned_at, p.name as printer_name
            FROM bambu_used_spools b
            JOIN printers p ON p.id = b.printer_id
        `).all();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/spoolman/bambu-warnings/:spoolId — dismiss a Bambu usage warning
router.delete('/bambu-warnings/:spoolId', (req, res) => {
    try {
        const db = getDb();
        db.prepare('DELETE FROM bambu_used_spools WHERE spool_id = ?').run(parseInt(req.params.spoolId, 10));
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/spoolman/spool/:id/use — consume filament by length (mm) or weight (g)
// body: { use_length: number } OR { use_weight: number }
router.put('/spool/:id/use', async (req, res) => {
    const url = getSpoolmanUrl();
    if (!url) return res.status(400).json({ error: 'Spoolman URL not configured' });
    const { use_length, use_weight } = req.body;
    if (use_length === undefined && use_weight === undefined)
        return res.status(400).json({ error: 'use_length or use_weight required' });
    try {
        const body = use_length !== undefined ? { use_length } : { use_weight };
        const r = await fetch(`${url}/api/v1/spool/${req.params.id}/use`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(5000),
        });
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            return res.status(r.status).json({ error: spoolmanErrorText(err, r.statusText) });
        }
        res.json(await r.json());
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// PUT /api/spoolman/spool/:id/measure — set filament amount by current measured gross weight (g)
// body: { weight: number }  — total weight of spool on a scale
router.put('/spool/:id/measure', async (req, res) => {
    const url = getSpoolmanUrl();
    if (!url) return res.status(400).json({ error: 'Spoolman URL not configured' });
    const { weight } = req.body;
    if (weight === undefined) return res.status(400).json({ error: 'weight required' });
    try {
        // First check that the spool's filament has a spool_weight set
        const spoolR = await fetch(`${url}/api/v1/spool/${req.params.id}`, { signal: AbortSignal.timeout(5000) });
        if (spoolR.ok) {
            const spool = await spoolR.json();
            const spoolWeight = spool.filament?.spool_weight;
            if (!spoolWeight && spoolWeight !== 0) {
                return res.status(400).json({
                    error: `Cannot measure: the filament profile "${spool.filament?.name || 'unknown'}" has no spool_weight set. Edit the filament and add the empty spool weight first.`
                });
            }
        }
        const r = await fetch(`${url}/api/v1/spool/${req.params.id}/measure`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ weight }),
            signal: AbortSignal.timeout(5000),
        });
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            console.error('[spoolman] measure failed:', r.status, err);
            return res.status(r.status).json({ error: spoolmanErrorText(err, r.statusText) });
        }
        res.json(await r.json());
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// GET /api/spoolman/vendors — list all vendors
router.get('/vendors', async (_req, res) => {
    const url = getSpoolmanUrl();
    if (!url) return res.status(400).json({ error: 'Spoolman URL not configured' });
    try {
        const r = await fetch(`${url}/api/v1/vendor`, { signal: AbortSignal.timeout(5000) });
        if (!r.ok) throw new Error(`Spoolman ${r.status}`);
        res.json(await r.json());
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// POST /api/spoolman/vendors — create a vendor
router.post('/vendors', async (req, res) => {
    const url = getSpoolmanUrl();
    if (!url) return res.status(400).json({ error: 'Spoolman URL not configured' });
    try {
        const r = await fetch(`${url}/api/v1/vendor`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body),
            signal: AbortSignal.timeout(5000),
        });
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            return res.status(r.status).json({ error: spoolmanErrorText(err, r.statusText) });
        }
        res.json(await r.json());
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// GET /api/spoolman/filaments — list all filaments
router.get('/filaments', async (_req, res) => {
    const url = getSpoolmanUrl();
    if (!url) return res.status(400).json({ error: 'Spoolman URL not configured' });
    try {
        const r = await fetch(`${url}/api/v1/filament`, { signal: AbortSignal.timeout(5000) });
        if (!r.ok) throw new Error(`Spoolman ${r.status}`);
        res.json(await r.json());
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// POST /api/spoolman/filaments — create a filament
router.post('/filaments', async (req, res) => {
    const url = getSpoolmanUrl();
    if (!url) return res.status(400).json({ error: 'Spoolman URL not configured' });
    try {
        const r = await fetch(`${url}/api/v1/filament`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body),
            signal: AbortSignal.timeout(5000),
        });
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            console.error('Spoolman POST /filament error:', r.status, JSON.stringify(err));
            return res.status(r.status).json({ error: spoolmanErrorText(err, r.statusText) });
        }
        res.json(await r.json());
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// POST /api/spoolman/spools — create a spool
// Also ensures the filament is tracked in spoolman_inventory (INSERT OR IGNORE with defaults).
router.post('/spools', async (req, res) => {
    const url = getSpoolmanUrl();
    if (!url) return res.status(400).json({ error: 'Spoolman URL not configured' });
    try {
        const r = await fetch(`${url}/api/v1/spool`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body),
            signal: AbortSignal.timeout(5000),
        });
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            return res.status(r.status).json({ error: spoolmanErrorText(err, r.statusText) });
        }
        const created = await r.json();
        // Auto-track the filament so it appears in the Inventory page
        try {
            const filamentId = created.filament?.id ?? req.body.filament_id;
            if (filamentId) {
                getDb().prepare(
                    'INSERT OR IGNORE INTO spoolman_inventory (filament_id, target_qty, min_qty) VALUES (?, 1, 0)'
                ).run(filamentId);
            }
        } catch { /* non-critical — spool was still created */ }
        res.json(created);
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// PATCH /api/spoolman/spools/:id — partial update (proxy to Spoolman)
// Used to set/clear the location field when opening a stored spool
router.patch('/spools/:id', async (req, res) => {
    const url = getSpoolmanUrl();
    if (!url) return res.status(400).json({ error: 'Spoolman URL not configured' });
    try {
        const r = await fetch(`${url}/api/v1/spool/${req.params.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body),
            signal: AbortSignal.timeout(5000),
        });
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            return res.status(r.status).json({ error: spoolmanErrorText(err, r.statusText) });
        }
        res.json(await r.json());
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// DELETE /api/spoolman/spools/:id — delete a spool
router.delete('/spools/:id', async (req, res) => {
    const url = getSpoolmanUrl();
    if (!url) return res.status(400).json({ error: 'Spoolman URL not configured' });
    try {
        const r = await fetch(`${url}/api/v1/spool/${req.params.id}`, {
            method: 'DELETE',
            signal: AbortSignal.timeout(5000),
        });
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            return res.status(r.status).json({ error: spoolmanErrorText(err, r.statusText) });
        }
        res.json({ ok: true });
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// GET /api/spoolman/fields/:entity — get custom field definitions (entity: filament | vendor | spool)
router.get('/fields/:entity', async (req, res) => {
    const url = getSpoolmanUrl();
    if (!url) return res.status(400).json({ error: 'Spoolman URL not configured' });
    const allowed = ['filament', 'vendor', 'spool'];
    if (!allowed.includes(req.params.entity))
        return res.status(400).json({ error: 'Invalid entity type' });
    try {
        const r = await fetch(`${url}/api/v1/field/${req.params.entity}`, { signal: AbortSignal.timeout(5000) });
        if (!r.ok) throw new Error(`Spoolman ${r.status}`);
        res.json(await r.json());
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// POST /api/spoolman/fields/:entity — create a custom field definition
router.post('/fields/:entity', async (req, res) => {
    const url = getSpoolmanUrl();
    if (!url) return res.status(400).json({ error: 'Spoolman URL not configured' });
    const allowed = ['filament', 'vendor', 'spool'];
    if (!allowed.includes(req.params.entity))
        return res.status(400).json({ error: 'Invalid entity type' });
    try {
        const { entity_type, key, ...fieldBody } = req.body;
        const entity = req.params.entity;
        if (!key) return res.status(400).json({ error: 'key is required' });
        // Check if field already exists by listing all fields and checking for key
        const listRes = await fetch(`${url}/api/v1/field/${entity}`, { signal: AbortSignal.timeout(5000) });
        if (listRes.ok) {
            const fields = await listRes.json();
            const existing = fields.find(f => f.key === key);
            if (existing) return res.json(existing);
        }
        // Create: POST /api/v1/field/{entity}/{key} with {name, field_type, ...} in body
        const r = await fetch(`${url}/api/v1/field/${entity}/${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fieldBody),
            signal: AbortSignal.timeout(5000),
        });
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            return res.status(r.status).json({ error: spoolmanErrorText(err, r.statusText) });
        }
        // Spoolman returns the full list; find our newly created field
        const result = await r.json();
        const created = Array.isArray(result) ? result.find(f => f.key === key) : result;
        res.json(created || { key });
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// PATCH /api/spoolman/filaments/:id — update a filament
router.patch('/filaments/:id', async (req, res) => {
    const url = getSpoolmanUrl();
    if (!url) return res.status(400).json({ error: 'Spoolman URL not configured' });
    try {
        const r = await fetch(`${url}/api/v1/filament/${req.params.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body),
            signal: AbortSignal.timeout(5000),
        });
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            console.error('Spoolman PATCH /filament error:', r.status, JSON.stringify(err));
            return res.status(r.status).json({ error: spoolmanErrorText(err, r.statusText) });
        }
        res.json(await r.json());
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// DELETE /api/spoolman/filaments/:id — delete a filament
router.delete('/filaments/:id', async (req, res) => {
    const url = getSpoolmanUrl();
    if (!url) return res.status(400).json({ error: 'Spoolman URL not configured' });
    try {
        const r = await fetch(`${url}/api/v1/filament/${req.params.id}`, {
            method: 'DELETE',
            signal: AbortSignal.timeout(5000),
        });
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            return res.status(r.status).json({ error: spoolmanErrorText(err, r.statusText) });
        }
        res.json({ ok: true });
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// POST /api/spoolman/filaments/:id/swatch — generate swatch STL, save to data/swatches/, return path
// Docker mode: calls the bundled marathon-swatch container directly.
// Native mode: spawns swatch_generator.py via uv run.
const SWATCH_SCRIPT = path.join(__dirname, '../services/swatch_generator.py');

router.post('/filaments/:id/swatch', async (req, res) => {
    const spoolmanUrl = getSpoolmanUrl();
    if (!spoolmanUrl) return res.status(400).json({ error: 'Spoolman URL not configured' });
    try {
        const r = await fetch(`${spoolmanUrl}/api/v1/filament/${req.params.id}`, { signal: AbortSignal.timeout(5000) });
        if (!r.ok) return res.status(404).json({ error: `Filament not found (${r.status})` });
        const filament = await r.json();

        const vendorName = filament.vendor?.name || '';
        const line1 = [vendorName, filament.material].filter(Boolean).join(' ').substring(0, 28);
        const line2 = (filament.name || '').substring(0, 20);
        const safeName = [filament.material, vendorName, filament.name || `swatch_${filament.id}`]
            .filter(Boolean).join(' ').replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').trim();
        const filename = `${safeName}.stl`;

        const DATA_DIR = process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : path.join(__dirname, '../../data');
        const swatchDir = path.join(DATA_DIR, 'swatches');
        if (!fs.existsSync(swatchDir)) fs.mkdirSync(swatchDir, { recursive: true });
        const outPath = path.join(swatchDir, filename);

        if (IS_DOCKER) {
            // In Docker mode, call the bundled swatch container over the internal network
            const upstream = await fetch('http://marathon-swatch:7321/swatch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ line1, line2 }),
                signal: AbortSignal.timeout(60000),
            });
            if (!upstream.ok) {
                const msg = await upstream.text();
                return res.status(500).json({ error: msg });
            }
            fs.writeFileSync(outPath, Buffer.from(await upstream.arrayBuffer()));
            return res.json({ ok: true, path: outPath, filename });
        }

        // Native mode: spawn via uv run (handles Python + CadQuery install automatically)
        const arg = JSON.stringify({ line1, line2 });
        const uvCandidates = [
            'uv',
            `${process.env.HOME || ''}/.local/bin/uv`,
            `${process.env.HOME || ''}/.cargo/bin/uv`,
        ];
        const uvBin = uvCandidates.find(b => { try { return fs.existsSync(b) || b === 'uv'; } catch { return false; } }) || 'uv';

        const proc = spawn(uvBin, ['run', '--python', '3.12', '--with', 'cadquery', SWATCH_SCRIPT, arg, outPath]);
        const stderr = [];
        proc.stderr.on('data', d => stderr.push(d.toString()));
        proc.on('error', err => {
            if (err.code === 'ENOENT') return res.status(500).json({ error: 'uv not found. Install from https://docs.astral.sh/uv/ to enable swatch generation.' });
            res.status(500).json({ error: err.message });
        });
        proc.on('close', code => {
            if (code !== 0) return res.status(500).json({ error: `Swatch generation failed: ${stderr.join('').trim() || `exit ${code}`}` });
            res.json({ ok: true, path: outPath, filename });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/spoolman/vendors/:id — update a vendor
router.patch('/vendors/:id', async (req, res) => {
    const url = getSpoolmanUrl();
    if (!url) return res.status(400).json({ error: 'Spoolman URL not configured' });
    try {
        const r = await fetch(`${url}/api/v1/vendor/${req.params.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body),
            signal: AbortSignal.timeout(5000),
        });
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            return res.status(r.status).json({ error: spoolmanErrorText(err, r.statusText) });
        }
        res.json(await r.json());
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// DELETE /api/spoolman/vendors/:id — delete a vendor
router.delete('/vendors/:id', async (req, res) => {
    const url = getSpoolmanUrl();
    if (!url) return res.status(400).json({ error: 'Spoolman URL not configured' });
    try {
        const r = await fetch(`${url}/api/v1/vendor/${req.params.id}`, {
            method: 'DELETE',
            signal: AbortSignal.timeout(5000),
        });
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            return res.status(r.status).json({ error: spoolmanErrorText(err, r.statusText) });
        }
        res.json({ ok: true });
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// ── Inventory (Marathon-local targets only) ──────────────────────────────────

// GET /api/spoolman/inventory — list all tracked filament targets
router.get('/inventory', (req, res) => {
    try {
        const db = getDb();
        res.json(db.prepare('SELECT * FROM spoolman_inventory').all());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/spoolman/inventory/:filamentId — upsert target/min for a filament
router.put('/inventory/:filamentId', (req, res) => {
    const { target_qty, min_qty } = req.body;
    if (target_qty === undefined) return res.status(400).json({ error: 'target_qty required' });
    try {
        const db = getDb();
        db.prepare(`
            INSERT INTO spoolman_inventory (filament_id, target_qty, min_qty)
            VALUES (?, ?, ?)
            ON CONFLICT(filament_id) DO UPDATE SET target_qty = excluded.target_qty, min_qty = excluded.min_qty
        `).run(parseInt(req.params.filamentId), parseInt(target_qty), parseInt(min_qty ?? 0));
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/spoolman/inventory/:filamentId — stop tracking a filament
router.delete('/inventory/:filamentId', (req, res) => {
    try {
        const db = getDb();
        db.prepare('DELETE FROM spoolman_inventory WHERE filament_id = ?').run(parseInt(req.params.filamentId));
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/spoolman/storage-location — return the configured storage location name
router.get('/storage-location', (req, res) => {
    const db = getDb();
    const row = db.prepare("SELECT value FROM settings WHERE key = 'storage_location'").get();
    res.json({ storage_location: row?.value || 'Storage' });
});

// PUT /api/spoolman/storage-location — update the storage location name
router.put('/storage-location', (req, res) => {
    const { storage_location } = req.body;
    if (typeof storage_location !== 'string' || !storage_location.trim())
        return res.status(400).json({ error: 'storage_location (non-empty string) required' });
    const db = getDb();
    const val = storage_location.trim();
    const info = db.prepare("UPDATE settings SET value = ? WHERE key = 'storage_location'").run(val);
    if (info.changes === 0)
        db.prepare("INSERT INTO settings (key, value) VALUES ('storage_location', ?)").run(val);
    res.json({ ok: true, storage_location: val });
});

// GET /api/spoolman/settings — fetch Spoolman global settings (currency, etc.)
router.get('/settings', async (_req, res) => {
    const url = getSpoolmanUrl();
    if (!url) return res.status(400).json({ error: 'Spoolman URL not configured' });
    try {
        const r = await fetch(`${url}/api/v1/setting`, { signal: AbortSignal.timeout(5000) });
        if (!r.ok) throw new Error(`Spoolman ${r.status}`);
        res.json(await r.json());
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// ── Export / Import ──────────────────────────────────────────────────────────

/** Known material modifiers — parsed from material string for filtering. */
const MATERIAL_MODIFIERS = ['Silk Rainbow', 'Silk TriColor', 'Silk BiColor', 'Silk', 'Matte', 'GF', 'CF', 'HF', 'HT', 'EF', 'HS', '95A', '85A', '70A', '60A', 'Tough', 'Pro', 'Galaxy', 'Glitter', 'Glow', 'Metal', 'BiColor', 'TriColor', 'Rainbow'];

/** Parse a material string into { base, modifier }. e.g. "PLA Silk" → { base: "PLA", modifier: "Silk" } */
function parseMaterial(material) {
    if (!material) return { base: '', modifier: '' };
    // Check extra field first — handled caller-side
    // Parse from string: try known modifiers
    const upper = material.toUpperCase();
    for (const mod of MATERIAL_MODIFIERS) {
        const modUpper = mod.toUpperCase();
        if (upper.includes(modUpper) && upper !== modUpper) {
            const base = material.replace(new RegExp(`\\s*${mod}\\s*`, 'i'), '').trim();
            return { base: base || material, modifier: mod };
        }
    }
    return { base: material, modifier: '' };
}

/** Shared helper: fetch all Spoolman data and build the export payload. */
async function buildExportPayload(url, { filamentIds, vendorIds, includeSpools = true } = {}) {
    const fetchJson = async (path) => {
        const r = await fetch(`${url}${path}`, { signal: AbortSignal.timeout(15000) });
        if (!r.ok) throw new Error(`Spoolman ${r.status} for ${path}`);
        return r.json();
    };
    const [allVendors, allFilaments, allSpools, vendorFields, filamentFields, spoolFields, settings] = await Promise.all([
        fetchJson('/api/v1/vendor'),
        fetchJson('/api/v1/filament'),
        fetchJson('/api/v1/spool'),
        fetchJson('/api/v1/field/vendor').catch(() => []),
        fetchJson('/api/v1/field/filament').catch(() => []),
        fetchJson('/api/v1/field/spool').catch(() => []),
        fetchJson('/api/v1/setting').catch(() => ({})),
    ]);

    const currency = typeof settings?.currency === 'string'
        ? settings.currency
        : (settings?.currency?.value ?? '');

    let vendors = allVendors;
    let filaments = allFilaments;
    let spools = allSpools;
    let partial = false;

    // Filter by specific filament IDs (finest granularity)
    if (filamentIds && filamentIds.length > 0) {
        const idSet = new Set(filamentIds);
        filaments = allFilaments.filter(f => idSet.has(f.id));
        // Auto-include vendors referenced by selected filaments
        const neededVendorIds = new Set(filaments.map(f => f.vendor?.id).filter(Boolean));
        vendors = allVendors.filter(v => neededVendorIds.has(v.id));
        partial = true;
    } else if (vendorIds && vendorIds.length > 0) {
        const idSet = new Set(vendorIds);
        vendors = allVendors.filter(v => idSet.has(v.id));
        filaments = allFilaments.filter(f => f.vendor?.id !== undefined && idSet.has(f.vendor.id));
        partial = true;
    }

    // Filter spools to match selected filaments
    if (includeSpools) {
        if (partial) {
            const filamentIdSet = new Set(filaments.map(f => f.id));
            spools = allSpools.filter(s => s.filament?.id !== undefined && filamentIdSet.has(s.filament.id));
        }
    } else {
        spools = [];
    }

    return {
        export_version: 2,
        exported_at: new Date().toISOString(),
        currency,
        partial,
        vendors,
        filaments,
        spools,
        custom_fields: { vendor: vendorFields, filament: filamentFields, spool: spoolFields },
    };
}

// GET /api/spoolman/export/preview — return filaments with vendor/material info for selection UI
router.get('/export/preview', async (_req, res) => {
    const url = getSpoolmanUrl();
    if (!url) return res.status(400).json({ error: 'Spoolman URL not configured' });
    try {
        const fetchJson = async (path) => {
            const r = await fetch(`${url}${path}`, { signal: AbortSignal.timeout(15000) });
            if (!r.ok) throw new Error(`Spoolman ${r.status} for ${path}`);
            return r.json();
        };
        const [vendors, filaments, spools] = await Promise.all([
            fetchJson('/api/v1/vendor'),
            fetchJson('/api/v1/filament'),
            fetchJson('/api/v1/spool'),
        ]);

        // Spool count per filament
        const spoolsByFilament = {};
        for (const s of spools) {
            const fid = s.filament?.id;
            if (fid !== undefined) spoolsByFilament[fid] = (spoolsByFilament[fid] || 0) + 1;
        }

        // Vendor name map
        const vendorMap = Object.fromEntries(vendors.map(v => [v.id, v.name]));

        // Read modifier field key from settings (no hardcoded key)
        const db = getDb();
        const modRow = db.prepare("SELECT value FROM settings WHERE key = 'material_modifier_field'").get();
        const modKey = modRow?.value || '';

        // Build filament preview list
        const filamentList = filaments.map(f => {
            const extraMod = modKey ? (f.extra?.[modKey] || '') : '';
            const { base, modifier } = parseMaterial(f.material);
            return {
                id: f.id,
                name: f.name || '',
                vendor_id: f.vendor?.id ?? null,
                vendor_name: f.vendor?.id ? (vendorMap[f.vendor.id] || '') : '',
                material: f.material || '',
                material_base: base,
                material_modifier: extraMod || modifier,
                color_hex: f.color_hex || '',
                multi_color_hexes: f.multi_color_hexes || null,
                spool_count: spoolsByFilament[f.id] || 0,
            };
        });

        // Unique values for filter dropdowns
        const vendorNames = [...new Set(filamentList.map(f => f.vendor_name).filter(Boolean))].sort();
        const materials = [...new Set(filamentList.map(f => f.material_base).filter(Boolean))].sort();
        const modifiers = [...new Set(filamentList.map(f => f.material_modifier).filter(Boolean))].sort();

        res.json({
            filaments: filamentList,
            vendors: vendorNames,
            materials,
            modifiers,
            total_spools: spools.length,
        });
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// GET /api/spoolman/export — download all Spoolman data as a JSON backup
router.get('/export', async (_req, res) => {
    const url = getSpoolmanUrl();
    if (!url) return res.status(400).json({ error: 'Spoolman URL not configured' });
    try {
        const payload = await buildExportPayload(url);
        const dateStr = new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Disposition', `attachment; filename="spoolman-backup-${dateStr}.json"`);
        res.setHeader('Content-Type', 'application/json');
        res.json(payload);
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// POST /api/spoolman/export — partial export filtered by filament/vendor IDs
router.post('/export', async (req, res) => {
    const url = getSpoolmanUrl();
    if (!url) return res.status(400).json({ error: 'Spoolman URL not configured' });
    const { filament_ids, vendor_ids, include_spools } = req.body || {};
    try {
        const payload = await buildExportPayload(url, {
            filamentIds: filament_ids || null,
            vendorIds: vendor_ids || null,
            includeSpools: include_spools !== false,
        });
        const dateStr = new Date().toISOString().slice(0, 10);
        const partial = (filament_ids?.length > 0 || vendor_ids?.length > 0);
        const suffix = partial ? '-partial' : '';
        res.setHeader('Content-Disposition', `attachment; filename="spoolman-backup${suffix}-${dateStr}.json"`);
        res.setHeader('Content-Type', 'application/json');
        res.json(payload);
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// POST /api/spoolman/import/validate — check if backup fields exist on target
router.post('/import/validate', async (req, res) => {
    const url = getSpoolmanUrl();
    if (!url) return res.status(400).json({ error: 'Spoolman URL not configured' });

    const data = req.body;
    if (!data || (data.export_version !== 1 && data.export_version !== 2))
        return res.status(400).json({ error: 'Invalid export file' });

    try {
        const fetchFields = async (entity) => {
            const r = await fetch(`${url}/api/v1/field/${entity}`, { signal: AbortSignal.timeout(5000) });
            return r.ok ? r.json() : [];
        };

        const [existingVendorFields, existingFilamentFields, existingSpoolFields] = await Promise.all([
            fetchFields('vendor'), fetchFields('filament'), fetchFields('spool'),
        ]);

        const existing = {
            vendor: existingVendorFields,
            filament: existingFilamentFields,
            spool: existingSpoolFields,
        };

        // Collect all extra field keys used in the backup data
        const usedKeys = { vendor: new Set(), filament: new Set(), spool: new Set() };
        for (const v of (data.vendors || [])) if (v.extra) Object.keys(v.extra).forEach(k => usedKeys.vendor.add(k));
        for (const f of (data.filaments || [])) if (f.extra) Object.keys(f.extra).forEach(k => usedKeys.filament.add(k));
        for (const s of (data.spools || [])) if (s.extra) Object.keys(s.extra).forEach(k => usedKeys.spool.add(k));

        // Find missing fields per entity type
        const missing = {};
        let hasMissing = false;
        for (const entity of ['vendor', 'filament', 'spool']) {
            const existingKeys = new Set(existing[entity].map(f => f.key));
            const backupFields = data.custom_fields?.[entity] || [];
            const missingList = [];
            for (const key of usedKeys[entity]) {
                if (!existingKeys.has(key)) {
                    const def = backupFields.find(f => f.key === key);
                    missingList.push(def || { key, name: key, field_type: 'text' });
                }
            }
            missing[entity] = missingList;
            if (missingList.length > 0) hasMissing = true;
        }

        // Check currency mismatch (v2 exports include currency)
        let currencyInfo = null;
        if (data.currency) {
            try {
                const settingsRes = await fetch(`${url}/api/v1/setting`, { signal: AbortSignal.timeout(5000) });
                if (settingsRes.ok) {
                    const settings = await settingsRes.json();
                    const localCurrency = typeof settings?.currency === 'string'
                        ? settings.currency
                        : (settings?.currency?.value ?? '');
                    if (localCurrency && data.currency && localCurrency !== data.currency) {
                        currencyInfo = { source: data.currency, target: localCurrency };
                    }
                }
            } catch { /* non-fatal */ }
        }

        res.json({ fieldsOk: !hasMissing, missing, existing, currencyInfo });
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// POST /api/spoolman/import — restore from an exported JSON backup
// Recreates vendors → filaments → spools in order, remapping IDs.
router.post('/import', async (req, res) => {
    const url = getSpoolmanUrl();
    if (!url) return res.status(400).json({ error: 'Spoolman URL not configured' });

    const data = req.body;
    if (!data || (data.export_version !== 1 && data.export_version !== 2)) {
        return res.status(400).json({ error: 'Invalid export file (missing export_version)' });
    }

    const fieldMappings = data._fieldMappings || {}; // { filament: { old_key: new_key }, ... }
    const createFields = data._createFields || []; // [{ entity, ...fieldDef }]
    const currencyRate = data._currencyRate || null; // multiplier for price conversion

    const log = [];
    const push = msg => { log.push(msg); console.log('[spoolman-import]', msg); };

    const spoolmanPost = async (path, body) => {
        const r = await fetch(`${url}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10000),
        });
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            throw new Error(err.detail || err.message || `HTTP ${r.status}`);
        }
        return r.json();
    };

    const spoolmanGet = async (path) => {
        const r = await fetch(`${url}${path}`, { signal: AbortSignal.timeout(10000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
    };

    /** Apply field mappings to an extra object, skipping fields mapped to '__skip__'. */
    const applyMappings = (extra, entityType) => {
        if (!extra) return undefined;
        if (fieldMappings[entityType]) {
            const mapped = {};
            for (const [k, v] of Object.entries(extra)) {
                const mapping = fieldMappings[entityType][k];
                if (mapping === '__skip__') continue;
                mapped[mapping || k] = v;
            }
            return Object.keys(mapped).length ? mapped : undefined;
        }
        return Object.keys(extra).length ? extra : undefined;
    };

    try {
        // Create missing fields first
        for (const fieldDef of createFields) {
            const { entity, key, ...def } = fieldDef;
            try {
                // POST /api/v1/field/{entity}/{key}
                await spoolmanPost(`/api/v1/field/${entity}/${key}`, def);
                push(`Created field "${def.name || key}" on ${entity}`);
            } catch (err) {
                push(`  Warning: could not create field "${key}": ${err.message}`);
            }
        }

        const vendorIdMap = {};
        const filamentIdMap = {};

        // Pre-fetch existing vendors so we can remap IDs even if creation fails (already exists)
        const existingVendors = await spoolmanGet('/api/v1/vendor').catch(() => []);
        const existingVendorByName = Object.fromEntries(existingVendors.map(v => [v.name.toLowerCase(), v.id]));

        // Vendors
        push(`Importing ${data.vendors?.length || 0} vendors…`);
        for (const v of (data.vendors || [])) {
            const { id, registered, extra, ...fields } = v;
            const mappedExtra = applyMappings(extra, 'vendor');
            if (mappedExtra) fields.extra = mappedExtra;
            try {
                const created = await spoolmanPost('/api/v1/vendor', fields);
                vendorIdMap[id] = created.id;
            } catch {
                // Already exists — remap to the existing vendor's ID so filaments link correctly
                const existingId = existingVendorByName[v.name?.toLowerCase()];
                if (existingId) {
                    vendorIdMap[id] = existingId;
                    push(`  Vendor "${v.name}" already exists, remapped to id=${existingId}`);
                } else {
                    push(`  Vendor "${v.name}" skipped (could not find existing match)`);
                }
            }
        }

        // Filaments
        if (currencyRate) push(`Converting prices with rate ×${currencyRate}`);
        push(`Importing ${data.filaments?.length || 0} filaments…`);
        for (const f of (data.filaments || [])) {
            const { id, registered, vendor, extra, ...fields } = f;
            if (vendor?.id !== undefined) {
                const newVendorId = vendorIdMap[vendor.id];
                if (newVendorId) fields.vendor_id = newVendorId;
                // If vendor couldn't be mapped, omit vendor_id (create filament without vendor)
            }
            // Convert price if currency rate provided
            if (currencyRate && fields.price != null) {
                fields.price = Math.round(fields.price * currencyRate * 100) / 100;
            }
            const mappedExtra = applyMappings(extra, 'filament');
            if (mappedExtra) fields.extra = mappedExtra;
            try {
                const created = await spoolmanPost('/api/v1/filament', fields);
                filamentIdMap[id] = created.id;
            } catch (err) {
                push(`  Filament "${f.name}" skipped: ${err.message}`);
            }
        }

        // Spools
        push(`Importing ${data.spools?.length || 0} spools…`);
        let spoolsOk = 0;
        for (const s of (data.spools || [])) {
            const { id, registered, filament, extra, ...fields } = s;
            // Spoolman rejects requests that include both; prefer remaining_weight.
            if (fields.remaining_weight != null) delete fields.used_weight;
            if (filament?.id !== undefined) {
                const newId = filamentIdMap[filament.id];
                if (!newId) { push(`  Spool id=${id} skipped: filament not found`); continue; }
                fields.filament_id = newId;
            }
            if (currencyRate && fields.price != null) {
                fields.price = Math.round(fields.price * currencyRate * 100) / 100;
            }
            const mappedExtra = applyMappings(extra, 'spool');
            if (mappedExtra) fields.extra = mappedExtra;
            try {
                await spoolmanPost('/api/v1/spool', fields);
                spoolsOk++;
            } catch (err) {
                push(`  Spool id=${id} skipped: ${err.message}`);
            }
        }
        push(`${spoolsOk} spools imported.`);
        push('Import complete.');
        res.json({ ok: true, log });
    } catch (err) {
        push(`Fatal: ${err.message}`);
        res.status(500).json({ error: err.message, log });
    }
});

// GET /api/spoolman/exchange-rate?from=USD&to=EUR — fetch live exchange rate
router.get('/exchange-rate', async (req, res) => {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to query params required' });
    if (from === to) return res.json({ rate: 1, from, to });
    try {
        // Use the free frankfurter.app API (no key required)
        const r = await fetch(
            `https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
            { signal: AbortSignal.timeout(5000) }
        );
        if (!r.ok) throw new Error(`Exchange rate API returned ${r.status}`);
        const data = await r.json();
        const rate = data.rates?.[to.toUpperCase()];
        if (!rate) throw new Error(`No rate found for ${from} → ${to}`);
        res.json({ rate, from: data.base, to: to.toUpperCase() });
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// ── Service status (bundled containers / external URLs) ──────────────────────

const IS_DOCKER = process.env.MARATHON_DEPLOY_MODE === 'docker';

const BUNDLED_SPOOLMAN_URL = 'http://marathon-spoolman:8000';

async function httpPing(url, timeoutMs = 3000) {
    try {
        await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
        return true; // any HTTP response means server is up
    } catch { return false; }
}

/** Returns the first non-loopback LAN IPv4 (prefers 192.168/10.x over Docker 172.x). */
function getLanIp() {
    const ifaces = os.networkInterfaces();
    let fallback = null;
    for (const iface of Object.values(ifaces).flat()) {
        if (iface.family !== 'IPv4' || iface.internal) continue;
        if (iface.address.startsWith('192.168.') || iface.address.startsWith('10.')) return iface.address;
        fallback ??= iface.address;
    }
    return fallback;
}

// GET /api/spoolman/services/status — deploy mode + Spoolman reachability
router.get('/services/status', async (req, res) => {
    const spoolmanUrl = getSpoolmanUrl();
    const reachable = spoolmanUrl ? await httpPing(`${spoolmanUrl}/api/v1/health`) : false;

    let externalUrl = null;
    if (IS_DOCKER) {
        // In Docker: host is visible via the browser's request Host header (works when accessed via LAN IP)
        const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0];
        const port = process.env.SPOOLMAN_PORT || '7912';
        const resolvedHost = (host && host !== 'localhost' && host !== '127.0.0.1') ? host : getLanIp();
        if (resolvedHost) externalUrl = `http://${resolvedHost}:${port}`;
    } else if (spoolmanUrl) {
        // Native: use the server's own LAN IP + port from the configured Spoolman URL
        const lanIp = getLanIp();
        try {
            const port = new URL(spoolmanUrl).port || '7912';
            if (lanIp) externalUrl = `http://${lanIp}:${port}`;
        } catch { /* invalid URL, skip */ }
    }

    res.json({
        deployMode: IS_DOCKER ? 'docker' : 'native',
        lanIp: getLanIp(),
        spoolman: {
            reachable,
            configuredUrl: spoolmanUrl,
            bundledUrl: IS_DOCKER ? BUNDLED_SPOOLMAN_URL : null,
            externalUrl,
        },
    });
});

// GET /api/spoolman/test — test connection to Spoolman
router.get('/test', async (_req, res) => {
    const url = getSpoolmanUrl();
    if (!url) return res.status(400).json({ error: 'Spoolman URL not configured' });
    try {
        const r = await fetch(`${url}/api/v1/health`, { signal: AbortSignal.timeout(5000) });
        res.json({ ok: r.ok, status: r.status });
    } catch (err) {
        res.json({ ok: false, error: err.message });
    }
});

// ── Teamster (load cell scale) proxy ─────────────────────────────────────────

function getTeamsterUrl() {
    const db = getDb();
    const row = db.prepare("SELECT value FROM settings WHERE key = 'teamster_url'").get();
    return row?.value || '';
}


/** GET /api/spoolman/teamster/weight — fetch live weight from the Teamster ESP device */
router.get('/teamster/weight', async (_req, res) => {
    const url = getTeamsterUrl();
    if (!url) return res.status(400).json({ error: 'Teamster URL not configured' });
    try {
        const r = await fetch(`${url}/data`, { signal: AbortSignal.timeout(5000) });
        if (!r.ok) return res.status(502).json({ error: `Device returned ${r.status}` });
        const data = await r.json();
        res.json({ weight_g: data.weight_g, ready: data.ready, stable: data.stable ?? false });
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

/** POST /api/spoolman/teamster/tare — zero the scale */
router.post('/teamster/tare', async (_req, res) => {
    const url = getTeamsterUrl();
    if (!url) return res.status(400).json({ error: 'Teamster URL not configured' });
    try {
        const r = await fetch(`${url}/tare`, { method: 'POST', signal: AbortSignal.timeout(5000) });
        res.json({ ok: r.ok });
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

/** POST /api/spoolman/teamster/calibrate — calibrate with a known weight */
router.post('/teamster/calibrate', async (req, res) => {
    const url = getTeamsterUrl();
    if (!url) return res.status(400).json({ error: 'Teamster URL not configured' });
    const { grams } = req.body;
    if (!grams || isNaN(grams)) return res.status(400).json({ error: 'grams required' });
    try {
        const r = await fetch(`${url}/calibrate?grams=${encodeURIComponent(grams)}`, { method: 'POST', signal: AbortSignal.timeout(5000) });
        res.json({ ok: r.ok });
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

/** GET /api/spoolman/teamster/test — check connectivity to the Teamster device */
router.get('/teamster/test', async (_req, res) => {
    const url = getTeamsterUrl();
    if (!url) return res.status(400).json({ error: 'Teamster URL not configured' });
    try {
        const r = await fetch(`${url}/data`, { signal: AbortSignal.timeout(5000) });
        const data = r.ok ? await r.json() : null;
        res.json({ ok: r.ok, weight_g: data?.weight_g, ready: data?.ready });
    } catch (err) {
        res.json({ ok: false, error: err.message });
    }
});

module.exports = router;
