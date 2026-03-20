// OctoPrint-compatible API routes.
// Slicers (PrusaSlicer, OrcaSlicer, Cura) use these to upload G-code files.
const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const upload = require('../middleware/upload');
const apiKeyAuth = require('../middleware/apiKeyAuth');
const printerCache = require('../services/printerCache');
const { parseGcodeFile } = require('../services/gcodeParser');
const fileStorage = require('../services/fileStorage');
const { getClient } = require('../services/clientFactory');

// GET /api/version  — slicer connectivity test
router.get('/version', (req, res) => {
  res.json({
    api: '0.1',
    server: '1.1.0',
    text: 'OctoPrint (Marathon)',
  });
});

// GET /api/printer  — minimal printer state (slicers may poll this)
router.get('/printer', (req, res) => {
  const allStatus = printerCache.getAll();
  const db = getDb();
  const enabledIds = new Set(db.prepare('SELECT id FROM printers WHERE enabled = 1').all().map(p => String(p.id)));
  const first = Object.entries(allStatus).find(([id]) => enabledIds.has(id))?.[1] || {};
  res.json({
    temperature: {
      tool0: {
        actual: first.extruder?.temperature ?? 0,
        target: first.extruder?.target ?? 0,
      },
      bed: {
        actual: first.heater_bed?.temperature ?? 0,
        target: first.heater_bed?.target ?? 0,
      },
    },
    state: {
      text: first._online ? (first.print_stats?.state ?? 'Operational') : 'Offline',
      flags: { printing: first.print_stats?.state === 'printing' },
    },
  });
});

// GET /api/job  — minimal job state
router.get('/job', (req, res) => {
  const allStatus = printerCache.getAll();
  const db = getDb();
  const enabledIds = new Set(db.prepare('SELECT id FROM printers WHERE enabled = 1').all().map(p => String(p.id)));
  const first = Object.entries(allStatus).find(([id]) => enabledIds.has(id))?.[1] || {};
  res.json({
    state: first.print_stats?.state ?? 'Operational',
    job: {
      file: { name: first.print_stats?.filename ?? '' },
      estimatedPrintTime: null,
    },
    progress: {
      completion: (first.display_status?.progress ?? 0) * 100,
    },
  });
});

// POST /api/files/local  — slicer file upload (OctoPrint upload path)
// Supports "Upload and Print": if print=true in body AND a per-printer API key was used,
// Marathon uploads the file to that printer and starts the print automatically.
router.post('/files/local', apiKeyAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const db = getDb();
  const slicerName = detectSlicer(req.headers['user-agent'] || '');
  const wantPrint = req.body?.print === 'true' || req.body?.print === true;
  const printer = req.targetPrinter || null;

  db.prepare(
    `INSERT OR IGNORE INTO gcode_files (filename, display_name, size_bytes, upload_source, slicer_name)
     VALUES (?, ?, ?, 'slicer', ?)`
  ).run(req.file.filename, req.file.originalname, req.file.size, slicerName);

  const record = db.prepare('SELECT * FROM gcode_files WHERE filename = ?').get(req.file.filename);

  // Parse G-code metadata in background
  if (record) {
    parseGcodeFile(req.file.filename).then(meta => {
      if (meta) {
        db.prepare(
          `INSERT OR REPLACE INTO gcode_metadata (file_id, min_x, max_x, min_y, max_y, min_z, max_z, filament_type, estimated_time_s, sliced_for, has_thumbnail)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(record.id, meta.min_x, meta.max_x, meta.min_y, meta.max_y, meta.min_z, meta.max_z, meta.filament_type, meta.estimated_time_s, meta.sliced_for, meta.has_thumbnail ? 1 : 0);
        console.log(`[OctoPrint/GcodeParser] Parsed ${req.file.filename}: X[${meta.min_x}→${meta.max_x}] Y[${meta.min_y}→${meta.max_y}] Z[${meta.min_z}→${meta.max_z}] filament=${meta.filament_type} model=${meta.sliced_for} thumbnail=${meta.has_thumbnail}`);
      }
    }).catch(err => {
      console.error('[OctoPrint/GcodeParser]', err.message);
    });
  }

  // Auto-start on target printer if "Upload and Print" was requested
  if (wantPrint && printer) {
    const status = printerCache.get(String(printer.id));
    const state = status?.print_stats?.state;
    const isIdle = status?._online && (!state || state === 'standby' || state === 'complete' || state === 'cancelled' || state === 'error');

    if (isIdle) {
      try {
        const fileBuffer = fileStorage.readFile(req.file.filename);
        const client = getClient(printer);
        await client.uploadFile(req.file.originalname, fileBuffer);
        await client.startPrint(req.file.originalname);

        // Record active job for poller tracking
        db.prepare(
          'INSERT OR REPLACE INTO printer_active_jobs (printer_id, plate_id, filename) VALUES (?, NULL, ?)'
        ).run(printer.id, req.file.originalname);

        console.log(`[OctoPrint] Auto-started "${req.file.originalname}" on "${printer.name}" (slicer upload-and-print)`);
      } catch (err) {
        console.error(`[OctoPrint] Auto-start failed on "${printer.name}":`, err.message);
        // File is still saved — user can manually start from the UI
      }
    } else {
      console.log(`[OctoPrint] Printer "${printer.name}" not idle (state=${state}), file saved but not auto-started`);
    }
  }

  res.status(201).json({
    files: {
      local: {
        name: req.file.originalname,
        origin: 'local',
        refs: {
          resource: `/api/files/local/${req.file.originalname}`,
        },
      },
    },
    done: true,
  });
});

function detectSlicer(userAgent) {
  const ua = userAgent.toLowerCase();
  if (ua.includes('prusaslicer')) return 'PrusaSlicer';
  if (ua.includes('orcaslicer')) return 'OrcaSlicer';
  if (ua.includes('cura')) return 'Cura';
  if (ua.includes('superslicer')) return 'SuperSlicer';
  if (ua.includes('bambu')) return 'BambuStudio';
  return null;
}

module.exports = router;
