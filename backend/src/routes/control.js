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

module.exports = router;
