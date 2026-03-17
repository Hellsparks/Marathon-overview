-- Setup wizard: track whether first-time setup has been completed.
-- Existing installs (with printers or spoolman configured) skip the wizard automatically.

INSERT OR IGNORE INTO settings (key, value) VALUES ('setup_completed', 'false');

-- If this is an existing install (has printers), mark setup as already done
UPDATE settings SET value = 'true'
  WHERE key = 'setup_completed'
    AND (SELECT COUNT(*) FROM printers) > 0;

-- Also mark done if spoolman was already configured
UPDATE settings SET value = 'true'
  WHERE key = 'setup_completed'
    AND EXISTS (SELECT 1 FROM settings WHERE key = 'spoolman_url' AND value != '');
