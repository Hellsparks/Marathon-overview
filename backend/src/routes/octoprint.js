// OctoPrint-compatible API routes.
// Slicers (PrusaSlicer, OrcaSlicer, Cura) use these to upload G-code files.
const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const upload = require('../middleware/upload');
const apiKeyAuth = require('../middleware/apiKeyAuth');
const printerCache = require('../services/printerCache');

// GET /api/version  — slicer connectivity test
router.get('/version', (req, res) => {
  res.json({
    api: '0.1',
    server: '1.1.0',
    text: 'Marathon-overview',
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
