-- Migration 009: Add sliced_for column to gcode_metadata to store the printer model the file was sliced for

ALTER TABLE gcode_metadata ADD COLUMN sliced_for TEXT;
