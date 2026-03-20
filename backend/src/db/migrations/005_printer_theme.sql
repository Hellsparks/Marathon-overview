-- Add custom_css column to printers table for per-printer themes
ALTER TABLE printers ADD COLUMN custom_css TEXT;
