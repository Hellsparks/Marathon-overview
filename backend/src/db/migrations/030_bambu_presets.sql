-- Expand built-in printer presets
-- Covers: Bambu, Prusa, Voron, RatRig, Creality, Snapmaker, VZbot, Mercury, Anycubic, Positron

-- Remove stale user-created presets that are now covered by built-ins
DELETE FROM printer_presets WHERE name LIKE '%No enclosure%';

-- Fix A1 bed dimensions (was using X1C dimensions)
UPDATE printer_presets SET bed_width = 256, bed_depth = 256, bed_height = 256 WHERE id = 'bambu-a1';

-- ── Bambu Lab ────────────────────────────────────────────────────────
INSERT OR IGNORE INTO printer_presets (id, name, bed_width, bed_depth, bed_height, filament_types, toolhead_count, is_builtin) VALUES
  ('bambu-a1-mini',  'Bambu A1 Mini',    180, 180, 180, '["PLA","PETG","TPU"]',                              4, 1),
  ('bambu-p1s',      'Bambu P1S',         256, 256, 256, '["PLA","PETG","ABS","ASA","Nylon","PC","TPU"]',     4, 1),
  ('bambu-p1p',      'Bambu P1P',         256, 256, 256, '["PLA","PETG","ABS","ASA","TPU"]',                  4, 1),
  ('bambu-x1e',      'Bambu X1E',         256, 256, 256, '["PLA","PETG","ABS","ASA","Nylon","PC","TPU"]',     4, 1),
  ('bambu-p2s',      'Bambu P2S',         256, 256, 256, '["PLA","PETG","ABS","ASA","Nylon","PC","TPU"]',     4, 1),
  ('bambu-h2',       'Bambu H2',          256, 256, 256, '["PLA","PETG","ABS","ASA","Nylon","PC","TPU"]',     4, 1),
  ('bambu-h2d',      'Bambu H2D',         256, 256, 256, '["PLA","PETG","ABS","ASA","Nylon","PC","TPU"]',     4, 1);

-- ── Prusa ────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO printer_presets (id, name, bed_width, bed_depth, bed_height, filament_types, toolhead_count, is_builtin) VALUES
  ('prusa-mk4s',        'Prusa MK4S',          250, 210, 220, '["PLA","PETG","ABS","ASA","Nylon","PC","TPU"]',   1, 1),
  ('prusa-mini',        'Prusa Mini+',         180, 180, 180, '["PLA","PETG","ASA"]',                            1, 1),
  ('prusa-xl-1t',       'Prusa XL (1 Tool)',   360, 360, 360, '["PLA","PETG","ABS","ASA","Nylon","PC","TPU"]',   1, 1),
  ('prusa-xl-2t',       'Prusa XL (2 Tool)',   360, 360, 360, '["PLA","PETG","ABS","ASA","Nylon","PC","TPU"]',   2, 1),
  ('prusa-xl-5t',       'Prusa XL (5 Tool)',   360, 360, 360, '["PLA","PETG","ABS","ASA","Nylon","PC","TPU"]',   5, 1),
  ('prusa-core-one',    'Prusa Core One',      250, 220, 270, '["PLA","PETG","ABS","ASA","Nylon","PC","TPU"]',   1, 1),
  ('prusa-core-one-l',  'Prusa Core One L',    300, 250, 270, '["PLA","PETG","ABS","ASA","Nylon","PC","TPU"]',   1, 1);

-- ── Voron ────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO printer_presets (id, name, bed_width, bed_depth, bed_height, filament_types, toolhead_count, is_builtin) VALUES
  ('voron-trident-250',   'Voron Trident (250)',   250, 250, 230, '["PLA","PETG","ABS","ASA","Nylon","PC","TPU"]',   1, 1),
  ('voron-trident-300',   'Voron Trident (300)',   300, 300, 250, '["PLA","PETG","ABS","ASA","Nylon","PC","TPU"]',   1, 1),
  ('voron-trident-350',   'Voron Trident (350)',   350, 350, 270, '["PLA","PETG","ABS","ASA","Nylon","PC","TPU"]',   1, 1),
  ('voron-switchwire',    'Voron Switchwire',      250, 210, 220, '["PLA","PETG","ABS","ASA","Nylon","PC","TPU"]',   1, 1),
  ('voron-enderwire',     'Voron Enderwire',       220, 220, 250, '["PLA","PETG","ABS","ASA","Nylon","TPU"]',        1, 1),
  ('voron-legacy',        'Voron Legacy',          230, 230, 230, '["PLA","PETG","ABS","ASA","Nylon","TPU"]',        1, 1);

