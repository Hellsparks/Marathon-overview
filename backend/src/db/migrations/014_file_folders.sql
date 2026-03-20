CREATE TABLE file_folders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  parent_id  INTEGER REFERENCES file_folders(id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE gcode_files ADD COLUMN folder_id INTEGER REFERENCES file_folders(id) ON DELETE SET NULL;
