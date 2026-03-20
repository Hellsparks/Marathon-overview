-- 018_projects.sql
-- Support for named print projects (hybrid: from template or files)

CREATE TABLE projects (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id  INTEGER REFERENCES project_templates(id) ON DELETE SET NULL,
  name         TEXT    NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'active',   -- 'active' | 'archived'
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE project_plates (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename         TEXT    NOT NULL,   -- stored filename (copied to templates/ or original)
  display_name     TEXT    NOT NULL,
  estimated_time_s INTEGER,
  filament_usage_mm REAL,
  filament_usage_g  REAL,
  sliced_for       TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  status           TEXT    NOT NULL DEFAULT 'pending',  -- 'pending'|'printing'|'done'|'failed'
  printer_id       INTEGER REFERENCES printers(id) ON DELETE SET NULL,
  print_job_id     INTEGER REFERENCES gcode_print_jobs(id) ON DELETE SET NULL,
  completed_at     TEXT
);

-- Actual spool/color assignments for this project run
CREATE TABLE project_color_assignments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slot_key   TEXT    NOT NULL,
  spool_id   INTEGER,
  material   TEXT,
  color_hex  TEXT,
  vendor     TEXT,
  spool_name TEXT
);
