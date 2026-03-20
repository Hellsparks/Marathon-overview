const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const os      = require('os');
const archiver = require('archiver');
const AdmZip  = require('adm-zip');
const { getDb, closeDb, reopenDb, DB_PATH } = require('../db');

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');

const router = express.Router();

// Temp-storage multer instance — accepts .zip or .db files
const upload = multer({
    dest: os.tmpdir(),
    limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB for zips with gcode
});

// GET /api/database/export — download a zip containing the DB + all gcode/uploads
router.get('/export', (req, res) => {
    try {
        const db = getDb();
        // Flush WAL so the .db file is fully consistent
        db.exec('PRAGMA wal_checkpoint(FULL)');

        const dateStr = new Date().toISOString().slice(0, 10);
        const filename = `marathon-backup-${dateStr}.zip`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/zip');

        const archive = archiver('zip', { zlib: { level: 5 } });
        archive.on('error', err => { throw err; });
        archive.pipe(res);

        // Add database file
        archive.file(path.resolve(DB_PATH), { name: 'marathon.db' });

        // Add uploads directory (gcode files, thumbnails, templates)
        if (fs.existsSync(UPLOADS_DIR)) {
            archive.directory(UPLOADS_DIR, 'uploads');
        }

        archive.finalize();
    } catch (err) {
        if (!res.headersSent) {
            res.status(500).json({ error: err.message });
        }
    }
});

// POST /api/database/import — restore from a .zip (DB + uploads) or legacy .db file
// Backs up the current DB and uploads first, then replaces and reopens.
router.post('/import', upload.single('database'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const tmpPath = req.file.path;
    const cleanup = () => { try { fs.unlinkSync(tmpPath); } catch { /* ok */ } };

    try {
        // Detect file type by reading magic bytes
        const buf = Buffer.alloc(16);
        const fd  = fs.openSync(tmpPath, 'r');
        fs.readSync(fd, buf, 0, 16, 0);
        fs.closeSync(fd);

        const isSqlite = buf.toString('ascii').startsWith('SQLite format 3');
        const isZip = buf[0] === 0x50 && buf[1] === 0x4B; // PK magic bytes

        if (!isSqlite && !isZip) {
            cleanup();
            return res.status(400).json({ error: 'Not a valid backup file. Expected a .zip or .db file.' });
        }

        // Backup current DB
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
        const backupDbPath = DB_PATH + '.bak-' + timestamp;
        fs.copyFileSync(DB_PATH, backupDbPath);

        if (isSqlite) {
            // Legacy .db import — just replace the database
            closeDb();
            fs.copyFileSync(tmpPath, DB_PATH);
            cleanup();
            reopenDb();
            return res.json({ ok: true, backedUpTo: backupDbPath, type: 'db' });
        }

        // ZIP import — extract DB + uploads
        const zip = new AdmZip(tmpPath);
        const entries = zip.getEntries();

        // Find the database file in the zip
        const dbEntry = entries.find(e => e.entryName === 'marathon.db' || e.entryName.endsWith('.db'));
        if (!dbEntry) {
            cleanup();
            return res.status(400).json({ error: 'No database file found in zip.' });
        }

        // Validate the DB inside the zip
        const dbBuf = dbEntry.getData();
        if (!dbBuf.toString('ascii', 0, 15).startsWith('SQLite format 3')) {
            cleanup();
            return res.status(400).json({ error: 'Database file in zip is not valid SQLite.' });
        }

        // Backup current uploads
        const uploadsBackup = UPLOADS_DIR + '.bak-' + timestamp;
        if (fs.existsSync(UPLOADS_DIR)) {
            fs.renameSync(UPLOADS_DIR, uploadsBackup);
        }

        // Close DB, replace with new one
        closeDb();
        fs.writeFileSync(DB_PATH, dbBuf);

        // Extract uploads directory
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
        for (const entry of entries) {
            if (entry.isDirectory) continue;
            if (entry.entryName.startsWith('uploads/')) {
                const relPath = entry.entryName.slice('uploads/'.length);
                if (!relPath) continue;
                const destPath = path.join(UPLOADS_DIR, relPath);
                fs.mkdirSync(path.dirname(destPath), { recursive: true });
                fs.writeFileSync(destPath, entry.getData());
            }
        }

        cleanup();
        reopenDb();
        res.json({ ok: true, backedUpTo: backupDbPath, uploadsBackedUpTo: uploadsBackup, type: 'zip' });
    } catch (err) {
        cleanup();
        // Re-open whatever was there before in case close() was called
        try { reopenDb(); } catch { /* ignore */ }
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
