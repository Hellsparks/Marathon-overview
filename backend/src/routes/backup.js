const express = require('express');
const fs = require('fs');
const path = require('path');
const { backupMarathon, backupSpoolman, getBackupDirs, isSmbPath, DEFAULT_BACKUP_DIR } = require('../services/backup');
const { getDb } = require('../db');

const router = express.Router();

function getSetting(key, def = '') {
    try {
        const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
        return row ? row.value : def;
    } catch { return def; }
}

function listBackups(dir, subfolder) {
    const target = path.join(dir, subfolder);
    if (!dir || !fs.existsSync(target)) return [];
    return fs.readdirSync(target)
        .filter(f => f.startsWith(subfolder + '-') && f.endsWith('.zip'))
        .map(f => {
            const stat = fs.statSync(path.join(target, f));
            return { name: f, size: stat.size, mtime: stat.mtime.toISOString() };
        })
        .sort((a, b) => b.mtime.localeCompare(a.mtime));
}

// Merge file lists from multiple dirs, deduplicate by name, keep newest copy
function mergeBackupLists(dirs, subfolder) {
    const seen = new Map();
    for (const dir of dirs) {
        for (const f of listBackups(dir, subfolder)) {
            if (!seen.has(f.name) || f.mtime > seen.get(f.name).mtime) {
                seen.set(f.name, { ...f, dir });
            }
        }
    }
    return [...seen.values()].sort((a, b) => b.mtime.localeCompare(a.mtime));
}

// GET /api/backup/status
router.get('/status', (_req, res) => {
    const dirs = getBackupDirs();
    const [dir1, dir2 = ''] = dirs;
    res.json({
        dir: dir1,
        dir2,
        defaultDir: DEFAULT_BACKUP_DIR,
        dir1IsSMB: isSmbPath(dir1),
        dir2IsSMB: dir2 ? isSmbPath(dir2) : false,
        smbUser1: getSetting('backup_smb_user_1') || '',
        smbUser2: getSetting('backup_smb_user_2') || '',
        marathon: {
            enabled:         getSetting('marathon_backup_enabled')         === '1',
            intervalHours:   parseFloat(getSetting('marathon_backup_interval', '24'))  || 24,
            keep:            parseInt(getSetting('marathon_backup_keep', '7'), 10)      || 7,
            includeUploads:  getSetting('marathon_backup_include_uploads', '1') === '1',
            lastBackup:      getSetting('marathon_last_backup') || null,
            files:           mergeBackupLists(dirs, 'marathon'),
        },
        spoolman: {
            enabled:         getSetting('spoolman_backup_enabled')         === '1',
            intervalHours:   parseFloat(getSetting('spoolman_backup_interval', '24'))  || 24,
            keep:            parseInt(getSetting('spoolman_backup_keep', '7'), 10)      || 7,
            lastBackup:      getSetting('spoolman_last_backup') || null,
            spoolmanDataDir: getSetting('spoolman_data_dir') || '',
            files:           mergeBackupLists(dirs, 'spoolman'),
        },
    });
});

// POST /api/backup/run — manual trigger
// body: { target: 'marathon' | 'spoolman' | 'all' }
router.post('/run', async (req, res) => {
    const { target = 'all' } = req.body;
    const errors = [];

    if (target === 'marathon' || target === 'all') {
        try { await backupMarathon(); }
        catch (e) { errors.push({ target: 'marathon', error: e.message }); }
    }
    if (target === 'spoolman' || target === 'all') {
        try { await backupSpoolman(); }
        catch (e) { errors.push({ target: 'spoolman', error: e.message }); }
    }

    if (errors.length) return res.status(207).json({ ok: false, errors });
    res.json({ ok: true });
});

// DELETE /api/backup/:filename — delete backup file from all configured dirs
// Infers subfolder from filename prefix (marathon-* → marathon/, spoolman-* → spoolman/)
router.delete('/:filename', (req, res) => {
    const { filename } = req.params;
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
        return res.status(400).json({ error: 'Invalid filename' });
    }
    const subfolder = filename.startsWith('spoolman-') ? 'spoolman' : 'marathon';
    const dirs = getBackupDirs();
    let deleted = 0;
    for (const dir of dirs) {
        const filePath = path.join(dir, subfolder, filename);
        if (fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); deleted++; } catch { /* ok */ }
        }
    }
    if (deleted === 0) return res.status(404).json({ error: 'File not found in any backup directory' });
    res.json({ ok: true, deleted });
});

module.exports = router;
