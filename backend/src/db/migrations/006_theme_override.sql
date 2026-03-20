-- Add theme_override column to printers table for per-printer themes
ALTER TABLE printers ADD COLUMN theme_override BOOLEAN DEFAULT 0;
