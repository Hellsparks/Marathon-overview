const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const os      = require('os');
const { getDb, closeDb, reopenDb, DB_PATH } = require('../db');

const router = express.Router();

// Temp-storage multer instance — only used for DB file uploads
const upload = multer({
    dest: os.tmpdir(),
    limits: { fileSize: 512 * 1024 * 1024 },
});

// GET /api/database/export — download a clean snapshot of the Marathon SQLite DB
router.get('/export', (req, res) => {
    try {
        const db = getDb();
        // Flush WAL so the .db file is fully consistent
        db.exec('PRAGMA wal_checkpoint(FULL)');
        const dateStr = new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Disposition', `attachment; filename="marathon-backup-${dateStr}.db"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.sendFile(path.resolve(DB_PATH));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/database/import — restore from a .db file upload
// Backs up the current DB first, then replaces and reopens.
router.post('/import', upload.single('database'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const tmpPath = req.file.path;
    const cleanup = () => { try { fs.unlinkSync(tmpPath); } catch { /* ok */ } };

    try {
        // Validate SQLite magic bytes
        const buf = Buffer.alloc(16);
        const fd  = fs.openSync(tmpPath, 'r');
        fs.readSync(fd, buf, 0, 16, 0);
        fs.closeSync(fd);
        if (!buf.toString('ascii').startsWith('SQLite format 3')) {
            cleanup();
            return res.status(400).json({ error: 'Not a valid SQLite database file.' });
        }

        // Backup current DB alongside the data directory
        const backupPath = DB_PATH + '.bak-' + new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
        fs.copyFileSync(DB_PATH, backupPath);

        // Close → replace → reopen (runs migrations if any are new)
        closeDb();
        fs.copyFileSync(tmpPath, DB_PATH);
        cleanup();
        reopenDb();

        res.json({ ok: true, backedUpTo: backupPath });
    } catch (err) {
        cleanup();
        // Re-open whatever was there before in case close() was called
        try { reopenDb(); } catch { /* ignore */ }
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
