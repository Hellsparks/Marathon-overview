-- Default storage location name used by the spool inventory management feature.
-- Spools with location = this value are treated as sealed/unopened inventory.
INSERT OR IGNORE INTO settings (key, value) VALUES ('storage_location', 'Storage');
