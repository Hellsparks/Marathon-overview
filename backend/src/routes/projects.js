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
                   COALESCE(t.thumbnail_path,
                       (SELECT t2.thumbnail_path FROM project_template_instances pti
                        JOIN project_templates t2 ON pti.template_id = t2.id
                        WHERE pti.project_id = p.id ORDER BY pti.sort_order LIMIT 1)
                   ) as thumbnail_path
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
                   tp.category_id, tp.option_id,
                   datetime(pj.end_time, '-' || pj.total_duration_s || ' seconds') as actual_start_time,
                   pj.end_time as actual_end_time
            FROM project_plates pp
            LEFT JOIN template_plates tp ON pp.template_plate_id = tp.id
            LEFT JOIN gcode_print_jobs pj ON pp.print_job_id = pj.id
            WHERE pp.project_id = ?
            ORDER BY pp.sort_order
        `).all(project.id);
        project.color_assignments = db.prepare(`SELECT * FROM project_color_assignments WHERE project_id = ?`).all(project.id);

        // Include category choices so the frontend can show which option was picked
        project.category_choices = db.prepare(`
            SELECT pcc.*, tc.name as category_name, tc.type as category_type,
                   tco.name as option_name
            FROM project_category_choices pcc
            LEFT JOIN template_categories tc ON pcc.category_id = tc.id
            LEFT JOIN template_category_options tco ON pcc.option_id = tco.id
            WHERE pcc.project_id = ?
        `).all(project.id);

        // Include template instances for multi-template projects
        project.instances = db.prepare(`
            SELECT pti.*, t.name as template_name
            FROM project_template_instances pti
            LEFT JOIN project_templates t ON pti.template_id = t.id
            WHERE pti.project_id = ?
            ORDER BY pti.sort_order
        `).all(project.id);

        res.json(project);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/** Helper: insert plates for a single template instance into a project */
function insertInstancePlates(projectId, instanceId, templateId, categoryChoices) {
    const templatePlates = db.prepare(`SELECT * FROM template_plates WHERE template_id = ?`).all(templateId);
    const categories = db.prepare(`SELECT * FROM template_categories WHERE template_id = ?`).all(templateId);
    const insertPlate = db.prepare(`
        INSERT INTO project_plates
        (project_id, instance_id, filename, display_name, estimated_time_s, filament_usage_mm, filament_usage_g, sliced_for, sort_order,
         filament_type, min_x, max_x, min_y, max_y, min_z, max_z, template_plate_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertChoice = db.prepare(`INSERT INTO project_category_choices (project_id, instance_id, category_id, option_id) VALUES (?, ?, ?, ?)`);

    const selectedOptionIds = new Set();
    const choiceCatIds = new Set();
    for (const cat of categories) {
        if (cat.type === 'choice') {
            choiceCatIds.add(cat.id);
            const chosenOptId = categoryChoices[cat.id] || categoryChoices[String(cat.id)];
            if (chosenOptId) {
                selectedOptionIds.add(Number(chosenOptId));
                insertChoice.run(projectId, instanceId, cat.id, Number(chosenOptId));
            }
        }
    }

    for (const tp of templatePlates) {
        if (tp.option_id && !selectedOptionIds.has(tp.option_id)) continue;
        if (tp.category_id && choiceCatIds.has(tp.category_id) && !tp.option_id) continue;

        insertPlate.run(
            projectId, instanceId, tp.filename, tp.display_name,
            tp.estimated_time_s, tp.filament_usage_mm, tp.filament_usage_g,
            tp.sliced_for, tp.sort_order,
            tp.filament_type || null,
            tp.min_x || null, tp.max_x || null,
            tp.min_y || null, tp.max_y || null,
            tp.min_z || null, tp.max_z || null,
            tp.id
        );
    }
}

