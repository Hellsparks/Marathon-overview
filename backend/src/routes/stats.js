const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

// GET /api/stats/fleet
router.get('/fleet', (req, res) => {
    const db = getDb();
    try {
        const totalJobsStr = db.prepare(`SELECT COUNT(*) as count FROM gcode_print_jobs`).get().count;
        const totalDurationStr = db.prepare(`SELECT SUM(total_duration_s) as total FROM gcode_print_jobs`).get().total || 0;
        const totalFilamentStr = db.prepare(`SELECT SUM(filament_used_mm) as total FROM gcode_print_jobs`).get().total || 0;

        const topMaterialRow = db.prepare(`
            SELECT material, COUNT(*) as count
            FROM gcode_print_jobs
            WHERE material IS NOT NULL AND material != ''
            GROUP BY material
            ORDER BY count DESC
            LIMIT 1
        `).get();

        res.json({
            total_jobs: totalJobsStr,
            total_duration_s: totalDurationStr,
            total_filament_mm: totalFilamentStr,
            top_material: topMaterialRow ? topMaterialRow.material : null,
        });
    } catch (err) {
        console.error('[Stats API] Error fetching fleet stats:', err);
        res.status(500).json({ error: 'Failed to fetch fleet statistics' });
    }
});

// GET /api/stats/files
router.get('/files', (req, res) => {
    const db = getDb();
    try {
        const fileStats = db.prepare(`
            SELECT
                filename,
                COUNT(CASE WHEN status = 'complete'  THEN 1 END) as print_count,
                SUM(CASE WHEN status = 'complete'  THEN total_duration_s  ELSE 0 END) as total_duration_s,
                SUM(CASE WHEN status = 'complete'  THEN filament_used_mm  ELSE 0 END) as total_filament_mm,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_count,
                COUNT(CASE WHEN status = 'error'     THEN 1 END) as error_count
            FROM gcode_print_jobs
            GROUP BY filename
        `).all();

        const statsMap = {};
        for (const stat of fileStats) {
            statsMap[stat.filename] = stat;
        }
        res.json(statsMap);
    } catch (err) {
        console.error('[Stats API] Error fetching file stats:', err);
        res.status(500).json({ error: 'Failed to fetch file statistics' });
    }
});

// GET /api/stats/history?page=1&limit=50&printer_id=&status=
router.get('/history', (req, res) => {
    const db = getDb();
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const page  = Math.max(parseInt(req.query.page) || 1, 1);
        const offset = (page - 1) * limit;

        const conditions = [];
        const params = [];
        if (req.query.printer_id) { conditions.push('j.printer_id = ?'); params.push(parseInt(req.query.printer_id)); }
        if (req.query.status && req.query.status !== 'all') { conditions.push('j.status = ?'); params.push(req.query.status); }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const jobs = db.prepare(`
            SELECT
                j.id, j.printer_id, j.filename, j.status,
                j.total_duration_s, j.filament_used_mm,
                j.spool_name, j.material, j.color_hex, j.vendor,
                j.plate_id, j.end_time,
                p.name   AS printer_name,
                proj.name AS project_name,
                pp.display_name AS plate_display_name
            FROM gcode_print_jobs j
            LEFT JOIN printers p    ON p.id   = j.printer_id
            LEFT JOIN project_plates pp   ON pp.id  = j.plate_id
            LEFT JOIN projects proj ON proj.id = pp.project_id
            ${where}
            ORDER BY j.id DESC
            LIMIT ? OFFSET ?
        `).all(...params, limit, offset);

        const { count: total } = db.prepare(
            `SELECT COUNT(*) as count FROM gcode_print_jobs j ${where}`
        ).get(...params);

        res.json({ jobs, total, page, limit, pages: Math.ceil(total / limit) });
    } catch (err) {
        console.error('[Stats API] Error fetching history:', err);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

// GET /api/stats/utilization?printer_id=
router.get('/utilization', (req, res) => {
    const db = getDb();
    try {
        const printerId = req.query.printer_id ? parseInt(req.query.printer_id) : null;
        const printerFilter = printerId ? 'AND j.printer_id = ?' : '';
        const printerParam  = printerId ? [printerId] : [];

        // Per-printer totals (always all printers for comparison chart)
        const printerTotals = db.prepare(`
            SELECT
                j.printer_id,
                p.name AS printer_name,
                COUNT(*)                AS job_count,
                SUM(j.total_duration_s) AS total_s,
                SUM(j.filament_used_mm) AS total_filament_mm
            FROM gcode_print_jobs j
            LEFT JOIN printers p ON p.id = j.printer_id
            WHERE j.status = 'complete'
            GROUP BY j.printer_id
            ORDER BY total_s DESC
        `).all();

        // Top files by completed print time (scoped to selected printer if any)
        const topFiles = db.prepare(`
            SELECT
                j.filename,
                SUM(j.total_duration_s) AS total_s,
                COUNT(*)                AS count
            FROM gcode_print_jobs j
            WHERE j.status = 'complete' ${printerFilter}
            GROUP BY j.filename
            ORDER BY total_s DESC
            LIMIT 10
        `).all(...printerParam);

        // Weekly activity — last 12 weeks, per printer (scoped if selected)
        const weeklyActivity = db.prepare(`
            SELECT
                j.printer_id,
                p.name AS printer_name,
                strftime('%Y-W%W', j.end_time) AS week,
                SUM(j.total_duration_s)        AS total_s,
                COUNT(*)                       AS job_count
            FROM gcode_print_jobs j
            LEFT JOIN printers p ON p.id = j.printer_id
            WHERE j.status = 'complete'
              AND j.end_time >= datetime('now', '-84 days')
              ${printerFilter}
            GROUP BY j.printer_id, week
            ORDER BY week ASC, j.printer_id ASC
        `).all(...printerParam);

        res.json({ printerTotals, topFiles, weeklyActivity });
    } catch (err) {
        console.error('[Stats API] Error fetching utilization:', err);
        res.status(500).json({ error: 'Failed to fetch utilization' });
    }
});

module.exports = router;
