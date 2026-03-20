-- Spoolman inventory tracking: target stock levels per filament
CREATE TABLE IF NOT EXISTS spoolman_inventory (
    filament_id INTEGER PRIMARY KEY,  -- Spoolman filament ID (not a FK, external)
    target_qty  INTEGER NOT NULL DEFAULT 1,
    min_qty     INTEGER NOT NULL DEFAULT 0   -- buy trigger: buy when current stock falls below this
);
