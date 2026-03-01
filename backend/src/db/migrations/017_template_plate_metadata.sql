-- Add filament usage columns to gcode_metadata
ALTER TABLE gcode_metadata ADD COLUMN filament_usage_mm REAL;
ALTER TABLE gcode_metadata ADD COLUMN filament_usage_g REAL;

-- Add detailed metadata columns to template_plates to support standalone template previews
ALTER TABLE template_plates ADD COLUMN estimated_time_s INTEGER;
ALTER TABLE template_plates ADD COLUMN sliced_for TEXT;
ALTER TABLE template_plates ADD COLUMN filament_usage_mm REAL;
ALTER TABLE template_plates ADD COLUMN filament_usage_g REAL;
ALTER TABLE template_plates ADD COLUMN has_thumbnail BOOLEAN DEFAULT 0;
