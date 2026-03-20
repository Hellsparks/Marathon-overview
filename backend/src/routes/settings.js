const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

// GET /api/settings — return all settings as an object
router.get('/', (_req, res) => {
    const db = getDb();
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    for (const { key, value } of rows) settings[key] = value;
    res.json(settings);
});

// PUT /api/settings — update a single setting
router.put('/', (req, res) => {
    const { key, value } = req.body;
    if (!key || typeof value !== 'string') {
        return res.status(400).json({ error: 'key (string) and value (string) required' });
    }
    const db = getDb();
    const info = db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(value, key);
    if (info.changes === 0) {
        db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, value);
    }
    res.json({ ok: true, key, value });
});

module.exports = router;
