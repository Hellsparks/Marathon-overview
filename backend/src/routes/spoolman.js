const express = require('express');
const { getDb } = require('../db');
const MoonrakerClient = require('../services/moonraker');

const router = express.Router();

/** Helper: get Spoolman URL from settings */
function getSpoolmanUrl() {
    const db = getDb();
    const row = db.prepare("SELECT value FROM settings WHERE key = 'spoolman_url'").get();
    return row?.value || '';
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

// POST /api/spoolman/set-active — set active spool on a printer (via Moonraker)
router.post('/set-active', async (req, res) => {
    const { printerId, spoolId } = req.body;
    if (!printerId) return res.status(400).json({ error: 'printerId required' });
    const db = getDb();
    const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(printerId);
    if (!printer) return res.status(404).json({ error: 'Printer not found' });
    try {
        const client = new MoonrakerClient(printer);
        const r = await fetch(
            `${client.baseUrl}/server/spoolman/spool_id`,
            {
                method: 'POST',
                headers: client._headers(),
                body: JSON.stringify({ spool_id: spoolId ?? null }),
                signal: AbortSignal.timeout(5000),
            }
        );
        if (!r.ok) throw new Error(`Moonraker ${r.status}`);
        res.json(await r.json());
    } catch (err) {
        res.status(502).json({ error: err.message });
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
