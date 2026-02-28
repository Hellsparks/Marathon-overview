const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { pollAll } = require('../services/poller');

// GET /api/printers
router.get('/', (req, res) => {
  const db = getDb();
  const printers = db.prepare('SELECT * FROM printers ORDER BY name').all();
  res.json(printers.map(normalizePrinter));
});

// POST /api/printers
router.post('/', (req, res) => {
  const {
    name, host, port = 7125, api_key = null,
    bed_width = null, bed_depth = null, bed_height = null,
    filament_types = '[]', toolhead_count = 1, preset_id = null,
    custom_css = null, theme_mode = 'global',
  } = req.body;

  if (!name || !host) {
    return res.status(400).json({ error: 'name and host are required' });
  }

  const db = getDb();
  const result = db.prepare(
    `INSERT INTO printers (name, host, port, api_key, bed_width, bed_depth, bed_height, filament_types, toolhead_count, preset_id, custom_css, theme_mode)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    name, host, port, api_key || null,
    bed_width, bed_depth, bed_height,
    typeof filament_types === 'string' ? filament_types : JSON.stringify(filament_types),
    toolhead_count, preset_id, custom_css, theme_mode
  );

  const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(result.lastInsertRowid);
  pollAll();
  res.status(201).json(normalizePrinter(printer));
});

// PUT /api/printers/:id
router.put('/:id', (req, res) => {
  const { name, host, port, api_key, enabled, bed_width, bed_depth, bed_height, filament_types, toolhead_count, preset_id, custom_css, theme_mode } = req.body;
  const db = getDb();
  const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(req.params.id);
  if (!printer) return res.status(404).json({ error: 'Printer not found' });

  db.prepare(
    `UPDATE printers SET name=?, host=?, port=?, api_key=?, enabled=?,
     bed_width=?, bed_depth=?, bed_height=?, filament_types=?, toolhead_count=?, preset_id=?, custom_css=?, theme_mode=?,
     updated_at=datetime('now')
     WHERE id=?`
  ).run(
    name ?? printer.name,
    host ?? printer.host,
    port ?? printer.port,
    api_key !== undefined ? api_key : printer.api_key,
    enabled !== undefined ? (enabled ? 1 : 0) : printer.enabled,
    bed_width !== undefined ? bed_width : printer.bed_width,
    bed_depth !== undefined ? bed_depth : printer.bed_depth,
    bed_height !== undefined ? bed_height : printer.bed_height,
    filament_types !== undefined
      ? (typeof filament_types === 'string' ? filament_types : JSON.stringify(filament_types))
      : printer.filament_types,
    toolhead_count !== undefined ? toolhead_count : printer.toolhead_count,
    preset_id !== undefined ? preset_id : printer.preset_id,
    custom_css !== undefined ? custom_css : printer.custom_css,
    theme_mode !== undefined ? theme_mode : printer.theme_mode,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM printers WHERE id = ?').get(req.params.id);
  res.json(normalizePrinter(updated));
});

// POST /api/printers/scrape-theme
router.post('/scrape-theme', async (req, res) => {
  const { host, port } = req.body;
  if (!host || !port) return res.status(400).json({ error: 'Host and port are required' });

  try {
    const url = `http://${host}:${port}/server/files/config/.theme/custom.css`;
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) return res.status(404).json({ error: 'No custom.css found on printer at standard Moonraker path.' });
      throw new Error(`Printer responded with HTTP ${response.status}`);
    }
    const cssContent = await response.text();
    res.json({ css: cssContent });
  } catch (err) {
    res.status(500).json({ error: `Failed to connect to printer: ${err.message}` });
  }
});

// DELETE /api/printers/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM printers WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Printer not found' });
  res.json({ success: true });
});

function normalizePrinter(p) {
  return {
    ...p,
    filament_types: safeJsonParse(p.filament_types),
  };
}

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return []; }
}

module.exports = router;
