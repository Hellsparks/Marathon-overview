CREATE TABLE project_templates (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL,
  description    TEXT,
  thumbnail_path TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE template_plates (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id  INTEGER NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,
  filename     TEXT    NOT NULL,        -- stored filename in templates dir
  display_name TEXT    NOT NULL,        -- user-facing label
  sort_order   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE template_color_slots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,
  slot_key    TEXT    NOT NULL,   -- 'PRIMARY', 'ACCENT', '3' …
  label       TEXT,               -- optional user label
  pref_hex    TEXT,               -- preferred hex colour (optional)
  pref_filament_id INTEGER        -- preferred Spoolman filament id (optional)
);

CREATE TABLE template_plate_slots (
  plate_id INTEGER NOT NULL REFERENCES template_plates(id) ON DELETE CASCADE,
  slot_key TEXT    NOT NULL,
  PRIMARY KEY (plate_id, slot_key)
);
