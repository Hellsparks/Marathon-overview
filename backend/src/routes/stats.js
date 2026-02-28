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
      SELECT filename, COUNT(*) as print_count, SUM(total_duration_s) as total_duration_s, SUM(filament_used_mm) as total_filament_mm
      FROM gcode_print_jobs
      WHERE status = 'complete'
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
