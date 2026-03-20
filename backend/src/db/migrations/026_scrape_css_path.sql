-- 026_scrape_css_path.sql
-- Allow per-printer custom path for the CSS auto-scraper
ALTER TABLE printers ADD COLUMN scrape_css_path TEXT;
