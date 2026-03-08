const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

// GET /api/folders
router.get('/', (req, res) => {
    const db = getDb();
    const type = req.query.type || 'gcode';

    // Choose the right subquery for file_count based on type
    let countSubquery = '(SELECT COUNT(*) FROM gcode_files g WHERE g.folder_id = f.id)';
    if (type === 'project') {
        countSubquery = "(SELECT COUNT(*) FROM projects p WHERE p.folder_id = f.id AND p.status = 'active')";
    } else if (type === 'template') {
        countSubquery = '(SELECT COUNT(*) FROM project_templates t WHERE t.folder_id = f.id)';
    } else if (type === 'archive') {
        countSubquery = "(SELECT COUNT(*) FROM projects p WHERE p.folder_id = f.id AND p.status = 'archived')";
    }

    // Get all folders of this type and count of files in each
    const folders = db.prepare(`
    SELECT f.*, 
           ${countSubquery} as file_count
    FROM file_folders f
    WHERE f.folder_type = ?
    ORDER BY f.name ASC
  `).all(type);
    res.json(folders);
});

// POST /api/folders
router.post('/', (req, res) => {
    const { name, parent_id, type } = req.body;
    const folderType = type || 'gcode';

    if (!name || name.trim() === '') {
        return res.status(400).json({ error: 'Folder name is required' });
    }

    const db = getDb();
    try {
        const info = db.prepare(`
      INSERT INTO file_folders (name, parent_id, folder_type)
      VALUES (?, ?, ?)
    `).run(name.trim(), parent_id || null, folderType);

        const newFolder = db.prepare('SELECT * FROM file_folders WHERE id = ?').get(info.lastInsertRowid);
        newFolder.file_count = 0;
        res.status(201).json(newFolder);
    } catch (err) {
        console.error('[Folders API Error]', err.message);
        res.status(500).json({ error: 'Failed to create folder' });
    }
});

// PUT /api/folders/:id
router.put('/:id', (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || name.trim() === '') {
        return res.status(400).json({ error: 'Folder name is required' });
    }

    const db = getDb();
    try {
        const info = db.prepare(`
      UPDATE file_folders 
      SET name = ? 
      WHERE id = ?
    `).run(name.trim(), id);

        if (info.changes === 0) {
            return res.status(404).json({ error: 'Folder not found' });
        }

        const updatedFolder = db.prepare('SELECT * FROM file_folders WHERE id = ?').get(id);
        res.json(updatedFolder);
    } catch (err) {
        console.error('[Folders API Error]', err.message);
        res.status(500).json({ error: 'Failed to rename folder' });
    }
});

// DELETE /api/folders/:id
router.delete('/:id', (req, res) => {
    const { id } = req.params;
    const db = getDb();

    // Due to ON DELETE CASCADE for parent_id and ON DELETE SET NULL for folder_id,
    // SQLite handles the cleanup of references.
    try {
        const info = db.prepare('DELETE FROM file_folders WHERE id = ?').run(id);
        if (info.changes === 0) {
            return res.status(404).json({ error: 'Folder not found' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('[Folders API Error]', err.message);
        res.status(500).json({ error: 'Failed to delete folder' });
    }
});

// PATCH /api/folders/:id/parent
router.patch('/:id/parent', (req, res) => {
    const { id } = req.params;
    const { parent_id } = req.body;

    if (id == parent_id) {
        return res.status(400).json({ error: 'Cannot move a folder into itself' });
    }

    const db = getDb();
    try {
        const info = db.prepare('UPDATE file_folders SET parent_id = ? WHERE id = ?').run(parent_id || null, id);
        if (info.changes === 0) return res.status(404).json({ error: 'Folder not found' });

        const updatedFolder = db.prepare('SELECT * FROM file_folders WHERE id = ?').get(id);
        res.json(updatedFolder);
    } catch (err) {
        console.error('[Folders API Error]', err.message);
        res.status(500).json({ error: 'Failed to move folder' });
    }
});

module.exports = router;
