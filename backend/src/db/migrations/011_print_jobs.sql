CREATE TABLE gcode_print_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  printer_id INTEGER NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  total_duration_s INTEGER,
  filament_used_mm REAL,
  spool_id INTEGER,
  spool_name TEXT,
  material TEXT,
  color_hex TEXT,
  vendor TEXT,
  end_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT
);
