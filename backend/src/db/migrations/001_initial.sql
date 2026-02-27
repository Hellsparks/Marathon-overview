PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS printers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  host       TEXT    NOT NULL,
  port       INTEGER NOT NULL DEFAULT 7125,
  api_key    TEXT,
  enabled    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gcode_files (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  filename      TEXT    NOT NULL UNIQUE,
  display_name  TEXT    NOT NULL,
  size_bytes    INTEGER NOT NULL,
  upload_source TEXT    NOT NULL DEFAULT 'web',
  slicer_name   TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS print_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  printer_id  INTEGER REFERENCES printers(id) ON DELETE SET NULL,
  file_id     INTEGER REFERENCES gcode_files(id) ON DELETE SET NULL,
  filename    TEXT    NOT NULL,
  started_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  status      TEXT    NOT NULL DEFAULT 'printing',
  duration_s  INTEGER
);
