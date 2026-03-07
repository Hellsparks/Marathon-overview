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

        // Most used material
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
        COUNT(CASE WHEN status = 'complete' THEN 1 END) as print_count,
        SUM(CASE WHEN status = 'complete' THEN total_duration_s ELSE 0 END) as total_duration_s,
        SUM(CASE WHEN status = 'complete' THEN filament_used_mm ELSE 0 END) as total_filament_mm,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_count,
        COUNT(CASE WHEN status = 'error' THEN 1 END) as error_count
      FROM gcode_print_jobs
      GROUP BY filename
    `).all();

        // Convert to a dictionary for easier frontend lookup
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

module.exports = router;

// GET /api/stats/history
router.get('/history', (req, res) => {
    const db = getDb();
    try {
        const { page = 1, limit = 50, printer_id, status, start, end } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let whereClauses = [];
        let params = [];

        if (printer_id) {
            whereClauses.push('gj.printer_id = ?');
            params.push(printer_id);
        }
        if (status) {
            whereClauses.push('gj.status = ?');
            params.push(status);
        }
        if (start) {
            whereClauses.push('gj.end_time >= ?');
            params.push(start);
        }
        if (end) {
            whereClauses.push('gj.end_time <= ?');
            params.push(end);
        }

        const whereSQL = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

        const countQuery = `
            SELECT COUNT(*) as total 
            FROM gcode_print_jobs gj
            ${whereSQL}
        `;
        const total = db.prepare(countQuery).get(...params).total;

        const dataQuery = `
            SELECT 
                gj.id, gj.printer_id, gj.filename, gj.total_duration_s,
                gj.filament_used_mm, gj.spool_id, gj.spool_name,
                gj.material, gj.color_hex, gj.vendor, gj.end_time, gj.status,
                pr.name as printer_name,
                pp.display_name as plate_name,
                p.name as project_name
            FROM gcode_print_jobs gj
            LEFT JOIN printers pr ON gj.printer_id = pr.id
            LEFT JOIN project_plates pp ON gj.id = pp.print_job_id
            LEFT JOIN projects p ON pp.project_id = p.id
            ${whereSQL}
            ORDER BY gj.end_time DESC
            LIMIT ? OFFSET ?
        `;
        const rows = db.prepare(dataQuery).all(...params, limit, offset);

        res.json({
            data: rows,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error('[Stats API] Error fetching history:', err);
        res.status(500).json({ error: 'Failed to fetch print history' });
    }
});

router.get('/utilization', (req, res) => {
    const db = getDb();
    try {
        const { printer_id, timeline_start, timeline_end } = req.query;

        // 1. Printer totals
        let printerStatsQuery = `
            SELECT 
                pr.id, pr.name,
                COUNT(gj.id) as job_count,
                SUM(gj.total_duration_s) as total_duration_s,
                SUM(gj.filament_used_mm) as total_filament_mm
            FROM gcode_print_jobs gj
            JOIN printers pr ON gj.printer_id = pr.id
            WHERE gj.status = 'complete'
        `;
        if (printer_id) {
            printerStatsQuery += ` AND pr.id = ?`;
        }
        printerStatsQuery += ` GROUP BY pr.id, pr.name ORDER BY total_duration_s DESC`;

        const params = printer_id ? [printer_id] : [];
        const printer_stats = db.prepare(printerStatsQuery).all(...params);

        // 2. Top files by duration
        let topFilesQuery = `
            SELECT 
                gj.filename,
                p.name as project_name,
                SUM(gj.total_duration_s) as total_print_time
            FROM gcode_print_jobs gj
            LEFT JOIN project_plates pp ON gj.id = pp.print_job_id
            LEFT JOIN projects p ON pp.project_id = p.id
            WHERE gj.status = 'complete'
        `;
        if (printer_id) {
            topFilesQuery += ` AND gj.printer_id = ?`;
        }
        topFilesQuery += `
            GROUP BY gj.filename, p.name
            ORDER BY total_print_time DESC
            LIMIT 8
        `;
        const top_files = db.prepare(topFilesQuery).all(...params);

        // 3. Weekly activity for the last 12 weeks
        // Using SQLite date functions: strftime('%W', end_time) gets week num
        // We'll bucket by (year-week) and also get a printable week start date
        let weeklyQuery = `
            SELECT 
                strftime('%Y-%W', gj.end_time) as week_key,
                date(gj.end_time, 'weekday 0', '-6 days') as week_start,
                gj.printer_id,
                pr.name as printer_name,
                SUM(gj.total_duration_s) as total_duration_s
            FROM gcode_print_jobs gj
            JOIN printers pr ON gj.printer_id = pr.id
            WHERE gj.status = 'complete' 
              AND gj.end_time >= date('now', '-12 weeks')
        `;
        if (printer_id) {
            weeklyQuery += ` AND gj.printer_id = ?`;
        }
        weeklyQuery += `
            GROUP BY week_key, week_start, gj.printer_id, pr.name
            ORDER BY week_key ASC
        `;
        const weekly_raw = db.prepare(weeklyQuery).all(...params);

        // 4. Timeline Jobs (with custom date range logic)
        let timelineQuery = `
            SELECT 
                gj.id, gj.printer_id, pr.name as printer_name,
                gj.total_duration_s, gj.end_time, gj.status,
                gj.filename, p.name as project_name
            FROM gcode_print_jobs gj
            JOIN printers pr ON gj.printer_id = pr.id
            LEFT JOIN project_plates pp ON gj.id = pp.print_job_id
            LEFT JOIN projects p ON pp.project_id = p.id
        `;
        let tlWhere = [];
        let tlParams = [];

        if (printer_id) {
            tlWhere.push(`gj.printer_id = ?`);
            tlParams.push(printer_id);
        }

        if (timeline_start && timeline_end) {
            tlWhere.push(`gj.end_time >= ? AND gj.end_time <= ?`);
            tlParams.push(`${timeline_start} 00:00:00`, `${timeline_end} 23:59:59`);
        } else {
            tlWhere.push(`gj.end_time >= date('now', '-30 days')`);
        }

        if (tlWhere.length > 0) timelineQuery += ` WHERE ` + tlWhere.join(' AND ');

        timelineQuery += ` ORDER BY gj.end_time ASC`;
        const timeline_jobs = db.prepare(timelineQuery).all(...tlParams);

        res.json({
            printer_stats,
            top_files,
            weekly_data: weekly_raw,
            timeline_jobs
        });
    } catch (err) {
        console.error('[Stats API] Error fetching utilization:', err);
        res.status(500).json({ error: 'Failed to fetch utilization stats' });
    }
});
