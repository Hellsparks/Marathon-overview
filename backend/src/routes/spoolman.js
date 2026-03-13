const express = require('express');
const net = require('net');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db');
const MoonrakerClient = require('../services/moonraker');
const BambuClient = require('../services/bambu');
const printerCache = require('../services/printerCache');
const { clearSpoolCache } = require('../services/poller');

const router = express.Router();

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

function getNearestBambuColor(hexStr) {
    if (!hexStr) return 'FFFFFFFF';

    // Convert a hex string to an array [r, g, b]
    const hexToRgb = (h) => {
        h = h.replace(/^#/, '');
        if (h.length === 3) h = h.split('').map(c => c + c).join('');
        const arr = [...h.matchAll(/[a-f0-9]{2}/gi)].map(m => parseInt(m[0], 16));
        return arr.length >= 3 ? arr.slice(0, 3) : [255, 255, 255];
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
                const colorHex = getNearestBambuColor(filament.color_hex);
                const material = (filament.material || 'PLA').toUpperCase();
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
                console.log(`[Bambu] setAmsTray completed for printer ${printerId} tray ${tray}`);

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
            const err = await r.json().catch(() => ({ message: r.statusText }));
            return res.status(r.status).json({ error: err.message || r.statusText });
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
        const r = await fetch(`${url}/api/v1/spool/${req.params.id}/measure`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ weight }),
            signal: AbortSignal.timeout(5000),
        });
        if (!r.ok) {
            const err = await r.json().catch(() => ({ message: r.statusText }));
            return res.status(r.status).json({ error: err.message || r.statusText });
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
            const err = await r.json().catch(() => ({ message: r.statusText }));
            return res.status(r.status).json({ error: err.message || r.statusText });
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
            const err = await r.json().catch(() => ({ message: r.statusText }));
            return res.status(r.status).json({ error: err.message || r.statusText });
        }
        res.json(await r.json());
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// POST /api/spoolman/spools — create a spool
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
            const err = await r.json().catch(() => ({ message: r.statusText }));
            return res.status(r.status).json({ error: err.message || r.statusText });
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
            const err = await r.json().catch(() => ({ message: r.statusText }));
            return res.status(r.status).json({ error: err.message || r.statusText });
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
        const r = await fetch(`${url}/api/v1/field/${req.params.entity}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body),
            signal: AbortSignal.timeout(5000),
        });
        if (!r.ok) {
            const err = await r.json().catch(() => ({ message: r.statusText }));
            return res.status(r.status).json({ error: err.message || r.statusText });
        }
        res.json(await r.json());
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
            const err = await r.json().catch(() => ({ message: r.statusText }));
            return res.status(r.status).json({ error: err.message || r.statusText });
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
            const err = await r.json().catch(() => ({ message: r.statusText }));
            return res.status(r.status).json({ error: err.message || r.statusText });
        }
        res.json({ ok: true });
    } catch (err) {
        res.status(502).json({ error: err.message });
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
            const err = await r.json().catch(() => ({ message: r.statusText }));
            return res.status(r.status).json({ error: err.message || r.statusText });
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
            const err = await r.json().catch(() => ({ message: r.statusText }));
            return res.status(r.status).json({ error: err.message || r.statusText });
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

// GET /api/spoolman/export — download all Spoolman data as a JSON backup
router.get('/export', async (_req, res) => {
    const url = getSpoolmanUrl();
    if (!url) return res.status(400).json({ error: 'Spoolman URL not configured' });
    try {
        const fetchJson = async (path) => {
            const r = await fetch(`${url}${path}`, { signal: AbortSignal.timeout(15000) });
            if (!r.ok) throw new Error(`Spoolman ${r.status} for ${path}`);
            return r.json();
        };
        const [vendors, filaments, spools, vendorFields, filamentFields, spoolFields] = await Promise.all([
            fetchJson('/api/v1/vendor'),
            fetchJson('/api/v1/filament'),
            fetchJson('/api/v1/spool'),
            fetchJson('/api/v1/field/vendor').catch(() => []),
            fetchJson('/api/v1/field/filament').catch(() => []),
            fetchJson('/api/v1/field/spool').catch(() => []),
        ]);
        const dateStr = new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Disposition', `attachment; filename="spoolman-backup-${dateStr}.json"`);
        res.setHeader('Content-Type', 'application/json');
        res.json({
            export_version: 1,
            exported_at: new Date().toISOString(),
            vendors,
            filaments,
            spools,
            custom_fields: { vendor: vendorFields, filament: filamentFields, spool: spoolFields },
        });
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
    if (!data || data.export_version !== 1) {
        return res.status(400).json({ error: 'Invalid export file (missing export_version: 1)' });
    }

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

    try {
        const vendorIdMap = {};
        const filamentIdMap = {};

        // Vendors
        push(`Importing ${data.vendors?.length || 0} vendors…`);
        for (const v of (data.vendors || [])) {
            const { id, registered, extra, ...fields } = v;
            if (extra && Object.keys(extra).length) fields.extra = extra;
            try {
                const created = await spoolmanPost('/api/v1/vendor', fields);
                vendorIdMap[id] = created.id;
            } catch (err) {
                push(`  Vendor "${v.name}" skipped: ${err.message}`);
            }
        }

        // Filaments
        push(`Importing ${data.filaments?.length || 0} filaments…`);
        for (const f of (data.filaments || [])) {
            const { id, registered, vendor, extra, ...fields } = f;
            if (vendor?.id !== undefined) fields.vendor_id = vendorIdMap[vendor.id] ?? null;
            if (extra && Object.keys(extra).length) fields.extra = extra;
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
            if (filament?.id !== undefined) {
                const newId = filamentIdMap[filament.id];
                if (!newId) { push(`  Spool id=${id} skipped: filament not found`); continue; }
                fields.filament_id = newId;
            }
            if (extra && Object.keys(extra).length) fields.extra = extra;
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

// ── Docker management ─────────────────────────────────────────────────────────

const DOCKER_SOCKET = '/var/run/docker.sock';
const SPOOLMAN_CONTAINER = 'marathon-spoolman';
const SPOOLMAN_IMAGE = 'ghcr.io/donkie/spoolman:latest';
const SPOOLMAN_VOLUME = 'spoolman_data';
const SPOOLMAN_NETWORK = 'marathon_net';

const IS_DOCKER = process.env.MARATHON_DEPLOY_MODE === 'docker';

/** HTTP call over the Docker socket (Docker-mode only). */
function dockerCall(method, path, body) {
    return new Promise((resolve, reject) => {
        const client = net.createConnection({ path: DOCKER_SOCKET });
        let raw = '';
        const bodyStr = body ? JSON.stringify(body) : '';
        let req = `${method} ${path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n`;
        if (bodyStr) req += `Content-Type: application/json\r\nContent-Length: ${Buffer.byteLength(bodyStr)}\r\n`;
        req += '\r\n';
        if (bodyStr) req += bodyStr;
        client.write(req);
        client.on('data', chunk => { raw += chunk.toString(); });
        client.on('end', () => {
            const sep = raw.indexOf('\r\n\r\n');
            const headers = sep >= 0 ? raw.slice(0, sep) : '';
            const bodyText = sep >= 0 ? raw.slice(sep + 4) : raw;
            const statusCode = parseInt((headers.split('\r\n')[0] || '').split(' ')[1]) || 0;
            let parsed;
            try { parsed = JSON.parse(bodyText); } catch { parsed = bodyText; }
            if (statusCode >= 400) {
                reject(new Error((typeof parsed === 'object' && parsed?.message) ? parsed.message : `Docker ${statusCode}`));
            } else {
                resolve(parsed);
            }
        });
        client.on('error', reject);
        client.setTimeout(300000, () => { client.destroy(); reject(new Error('Docker socket timeout')); });
    });
}

/** Run a docker CLI command (non-Docker-mode). Resolves with stdout. */
function cliRun(cmd, timeoutMs = 300000) {
    return new Promise((resolve, reject) => {
        const child = exec(cmd, { timeout: timeoutMs }, (err, stdout, stderr) => {
            if (err) reject(new Error(stderr?.trim() || err.message));
            else resolve(stdout.trim());
        });
        void child;
    });
}

/** Check whether the docker CLI is accessible. */
async function dockerCliAvailable() {
    try { await cliRun('docker --version', 5000); return true; } catch { return false; }
}

// GET /api/spoolman/docker/status
router.get('/docker/status', async (_req, res) => {
    if (IS_DOCKER) {
        try {
            const info = await dockerCall('GET', `/containers/${SPOOLMAN_CONTAINER}/json`);
            return res.json({
                available: true,
                mode: 'docker',
                created: true,
                running: info.State?.Running || false,
                status: info.State?.Status || 'unknown',
            });
        } catch {
            return res.json({ available: true, mode: 'docker', created: false, running: false, status: 'not_created' });
        }
    }

    // Non-Docker mode: check via CLI
    if (!await dockerCliAvailable()) {
        return res.json({ available: false, reason: 'docker_not_found' });
    }
    try {
        const out = await cliRun(`docker inspect --format="{{json .State}}" ${SPOOLMAN_CONTAINER}`, 5000);
        const state = JSON.parse(out.replace(/^"|"$/g, ''));
        return res.json({
            available: true,
            mode: 'cli',
            created: true,
            running: state.Running || false,
            status: state.Status || 'unknown',
        });
    } catch {
        return res.json({ available: true, mode: 'cli', created: false, running: false, status: 'not_created' });
    }
});

// POST /api/spoolman/docker/install — body: { port: 7912 }
router.post('/docker/install', async (req, res) => {
    const port = parseInt(req.body?.port) || 7912;
    if (port < 1025 || port > 65535) return res.status(400).json({ error: 'port must be between 1025 and 65535' });
    const log = [];
    const push = msg => { log.push(msg); console.log('[spoolman-install]', msg); };

    try {
        if (IS_DOCKER) {
            // ── Socket API (in Docker Compose stack) ──
            push(`Pulling ${SPOOLMAN_IMAGE}…`);
            await dockerCall('POST', `/images/create?fromImage=${encodeURIComponent('ghcr.io/donkie/spoolman')}&tag=latest`);
            push('Image pulled.');

            push('Creating data volume…');
            await dockerCall('POST', '/volumes/create', { Name: SPOOLMAN_VOLUME }).catch(() => {});
            push('Volume ready.');

            push('Creating container…');
            await dockerCall('POST', `/containers/create?name=${SPOOLMAN_CONTAINER}`, {
                Image: SPOOLMAN_IMAGE,
                ExposedPorts: { '8000/tcp': {} },
                HostConfig: {
                    Binds: [`${SPOOLMAN_VOLUME}:/home/app/.local/share/spoolman`],
                    PortBindings: { '8000/tcp': [{ HostPort: String(port) }] },
                    RestartPolicy: { Name: 'unless-stopped' },
                    NetworkMode: SPOOLMAN_NETWORK,
                },
            });
            push('Container created.');

            push('Starting container…');
            await dockerCall('POST', `/containers/${SPOOLMAN_CONTAINER}/start`);
            push('Container started.');

            // Use internal hostname — backend can reach Spoolman over marathon_net
            const spoolmanUrl = `http://${SPOOLMAN_CONTAINER}:8000`;
            getDb().prepare(`INSERT INTO settings (key, value) VALUES ('spoolman_url', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(spoolmanUrl);
            push(`Spoolman URL set to ${spoolmanUrl}`);
            return res.json({ ok: true, log, spoolmanUrl, externalPort: port });

        } else {
            // ── Docker CLI (direct / Windows deployment) ──
            if (!await dockerCliAvailable()) {
                return res.status(400).json({ error: 'Docker is not installed or not in PATH', log });
            }

            push(`Pulling ${SPOOLMAN_IMAGE}…`);
            await cliRun(`docker pull ${SPOOLMAN_IMAGE}`);
            push('Image pulled.');

            push('Creating data volume…');
            await cliRun(`docker volume create ${SPOOLMAN_VOLUME}`).catch(() => {});
            push('Volume ready.');

            push('Creating and starting container…');
            await cliRun(
                `docker run -d --name ${SPOOLMAN_CONTAINER} --restart unless-stopped` +
                ` -p ${port}:8000` +
                ` -v ${SPOOLMAN_VOLUME}:/home/app/.local/share/spoolman` +
                ` ${SPOOLMAN_IMAGE}`
            );
            push('Container started.');

            // In non-Docker mode the backend isn't in a shared network, so use localhost
            const spoolmanUrl = `http://localhost:${port}`;
            getDb().prepare(`INSERT INTO settings (key, value) VALUES ('spoolman_url', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(spoolmanUrl);
            push(`Spoolman URL set to ${spoolmanUrl}`);
            return res.json({ ok: true, log, spoolmanUrl, externalPort: port });
        }
    } catch (err) {
        push(`Error: ${err.message}`);
        res.status(500).json({ error: err.message, log });
    }
});

// DELETE /api/spoolman/docker/uninstall — query: removeData=true to also delete the volume
router.delete('/docker/uninstall', async (req, res) => {
    const removeData = req.query.removeData === 'true';
    const log = [];
    const push = msg => { log.push(msg); console.log('[spoolman-uninstall]', msg); };

    try {
        if (IS_DOCKER) {
            // ── Socket API ──
            push('Stopping container…');
            await dockerCall('POST', `/containers/${SPOOLMAN_CONTAINER}/stop`).catch(() => {});
            push('Removing container…');
            await dockerCall('DELETE', `/containers/${SPOOLMAN_CONTAINER}`);
            push('Container removed.');
            if (removeData) {
                push('Removing data volume…');
                await dockerCall('DELETE', `/volumes/${SPOOLMAN_VOLUME}`);
                push('Volume removed.');
            }
        } else {
            // ── Docker CLI ──
            if (!await dockerCliAvailable()) {
                return res.status(400).json({ error: 'Docker is not installed or not in PATH', log });
            }
            push('Stopping container…');
            await cliRun(`docker stop ${SPOOLMAN_CONTAINER}`).catch(() => {});
            push('Removing container…');
            await cliRun(`docker rm ${SPOOLMAN_CONTAINER}`);
            push('Container removed.');
            if (removeData) {
                push('Removing data volume…');
                await cliRun(`docker volume rm ${SPOOLMAN_VOLUME}`);
                push('Volume removed.');
            }
        }

        res.json({ ok: true, log });
    } catch (err) {
        push(`Error: ${err.message}`);
        res.status(500).json({ error: err.message, log });
    }
});

// ── Native (Python venv) Spoolman management ─────────────────────────────────

// Install directory lives alongside the Marathon SQLite database
const NATIVE_DIR = process.env.DB_PATH
    ? path.join(path.dirname(process.env.DB_PATH), 'spoolman')
    : path.join(process.cwd(), 'data', 'spoolman');
const NATIVE_PID_FILE  = path.join(NATIVE_DIR, 'spoolman.pid');
const NATIVE_PORT_FILE = path.join(NATIVE_DIR, 'spoolman.port');
const NATIVE_LOG_FILE  = path.join(NATIVE_DIR, 'spoolman.log');

function nativeVenv() {
    const isWin = process.platform === 'win32';
    const venv  = path.join(NATIVE_DIR, 'venv');
    return {
        dir:      venv,
        python:   isWin ? path.join(venv, 'Scripts', 'python.exe') : path.join(venv, 'bin', 'python'),
        spoolman: isWin ? path.join(venv, 'Scripts', 'spoolman.exe') : path.join(venv, 'bin', 'spoolman'),
    };
}

/** Try python3 / python / py and return the first that resolves to Python 3.8+. */
async function findPython() {
    for (const cmd of ['python3', 'python', 'py']) {
        try {
            const out = await cliRun(`${cmd} --version`, 5000);
            const m = out.match(/Python (\d+)\.(\d+)/);
            if (m && (parseInt(m[1]) > 3 || (parseInt(m[1]) === 3 && parseInt(m[2]) >= 8)))
                return { cmd, version: `${m[1]}.${m[2]}` };
        } catch { /* not found */ }
    }
    return null;
}

function nativePid() {
    try { return parseInt(fs.readFileSync(NATIVE_PID_FILE, 'utf8').trim()) || null; } catch { return null; }
}
function nativePort() {
    try { return parseInt(fs.readFileSync(NATIVE_PORT_FILE, 'utf8').trim()) || 7912; } catch { return 7912; }
}
function pidAlive(pid) {
    if (!pid) return false;
    try { process.kill(pid, 0); return true; } catch { return false; }
}

/** Spawn Spoolman in the background and return its PID. */
function spawnSpoolman(port) {
    const venv    = nativeVenv();
    const dataDir = path.join(NATIVE_DIR, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    const logFd = fs.openSync(NATIVE_LOG_FILE, 'a');
    const child = spawn(venv.spoolman, [], {
        detached: true,
        stdio: ['ignore', logFd, logFd],
        env: { ...process.env, SPOOLMAN_HOST: '0.0.0.0', SPOOLMAN_PORT: String(port), SPOOLMAN_DATA_DIR: dataDir },
    });
    child.unref();
    fs.closeSync(logFd);
    return child.pid || null;
}

// GET /api/spoolman/native/status
router.get('/native/status', async (_req, res) => {
    const py        = await findPython();
    const venv      = nativeVenv();
    const installed = fs.existsSync(venv.spoolman);
    const pid       = nativePid();
    const running   = installed && pidAlive(pid);
    res.json({
        pythonAvailable: !!py,
        pythonVersion:   py?.version || null,
        installed,
        running,
        pid:     running ? pid : null,
        port:    nativePort(),
        installDir: NATIVE_DIR,
    });
});

// POST /api/spoolman/native/install — body: { port: 7912 }
router.post('/native/install', async (req, res) => {
    const port = parseInt(req.body?.port) || 7912;
    if (port < 1025 || port > 65535) return res.status(400).json({ error: 'port must be between 1025 and 65535' });
    const log  = [];
    const push = msg => { log.push(msg); console.log('[spoolman-native]', msg); };

    try {
        const py = await findPython();
        if (!py) return res.status(400).json({ error: 'Python 3.8+ not found. Please install Python first.', log });
        push(`Python ${py.version} found (${py.cmd})`);

        fs.mkdirSync(NATIVE_DIR, { recursive: true });

        const venv = nativeVenv();
        if (!fs.existsSync(venv.dir)) {
            push('Creating virtual environment…');
            await cliRun(`"${py.cmd}" -m venv "${venv.dir}"`);
            push('Virtual environment created.');
        } else {
            push('Virtual environment already exists.');
        }

        push('Installing Spoolman (this may take a minute)…');
        await cliRun(`"${venv.python}" -m pip install --upgrade spoolman`);
        push('Spoolman installed.');

        if (!fs.existsSync(venv.spoolman)) {
            throw new Error('Spoolman executable not found after install — check pip output above.');
        }

        fs.writeFileSync(NATIVE_PORT_FILE, String(port));

        push('Starting Spoolman…');
        const pid = spawnSpoolman(port);
        if (!pid) throw new Error('Process failed to start.');

        // Brief check that the process didn't exit immediately
        await new Promise(r => setTimeout(r, 800));
        if (!pidAlive(pid)) throw new Error('Spoolman exited immediately. Check ' + NATIVE_LOG_FILE);

        fs.writeFileSync(NATIVE_PID_FILE, String(pid));
        push(`Spoolman started (PID ${pid}).`);

        const spoolmanUrl = `http://localhost:${port}`;
        getDb().prepare(`INSERT INTO settings (key, value) VALUES ('spoolman_url', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(spoolmanUrl);
        push(`Spoolman URL set to ${spoolmanUrl}`);

        res.json({ ok: true, log, spoolmanUrl, port });
    } catch (err) {
        push(`Error: ${err.message}`);
        res.status(500).json({ error: err.message, log });
    }
});

// POST /api/spoolman/native/start — start an already-installed Spoolman
router.post('/native/start', async (req, res) => {
    const log  = [];
    const push = msg => { log.push(msg); console.log('[spoolman-native]', msg); };
    try {
        const venv = nativeVenv();
        if (!fs.existsSync(venv.spoolman))
            return res.status(400).json({ error: 'Spoolman is not installed. Use /native/install first.', log });

        const existingPid = nativePid();
        if (pidAlive(existingPid))
            return res.json({ ok: true, log: ['Already running'], pid: existingPid, port: nativePort() });

        const port = nativePort();
        const pid  = spawnSpoolman(port);
        if (!pid) throw new Error('Process failed to start.');
        await new Promise(r => setTimeout(r, 800));
        if (!pidAlive(pid)) throw new Error('Spoolman exited immediately. Check ' + NATIVE_LOG_FILE);

        fs.writeFileSync(NATIVE_PID_FILE, String(pid));
        push(`Spoolman started (PID ${pid}) on port ${port}`);
        res.json({ ok: true, log, pid, port });
    } catch (err) {
        push(`Error: ${err.message}`);
        res.status(500).json({ error: err.message, log });
    }
});

// POST /api/spoolman/native/stop
router.post('/native/stop', (_req, res) => {
    const pid = nativePid();
    if (!pid || !pidAlive(pid)) return res.json({ ok: true, message: 'Not running' });
    try {
        process.kill(pid);
        setTimeout(() => fs.unlink(NATIVE_PID_FILE, () => {}), 500);
        res.json({ ok: true, message: `Stopped PID ${pid}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/spoolman/native/uninstall
// query: removeData=true removes everything including the data directory
router.delete('/native/uninstall', async (req, res) => {
    const removeData = req.query.removeData === 'true';
    const log  = [];
    const push = msg => { log.push(msg); console.log('[spoolman-native]', msg); };
    try {
        const pid = nativePid();
        if (pid && pidAlive(pid)) {
            push(`Stopping Spoolman (PID ${pid})…`);
            process.kill(pid);
            push('Stopped.');
        }

        if (removeData) {
            push(`Removing ${NATIVE_DIR}…`);
            fs.rmSync(NATIVE_DIR, { recursive: true, force: true });
            push('Removed.');
        } else {
            // Keep the data subfolder, remove only the venv
            const venv = nativeVenv();
            if (fs.existsSync(venv.dir)) {
                push('Removing virtual environment…');
                fs.rmSync(venv.dir, { recursive: true, force: true });
            }
            try { fs.unlinkSync(NATIVE_PID_FILE); } catch { /* ok */ }
            push('Spoolman uninstalled (data directory preserved).');
        }

        res.json({ ok: true, log });
    } catch (err) {
        push(`Error: ${err.message}`);
        res.status(500).json({ error: err.message, log });
    }
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

module.exports = router;
