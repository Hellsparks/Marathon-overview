// OctoPrint-compatible API routes.
// Slicers (PrusaSlicer, OrcaSlicer, Cura) use these to upload G-code files.
const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const upload = require('../middleware/upload');
const apiKeyAuth = require('../middleware/apiKeyAuth');
const printerCache = require('../services/printerCache');
const { parseGcodeFile } = require('../services/gcodeParser');

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
  const first = Object.values(allStatus)[0] || {};
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
  const first = Object.values(allStatus)[0] || {};
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
router.post('/files/local', apiKeyAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const db = getDb();
  const slicerName = detectSlicer(req.headers['user-agent'] || '');

  db.prepare(
    `INSERT OR IGNORE INTO gcode_files (filename, display_name, size_bytes, upload_source, slicer_name)
     VALUES (?, ?, ?, 'slicer', ?)`
  ).run(req.file.filename, req.file.originalname, req.file.size, slicerName);

  // Parse G-code metadata for safety checks (runs in background after response)
  const record = db.prepare('SELECT * FROM gcode_files WHERE filename = ?').get(req.file.filename);
  if (record) {
    parseGcodeFile(req.file.filename).then(meta => {
      if (meta) {
        db.prepare(
          `INSERT OR REPLACE INTO gcode_metadata (file_id, min_x, max_x, min_y, max_y, min_z, max_z, filament_type, estimated_time_s)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(record.id, meta.min_x, meta.max_x, meta.min_y, meta.max_y, meta.min_z, meta.max_z, meta.filament_type, meta.estimated_time_s);
        console.log(`[OctoPrint/GcodeParser] Parsed ${req.file.filename}: X[${meta.min_x}→${meta.max_x}] Y[${meta.min_y}→${meta.max_y}] Z[${meta.min_z}→${meta.max_z}] filament=${meta.filament_type}`);
      }
    }).catch(err => {
      console.error('[OctoPrint/GcodeParser]', err.message);
    });
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
