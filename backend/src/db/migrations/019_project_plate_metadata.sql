-- Add metadata columns to project_plates
ALTER TABLE project_plates ADD COLUMN filament_type TEXT;
ALTER TABLE project_plates ADD COLUMN min_x REAL;
ALTER TABLE project_plates ADD COLUMN max_x REAL;
ALTER TABLE project_plates ADD COLUMN min_y REAL;
ALTER TABLE project_plates ADD COLUMN max_y REAL;
ALTER TABLE project_plates ADD COLUMN min_z REAL;
ALTER TABLE project_plates ADD COLUMN max_z REAL;
