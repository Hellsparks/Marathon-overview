-- Add due_date to projects
ALTER TABLE projects ADD COLUMN due_date TEXT;

-- Add deadline warning setting (default 50%)
INSERT OR IGNORE INTO settings (key, value) VALUES ('project_deadline_warning_percent', '50');
