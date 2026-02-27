const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

// GET /api/presets — list all presets
router.get('/', (req, res) => {
    const db = getDb();
    const presets = db.prepare('SELECT * FROM printer_presets ORDER BY is_builtin DESC, name').all();
    // Parse filament_types JSON for each preset
    res.json(presets.map(p => ({
        ...p,
        filament_types: safeJsonParse(p.filament_types),
    })));
});

// GET /api/presets/:id
router.get('/:id', (req, res) => {
    const db = getDb();
    const preset = db.prepare('SELECT * FROM printer_presets WHERE id = ?').get(req.params.id);
    if (!preset) return res.status(404).json({ error: 'Preset not found' });
    res.json({ ...preset, filament_types: safeJsonParse(preset.filament_types) });
});

// POST /api/presets — create a user preset
router.post('/', (req, res) => {
    const { name, bed_width, bed_depth, bed_height, filament_types = [], toolhead_count = 1 } = req.body;
    if (!name || !bed_width || !bed_depth || !bed_height) {
        return res.status(400).json({ error: 'name, bed_width, bed_depth, bed_height are required' });
    }

    const db = getDb();
    const id = slugify(name);

    // Check for duplicate
    const existing = db.prepare('SELECT id FROM printer_presets WHERE id = ?').get(id);
    if (existing) return res.status(409).json({ error: 'A preset with that name already exists' });

    db.prepare(
        `INSERT INTO printer_presets (id, name, bed_width, bed_depth, bed_height, filament_types, toolhead_count, is_builtin)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
    ).run(id, name, bed_width, bed_depth, bed_height, JSON.stringify(filament_types), toolhead_count);

    const preset = db.prepare('SELECT * FROM printer_presets WHERE id = ?').get(id);
    res.status(201).json({ ...preset, filament_types: safeJsonParse(preset.filament_types) });
});

// PUT /api/presets/:id — edit a user preset
router.put('/:id', (req, res) => {
    const db = getDb();
    const preset = db.prepare('SELECT * FROM printer_presets WHERE id = ?').get(req.params.id);
    if (!preset) return res.status(404).json({ error: 'Preset not found' });
    if (preset.is_builtin) return res.status(403).json({ error: 'Cannot edit built-in presets' });

    const { name, bed_width, bed_depth, bed_height, filament_types, toolhead_count } = req.body;

    db.prepare(
        `UPDATE printer_presets SET name=?, bed_width=?, bed_depth=?, bed_height=?, filament_types=?, toolhead_count=?, updated_at=datetime('now')
     WHERE id=?`
    ).run(
        name ?? preset.name,
        bed_width ?? preset.bed_width,
        bed_depth ?? preset.bed_depth,
        bed_height ?? preset.bed_height,
        filament_types ? JSON.stringify(filament_types) : preset.filament_types,
        toolhead_count ?? preset.toolhead_count,
        req.params.id
    );

    const updated = db.prepare('SELECT * FROM printer_presets WHERE id = ?').get(req.params.id);
    res.json({ ...updated, filament_types: safeJsonParse(updated.filament_types) });
});

// DELETE /api/presets/:id — delete a user preset
router.delete('/:id', (req, res) => {
    const db = getDb();
    const preset = db.prepare('SELECT * FROM printer_presets WHERE id = ?').get(req.params.id);
    if (!preset) return res.status(404).json({ error: 'Preset not found' });
    if (preset.is_builtin) return res.status(403).json({ error: 'Cannot delete built-in presets' });

    db.prepare('DELETE FROM printer_presets WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

function slugify(str) {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function safeJsonParse(str) {
    try { return JSON.parse(str); } catch { return []; }
}

module.exports = router;
