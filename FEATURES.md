# Marathon — Planned Features

> Session-resumable task breakdown. Each section is an independent feature.
> Start a new session by reading this file + AGENTS.md, then pick up the next unchecked task.
> Check boxes as tasks are completed and commit after each logical unit.

---

## Feature A — Files: Folders & Drag-Drop

**Goal:** Files page gets a folder/subfolder system. Folder tiles appear above a divider
bar; G-code files appear below. Files and folders can be dragged into other folders.
Sidebar gets subtabs under "Files" mirroring the Spoolman pattern.

### Navigation change
The Files sidebar link becomes a parent with subtabs (same as Spoolman). Add these
sub-routes under `/files`:
- `/files` → Files grid (folders + gcodes) — existing page, enhanced
- `/files/templates` → Templates manager
- `/files/start` → Start a template (project init)
- `/files/projects` → Active projects
- `/files/archive` → Completed project archive

**Subtabs are added to `Sidebar.jsx` using the same `sidebar-subnav` pattern as Spoolman.
`AppShell.getPanel()` should show the existing `<FilesPanel>` for all `/files/*` routes.**

### A1 — Database migration (014_file_folders.sql)
- [ ] Create `014_file_folders.sql`:
  ```sql
  CREATE TABLE file_folders (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    parent_id  INTEGER REFERENCES file_folders(id) ON DELETE CASCADE,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  ALTER TABLE gcode_files ADD COLUMN folder_id INTEGER REFERENCES file_folders(id) ON DELETE SET NULL;
  ```
- [ ] Register migration in `backend/src/db/index.js` migration list

### A2 — Backend: Folder CRUD routes (backend/src/routes/folders.js)
- [ ] `GET /api/folders` — list all folders (id, name, parent_id, file_count)
- [ ] `POST /api/folders` — create folder `{ name, parent_id? }`
- [ ] `PUT /api/folders/:id` — rename folder `{ name }`
- [ ] `DELETE /api/folders/:id` — delete folder (files inside get `folder_id = null`, subfolders cascade)
- [ ] `PATCH /api/files/:id/folder` — move file to folder `{ folder_id }` (null = root)
- [ ] Mount `/api/folders` in `backend/src/app.js`

### A3 — Frontend: useFolders hook (frontend/src/hooks/useFolders.js)
- [ ] Fetch `GET /api/folders`, return `{ folders, loading, error, refresh }`
- [ ] Helper functions: `createFolder(name, parentId)`, `renameFolder(id, name)`, `deleteFolder(id)`, `moveFile(fileId, folderId)`

### A4 — Frontend: FolderCard component (frontend/src/components/files/FolderCard.jsx)
- [ ] Tile styled like FileCard but ~half height, folder icon, name, file count
- [ ] Click to navigate into folder (update current folder state in FilesPage)
- [ ] Right-click or "⋮" menu: Rename, Delete
- [ ] Accepts `onDrop` for drag-drop target

### A5 — Frontend: FilesPage overhaul (frontend/src/pages/FilesPage.jsx)
- [ ] State: `currentFolderId` (null = root), `breadcrumb` path array
- [ ] Breadcrumb bar at top (click to navigate up)
- [ ] Fetch folders filtered by `parent_id === currentFolderId`
- [ ] Fetch files filtered by `folder_id === currentFolderId`
- [ ] Render: folder grid (larger tiles) → horizontal divider → file grid
- [ ] "New folder" button in header
- [ ] Inline rename on folder double-click

### A6 — Frontend: Drag-drop (HTML5 drag API, no extra library)
- [ ] FileCard and FolderCard become draggable (`draggable` attribute)
- [ ] FolderCard accepts drops (`onDragOver`, `onDrop`) — calls `moveFile` or `moveFolder`
- [ ] Visual: `dragover` highlights the target folder card with a border glow
- [ ] After drop: refresh file + folder lists

### A7 — Frontend: Sidebar Files subtabs (Sidebar.jsx)
- [ ] Add `onFiles` detection (`location.pathname.startsWith('/files')`)
- [ ] Render sub-links: Files / Templates / Start / Projects / Archive
- [ ] AppShell: return `<FilesPanel>` for all `/files/*` routes (not just `/files`)

### A8 — Frontend: Add routes to App.jsx
- [ ] `/files` stays; add `/files/templates`, `/files/start`, `/files/projects`, `/files/archive`
- [ ] Each maps to a placeholder page (`FilesPage`, `TemplatesPage`, `StartTemplatePage`, `ProjectsPage`, `ArchivePage`)
- [ ] Create empty stub pages so routing works while features are built

---

## Feature B — Templates

**Goal:** Create and edit reusable multi-plate print projects. Each template has named
G-code plates, colour slot assignments per plate, and an optional thumbnail image.
Template G-code files are copied to a separate directory so deleting from the main
library doesn't break templates.

