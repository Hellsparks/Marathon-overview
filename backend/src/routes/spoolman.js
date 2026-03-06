const express = require('express');
const { getDb } = require('../db');
const MoonrakerClient = require('../services/moonraker');
const BambuClient = require('../services/bambu');
const printerCache = require('../services/printerCache');

const router = express.Router();

/** Helper: get Spoolman URL from settings */
function getSpoolmanUrl() {
    const db = getDb();
    const row = db.prepare("SELECT value FROM settings WHERE key = 'spoolman_url'").get();
    return row?.value || '';
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
                const colorHex = (filament.color_hex || 'FFFFFF').toUpperCase() + 'FF'; // RRGGBBAA
                const material = (filament.material || 'PLA').toUpperCase();
                const nozzleTempMin = filament.settings_nozzle_temperature
                    ? Math.max(150, filament.settings_nozzle_temperature - 20)
                    : 190;
                const nozzleTempMax = filament.settings_nozzle_temperature
                    ? Math.min(300, filament.settings_nozzle_temperature + 20)
                    : 230;

                await client.setAmsTray(tray, {
                    tray_type: material,
                    tray_color: colorHex,
                    nozzle_temp_min: nozzleTempMin,
                    nozzle_temp_max: nozzleTempMax,
                });

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
