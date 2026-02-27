const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { pollAll } = require('../services/poller');

// GET /api/printers
router.get('/', (req, res) => {
  const db = getDb();
  const printers = db.prepare('SELECT * FROM printers ORDER BY name').all();
  res.json(printers);
});

// POST /api/printers
router.post('/', (req, res) => {
  const { name, host, port = 7125, api_key = null } = req.body;
  if (!name || !host) {
    return res.status(400).json({ error: 'name and host are required' });
  }
  const db = getDb();
  const result = db
    .prepare('INSERT INTO printers (name, host, port, api_key) VALUES (?, ?, ?, ?)')
    .run([name, host, port, api_key || null]);
  const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(result.lastInsertRowid);
  pollAll(); // trigger immediate status poll to populate cache for new printer
  res.status(201).json(printer);
});

// PUT /api/printers/:id
router.put('/:id', (req, res) => {
  const { name, host, port, api_key, enabled } = req.body;
  const db = getDb();
  const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(req.params.id);
  if (!printer) return res.status(404).json({ error: 'Printer not found' });

  db.prepare(
    `UPDATE printers SET name=?, host=?, port=?, api_key=?, enabled=?, updated_at=datetime('now')
     WHERE id=?`
  ).run([
    name ?? printer.name,
    host ?? printer.host,
    port ?? printer.port,
    api_key !== undefined ? api_key : printer.api_key,
    enabled !== undefined ? (enabled ? 1 : 0) : printer.enabled,
    req.params.id,
  ]);
  res.json(db.prepare('SELECT * FROM printers WHERE id = ?').get(req.params.id));
});

// DELETE /api/printers/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM printers WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Printer not found' });
  res.json({ success: true });
});

module.exports = router;
