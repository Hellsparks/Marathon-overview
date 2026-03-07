-- 024_print_job_tracking.sql
-- Link print jobs to project plates, and track which plate is currently printing
-- on each printer so the poller can associate completed jobs automatically.

-- Add plate_id to existing print jobs table
ALTER TABLE gcode_print_jobs ADD COLUMN plate_id INTEGER REFERENCES project_plates(id) ON DELETE SET NULL;

-- One row per printer: set when a plate's file is sent to print, cleared when the job ends.
-- The poller reads this to know which plate to update when it logs a completed job.
CREATE TABLE printer_active_jobs (
  printer_id  INTEGER PRIMARY KEY REFERENCES printers(id) ON DELETE CASCADE,
  plate_id    INTEGER REFERENCES project_plates(id) ON DELETE SET NULL,
  filename    TEXT    NOT NULL,
  started_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
