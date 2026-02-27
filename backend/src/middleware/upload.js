const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');

// Ensure the uploads directory exists at startup
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    // Sanitize: strip path traversal chars, keep extension
    const safe = file.originalname.replace(/[^a-zA-Z0-9._\-]/g, '_');
    // Prefix with timestamp to avoid collisions
    cb(null, `${Date.now()}_${safe}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.gcode', '.gc', '.g', '.gco', '.bgcode'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(Object.assign(new Error(`File type not allowed: ${ext}`), { status: 400 }), false);
  }
};

module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: 512 * 1024 * 1024 }, // 512 MB
});