-- ── RatRig ───────────────────────────────────────────────────────────
INSERT OR IGNORE INTO printer_presets (id, name, bed_width, bed_depth, bed_height, filament_types, toolhead_count, is_builtin) VALUES
  ('ratrig-vcore3-200',      'RatRig V-Core 3 (200)',        200, 200, 200, '["PLA","PETG","ABS","ASA","Nylon","TPU"]',      1, 1),
  ('ratrig-vcore3-300',      'RatRig V-Core 3 (300)',        300, 300, 300, '["PLA","PETG","ABS","ASA","Nylon","TPU"]',      1, 1),
  ('ratrig-vcore3-400',      'RatRig V-Core 3 (400)',        400, 400, 400, '["PLA","PETG","ABS","ASA","Nylon","TPU"]',      1, 1),
  ('ratrig-vcore3-500',      'RatRig V-Core 3 (500)',        500, 500, 500, '["PLA","PETG","ABS","ASA","Nylon","TPU"]',      1, 1),
  ('ratrig-vcore4-300',      'RatRig V-Core 4 (300)',        300, 300, 300, '["PLA","PETG","ABS","ASA","Nylon","PC","TPU"]', 1, 1),
  ('ratrig-vcore4-400',      'RatRig V-Core 4 (400)',        400, 400, 400, '["PLA","PETG","ABS","ASA","Nylon","PC","TPU"]', 1, 1),
  ('ratrig-vcore4-500',      'RatRig V-Core 4 (500)',        500, 500, 500, '["PLA","PETG","ABS","ASA","Nylon","PC","TPU"]', 1, 1),
  ('ratrig-vcore4-idex-300', 'RatRig V-Core 4 IDEX (300)',   300, 300, 300, '["PLA","PETG","ABS","ASA","Nylon","PC","TPU"]', 2, 1),
  ('ratrig-vcore4-idex-400', 'RatRig V-Core 4 IDEX (400)',   400, 400, 400, '["PLA","PETG","ABS","ASA","Nylon","PC","TPU"]', 2, 1),
  ('ratrig-vcore4-idex-500', 'RatRig V-Core 4 IDEX (500)',   500, 500, 500, '["PLA","PETG","ABS","ASA","Nylon","PC","TPU"]', 2, 1),
  ('ratrig-vminion',         'RatRig V-Minion',              180, 180, 180, '["PLA","PETG","ABS","ASA","TPU"]',              1, 1),
  ('ratrig-vcast-200',       'RatRig V-Cast (200)',          200, 200, 200, '["PLA","PETG","ABS","ASA","Nylon","TPU"]',      1, 1),
  ('ratrig-vcast-300',       'RatRig V-Cast (300)',          300, 300, 300, '["PLA","PETG","ABS","ASA","Nylon","TPU"]',      1, 1);

-- ── Creality ─────────────────────────────────────────────────────────
INSERT OR IGNORE INTO printer_presets (id, name, bed_width, bed_depth, bed_height, filament_types, toolhead_count, is_builtin) VALUES
  ('ender-3-v3-se',    'Ender 3 V3 SE',     220, 220, 250, '["PLA","PETG","TPU"]',                          1, 1),
  ('ender-3-v3-ke',    'Ender 3 V3 KE',     220, 220, 250, '["PLA","PETG","TPU"]',                          1, 1),
  ('ender-3-v3-plus',  'Ender 3 V3 Plus',   300, 300, 330, '["PLA","PETG","ABS","TPU"]',                    1, 1),
  ('ender-5-s1',       'Ender 5 S1',        220, 220, 280, '["PLA","PETG","ABS","TPU"]',                    1, 1),
  ('ender-7',          'Ender 7',           250, 250, 300, '["PLA","PETG","ABS","TPU"]',                    1, 1),
  ('enderng',          'EnderNG',           235, 235, 250, '["PLA","PETG","ABS","ASA","TPU"]',              1, 1),
  ('creality-k1',      'Creality K1',       220, 220, 250, '["PLA","PETG","ABS","ASA","TPU"]',              1, 1),
  ('creality-k1-max',  'Creality K1 Max',   300, 300, 340, '["PLA","PETG","ABS","ASA","Nylon","TPU"]',      1, 1),
  ('creality-k2-plus', 'Creality K2 Plus',  350, 350, 350, '["PLA","PETG","ABS","ASA","Nylon","PC","TPU"]', 1, 1);