### B1 — Database migration (015_templates.sql)
- [ ] Create `015_templates.sql`:
  ```sql
  CREATE TABLE project_templates (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT    NOT NULL,
    description    TEXT,
    thumbnail_path TEXT,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- Each plate = one G-code file belonging to a template.
  -- The file is COPIED to uploads/templates/ on creation.
  CREATE TABLE template_plates (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id  INTEGER NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,
    filename     TEXT    NOT NULL,        -- stored filename in templates dir
    display_name TEXT    NOT NULL,        -- user-facing label
    sort_order   INTEGER NOT NULL DEFAULT 0
  );

  -- Named colour slots defined per template (PRIMARY, ACCENT, 3, 4, 5 …)
  CREATE TABLE template_color_slots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,
    slot_key    TEXT    NOT NULL,   -- 'PRIMARY', 'ACCENT', '3' …
    label       TEXT,               -- optional user label
    pref_hex    TEXT,               -- preferred hex colour (optional)
    pref_filament_id INTEGER        -- preferred Spoolman filament id (optional)
  );

  -- Which colour slots each plate uses
  CREATE TABLE template_plate_slots (
    plate_id INTEGER NOT NULL REFERENCES template_plates(id) ON DELETE CASCADE,
    slot_key TEXT    NOT NULL,
    PRIMARY KEY (plate_id, slot_key)
  );
  ```
- [ ] Register in migration list

### B2 — Backend: Template file storage
- [ ] Create `TEMPLATES_DIR` env var (default `uploads/templates/`)
- [ ] On template create: copy each selected gcode file from `UPLOADS_DIR` to `TEMPLATES_DIR` with a unique filename prefix
- [ ] On template delete: delete copied files from `TEMPLATES_DIR`
- [ ] `GET /api/files/templates/thumb/:filename` — serve template thumbnails

### B3 — Backend: Template CRUD (backend/src/routes/templates.js)
- [ ] `GET /api/templates` — list all templates with plate count, slots, thumbnail URL
- [ ] `GET /api/templates/:id` — full template detail (plates + slots + plate_slots)
- [ ] `POST /api/templates` — create template, copy gcode files, insert all rows
  - Body: `{ name, description, plates: [{file_id, display_name, sort_order, slot_keys[]}], color_slots: [{slot_key, label, pref_hex?, pref_filament_id?}] }`
- [ ] `PUT /api/templates/:id` — update name/description/slots; handle plate additions/removals with file copy/delete
- [ ] `DELETE /api/templates/:id` — delete template + copied files
- [ ] `POST /api/templates/:id/thumbnail` — upload image as thumbnail (multer, store in `TEMPLATES_DIR/.thumbs/`)
- [ ] Mount in `app.js`

### B4 — Frontend: TemplatesPage (frontend/src/pages/TemplatesPage.jsx)
- [ ] Grid of TemplateCard components
- [ ] "New Template" button opens CreateTemplateModal

### B5 — Frontend: TemplateCard (frontend/src/components/templates/TemplateCard.jsx)
- [ ] Thumbnail (or placeholder icon if none), name, plate count, colour slot dots
- [ ] Edit button → opens CreateTemplateModal in edit mode
- [ ] Delete button with confirmation

### B6 — Frontend: CreateTemplateModal (frontend/src/components/templates/CreateTemplateModal.jsx)
Step 1 — Basics: name, description
Step 2 — Plates: pick G-code files from the files library (checkbox grid), set display name + sort order per plate
Step 3 — Colour slots: define slots (PRIMARY auto-added; + button for more). Per slot: label, optional preferred colour
  - Colour picker: search Spoolman filaments by name/material OR type a hex → hex-distance search (reuse existing logic from InventoryPanel or similar)
  - Per plate: checkbox which slots it uses
Step 4 — Thumbnail: optional image upload (drag-drop or browse)
- [ ] On save: POST or PUT `/api/templates`
- [ ] On thumbnail upload: POST `/api/templates/:id/thumbnail`

---

## Feature C — Start Template (Project Init)

**Goal:** List available templates, pick one, fill in material/colour per slot, create a project.

### C1 — Frontend: StartTemplatePage (frontend/src/pages/StartTemplatePage.jsx)
- [ ] Grid of TemplateCard (read-only, "Start" button per card)
- [ ] Clicking Start opens StartProjectModal

### C2 — Frontend: StartProjectModal (frontend/src/components/projects/StartProjectModal.jsx)
- [ ] Shows template name and list of colour slots defined by the template
- [ ] Per slot: search Spoolman spools (active/available) or type hex for distance match
  - Shows spool name, material, colour swatch, remaining weight
- [ ] Optional project name override (defaults to template name + date)
- [ ] Confirm → POST `/api/projects` with slot assignments → navigate to Projects tab

---

## Feature D — Projects (Active)

**Goal:** View and manage in-progress multi-plate print projects. Click a project card to
open a full-screen detail view: plate checklist, time totals, material usage and cost.

