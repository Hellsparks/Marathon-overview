const express = require('express');
const router = express.Router({ mergeParams: true });
const { getDb } = require('../db');
const { getClient } = require('../services/clientFactory');

function getPrinter(id) {
  return getDb().prepare('SELECT * FROM printers WHERE id = ?').get(id);
}

// GET /api/printers/:id/queue
router.get('/:id/queue', async (req, res) => {
  const printer = getPrinter(req.params.id);
  if (!printer) return res.status(404).json({ error: 'Printer not found' });

  try {
    const queue = await getClient(printer).getQueue();
    res.json(queue);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/printers/:id/queue  — add file(s) to queue
router.post('/:id/queue', async (req, res) => {
  const printer = getPrinter(req.params.id);
  if (!printer) return res.status(404).json({ error: 'Printer not found' });

  const { filenames } = req.body;
  if (!filenames || !filenames.length) {
    return res.status(400).json({ error: 'filenames array is required' });
  }

  try {
    const result = await getClient(printer).addToQueue(filenames);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// DELETE /api/printers/:id/queue/:jobId
router.delete('/:id/queue/:jobId', async (req, res) => {
  const printer = getPrinter(req.params.id);
  if (!printer) return res.status(404).json({ error: 'Printer not found' });

  try {
    const result = await getClient(printer).removeFromQueue([req.params.jobId]);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/printers/:id/queue/start
router.post('/:id/queue/start', async (req, res) => {
  const printer = getPrinter(req.params.id);
  if (!printer) return res.status(404).json({ error: 'Printer not found' });

  try {
    const result = await getClient(printer).startQueue();
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
