const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

// GET /api/maintenance — all tasks, printers, intervals, history
router.get('/', (req, res) => {
  const db = getDb();
  try {
    const tasks = db.prepare('SELECT * FROM maintenance_tasks ORDER BY name').all();
    const printers = db.prepare('SELECT id, name, host, port, api_key, theme_mode, custom_css, runtime_s FROM printers WHERE enabled = 1 ORDER BY sort_order, name').all();
    const intervals = db.prepare('SELECT task_id, printer_id, interval_hours FROM maintenance_intervals').all();
    const history = db.prepare(`
      SELECT task_id, printer_id, performed_at, runtime_s_at_performance
      FROM maintenance_history
      WHERE id IN (
        SELECT MAX(id) FROM maintenance_history GROUP BY task_id, printer_id
      )
    `).all();

    // Index by "taskId_printerId" for easy frontend lookup
    const intervalMap = {};
    for (const r of intervals) intervalMap[`${r.task_id}_${r.printer_id}`] = r.interval_hours;

    const historyMap = {};
    for (const r of history) historyMap[`${r.task_id}_${r.printer_id}`] = {
      performed_at: r.performed_at,
      runtime_s_at_performance: r.runtime_s_at_performance,
    };

    res.json({ tasks, printers, intervals: intervalMap, history: historyMap });
  } catch (err) {
    console.error('[Maintenance] GET error:', err);
    res.status(500).json({ error: 'Failed to fetch maintenance data' });
  }
});

// POST /api/maintenance/tasks — create a task
router.post('/tasks', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  const db = getDb();
  try {
    const result = db.prepare('INSERT INTO maintenance_tasks (name) VALUES (?)').run(name.trim());
    const task = db.prepare('SELECT * FROM maintenance_tasks WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(task);
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Task name already exists' });
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// DELETE /api/maintenance/tasks/:id
router.delete('/tasks/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM maintenance_tasks WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Task not found' });
  res.json({ ok: true });
});

// PUT /api/maintenance/intervals/:taskId/:printerId — set interval hours (0 = not tracked)
router.put('/intervals/:taskId/:printerId', (req, res) => {
  const { interval_hours } = req.body;
  if (interval_hours === undefined) return res.status(400).json({ error: 'interval_hours required' });
  const hours = parseInt(interval_hours, 10);
  if (isNaN(hours) || hours < 0) return res.status(400).json({ error: 'interval_hours must be a non-negative integer' });
  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO maintenance_intervals (task_id, printer_id, interval_hours)
      VALUES (?, ?, ?)
      ON CONFLICT(task_id, printer_id) DO UPDATE SET interval_hours = excluded.interval_hours
    `).run(req.params.taskId, req.params.printerId, hours);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update interval' });
  }
});

// POST /api/maintenance/done/:taskId/:printerId — mark task as done now
router.post('/done/:taskId/:printerId', (req, res) => {
  const db = getDb();
  try {
    const printer = db.prepare('SELECT runtime_s FROM printers WHERE id = ?').get(req.params.printerId);
    if (!printer) return res.status(404).json({ error: 'Printer not found' });
    const task = db.prepare('SELECT id FROM maintenance_tasks WHERE id = ?').get(req.params.taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    db.prepare(`
      INSERT INTO maintenance_history (task_id, printer_id, runtime_s_at_performance)
      VALUES (?, ?, ?)
    `).run(req.params.taskId, req.params.printerId, printer.runtime_s || 0);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Maintenance] done error:', err);
    res.status(500).json({ error: 'Failed to record maintenance' });
  }
});

module.exports = router;
