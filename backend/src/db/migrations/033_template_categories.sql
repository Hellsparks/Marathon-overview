-- Template categories: organize plates into fixed groups and choice groups with alternatives

CREATE TABLE IF NOT EXISTS template_categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  type        TEXT    NOT NULL DEFAULT 'fixed',  -- 'fixed' | 'choice'
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS template_category_options (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES template_categories(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- Link template plates to categories/options
ALTER TABLE template_plates ADD COLUMN category_id INTEGER REFERENCES template_categories(id) ON DELETE SET NULL;
ALTER TABLE template_plates ADD COLUMN option_id   INTEGER REFERENCES template_category_options(id) ON DELETE SET NULL;

-- Track which template_plate each project_plate came from (enables swap)
ALTER TABLE project_plates ADD COLUMN template_plate_id INTEGER REFERENCES template_plates(id) ON DELETE SET NULL;

-- Track which option was selected for each choice category in a project
CREATE TABLE IF NOT EXISTS project_category_choices (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES template_categories(id) ON DELETE SET NULL,
  option_id   INTEGER NOT NULL REFERENCES template_category_options(id) ON DELETE SET NULL,
  UNIQUE(project_id, category_id)
);
