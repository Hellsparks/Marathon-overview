const express = require('express');
const router = express.Router();
const path = require('path');
const { getDb } = require('../db');
const upload = require('../middleware/upload');
const fileStorage = require('../services/fileStorage');
const MoonrakerClient = require('../services/moonraker');
const { parseGcodeFile } = require('../services/gcodeParser');

// GET /api/files
router.get('/', (req, res) => {
  const db = getDb();
  const files = db.prepare(
    `SELECT f.*, m.min_x, m.max_x, m.min_y, m.max_y, m.min_z, m.max_z,
            m.filament_type, m.estimated_time_s, m.sliced_for
     FROM gcode_files f
     LEFT JOIN gcode_metadata m ON m.file_id = f.id
     ORDER BY f.created_at DESC`
  ).all();
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

  // Parse G-code metadata in the background
  storeGcodeMetadata(db, record.id, req.file.filename);

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

// GET /api/files/:id/compatibility/:printerId — safety check
router.get('/:id/compatibility/:printerId', (req, res) => {
  const db = getDb();
  const file = db.prepare('SELECT * FROM gcode_files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found' });

  const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(req.params.printerId);
  if (!printer) return res.status(404).json({ error: 'Printer not found' });

  const meta = db.prepare('SELECT * FROM gcode_metadata WHERE file_id = ?').get(file.id);

  const warnings = [];
  let compatible = true;
  let metadataAvailable = false;

  if (meta) {
    metadataAvailable = true;

    // Check bounding box vs. printer build volume
    if (printer.bed_width && meta.max_x != null && meta.min_x != null) {
      const printWidth = meta.max_x - meta.min_x;
      if (printWidth > printer.bed_width) {
        warnings.push({ type: 'size', severity: 'error', message: `Print width (${printWidth.toFixed(1)}mm) exceeds bed width (${printer.bed_width}mm)` });
        compatible = false;
      }
    }
    if (printer.bed_depth && meta.max_y != null && meta.min_y != null) {
      const printDepth = meta.max_y - meta.min_y;
      if (printDepth > printer.bed_depth) {
        warnings.push({ type: 'size', severity: 'error', message: `Print depth (${printDepth.toFixed(1)}mm) exceeds bed depth (${printer.bed_depth}mm)` });
        compatible = false;
      }
    }
    if (printer.bed_height && meta.max_z != null) {
      const printHeight = meta.max_z - (meta.min_z || 0);
      if (printHeight > printer.bed_height) {
        warnings.push({ type: 'size', severity: 'error', message: `Print height (${printHeight.toFixed(1)}mm) exceeds max height (${printer.bed_height}mm)` });
        compatible = false;
      }
    }

    // Check filament type
    if (meta.filament_type && printer.filament_types) {
      const supported = safeJsonParse(printer.filament_types);
      if (supported.length > 0 && !supported.some(f => f.toLowerCase() === meta.filament_type.toLowerCase())) {
        warnings.push({
          type: 'filament',
          severity: 'warning',
          message: `File uses ${meta.filament_type} but printer supports: ${supported.join(', ')}`,
        });
      }
    }
  } else {
    warnings.push({ type: 'metadata', severity: 'info', message: 'Could not parse G-code metadata — dimensions not verified' });
  }

  // Check if printer has any capabilities set at all
  if (!printer.bed_width && !printer.bed_depth && !printer.bed_height) {
    warnings.push({ type: 'config', severity: 'info', message: 'Printer has no build volume configured — skipping size check' });
  }

  res.json({ compatible, metadataAvailable, warnings, meta: meta || null });
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

// Helper: store G-code metadata after upload (runs in background)
async function storeGcodeMetadata(db, fileId, filename) {
  try {
    const meta = await parseGcodeFile(filename);
    if (!meta) return;
    db.prepare(
      `INSERT OR REPLACE INTO gcode_metadata (file_id, min_x, max_x, min_y, max_y, min_z, max_z, filament_type, estimated_time_s, sliced_for)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(fileId, meta.min_x, meta.max_x, meta.min_y, meta.max_y, meta.min_z, meta.max_z, meta.filament_type, meta.estimated_time_s, meta.sliced_for);
    console.log(`[GcodeParser] Parsed ${filename}: X[${meta.min_x}→${meta.max_x}] Y[${meta.min_y}→${meta.max_y}] Z[${meta.min_z}→${meta.max_z}] filament=${meta.filament_type} model=${meta.sliced_for}`);
  } catch (err) {
    console.error('[GcodeParser]', err.message);
  }
}

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return []; }
}

// Export for reuse from octoprint.js
module.exports = router;
module.exports.storeGcodeMetadata = storeGcodeMetadata;
