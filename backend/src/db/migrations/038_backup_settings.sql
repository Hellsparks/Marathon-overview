INSERT OR IGNORE INTO settings (key, value) VALUES
  ('backup_dir',                      ''),
  ('marathon_backup_enabled',         '0'),
  ('marathon_backup_interval',        '24'),
  ('marathon_backup_keep',            '7'),
  ('marathon_backup_include_uploads', '1'),
  ('spoolman_backup_enabled',         '0'),
  ('spoolman_backup_interval',        '24'),
  ('spoolman_backup_keep',            '7');
