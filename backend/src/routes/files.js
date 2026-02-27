const express = require('express');
const router = express.Router();
const path = require('path');
const { getDb } = require('../db');
const upload = require('../middleware/upload');
const fileStorage = require('../services/fileStorage');
const MoonrakerClient = require('../services/moonraker');

// GET /api/files
router.get('/', (req, res) => {
  const db = getDb();
  const files = db
    .prepare('SELECT * FROM gcode_files ORDER BY created_at DESC')
    .all();
  res.json(files);
});

// POST /api/files/upload
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });

  const db = getDb();
  db.prepare(
    `INSERT INTO gcode_files (filename, display_name, size_bytes, upload_source)
     VALUES (?, ?, ?, 'web')`
  ).run(req.file.filename, req.file.originalname, req.file.size);

  const record = db
    .prepare('SELECT * FROM gcode_files WHERE filename = ?')
    .get(req.file.filename);
  res.status(201).json(record);
});

// DELETE /api/files/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const file = db.prepare('SELECT * FROM gcode_files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found' });

  fileStorage.deleteFile(file.filename);
  db.prepare('DELETE FROM gcode_files WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST /api/files/:id/send  — upload to a specific printer's Moonraker
router.post('/:id/send', async (req, res) => {
  const { printerId, autoStart = false, addToQueue = false } = req.body;
  if (!printerId) return res.status(400).json({ error: 'printerId is required' });

  const db = getDb();
  const file = db.prepare('SELECT * FROM gcode_files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found' });

  const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(printerId);
  if (!printer) return res.status(404).json({ error: 'Printer not found' });

  try {
    const fileBuffer = fileStorage.readFile(file.filename);
    const client = new MoonrakerClient(printer);

    // Upload the file to the printer's Moonraker
    await client.uploadFile(file.display_name, fileBuffer);

    if (addToQueue) {
      await client.addToQueue([file.display_name]);
      return res.json({ success: true, action: 'queued' });
    }

    if (autoStart) {
      await client.startPrint(file.display_name);
      // Log to history
      db.prepare(
        `INSERT INTO print_history (printer_id, file_id, filename) VALUES (?, ?, ?)`
      ).run(printer.id, file.id, file.display_name);
      return res.json({ success: true, action: 'started' });
    }

    res.json({ success: true, action: 'uploaded' });
  } catch (err) {
    console.error('[Files/send]', err.message);
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
