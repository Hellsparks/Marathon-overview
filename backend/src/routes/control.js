const express = require('express');
const router = express.Router();
const tls = require('tls');
const { getDb } = require('../db');
const { getClient } = require('../services/clientFactory');

function getPrinter(id) {
  return getDb().prepare('SELECT * FROM printers WHERE id = ?').get(id);
}

async function proxyPrint(action, req, res) {
  const printer = getPrinter(req.params.id);
  if (!printer) return res.status(404).json({ error: 'Printer not found' });

  const client = getClient(printer);
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
    await getClient(printer).sendGcode(script);
    res.json({ success: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/printers/:id/webcams
// Priority: manual webcam_url on printer → Bambu proxy → Moonraker API → auto-guess /webcam/?action=stream
router.get('/:id/webcams', async (req, res) => {
  const printer = getPrinter(req.params.id);
  if (!printer) return res.status(404).json({ error: 'Printer not found' });

  // 1. Manually configured URL overrides everything
  if (printer.webcam_url) {
    return res.json([{ name: 'webcam', stream_url: printer.webcam_url, snapshot_url: null }]);
  }

  // 2. Bambu printers: proxy RTSPS stream through backend (browsers can't consume RTSPS directly)
  if (printer.firmware_type === 'bambu') {
    return res.json([{ name: 'Camera', stream_url: `/api/printers/${printer.id}/bambu-stream`, snapshot_url: null }]);
  }

  // 3. Try firmware webcam API (Moonraker only; OctoPrint/Duet return [])
  try {
    const webcams = await getClient(printer).getWebcams();
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

  // 4. Auto-guess: standard mjpeg-streamer path used by most Klipper setups
  res.json([{ name: 'webcam', stream_url: `http://${printer.host}/webcam/?action=stream`, snapshot_url: null }]);
});

// GET /api/printers/:id/bambu-stream
// Proxies the Bambu A1/P1 camera stream as MJPEG.
// Protocol: custom TCP+TLS on port 6000. After the TLS handshake, a 96-byte auth
// packet is sent (4× uint32-LE header + 32-byte username + 32-byte access code).
// The printer then streams raw JPEG frames which we detect by start/end markers
// and forward as multipart/x-mixed-replace so the browser <img> tag can display them.
router.get('/:id/bambu-stream', (req, res) => {
  const printer = getPrinter(req.params.id);
  if (!printer) return res.status(404).json({ error: 'Printer not found' });
  if (printer.firmware_type !== 'bambu') return res.status(400).json({ error: 'Not a Bambu printer' });

  const BOUNDARY = 'BambuFrame';
  res.setHeader('Content-Type', `multipart/x-mixed-replace; boundary=${BOUNDARY}`);
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // 96-byte auth packet: [0x40, 0x3000, 0, 0] + "bblp" (32 bytes) + access_code (32 bytes)
  const auth = Buffer.alloc(96);
  auth.writeUInt32LE(0x40, 0);
  auth.writeUInt32LE(0x3000, 4);
  auth.writeUInt32LE(0, 8);
  auth.writeUInt32LE(0, 12);
  auth.write('bblp', 16, 'ascii');
  auth.write(printer.api_key || '', 48, 'ascii');

  const socket = tls.connect({ host: printer.host, port: 6000, rejectUnauthorized: false }, () => {
    socket.write(auth);
  });

  // Bambu cameras send standard JFIF JPEGs (FF D8 FF E0 … FF D9).
  // Using the full 4-byte SOI avoids false-positive matches on FF D8 bytes
  // that can appear inside JPEG entropy-coded data.
  const JPEG_SOI = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  const JPEG_EOI = Buffer.from([0xff, 0xd9]);
  let buf = Buffer.alloc(0);

  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    // Guard against runaway buffer (e.g. broken stream)
    if (buf.length > 5 * 1024 * 1024) buf = Buffer.alloc(0);

    let startIdx;
    while ((startIdx = buf.indexOf(JPEG_SOI)) !== -1) {
      const endIdx = buf.indexOf(JPEG_EOI, startIdx + 4);
      if (endIdx === -1) break;

      const frame = buf.slice(startIdx, endIdx + 2);
      buf = buf.slice(endIdx + 2);

      if (!res.writableEnded) {
        res.write(`--${BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);
        res.write(frame);
        res.write('\r\n');
      }
    }
  });

  const cleanup = () => { try { socket.destroy(); } catch (_) { } };
  socket.on('error', (err) => {
    console.error(`[Bambu] Camera stream error for printer ${printer.id}:`, err.message);
    cleanup();
    if (!res.writableEnded) res.end();
  });
  socket.on('close', () => { if (!res.writableEnded) res.end(); });
  res.on('close', cleanup);
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
    const macros = await getClient(printer).getMacros();
    res.json(macros);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/printers/:id/light
// Body: { on: boolean, node?: 'chamber_light' | 'work_light' }
router.post('/:id/light', async (req, res) => {
  const printer = getPrinter(req.params.id);
  if (!printer) return res.status(404).json({ error: 'Printer not found' });
  if (printer.firmware_type !== 'bambu') return res.status(400).json({ error: 'Light control only supported on Bambu printers' });

  const { on, node = 'chamber_light' } = req.body;
  if (on === undefined) return res.status(400).json({ error: 'on (boolean) is required' });

  try {
    await getClient(printer).controlLight(!!on, node);
    res.json({ success: true, on: !!on, node });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/printers/:id/temperature
// Body: { type: 'bed' | 'nozzle', temp: number }
router.post('/:id/temperature', async (req, res) => {
  const printer = getPrinter(req.params.id);
  if (!printer) return res.status(404).json({ error: 'Printer not found' });

  const { type, temp } = req.body;
  if (!type || temp === undefined) return res.status(400).json({ error: 'type and temp are required' });
  if (!['bed', 'nozzle'].includes(type)) return res.status(400).json({ error: "type must be 'bed' or 'nozzle'" });

  try {
    await getClient(printer).setTemperature(type, temp);
    res.json({ success: true, type, temp });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
