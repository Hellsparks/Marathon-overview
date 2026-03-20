-- 025_separate_folders.sql
-- Support for separate folder systems for projects, templates, and archives

-- Add folder_id to projects
ALTER TABLE projects ADD COLUMN folder_id INTEGER REFERENCES file_folders(id) ON DELETE SET NULL;

-- Add folder_id to templates
ALTER TABLE project_templates ADD COLUMN folder_id INTEGER REFERENCES file_folders(id) ON DELETE SET NULL;

-- Add folder_type to file_folders
-- We will default existing folders to 'gcode'
ALTER TABLE file_folders ADD COLUMN folder_type TEXT NOT NULL DEFAULT 'gcode';
