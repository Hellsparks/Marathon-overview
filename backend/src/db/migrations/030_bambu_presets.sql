-- Add missing Bambu Lab printer presets
INSERT OR IGNORE INTO printer_presets (id, name, bed_width, bed_depth, bed_height, filament_types, toolhead_count, is_builtin) VALUES
  ('bambu-a1-mini', 'Bambu A1 Mini',   180, 180, 180, '["PLA","PETG","TPU"]',                              4, 1),
  ('bambu-p1s',     'Bambu P1S',        256, 256, 256, '["PLA","PETG","ABS","ASA","Nylon","PC","TPU"]',     4, 1),
  ('bambu-p1p',     'Bambu P1P',        256, 256, 256, '["PLA","PETG","ABS","ASA","TPU"]',                  4, 1),
  ('bambu-x1e',     'Bambu X1E',        256, 256, 256, '["PLA","PETG","ABS","ASA","Nylon","PC","TPU"]',     4, 1);

-- Fix A1 bed dimensions (was using X1C dimensions)
UPDATE printer_presets SET bed_width = 256, bed_depth = 256, bed_height = 256 WHERE id = 'bambu-a1';
