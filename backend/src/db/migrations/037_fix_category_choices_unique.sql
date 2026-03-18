-- 037_fix_category_choices_unique.sql
-- Replace the restrictive UNIQUE(project_id, category_id) with UNIQUE(instance_id, category_id)
-- to support multiple instances of the same template in one project.

-- 1. Create the new table with the correct constraints
CREATE TABLE project_category_choices_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  instance_id INTEGER NOT NULL REFERENCES project_template_instances(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES template_categories(id) ON DELETE SET NULL,
  option_id   INTEGER NOT NULL REFERENCES template_category_options(id) ON DELETE SET NULL,
  UNIQUE(instance_id, category_id)
);

-- 2. Migrate data from the old table
-- We assume instance_id is already backfilled by migration 036.
-- If any rows have NULL instance_id (unlikely after 036), they will be skipped if we use NOT NULL.
-- Given the error the user is hitting, we want instance_id to be mandatory here.
INSERT INTO project_category_choices_new (id, project_id, instance_id, category_id, option_id)
SELECT id, project_id, instance_id, category_id, option_id
FROM project_category_choices;

-- 3. Replace the old table
DROP TABLE project_category_choices;
ALTER TABLE project_category_choices_new RENAME TO project_category_choices;
