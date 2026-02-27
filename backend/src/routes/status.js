const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const printerCache = require('../services/printerCache');

// GET /api/status - all printers status from cache
router.get('/', (req, res) => {
  const db = getDb();
  const printers = db.prepare('SELECT id, name, host, port, enabled FROM printers').all();
  const all = printerCache.getAll();

  const result = {};
  for (const printer of printers) {
    result[printer.id] = {
      printer,
      ...(all[printer.id] || { _online: false }),
    };
  }
  res.json({ printers: result });
});

// GET /api/status/:id - single printer status
router.get('/:id', (req, res) => {
  const db = getDb();
  const printer = db
    .prepare('SELECT id, name, host, port, enabled FROM printers WHERE id = ?')
    .get(req.params.id);
  if (!printer) return res.status(404).json({ error: 'Printer not found' });

  const status = printerCache.get(req.params.id);
  res.json({ printer, ...status });
});

module.exports = router;
