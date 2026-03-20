-- 010_gcode_thumbnails.sql
-- Add has_thumbnail tracking column
ALTER TABLE gcode_metadata ADD COLUMN has_thumbnail BOOLEAN DEFAULT 0;
