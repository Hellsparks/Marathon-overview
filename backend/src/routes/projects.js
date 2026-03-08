const express = require('express');
const router = express.Router();
const db = require('../db').getDb();
const path = require('path');
const fs = require('fs');
const { getClient } = require('../services/clientFactory');

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
const TEMPLATES_DIR = process.env.TEMPLATES_DIR || path.join(UPLOADS_DIR, 'templates');
const THUMBS_DIR = path.join(TEMPLATES_DIR, '.thumbs');

/** Helper: get Spoolman URL from settings */
function getSpoolmanUrl() {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'spoolman_url'").get();
    return row?.value || '';
}

// Helper to copy a file from uploads/ to templates/ (if not already there)
function facilitateFile(sourceFileId, prefix) {
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

// GET /api/projects
router.get('/', (req, res) => {
    const { status = 'active' } = req.query;
    try {
        const projects = db.prepare(`
            SELECT p.*,
                   (SELECT COUNT(*) FROM project_plates WHERE project_id = p.id) as total_plates,
                   (SELECT COUNT(*) FROM project_plates WHERE project_id = p.id AND status = 'done') as completed_plates,
                   t.thumbnail_path
            FROM projects p
            LEFT JOIN project_templates t ON p.template_id = t.id
            WHERE p.status = ?
            ORDER BY created_at DESC
        `).all(status);

        // Fetch assignments for each (simplified for card view)
        const assignments = db.prepare(`SELECT project_id, color_hex, material FROM project_color_assignments`).all();
        for (const p of projects) {
            p.assignments = assignments.filter(a => a.project_id === p.id);
        }

        res.json(projects);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/projects/:id
router.get('/:id', (req, res) => {
    try {
        const project = db.prepare(`
            SELECT p.*, t.name as template_name
            FROM projects p
            LEFT JOIN project_templates t ON p.template_id = t.id
            WHERE p.id = ?
        `).get(req.params.id);

        if (!project) return res.status(404).json({ error: 'Project not found' });

        project.plates = db.prepare(`
            SELECT pp.*, 
                   datetime(pj.end_time, '-' || pj.total_duration_s || ' seconds') as actual_start_time, 
                   pj.end_time as actual_end_time
            FROM project_plates pp
            LEFT JOIN gcode_print_jobs pj ON pp.print_job_id = pj.id
            WHERE pp.project_id = ?
            ORDER BY pp.sort_order
        `).all(project.id);
        project.color_assignments = db.prepare(`SELECT * FROM project_color_assignments WHERE project_id = ?`).all(project.id);

        res.json(project);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/projects (Hybrid)
router.post('/', (req, res) => {
    const { template_id, name, due_date, file_ids = [], color_assignments = [], folder_id } = req.body;
    if (!name) return res.status(400).json({ error: 'Project name is required' });

    try {
        db.exec('BEGIN TRANSACTION');
        let projectId;
        try {
            const run = db.prepare(`INSERT INTO projects (template_id, name, due_date, folder_id) VALUES (?, ?, ?, ?)`).run(template_id || null, name, due_date || null, folder_id || null);
            projectId = run.lastInsertRowid;

            if (template_id) {
                // Flow A: Create from Template
                const templatePlates = db.prepare(`SELECT * FROM template_plates WHERE template_id = ?`).all(template_id);
                const insertPlate = db.prepare(`
                    INSERT INTO project_plates 
                    (project_id, filename, display_name, estimated_time_s, filament_usage_mm, filament_usage_g, sliced_for, sort_order,
                     filament_type, min_x, max_x, min_y, max_y, min_z, max_z)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);

                for (const tp of templatePlates) {
                    insertPlate.run(
                        projectId,
                        tp.filename,
                        tp.display_name,
                        tp.estimated_time_s,
                        tp.filament_usage_mm,
                        tp.filament_usage_g,
                        tp.sliced_for,
                        tp.sort_order,
                        tp.filament_type || null,
                        tp.min_x || null,
                        tp.max_x || null,
                        tp.min_y || null,
                        tp.max_y || null,
                        tp.min_z || null,
                        tp.max_z || null
                    );
                }
            } else if (file_ids.length > 0) {
                // Flow B: Create from raw files
                const prefix = `prj${projectId}`;
                const insertPlate = db.prepare(`
                    INSERT INTO project_plates 
                    (project_id, filename, display_name, estimated_time_s, filament_usage_mm, filament_usage_g, sliced_for, sort_order,
                     filament_type, min_x, max_x, min_y, max_y, min_z, max_z)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);

                let order = 0;
                for (const fid of file_ids) {
                    const filename = facilitateFile(fid, prefix);
                    const meta = db.prepare(`SELECT * FROM gcode_metadata WHERE file_id = ?`).get(fid) || {};
                    const gfile = db.prepare(`SELECT filename, display_name FROM gcode_files WHERE id = ?`).get(fid);

                    insertPlate.run(
                        projectId,
                        filename,
                        gfile?.display_name || filename,
                        meta.estimated_time_s || null,
                        meta.filament_usage_mm || null,
                        meta.filament_usage_g || null,
                        meta.sliced_for || null,
                        order++,
                        meta.filament_type || null,
                        meta.min_x || null,
                        meta.max_x || null,
                        meta.min_y || null,
                        meta.max_y || null,
                        meta.min_z || null,
                        meta.max_z || null
                    );
                }
            }

            // Insert color assignments if any
            if (color_assignments.length > 0) {
                const insertAssign = db.prepare(`
                    INSERT INTO project_color_assignments (project_id, slot_key, spool_id, material, color_hex, vendor, spool_name)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `);
                for (const ca of color_assignments) {
                    insertAssign.run(
                        projectId,
                        ca.slot_key,
                        ca.spool_id || null,
                        ca.material || null,
                        ca.color_hex || null,
                        ca.vendor || null,
                        ca.spool_name || null
                    );
                }
            }

            db.exec('COMMIT');
            res.status(201).json({ success: true, id: projectId });
        } catch (txnErr) {
            db.exec('ROLLBACK');
            throw txnErr;
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/projects/:id (Rename, Update status, etc)
router.patch('/:id', (req, res) => {
    const { name, status, completed_at } = req.body;
    try {
        const fields = [];
        const params = [];

        if (name !== undefined) { fields.push('name = ?'); params.push(name); }
        if (status !== undefined) {
            fields.push('status = ?'); params.push(status);
            if (status === 'archived') {
                fields.push('completed_at = datetime(\'now\')');
                fields.push('folder_id = NULL');
            }
        }
        if (completed_at !== undefined) { fields.push('completed_at = ?'); params.push(completed_at); }

        if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

        params.push(req.params.id);
        const sql = `UPDATE projects SET ${fields.join(', ')} WHERE id = ?`;
        db.prepare(sql).run(...params);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update project plate status
router.patch('/:id/plates/:plateId', (req, res) => {
    const { status, printer_id, print_job_id } = req.body;
    try {
        const fields = [];
        const params = [];

        if (status !== undefined) {
            fields.push('status = ?'); params.push(status);
            if (status === 'done') fields.push('completed_at = datetime("now")');
        }
        if (printer_id !== undefined) { fields.push('printer_id = ?'); params.push(printer_id); }
        if (print_job_id !== undefined) { fields.push('print_job_id = ?'); params.push(print_job_id); }

        if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

        params.push(req.params.plateId);
        params.push(req.params.id);
        const sql = `UPDATE project_plates SET ${fields.join(', ')} WHERE id = ? AND project_id = ?`;
        db.prepare(sql).run(...params);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/projects/:id (Update status, name, or due_date)
router.patch('/:id', (req, res) => {
    const { status, name, due_date } = req.body;
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    try {
        const fields = ['updated_at = datetime(\'now\')'];
        const params = [];

        if (status !== undefined) {
            fields.push('status = ?');
            params.push(status);
            if (status === 'archived') fields.push('folder_id = NULL');
        }
        if (name !== undefined) { fields.push('name = ?'); params.push(name); }
        if (due_date !== undefined) { fields.push('due_date = ?'); params.push(due_date); }

        params.push(req.params.id);
        const sql = `UPDATE projects SET ${fields.join(', ')} WHERE id = ?`;
        db.prepare(sql).run(...params);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/projects/:id/folder
router.patch('/:id/folder', (req, res) => {
    const { folder_id } = req.body;
    try {
        const info = db.prepare('UPDATE projects SET folder_id = ? WHERE id = ?').run(folder_id || null, req.params.id);
        if (info.changes === 0) return res.status(404).json({ error: 'Project not found' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/projects/:id
router.delete('/:id', (req, res) => {
    try {
        // Find plates that were created from "PROJECTS" flow (prefixed with prj) to delete them
        // Plates from TEMPLATES flow should probably STAY in TEMPLATES_DIR until the template itself is deleted
        const plates = db.prepare('SELECT filename FROM project_plates WHERE project_id = ?').all(req.params.id);

        db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);

        // Delete prefixed files only if they were specific to this project
        for (const p of plates) {
            if (p.filename.startsWith('prj')) {
                const f = path.join(TEMPLATES_DIR, p.filename);
                if (fs.existsSync(f)) fs.unlinkSync(f);
                const thumb = path.join(THUMBS_DIR, `${p.filename}.png`);
                if (fs.existsSync(thumb)) fs.unlinkSync(thumb);
            }
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/projects/:id/plates/:plateId/print
// Upload the plate file to a printer and start the print, tracking the active job.
router.post('/:id/plates/:plateId/print', async (req, res) => {
    const { printer_id } = req.body;
    if (!printer_id) return res.status(400).json({ error: 'printer_id is required' });

    try {
        const plate = db.prepare('SELECT * FROM project_plates WHERE id = ? AND project_id = ?')
            .get(req.params.plateId, req.params.id);
        if (!plate) return res.status(404).json({ error: 'Plate not found' });

        const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(printer_id);
        if (!printer) return res.status(404).json({ error: 'Printer not found' });

        // Plate files live in TEMPLATES_DIR
        const filePath = path.join(TEMPLATES_DIR, plate.filename);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: `File not found on disk: ${plate.filename}` });

        const fileBuffer = fs.readFileSync(filePath);

        // Resolve a clean upload name: strip the prjXXX_ or tplXXX_ prefix,
        // then look up the original gcode_files record to get its human-readable display_name.
        const strippedName = plate.filename.replace(/^(?:prj|tpl)\d+_/, '');
        const origFile = db.prepare('SELECT display_name FROM gcode_files WHERE filename = ?').get(strippedName);
        const uploadName = origFile?.display_name || plate.display_name || strippedName;
        console.log(`[Projects] plate="${plate.filename}" stripped="${strippedName}" origFile="${origFile?.display_name}" uploadName="${uploadName}"`);

        const client = getClient(printer);
        await client.uploadFile(uploadName, fileBuffer);
        await client.startPrint(uploadName);

        // Record active job so poller can link completion to this plate
        db.prepare(`INSERT OR REPLACE INTO printer_active_jobs (printer_id, plate_id, filename) VALUES (?, ?, ?)`)
            .run(printer.id, plate.id, uploadName);

        // Mark plate as printing
        db.prepare(`UPDATE project_plates SET status = 'printing', printer_id = ? WHERE id = ?`)
            .run(printer.id, plate.id);

        res.json({ success: true });
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// Update project filament assignment
router.patch('/:id/filament', async (req, res) => {
    const { slot_key, spool_id } = req.body;
    if (!slot_key) return res.status(400).json({ error: 'slot_key is required' });

    try {
        const url = getSpoolmanUrl();
        let material = null, color_hex = null, vendor = null, spool_name = null;

        if (spool_id && url) {
            try {
                const r = await fetch(`${url}/api/v1/spool/${spool_id}`, { signal: AbortSignal.timeout(5000) });
                if (r.ok) {
                    const spool = await r.json();
                    material = spool.filament?.material || null;
                    color_hex = spool.filament?.color_hex || null;
                    vendor = spool.filament?.vendor?.name || null;
                    spool_name = spool.filament?.name || `Spool #${spool.id}`;
                }
            } catch (fetchErr) {
                console.error('Failed to fetch spool details from Spoolman:', fetchErr);
                // Fallback: we still update the spool_id even if metadata fetch fails
            }
        }

        db.prepare(`
            UPDATE project_color_assignments 
            SET spool_id = ?, material = ?, color_hex = ?, vendor = ?, spool_name = ?
            WHERE project_id = ? AND slot_key = ?
        `).run(spool_id || null, material, color_hex, vendor, spool_name, req.params.id, slot_key);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