### D1 — Database migration (016_projects.sql)
- [ ] Create `016_projects.sql`:
  ```sql
  CREATE TABLE projects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER REFERENCES project_templates(id) ON DELETE SET NULL,
    name        TEXT    NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'active',   -- 'active' | 'archived'
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
  );

  CREATE TABLE project_plates (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    template_plate_id INTEGER REFERENCES template_plates(id) ON DELETE SET NULL,
    filename        TEXT    NOT NULL,   -- template file copy path
    display_name    TEXT    NOT NULL,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    status          TEXT    NOT NULL DEFAULT 'pending',  -- 'pending'|'printing'|'done'|'failed'
    printer_id      INTEGER REFERENCES printers(id) ON DELETE SET NULL,
    print_job_id    INTEGER REFERENCES gcode_print_jobs(id) ON DELETE SET NULL,
    completed_at    TEXT
  );

  -- Which spool/material was chosen for each colour slot in this project run
  CREATE TABLE project_color_assignments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    slot_key   TEXT    NOT NULL,
    spool_id   INTEGER,
    material   TEXT,
    color_hex  TEXT,
    vendor     TEXT,
    spool_name TEXT
  );
  ```
- [ ] Register migration

### D2 — Backend: Projects CRUD (backend/src/routes/projects.js)
- [ ] `GET /api/projects?status=active` — list projects with plate progress summary
- [ ] `GET /api/projects/:id` — full detail: plates, colour assignments, linked print jobs
- [ ] `POST /api/projects` — create project from template (copies plate list + colour slots)
  - Also accepts `{ gcode_file_ids[], name }` for creating without a template
- [ ] `PATCH /api/projects/:id/plates/:plateId` — update plate status `{ status, printer_id? }`
- [ ] `PATCH /api/projects/:id` — update name or status (archive)
- [ ] `DELETE /api/projects/:id`
- [ ] Mount in `app.js`

### D3 — Frontend: ProjectsPage (frontend/src/pages/ProjectsPage.jsx)
- [ ] List of ProjectCard components (active projects)
- [ ] "New Project from Files" button → opens file picker → creates project without template
- [ ] ProjectCard: name, thumbnail (from template if any), plate progress bar (done/total), material dots

### D4 — Frontend: ProjectCard (frontend/src/components/projects/ProjectCard.jsx)
- [ ] Compact card with progress, material swatches, click to open detail

### D5 — Frontend: ProjectDetailView (frontend/src/components/projects/ProjectDetailView.jsx)
- [ ] Takes over the page content (full width, no right sidebar — use `:has()` pattern)
- [ ] Plate checklist: each plate row shows display name, status badge, mark-done button, printer used
- [ ] Summary stats: total print time (summed from linked print jobs), filament used per material
- [ ] Estimated cost (g used × cost-per-g if available from Spoolman)
- [ ] Colour assignment panel: shows each slot with swatch + material name
- [ ] Archive button (marks project complete, moves to Archive)
- [ ] Back button → returns to ProjectsPage

---

## Feature E — Archive

**Goal:** View completed projects as a read-only historical record. Same card list as
Projects but filtered `status = 'archived'`. Click to open a read-only detail view.

### E1 — Frontend: ArchivePage (frontend/src/pages/ArchivePage.jsx)
- [ ] Same structure as ProjectsPage but fetches `?status=archived`
- [ ] Cards are read-only (no mark-done, no archive button)
- [ ] Click opens ArchiveDetailView (same as ProjectDetailView but read-only)
- [ ] Completion date shown on card

### E2 — Backend: Archive filtering
- [ ] `GET /api/projects?status=archived` — already handled if D2 uses query param filter
- [ ] Verify `PATCH /api/projects/:id` status='archived' also sets `completed_at = datetime('now')`

---

## Implementation Order

Recommended session sequence (each can stand alone):

| Session | Tasks | Deliverable |
|---------|-------|-------------|
| 1 | A1 → A3 | DB + backend folder API |
| 2 | A4 → A6 | Folder/file grid UI + drag-drop |
| 3 | A7 → A8 | Sidebar subtabs + stub pages |
| 4 | B1 → B3 | DB + backend template API |
| 5 | B4 → B6 | Template UI (card + create modal) |
| 6 | C1 → C2 | Start Template page + modal |
| 7 | D1 → D2 | DB + backend projects API |
| 8 | D3 → D4 | Projects list + card |
| 9 | D5       | Project detail full-screen view |
| 10 | E1 → E2 | Archive page |

---

## Shared Design Patterns (reference while building)

- **Sidebar subtabs:** copy Spoolman pattern in `Sidebar.jsx` — detect route prefix, render `sidebar-subnav` list
- **Right panel suppression:** `AppShell.getPanel()` returns `null` for `/printer/*` — same for project detail if needed
- **Full-screen detail views:** `.app-main:has(.detail-class) { padding: 0; overflow: hidden; }` pattern
- **Hex colour distance search:** look at how `InventoryPage.jsx` does filament colour matching (closest-hex logic)
- **DB migrations:** add `.sql` file in `backend/src/db/migrations/`, register filename in the migration runner in `backend/src/db/index.js`
- **CSS variables:** all new components use `var(--surface)`, `var(--primary)` etc. No hardcoded colours
- **No Tailwind:** vanilla CSS only; add new rules to `frontend/src/index.css`
