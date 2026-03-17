-- MMU (Multi-Material Unit) addon support

-- Built-in MMU presets
CREATE TABLE IF NOT EXISTS mmu_presets (
  id          TEXT    PRIMARY KEY,
  name        TEXT    NOT NULL,
  slot_count  INTEGER NOT NULL DEFAULT 4,
  is_builtin  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO mmu_presets (id, name, slot_count, is_builtin) VALUES
  ('bambu-ams',      'Bambu AMS',      4, 1),
  ('bambu-ams-lite', 'Bambu AMS Lite', 4, 1),
  ('prusa-mmu3',     'Prusa MMU3',     5, 1),
  ('prusa-mmu2s',    'Prusa MMU2S',    5, 1),
  ('ercf',           'ERCF',           9, 1),
  ('tradrack',       'Tradrack',      10, 1),
  ('box-turtle',     'Box Turtle',     4, 1),
  ('angry-beaver',   'Angry Beaver',   8, 1),
  ('emu',            'Emu',            4, 1);

-- Link MMUs to printer toolheads
CREATE TABLE IF NOT EXISTS printer_mmus (
  printer_id    INTEGER NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
  tool_index    INTEGER NOT NULL DEFAULT 0,
  mmu_preset_id TEXT    NOT NULL REFERENCES mmu_presets(id),
  slot_count    INTEGER NOT NULL DEFAULT 4,
  PRIMARY KEY (printer_id, tool_index)
);