-- ── Snapmaker ────────────────────────────────────────────────────────
INSERT OR IGNORE INTO printer_presets (id, name, bed_width, bed_depth, bed_height, filament_types, toolhead_count, is_builtin) VALUES
  ('snapmaker-a150',    'Snapmaker 2.0 A150',  160, 160, 145, '["PLA","PETG","ABS","TPU"]',                    1, 1),
  ('snapmaker-a250',    'Snapmaker 2.0 A250',  230, 250, 235, '["PLA","PETG","ABS","TPU"]',                    1, 1),
  ('snapmaker-a350',    'Snapmaker 2.0 A350',  320, 350, 330, '["PLA","PETG","ABS","TPU"]',                    1, 1),
  ('snapmaker-j1',      'Snapmaker J1',        300, 200, 200, '["PLA","PETG","ABS","ASA","TPU"]',              2, 1),
  ('snapmaker-j1s',     'Snapmaker J1s',       300, 200, 200, '["PLA","PETG","ABS","ASA","TPU"]',              2, 1),
  ('snapmaker-artisan', 'Snapmaker Artisan',   400, 400, 400, '["PLA","PETG","ABS","ASA","Nylon","TPU"]',      1, 1);

-- ── VZbot ────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO printer_presets (id, name, bed_width, bed_depth, bed_height, filament_types, toolhead_count, is_builtin) VALUES
  ('vzbot-235',   'VZbot 235',   235, 235, 250, '["PLA","PETG","ABS","ASA","Nylon","PC","TPU"]',   1, 1),
  ('vzbot-330',   'VZbot 330',   330, 330, 400, '["PLA","PETG","ABS","ASA","Nylon","PC","TPU"]',   1, 1);

-- ── Mercury One / Zero-G ─────────────────────────────────────────────
INSERT OR IGNORE INTO printer_presets (id, name, bed_width, bed_depth, bed_height, filament_types, toolhead_count, is_builtin) VALUES
  ('mercury-one',     'Mercury One',       235, 235, 250, '["PLA","PETG","ABS","ASA","Nylon","TPU"]',   1, 1),
  ('mercury-one-1',   'Mercury One.1',     255, 255, 260, '["PLA","PETG","ABS","ASA","Nylon","TPU"]',   1, 1),
  ('zero-g',          'Zero-G Mercury',    235, 235, 250, '["PLA","PETG","ABS","ASA","Nylon","TPU"]',   1, 1);

-- ── Anycubic ─────────────────────────────────────────────────────────
INSERT OR IGNORE INTO printer_presets (id, name, bed_width, bed_depth, bed_height, filament_types, toolhead_count, is_builtin) VALUES
  ('anycubic-kobra-2',      'Anycubic Kobra 2',      220, 220, 250, '["PLA","PETG","TPU"]',                          1, 1),
  ('anycubic-kobra-2-max',  'Anycubic Kobra 2 Max',  420, 420, 500, '["PLA","PETG","ABS","TPU"]',                    1, 1),
  ('anycubic-kobra-3',      'Anycubic Kobra 3',      250, 250, 260, '["PLA","PETG","ABS","ASA","TPU"]',              4, 1),
  ('anycubic-kobra-s1',     'Anycubic Kobra S1',     220, 220, 250, '["PLA","PETG","ABS","TPU"]',                    1, 1),
  ('anycubic-vyper',        'Anycubic Vyper',        245, 245, 260, '["PLA","PETG","ABS","TPU"]',                    1, 1),
  ('anycubic-i3-mega-s',    'Anycubic i3 Mega S',   210, 210, 205, '["PLA","PETG","TPU"]',                          1, 1);

-- ── Positron ─────────────────────────────────────────────────────────
INSERT OR IGNORE INTO printer_presets (id, name, bed_width, bed_depth, bed_height, filament_types, toolhead_count, is_builtin) VALUES
  ('positron-v3',  'Positron V3',  180, 185, 180, '["PLA","PETG","TPU"]',  1, 1);
