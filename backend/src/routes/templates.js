const express = require('express');
const router = express.Router();
const db = require('../db').getDb();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
const TEMPLATES_DIR = process.env.TEMPLATES_DIR || path.join(UPLOADS_DIR, 'templates');
const THUMBS_DIR = path.join(TEMPLATES_DIR, '.thumbs');

// Ensure directories exist
if (!fs.existsSync(TEMPLATES_DIR)) {
    fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
}
if (!fs.existsSync(THUMBS_DIR)) {
    fs.mkdirSync(THUMBS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, THUMBS_DIR),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

function copyToTemplates(sourceFileId, prefix) {
    const sourceFile = db.prepare(`SELECT filename FROM gcode_files WHERE id = ?`).get(sourceFileId);
    if (!sourceFile) throw new Error(`Source file ID ${sourceFileId} not found`);

    const sourcePath = path.join(UPLOADS_DIR, sourceFile.filename);
    if (!fs.existsSync(sourcePath)) throw new Error(`Source file missing from disk: ${sourceFile.filename}`);

    const newFilename = `${prefix}_${sourceFile.filename}`;
    const destPath = path.join(TEMPLATES_DIR, newFilename);
    fs.copyFileSync(sourcePath, destPath);

    // Also copy thumbnail if exists
    const metadata = db.prepare(`SELECT has_thumbnail FROM gcode_metadata WHERE file_id = ?`).get(sourceFileId);
    if (metadata && metadata.has_thumbnail) {
        const sourceThumb = path.join(UPLOADS_DIR, '.thumbnails', `${sourceFile.filename}.png`);
        const destThumb = path.join(THUMBS_DIR, `${newFilename}.png`);
        if (fs.existsSync(sourceThumb)) {
            fs.copyFileSync(sourceThumb, destThumb);
        }
    }

    return newFilename;
}

/** Build categories array for a template, attaching plates to each category/option */
function buildCategories(templateId, platesData, plateSlots) {
    const cats = db.prepare(`SELECT * FROM template_categories WHERE template_id = ? ORDER BY sort_order`).all(templateId);
    const allOptions = db.prepare(`SELECT * FROM template_category_options WHERE category_id IN (SELECT id FROM template_categories WHERE template_id = ?) ORDER BY sort_order`).all(templateId);

    function plateToObj(p) {
        return {
            id: p.id, filename: p.filename, display_name: p.display_name,
            sort_order: p.sort_order, filament_type: p.filament_type,
            estimated_time_s: p.estimated_time_s, sliced_for: p.sliced_for,
            filament_usage_mm: p.filament_usage_mm, filament_usage_g: p.filament_usage_g,
            has_thumbnail: p.has_thumbnail, category_id: p.category_id, option_id: p.option_id,
            slot_keys: plateSlots.filter(ps => ps.plate_id === p.id).map(ps => ps.slot_key)
        };
    }

    return cats.map(cat => {
        if (cat.type === 'choice') {
            const options = allOptions.filter(o => o.category_id === cat.id).map(opt => ({
                id: opt.id, name: opt.name, sort_order: opt.sort_order,
                plates: platesData.filter(p => p.option_id === opt.id).map(plateToObj)
            }));
            return { id: cat.id, name: cat.name, type: 'choice', sort_order: cat.sort_order, options };
        }
        return {
            id: cat.id, name: cat.name, type: 'fixed', sort_order: cat.sort_order,
            plates: platesData.filter(p => p.category_id === cat.id && !p.option_id).map(plateToObj)
        };
    });
}

// GET /api/templates
router.get('/', (req, res) => {
    try {
        const templates = db.prepare(`
      SELECT t.*,
             COUNT(p.id) as plate_count
      FROM project_templates t
      LEFT JOIN template_plates p ON t.id = p.template_id
      GROUP BY t.id
      ORDER BY t.created_at DESC
    `).all();

        // Fetch slots for each
        const slots = db.prepare(`SELECT * FROM template_color_slots`).all();
        const platesData = db.prepare(`SELECT * FROM template_plates ORDER BY sort_order ASC`).all();
        const plateSlots = db.prepare(`SELECT * FROM template_plate_slots`).all();

        // Attach slots, plates, and categories to output
        for (const t of templates) {
            t.color_slots = slots.filter(s => s.template_id === t.id);
            const tplPlates = platesData.filter(p => p.template_id === t.id);
            t.plates = tplPlates.map(p => ({
                id: p.id, filename: p.filename, display_name: p.display_name,
                sort_order: p.sort_order, filament_type: p.filament_type,
                estimated_time_s: p.estimated_time_s, sliced_for: p.sliced_for,
                filament_usage_mm: p.filament_usage_mm, filament_usage_g: p.filament_usage_g,
                has_thumbnail: p.has_thumbnail, category_id: p.category_id, option_id: p.option_id,
                slot_keys: plateSlots.filter(ps => ps.plate_id === p.id).map(ps => ps.slot_key)
            }));
            t.categories = buildCategories(t.id, tplPlates, plateSlots);
        }

        res.json(templates);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/templates/:id
router.get('/:id', (req, res) => {
    try {
        const template = db.prepare('SELECT * FROM project_templates WHERE id = ?').get(req.params.id);
        if (!template) return res.status(404).json({ error: 'Template not found' });

        const platesData = db.prepare('SELECT * FROM template_plates WHERE template_id = ? ORDER BY sort_order').all(template.id);
        template.color_slots = db.prepare('SELECT * FROM template_color_slots WHERE template_id = ?').all(template.id);

        const plateSlots = db.prepare(`
      SELECT ps.plate_id, ps.slot_key
      FROM template_plate_slots ps
      JOIN template_plates p ON p.id = ps.plate_id
      WHERE p.template_id = ?
    `).all(template.id);

        // attach slots array to each plate
        for (const p of platesData) {
            p.slot_keys = plateSlots.filter(ps => ps.plate_id === p.id).map(ps => ps.slot_key);
        }

        template.plates = platesData;
        template.categories = buildCategories(template.id, platesData, plateSlots);

        res.json(template);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/** Insert a plate row with category/option linkage, copy file if needed */
function insertPlateRow(stmts, templateId, prefix, plate, categoryId, optionId) {
    let filename = plate.filename;
    let meta = {};
    if (plate.file_id && !filename) {
        filename = copyToTemplates(plate.file_id, prefix);
        meta = db.prepare(`SELECT * FROM gcode_metadata WHERE file_id = ?`).get(plate.file_id) || {};
    }
    if (!filename) throw new Error('Plate is missing filename or source file_id');

    const prun = stmts.insertPlate.run(
        templateId, filename,
        plate.display_name || filename,
        plate.sort_order || 0,
        plate.filament_type || meta.filament_type || null,
        meta.estimated_time_s || plate.estimated_time_s || null,
        meta.sliced_for || plate.sliced_for || null,
        meta.filament_usage_mm || plate.filament_usage_mm || null,
        meta.filament_usage_g || plate.filament_usage_g || null,
        plate.has_thumbnail !== undefined ? (plate.has_thumbnail ? 1 : 0) : (meta.has_thumbnail ? 1 : 0),
        categoryId || null,
        optionId || null
    );
    const plateId = prun.lastInsertRowid;
    if (plate.slot_keys && Array.isArray(plate.slot_keys)) {
        for (const key of plate.slot_keys) stmts.insertPlateSlot.run(plateId, key);
    }
    return filename; // returned so callers can track which files are still in use
}

/** Insert categories + their plates for a template */
function insertCategories(stmts, templateId, prefix, categories) {
    const insertCat = db.prepare(`INSERT INTO template_categories (template_id, name, type, sort_order) VALUES (?, ?, ?, ?)`);
    const insertOpt = db.prepare(`INSERT INTO template_category_options (category_id, name, sort_order) VALUES (?, ?, ?)`);

    for (const cat of categories) {
        const catRun = insertCat.run(templateId, cat.name, cat.type || 'fixed', cat.sort_order ?? 0);
        const catId = catRun.lastInsertRowid;

        if (cat.type === 'choice' && cat.options) {
            for (const opt of cat.options) {
                const optRun = insertOpt.run(catId, opt.name, opt.sort_order ?? 0);
                const optId = optRun.lastInsertRowid;
                for (const plate of (opt.plates || [])) {
                    insertPlateRow(stmts, templateId, prefix, plate, catId, optId);
                }
            }
        } else {
            for (const plate of (cat.plates || [])) {
                insertPlateRow(stmts, templateId, prefix, plate, catId, null);
            }
        }
    }
}

// POST /api/templates
router.post('/', (req, res) => {
    const { name, description, plates = [], color_slots = [], categories = [], folder_id } = req.body;
    if (!name) return res.status(400).json({ error: 'Template name is required' });

    try {
        const insertTemplate = db.prepare(`INSERT INTO project_templates (name, description, folder_id) VALUES (?, ?, ?)`);
        const stmts = {
            insertPlate: db.prepare(`INSERT INTO template_plates (template_id, filename, display_name, sort_order, filament_type, estimated_time_s, sliced_for, filament_usage_mm, filament_usage_g, has_thumbnail, category_id, option_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
            insertPlateSlot: db.prepare(`INSERT INTO template_plate_slots (plate_id, slot_key) VALUES (?, ?)`)
        };
        const insertSlot = db.prepare(`INSERT INTO template_color_slots (template_id, slot_key, label, pref_hex, pref_filament_id) VALUES (?, ?, ?, ?, ?)`);

        db.exec('BEGIN TRANSACTION');
        let templateId;
        try {
            const run = insertTemplate.run(name, description || null, folder_id || null);
            templateId = run.lastInsertRowid;
            const prefix = `tpl${templateId}`;

            // Insert color slots
            for (const slot of color_slots) {
                insertSlot.run(templateId, slot.slot_key, slot.label || null, slot.pref_hex || null, slot.pref_filament_id || null);
            }

            // Insert categories + their plates
            if (categories.length > 0) {
                insertCategories(stmts, templateId, prefix, categories);
            }

            // Insert uncategorized plates (backward compat)
            for (const plate of plates) {
                if (!plate.file_id) throw new Error('Plate is missing source file_id');
                insertPlateRow(stmts, templateId, prefix, plate, null, null);
            }

            db.exec('COMMIT');
            res.status(201).json({ success: true, id: templateId });
        } catch (txnErr) {
            db.exec('ROLLBACK');
            throw txnErr;
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/templates/:id
router.put('/:id', (req, res) => {
    const { name, description, plates = [], color_slots = [], categories = [], folder_id } = req.body;
    if (!name) return res.status(400).json({ error: 'Template name is required' });

    try {
        const templateId = req.params.id;
        const existing = db.prepare('SELECT id, folder_id FROM project_templates WHERE id = ?').get(templateId);
        if (!existing) return res.status(404).json({ error: 'Template not found' });

        const updateTemplate = db.prepare(`UPDATE project_templates SET name = ?, description = ?, folder_id = ?, updated_at = datetime('now') WHERE id = ?`);
        const stmts = {
            insertPlate: db.prepare(`INSERT INTO template_plates (template_id, filename, display_name, sort_order, filament_type, estimated_time_s, sliced_for, filament_usage_mm, filament_usage_g, has_thumbnail, category_id, option_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
            insertPlateSlot: db.prepare(`INSERT INTO template_plate_slots (plate_id, slot_key) VALUES (?, ?)`)
        };
        const insertSlot = db.prepare(`INSERT INTO template_color_slots (template_id, slot_key, label, pref_hex, pref_filament_id) VALUES (?, ?, ?, ?, ?)`);

        db.exec('BEGIN TRANSACTION');
        try {
            const targetFolderId = folder_id !== undefined ? (folder_id || null) : existing.folder_id;
            updateTemplate.run(name, description || null, targetFolderId, templateId);

            // Collect existing filenames before clearing
            const existingPlates = db.prepare('SELECT id, filename FROM template_plates WHERE template_id = ?').all(templateId);
            const existingFilenames = new Set(existingPlates.map(p => p.filename));

            // Clear everything (cascade handles plate_slots)
            db.prepare('DELETE FROM template_color_slots WHERE template_id = ?').run(templateId);
            db.prepare('DELETE FROM template_categories WHERE template_id = ?').run(templateId);
            db.prepare('DELETE FROM template_plates WHERE template_id = ?').run(templateId);

            // Re-insert color slots
            for (const slot of color_slots) {
                insertSlot.run(templateId, slot.slot_key, slot.label || null, slot.pref_hex || null, slot.pref_filament_id || null);
            }

            const prefix = `tpl${templateId}`;
            const newFilenames = new Set();

            // Insert categories + their plates
            if (categories.length > 0) {
                const insertCat = db.prepare(`INSERT INTO template_categories (template_id, name, type, sort_order) VALUES (?, ?, ?, ?)`);
                const insertOpt = db.prepare(`INSERT INTO template_category_options (category_id, name, sort_order) VALUES (?, ?, ?)`);

                for (const cat of categories) {
                    const catRun = insertCat.run(templateId, cat.name, cat.type || 'fixed', cat.sort_order ?? 0);
                    const catId = catRun.lastInsertRowid;

                    if (cat.type === 'choice' && cat.options) {
                        for (const opt of cat.options) {
                            const optRun = insertOpt.run(catId, opt.name, opt.sort_order ?? 0);
                            const optId = optRun.lastInsertRowid;
                            for (const plate of (opt.plates || [])) {
                                const fn = insertPlateRow(stmts, templateId, prefix, plate, catId, optId);
                                if (fn) newFilenames.add(fn);
                            }
                        }
                    } else {
                        for (const plate of (cat.plates || [])) {
                            const fn = insertPlateRow(stmts, templateId, prefix, plate, catId, null);
                            if (fn) newFilenames.add(fn);
                        }
                    }
                }
            }

            // Insert uncategorized plates
            for (const plate of plates) {
                const fn = insertPlateRow(stmts, templateId, prefix, plate, null, null);
                if (fn) newFilenames.add(fn);
            }

            // Cleanup files that were removed
            for (const oldFile of existingFilenames) {
                if (!newFilenames.has(oldFile)) {
                    const f = path.join(TEMPLATES_DIR, oldFile);
                    if (fs.existsSync(f)) fs.unlinkSync(f);
                }
            }
            db.exec('COMMIT');
            res.json({ success: true });
        } catch (txnErr) {
            db.exec('ROLLBACK');
            throw txnErr;
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/templates/:id/folder
router.patch('/:id/folder', (req, res) => {
    const { folder_id } = req.body;
    try {
        const info = db.prepare('UPDATE project_templates SET folder_id = ? WHERE id = ?').run(folder_id || null, req.params.id);
        if (info.changes === 0) return res.status(404).json({ error: 'Template not found' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/templates/:id
router.delete('/:id', (req, res) => {
    try {
        // get plates to delete physical files
        const plates = db.prepare('SELECT filename FROM template_plates WHERE template_id = ?').all(req.params.id);
        const template = db.prepare('SELECT thumbnail_path FROM project_templates WHERE id = ?').get(req.params.id);

        db.prepare('DELETE FROM project_templates WHERE id = ?').run(req.params.id);

        // Cleanup physical files
        for (const p of plates) {
            const f = path.join(TEMPLATES_DIR, p.filename);
            if (fs.existsSync(f)) fs.unlinkSync(f);
        }
        if (template && template.thumbnail_path) {
            const t = path.join(THUMBS_DIR, path.basename(template.thumbnail_path));
            if (fs.existsSync(t)) fs.unlinkSync(t);
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Thumbnail upload
router.post('/:id/thumbnail', upload.single('thumbnail'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No thumbnail file uploaded' });
    const relativePath = `/.thumbs/${req.file.filename}`;
    try {
        db.prepare('UPDATE project_templates SET thumbnail_path = ? WHERE id = ?').run(relativePath, req.params.id);
        res.json({ success: true, thumbnail_path: relativePath });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Serve thumbnails (template main or plate thumbs)
router.get('/thumb/:filename', (req, res) => {
    // Both template thumbnails and plate thumbnails are in THUMBS_DIR
    const file = path.join(THUMBS_DIR, req.params.filename);
    if (fs.existsSync(file)) {
        res.sendFile(file);
    } else {
        res.status(404).end();
    }
});

module.exports = router;
