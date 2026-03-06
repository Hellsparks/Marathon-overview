-- AMS spool slot assignments and Bambu untracked-usage tracking

CREATE TABLE IF NOT EXISTS ams_slots (
    printer_id INTEGER NOT NULL,
    tray_id    INTEGER NOT NULL,       -- 0-3
    spool_id   INTEGER,                -- Spoolman spool ID (nullable = empty slot)
    PRIMARY KEY (printer_id, tray_id)
);

-- Spools that were last used on a Bambu printer (untracked usage).
-- When such a spool is later loaded on a Moonraker printer, the UI shows
-- a warning to check remaining filament.
CREATE TABLE IF NOT EXISTS bambu_used_spools (
    spool_id    INTEGER PRIMARY KEY,   -- Spoolman spool ID
    printer_id  INTEGER NOT NULL,      -- which Bambu printer it was used on
    assigned_at TEXT NOT NULL DEFAULT (datetime('now'))
);