// POST /api/projects (Hybrid — supports legacy single-template and new multi-instance)
router.post('/', (req, res) => {
    const { name, due_date, folder_id } = req.body;
    if (!name) return res.status(400).json({ error: 'Project name is required' });

    try {
        db.exec('BEGIN TRANSACTION');
        let projectId;
        try {
            const run = db.prepare(`INSERT INTO projects (template_id, name, due_date, folder_id) VALUES (?, ?, ?, ?)`).run(null, name, due_date || null, folder_id || null);
            projectId = run.lastInsertRowid;

            const instances = req.body.instances || [];
            const looseFiles = req.body.loose_files || [];

            // Legacy compat: if no instances but template_id provided, create one instance
            if (instances.length === 0 && req.body.template_id) {
                instances.push({
                    template_id: req.body.template_id,
                    choices: req.body.category_choices || {},
                    color_assignments: req.body.color_assignments || []
                });
            }

            // Legacy compat: file_ids without instances
            const legacyFileIds = req.body.file_ids || [];
            if (instances.length === 0 && legacyFileIds.length > 0) {
                const prefix = `prj${projectId}`;
                const insertPlate = db.prepare(`
                    INSERT INTO project_plates
                    (project_id, instance_id, filename, display_name, estimated_time_s, filament_usage_mm, filament_usage_g, sliced_for, sort_order,
                     filament_type, min_x, max_x, min_y, max_y, min_z, max_z)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);

                let order = 0;
                for (const fid of legacyFileIds) {
                    const filename = facilitateFile(fid, prefix);
                    const meta = db.prepare(`SELECT * FROM gcode_metadata WHERE file_id = ?`).get(fid) || {};
                    const gfile = db.prepare(`SELECT filename, display_name FROM gcode_files WHERE id = ?`).get(fid);

                    insertPlate.run(
                        projectId, null,
                        filename,
                        gfile?.display_name || filename,
                        meta.estimated_time_s || null,
                        meta.filament_usage_mm || null,
                        meta.filament_usage_g || null,
                        meta.sliced_for || null,
                        order++,
                        meta.filament_type || null,
                        meta.min_x || null, meta.max_x || null,
                        meta.min_y || null, meta.max_y || null,
                        meta.min_z || null, meta.max_z || null
                    );
                }
            }

            // Process each template instance
            const insertInstance = db.prepare(`INSERT INTO project_template_instances (project_id, template_id, label, sort_order) VALUES (?, ?, ?, ?)`);
            const insertAssign = db.prepare(`
                INSERT INTO project_color_assignments (project_id, instance_id, slot_key, spool_id, material, color_hex, vendor, spool_name)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (let i = 0; i < instances.length; i++) {
                const inst = instances[i];
                const instRun = insertInstance.run(projectId, inst.template_id, inst.label || null, i);
                const instanceId = instRun.lastInsertRowid;

                insertInstancePlates(projectId, instanceId, inst.template_id, inst.choices || {});

                // Color assignments for this instance
                const cas = Array.isArray(inst.color_assignments) ? inst.color_assignments : Object.values(inst.color_assignments || {});
                for (const ca of cas) {
                    insertAssign.run(
                        projectId, instanceId,
                        ca.slot_key,
                        ca.spool_id || null,
                        ca.material || null,
                        ca.color_hex || null,
                        ca.vendor || null,
                        ca.spool_name || null
                    );
                }
            }

            // Loose files
            if (looseFiles.length > 0) {
                const prefix = `prj${projectId}`;
                const insertPlate = db.prepare(`
                    INSERT INTO project_plates
                    (project_id, instance_id, filename, display_name, estimated_time_s, filament_usage_mm, filament_usage_g, sliced_for, sort_order,
                     filament_type, min_x, max_x, min_y, max_y, min_z, max_z)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                let order = instances.length * 100; // offset loose files after instance plates
                for (const lf of looseFiles) {
                    const filename = facilitateFile(lf.file_id, prefix);
                    const meta = db.prepare(`SELECT * FROM gcode_metadata WHERE file_id = ?`).get(lf.file_id) || {};
                    const gfile = db.prepare(`SELECT filename, display_name FROM gcode_files WHERE id = ?`).get(lf.file_id);

                    insertPlate.run(
                        projectId, null,
                        filename,
                        gfile?.display_name || filename,
                        meta.estimated_time_s || null,
                        meta.filament_usage_mm || null,
                        meta.filament_usage_g || null,
                        meta.sliced_for || null,
                        order++,
                        meta.filament_type || null,
                        meta.min_x || null, meta.max_x || null,
                        meta.min_y || null, meta.max_y || null,
                        meta.min_z || null, meta.max_z || null
                    );

                    // If a spool was assigned for the loose file, insert assignment
                    if (lf.spool_id) {
                        insertAssign.run(
                            projectId, null,
                            `loose_${lf.file_id}`,
                            lf.spool_id,
                            lf.material || null,
                            lf.color_hex || null,
                            lf.vendor || null,
                            lf.spool_name || null
                        );
                    }
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

// PATCH /api/projects/:id (Update status, name, due_date, or completed_at)
router.patch('/:id', (req, res) => {
    const { status, name, due_date, completed_at } = req.body;
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    try {
        const fields = ['updated_at = datetime(\'now\')'];
        const params = [];

        if (status !== undefined) {
            fields.push('status = ?');
            params.push(status);
            if (status === 'archived') {
                fields.push('folder_id = NULL');
                if (completed_at === undefined) fields.push('completed_at = datetime(\'now\')');
            }
        }
        if (name !== undefined) { fields.push('name = ?'); params.push(name); }
        if (due_date !== undefined) { fields.push('due_date = ?'); params.push(due_date); }
        if (completed_at !== undefined) { fields.push('completed_at = ?'); params.push(completed_at); }

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

// POST /api/projects/:id/instances — add a template instance to an existing project
router.post('/:id/instances', (req, res) => {
    const { template_id, label, choices = {}, color_assignments = [] } = req.body;
    if (!template_id) return res.status(400).json({ error: 'template_id is required' });

    try {
        const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        db.exec('BEGIN TRANSACTION');
        try {
            const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM project_template_instances WHERE project_id = ?').get(project.id);
            const sortOrder = (maxOrder?.m ?? -1) + 1;

            const instRun = db.prepare('INSERT INTO project_template_instances (project_id, template_id, label, sort_order) VALUES (?, ?, ?, ?)')
                .run(project.id, template_id, label || null, sortOrder);
            const instanceId = instRun.lastInsertRowid;

            insertInstancePlates(project.id, instanceId, template_id, choices);

            const insertAssign = db.prepare(`
                INSERT INTO project_color_assignments (project_id, instance_id, slot_key, spool_id, material, color_hex, vendor, spool_name)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const cas = Array.isArray(color_assignments) ? color_assignments : Object.values(color_assignments);
            for (const ca of cas) {
                insertAssign.run(project.id, instanceId, ca.slot_key, ca.spool_id || null, ca.material || null, ca.color_hex || null, ca.vendor || null, ca.spool_name || null);
            }

            db.exec('COMMIT');
            res.status(201).json({ success: true, instance_id: instanceId });
        } catch (txnErr) {
            db.exec('ROLLBACK');
            throw txnErr;
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/projects/:id/instances/:instanceId — remove a template instance from a project
router.delete('/:id/instances/:instanceId', (req, res) => {
    try {
        const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        // ON DELETE CASCADE on instance_id handles project_plates, project_category_choices, project_color_assignments
        const info = db.prepare('DELETE FROM project_template_instances WHERE id = ? AND project_id = ?').run(req.params.instanceId, project.id);
        if (info.changes === 0) return res.status(404).json({ error: 'Instance not found' });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/projects/:id/swap-option — swap a choice category's selected alternative
router.patch('/:id/swap-option', (req, res) => {
    const { category_id, new_option_id, force, instance_id } = req.body;
    if (!category_id || !new_option_id) return res.status(400).json({ error: 'category_id and new_option_id are required' });

    try {
        const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        // Find current choice for this category (scoped by instance_id if provided)
        const currentChoice = instance_id
            ? db.prepare('SELECT * FROM project_category_choices WHERE project_id = ? AND category_id = ? AND instance_id = ?').get(project.id, category_id, instance_id)
            : db.prepare('SELECT * FROM project_category_choices WHERE project_id = ? AND category_id = ?').get(project.id, category_id);

        if (currentChoice && currentChoice.option_id === Number(new_option_id)) {
            return res.json({ success: true, message: 'Already selected' });
        }

        // Find plates that belong to the old option (scoped by instance_id)
        const oldPlatesQuery = instance_id
            ? 'SELECT * FROM project_plates WHERE project_id = ? AND instance_id = ? AND template_plate_id IN (SELECT id FROM template_plates WHERE option_id = ?)'
            : 'SELECT * FROM project_plates WHERE project_id = ? AND template_plate_id IN (SELECT id FROM template_plates WHERE option_id = ?)';
        const oldPlates = currentChoice
            ? (instance_id
                ? db.prepare(oldPlatesQuery).all(project.id, instance_id, currentChoice.option_id)
                : db.prepare(oldPlatesQuery).all(project.id, currentChoice.option_id))
            : [];

        // Check for printed plates
        const donePlates = oldPlates.filter(p => p.status === 'done');
        if (donePlates.length > 0 && !force) {
            return res.json({
                warning: true,
                done_count: donePlates.length,
                done_plates: donePlates.map(p => ({ id: p.id, display_name: p.display_name })),
                message: `${donePlates.length} plate(s) already printed. Send force:true to confirm swap.`
            });
        }

        // Perform swap in transaction
        db.exec('BEGIN TRANSACTION');
        try {
            // Remove old option's plates (scoped by instance_id)
            if (currentChoice) {
                if (instance_id) {
                    db.prepare('DELETE FROM project_plates WHERE project_id = ? AND instance_id = ? AND template_plate_id IN (SELECT id FROM template_plates WHERE option_id = ?)')
                        .run(project.id, instance_id, currentChoice.option_id);
                } else {
                    db.prepare('DELETE FROM project_plates WHERE project_id = ? AND template_plate_id IN (SELECT id FROM template_plates WHERE option_id = ?)')
                        .run(project.id, currentChoice.option_id);
                }
            }

            // Insert new option's plates from template
            const newTemplatePlates = db.prepare('SELECT * FROM template_plates WHERE option_id = ?').all(new_option_id);
            const insertPlate = db.prepare(`
                INSERT INTO project_plates
                (project_id, instance_id, filename, display_name, estimated_time_s, filament_usage_mm, filament_usage_g, sliced_for, sort_order,
                 filament_type, min_x, max_x, min_y, max_y, min_z, max_z, template_plate_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (const tp of newTemplatePlates) {
                insertPlate.run(
                    project.id, instance_id || null, tp.filename, tp.display_name,
                    tp.estimated_time_s, tp.filament_usage_mm, tp.filament_usage_g,
                    tp.sliced_for, tp.sort_order,
                    tp.filament_type || null,
                    tp.min_x || null, tp.max_x || null,
                    tp.min_y || null, tp.max_y || null,
                    tp.min_z || null, tp.max_z || null,
                    tp.id
                );
            }

            // Update or insert the choice record
            if (currentChoice) {
                if (instance_id) {
                    db.prepare('UPDATE project_category_choices SET option_id = ? WHERE project_id = ? AND category_id = ? AND instance_id = ?')
                        .run(new_option_id, project.id, category_id, instance_id);
                } else {
                    db.prepare('UPDATE project_category_choices SET option_id = ? WHERE project_id = ? AND category_id = ?')
                        .run(new_option_id, project.id, category_id);
                }
            } else {
                db.prepare('INSERT INTO project_category_choices (project_id, instance_id, category_id, option_id) VALUES (?, ?, ?, ?)')
                    .run(project.id, instance_id || null, category_id, new_option_id);
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

        // path.basename prevents path traversal (plate.filename comes from DB but defence-in-depth)
        const safeFilename = path.basename(plate.filename);
        const filePath = path.join(TEMPLATES_DIR, safeFilename);
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
    const { slot_key, spool_id, instance_id } = req.body;
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

        if (instance_id) {
            db.prepare(`
                UPDATE project_color_assignments
                SET spool_id = ?, material = ?, color_hex = ?, vendor = ?, spool_name = ?
                WHERE project_id = ? AND slot_key = ? AND instance_id = ?
            `).run(spool_id || null, material, color_hex, vendor, spool_name, req.params.id, slot_key, instance_id);
        } else {
            db.prepare(`
                UPDATE project_color_assignments
                SET spool_id = ?, material = ?, color_hex = ?, vendor = ?, spool_name = ?
                WHERE project_id = ? AND slot_key = ?
            `).run(spool_id || null, material, color_hex, vendor, spool_name, req.params.id, slot_key);
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
