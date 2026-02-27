CREATE TABLE IF NOT EXISTS queue_entries (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  printer_id       INTEGER NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
  file_id          INTEGER NOT NULL REFERENCES gcode_files(id) ON DELETE CASCADE,
  filename         TEXT    NOT NULL,
  moonraker_job_id TEXT,
  position         INTEGER NOT NULL DEFAULT 0,
  status           TEXT    NOT NULL DEFAULT 'pending',
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);
