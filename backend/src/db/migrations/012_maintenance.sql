ALTER TABLE printers ADD COLUMN runtime_s INTEGER DEFAULT 0;

CREATE TABLE maintenance_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE maintenance_intervals (
  task_id INTEGER NOT NULL REFERENCES maintenance_tasks(id) ON DELETE CASCADE,
  printer_id INTEGER NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
  interval_hours INTEGER DEFAULT 0,
  PRIMARY KEY (task_id, printer_id)
);

CREATE TABLE maintenance_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES maintenance_tasks(id) ON DELETE CASCADE,
  printer_id INTEGER NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
  performed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  runtime_s_at_performance INTEGER NOT NULL
);
