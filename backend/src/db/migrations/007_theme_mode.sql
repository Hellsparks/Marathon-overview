-- Add theme_mode column to printers table for 3-way toggle (global, scrape, custom)
ALTER TABLE printers ADD COLUMN theme_mode TEXT DEFAULT 'global';
