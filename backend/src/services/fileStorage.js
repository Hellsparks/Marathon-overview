const path = require('path');
const fs = require('fs');

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');

function ensureUploadsDir() {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function getFilePath(filename) {
  return path.join(UPLOADS_DIR, filename);
}

function readFile(filename) {
  return fs.readFileSync(getFilePath(filename));
}

function deleteFile(filename) {
  const filePath = getFilePath(filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function fileExists(filename) {
  return fs.existsSync(getFilePath(filename));
}

module.exports = { ensureUploadsDir, getFilePath, readFile, deleteFile, fileExists };
