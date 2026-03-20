-- Printer capability columns
ALTER TABLE printers ADD COLUMN bed_width      INTEGER;
ALTER TABLE printers ADD COLUMN bed_depth      INTEGER;
ALTER TABLE printers ADD COLUMN bed_height     INTEGER;
ALTER TABLE printers ADD COLUMN filament_types TEXT DEFAULT '[]';
ALTER TABLE printers ADD COLUMN toolhead_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE printers ADD COLUMN preset_id      TEXT;

-- Printer presets (built-in + user-created)
CREATE TABLE IF NOT EXISTS printer_presets (
  id              TEXT    PRIMARY KEY,
  name            TEXT    NOT NULL,
  bed_width       INTEGER NOT NULL,
  bed_depth       INTEGER NOT NULL,
  bed_height      INTEGER NOT NULL,
  filament_types  TEXT    NOT NULL DEFAULT '["PLA","PETG","ABS","TPU"]',
  toolhead_count  INTEGER NOT NULL DEFAULT 1,
  is_builtin      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Seed built-in presets
INSERT OR IGNORE INTO printer_presets (id, name, bed_width, bed_depth, bed_height, filament_types, toolhead_count, is_builtin) VALUES
  ('voron-0.1',      'Voron 0.1',       120, 120, 120, '["PLA","PETG","ABS","ASA","Nylon","TPU"]',        1, 1),
  ('voron-0.2',      'Voron 0.2',       120, 120, 120, '["PLA","PETG","ABS","ASA","Nylon","TPU"]',        1, 1),
  ('voron-2.4-250',  'Voron 2.4 (250)', 250, 250, 230, '["PLA","PETG","ABS","ASA","Nylon","PC","TPU"]',   1, 1),
  ('voron-2.4-300',  'Voron 2.4 (300)', 300, 300, 280, '["PLA","PETG","ABS","ASA","Nylon","PC","TPU"]',   1, 1),
  ('voron-2.4-350',  'Voron 2.4 (350)', 350, 350, 330, '["PLA","PETG","ABS","ASA","Nylon","PC","TPU"]',   1, 1),
  ('voron-trident',  'Voron Trident',   300, 300, 250, '["PLA","PETG","ABS","ASA","Nylon","PC","TPU"]',   1, 1),
  ('ender-3',        'Ender 3',         220, 220, 250, '["PLA","PETG","TPU"]',                            1, 1),
  ('ender-3-v3',     'Ender 3 V3',      220, 220, 250, '["PLA","PETG","ABS","TPU"]',                      1, 1),
  ('prusa-mk3s',     'Prusa MK3S+',     250, 210, 210, '["PLA","PETG","ABS","ASA","Nylon","PC","TPU"]',   1, 1),
  ('prusa-mk4',      'Prusa MK4',       250, 210, 220, '["PLA","PETG","ABS","ASA","Nylon","PC","TPU"]',   1, 1),
  ('bambu-x1c',      'Bambu X1 Carbon', 256, 256, 256, '["PLA","PETG","ABS","ASA","Nylon","PC","TPU"]',   4, 1),
  ('bambu-a1',       'Bambu A1',        256, 256, 256, '["PLA","PETG","ABS","ASA","TPU"]',                4, 1);

-- G-code metadata parsed from uploaded files
CREATE TABLE IF NOT EXISTS gcode_metadata (
  file_id       INTEGER PRIMARY KEY REFERENCES gcode_files(id) ON DELETE CASCADE,
  min_x         REAL,
  max_x         REAL,
  min_y         REAL,
  max_y         REAL,
  min_z         REAL,
  max_z         REAL,
  filament_type TEXT,
  estimated_time_s INTEGER,
  parsed_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
