const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const MoonrakerClient = require('../services/moonraker');

function getPrinter(id) {
  return getDb().prepare('SELECT * FROM printers WHERE id = ?').get(id);
}

async function proxyPrint(action, req, res) {
  const printer = getPrinter(req.params.id);
  if (!printer) return res.status(404).json({ error: 'Printer not found' });

  const client = new MoonrakerClient(printer);
  try {
    let result;
    switch (action) {
      case 'start':
        result = await client.startPrint(req.body.filename);
        break;
      case 'pause':
        result = await client.pausePrint();
        break;
      case 'resume':
        result = await client.resumePrint();
        break;
      case 'cancel':
        result = await client.cancelPrint();
        break;
    }
    res.json({ success: true, result });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}

router.post('/:id/print/start',  (req, res) => proxyPrint('start',  req, res));
router.post('/:id/print/pause',  (req, res) => proxyPrint('pause',  req, res));
router.post('/:id/print/resume', (req, res) => proxyPrint('resume', req, res));
router.post('/:id/print/cancel', (req, res) => proxyPrint('cancel', req, res));

// POST /api/printers/:id/gcode  — send arbitrary gcode
router.post('/:id/gcode', async (req, res) => {
  const { script } = req.body;
  if (!script) return res.status(400).json({ error: 'script is required' });

  const printer = getPrinter(req.params.id);
  if (!printer) return res.status(404).json({ error: 'Printer not found' });

  try {
    await new MoonrakerClient(printer).sendGcode(script);
    res.json({ success: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/printers/:id/webcams  — list webcams with resolved absolute URLs
router.get('/:id/webcams', async (req, res) => {
  const printer = getPrinter(req.params.id);
  if (!printer) return res.status(404).json({ error: 'Printer not found' });

  try {
    const webcams = await new MoonrakerClient(printer).getWebcams();
    const resolved = webcams
      .filter(w => w.enabled !== false)
      .map(w => ({
        ...w,
        stream_url:   resolveWebcamUrl(w.stream_url,   printer),
        snapshot_url: resolveWebcamUrl(w.snapshot_url, printer),
      }));
    res.json(resolved);
  } catch (err) {
    // Return empty list rather than error — printer may not have webcam configured
    res.json([]);
  }
});

// Relative webcam URLs are relative to the printer's nginx proxy (port 80), not Moonraker (7125)
function resolveWebcamUrl(url, printer) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `http://${printer.host}${url.startsWith('/') ? '' : '/'}${url}`;
}

module.exports = router;
