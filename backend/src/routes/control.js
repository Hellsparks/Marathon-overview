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

router.post('/:id/print/start', (req, res) => proxyPrint('start', req, res));
router.post('/:id/print/pause', (req, res) => proxyPrint('pause', req, res));
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

// GET /api/printers/:id/webcams
// Priority: manual webcam_url on printer → Moonraker API → auto-guess /webcam/?action=stream
router.get('/:id/webcams', async (req, res) => {
  const printer = getPrinter(req.params.id);
  if (!printer) return res.status(404).json({ error: 'Printer not found' });

  // 1. Manually configured URL overrides everything
  if (printer.webcam_url) {
    return res.json([{ name: 'webcam', stream_url: printer.webcam_url, snapshot_url: null }]);
  }

  // 2. Try Moonraker webcam API
  try {
    const webcams = await new MoonrakerClient(printer).getWebcams();
    const resolved = webcams
      .filter(w => w.enabled !== false && w.stream_url)
      .map(w => ({
        ...w,
        stream_url: resolveWebcamUrl(w.stream_url, printer),
        snapshot_url: resolveWebcamUrl(w.snapshot_url, printer),
      }));
    if (resolved.length > 0) return res.json(resolved);
  } catch (_) {
    // Moonraker webcam API unavailable — fall through to auto-guess
  }

  // 3. Auto-guess: standard mjpeg-streamer path used by most Klipper setups
  res.json([{ name: 'webcam', stream_url: `http://${printer.host}/webcam/?action=stream`, snapshot_url: null }]);
});

// Relative webcam URLs are relative to the printer's nginx proxy (port 80), not Moonraker (7125)
function resolveWebcamUrl(url, printer) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `http://${printer.host}${url.startsWith('/') ? '' : '/'}${url}`;
}

// GET /api/printers/:id/macros
router.get('/:id/macros', async (req, res) => {
  const printer = getPrinter(req.params.id);
  if (!printer) return res.status(404).json({ error: 'Printer not found' });

  try {
    const macros = await new MoonrakerClient(printer).getMacros();
    res.json(macros);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
