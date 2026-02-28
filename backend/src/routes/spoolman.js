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
