-- Multi-template support: a project can use multiple templates (or the same template multiple times with different options)

CREATE TABLE IF NOT EXISTS project_template_instances (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  template_id INTEGER NOT NULL REFERENCES project_templates(id),
  label       TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Migrate existing projects that have template_id set
INSERT INTO project_template_instances (project_id, template_id, sort_order)
SELECT id, template_id, 0 FROM projects WHERE template_id IS NOT NULL;

-- Add instance_id to project_plates (nullable for loose files)
ALTER TABLE project_plates ADD COLUMN instance_id INTEGER REFERENCES project_template_instances(id) ON DELETE CASCADE;

-- Backfill instance_id for existing project_plates
UPDATE project_plates SET instance_id = (
  SELECT pti.id FROM project_template_instances pti
  WHERE pti.project_id = project_plates.project_id
  LIMIT 1
) WHERE project_id IN (SELECT project_id FROM project_template_instances);

-- Add instance_id to project_category_choices
ALTER TABLE project_category_choices ADD COLUMN instance_id INTEGER REFERENCES project_template_instances(id) ON DELETE CASCADE;

-- Backfill
UPDATE project_category_choices SET instance_id = (
  SELECT pti.id FROM project_template_instances pti
  WHERE pti.project_id = project_category_choices.project_id
  LIMIT 1
) WHERE project_id IN (SELECT project_id FROM project_template_instances);

-- Add instance_id to project_color_assignments
ALTER TABLE project_color_assignments ADD COLUMN instance_id INTEGER REFERENCES project_template_instances(id) ON DELETE CASCADE;

-- Backfill
UPDATE project_color_assignments SET instance_id = (
  SELECT pti.id FROM project_template_instances pti
  WHERE pti.project_id = project_color_assignments.project_id
  LIMIT 1
) WHERE project_id IN (SELECT project_id FROM project_template_instances);
