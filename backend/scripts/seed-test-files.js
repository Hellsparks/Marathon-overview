#!/usr/bin/env node
/**
 * One-time script: import all test G-code files from ../../test-gcodes/
 * into Marathon's uploads directory and gcode_files table.
 *
 * Run from the backend directory:
 *   node scripts/seed-test-files.js
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/marathon.db');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../uploads');
const TEST_DIR = path.join(__dirname, '../../test-gcodes');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON');

const files = fs.readdirSync(TEST_DIR).filter(f => f.endsWith('.gcode')).sort();

let added = 0, skipped = 0;

for (const originalName of files) {
  // Check if already imported (by display_name)
  const existing = db.prepare('SELECT id FROM gcode_files WHERE display_name = ?').get(originalName);
  if (existing) {
    console.log(`  skip  ${originalName} (already imported)`);
    skipped++;
    continue;
  }

  const ts = Date.now();
  const safe = originalName.replace(/[^a-zA-Z0-9._\-]/g, '_');
  const storedName = `${ts}_${safe}`;

  // Copy to uploads
  const src = path.join(TEST_DIR, originalName);
  const dst = path.join(UPLOADS_DIR, storedName);
  fs.copyFileSync(src, dst);

  const size = fs.statSync(dst).size;

  db.prepare(
    `INSERT INTO gcode_files (filename, display_name, size_bytes, upload_source) VALUES (?, ?, ?, 'seed')`
  ).run(storedName, originalName, size);

  console.log(`  added ${originalName}  →  ${storedName}`);
  added++;
}

console.log(`\nDone: ${added} added, ${skipped} skipped.`);
db.close();
