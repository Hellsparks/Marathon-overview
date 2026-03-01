-- Add filament_type to template_plates to allow frontend to surface what plastic the G-code was sliced for

ALTER TABLE template_plates ADD COLUMN filament_type TEXT;
