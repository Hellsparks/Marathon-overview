const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

// GET /api/setup/status — check if setup wizard is needed
router.get('/status', (_req, res) => {
    const db = getDb();
    const row = db.prepare("SELECT value FROM settings WHERE key = 'setup_completed'").get();
    const completed = row?.value === 'true';
    res.json({ setup_completed: completed });
});

// POST /api/setup/complete — mark setup as done
router.post('/complete', (_req, res) => {
    const db = getDb();
    const info = db.prepare("UPDATE settings SET value = 'true' WHERE key = 'setup_completed'").run();
    if (info.changes === 0) {
        db.prepare("INSERT INTO settings (key, value) VALUES ('setup_completed', 'true')").run();
    }
    res.json({ ok: true });
});

// POST /api/setup/reset — allow re-running the wizard from Settings
router.post('/reset', (_req, res) => {
    const db = getDb();
    db.prepare("UPDATE settings SET value = 'false' WHERE key = 'setup_completed'").run();
    res.json({ ok: true });
});

// POST /api/setup/spoolman — test and save Spoolman connection
router.post('/spoolman', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'url is required' });

    // Test connection
    try {
        const testUrl = url.replace(/\/$/, '') + '/api/v1/info';
        const r = await fetch(testUrl, { signal: AbortSignal.timeout(5000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const info = await r.json();

        // Save the URL
        const db = getDb();
        const upd = db.prepare("UPDATE settings SET value = ? WHERE key = 'spoolman_url'").run(url);
        if (upd.changes === 0) {
            db.prepare("INSERT INTO settings (key, value) VALUES ('spoolman_url', ?)").run(url);
        }

        // Auto-create all extra fields in Spoolman (always, regardless of feature toggles)
        const baseUrl = url.replace(/\/$/, '');
        const fieldsCreated = [];
        const extraFields = [
            { entity: 'filament', payload: { name: 'Link', key: 'url', field_type: 'text' }, setting: 'url_extra_field' },
            { entity: 'filament', payload: { name: 'Hueforge TD', key: 'hue_td', field_type: 'float', unit: 'TD' }, setting: 'hueforge_td_field' },
            { entity: 'filament', payload: { name: 'Has printed swatch', key: 'swatch', field_type: 'boolean' }, setting: 'swatch_extra_field' },
            { entity: 'filament', payload: { name: 'OrcaSlicer Config', key: 'orcaslicer_config', field_type: 'text' }, setting: 'orcaslicer_config_field' },
            { entity: 'filament', payload: { name: 'Material Modifier', key: 'material_modifier', field_type: 'text' }, setting: 'material_modifier_field' },
        ];

        for (const { entity, payload, setting } of extraFields) {
            try {
                // Check if field already exists by listing all fields
                const listRes = await fetch(`${baseUrl}/api/v1/field/${entity}`, { signal: AbortSignal.timeout(5000) });
                if (listRes.ok) {
                    const fields = await listRes.json();
                    if (fields.find(f => f.key === payload.key)) {
                        const upsert = db.prepare("UPDATE settings SET value = ? WHERE key = ?").run(payload.key, setting);
                        if (upsert.changes === 0) db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(setting, payload.key);
                        fieldsCreated.push(payload.key);
                        continue;
                    }
                }
                // Create: POST /api/v1/field/{entity}/{key}
                const { key, ...body } = payload;
                const createRes = await fetch(`${baseUrl}/api/v1/field/${entity}/${key}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                    signal: AbortSignal.timeout(5000)
                });
                if (createRes.ok) {
                    const upsert = db.prepare("UPDATE settings SET value = ? WHERE key = ?").run(payload.key, setting);
                    if (upsert.changes === 0) db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(setting, payload.key);
                    fieldsCreated.push(payload.key);
                }
            } catch {
                // Non-fatal — field creation is best-effort
            }
        }

        res.json({ ok: true, version: info.version || 'unknown', fields_created: fieldsCreated });
    } catch (err) {
        res.status(502).json({ error: `Cannot reach Spoolman: ${err.message}` });
    }
});

// GET /api/setup/check-deps — check optional dependency status
router.get('/check-deps', (_req, res) => {
    const { execSync } = require('child_process');
    const os = require('os');
    const path = require('path');
    const fs = require('fs');
    const deps = {};

    function findBin(cmd) {
        try {
            const out = execSync(process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`,
                { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
            const p = out.trim().split('\n')[0].trim();
            if (p) return p;
        } catch { /* fall through */ }
        const home = os.homedir();
        const candidates = process.platform === 'win32'
            ? [path.join(home, '.cargo', 'bin', cmd + '.exe')]
            : [path.join(home, '.local', 'bin', cmd), path.join(home, '.cargo', 'bin', cmd)];
        return candidates.find(p => { try { return fs.existsSync(p); } catch { return false; } }) || null;
    }

    // Check uv
    const uvPath = findBin('uv');
    deps.uv = { available: !!uvPath, path: uvPath };

    // Check Docker
    const dockerPath = findBin('docker');
    if (dockerPath) {
        try {
            execSync('docker info', { stdio: 'ignore', timeout: 5000 });
            deps.docker = { available: true, path: dockerPath };
        } catch {
            deps.docker = { available: false, installed: true }; // installed but daemon not running
        }
    } else {
        deps.docker = { available: false, installed: false };
    }

    res.json(deps);
});

module.exports = router;
