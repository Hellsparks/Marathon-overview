# Marathon — AI Agent System Document

> This document is for AI coding agents working on this codebase.
> Read this before making changes to understand the architecture,
> conventions, and known pitfalls.

---

## Project Overview

Marathon is a Klipper 3D printer fleet manager. It's a web app that lets users
monitor and control multiple Klipper/Moonraker printers from a single dashboard.

**Tech stack:**
- **Frontend:** React 18 + Vite (SPA, no framework — vanilla React Router)
- **Backend:** Express.js + **`node:sqlite`** (`DatabaseSync` — synchronous, built-in Node 22; **not** `better-sqlite3`)
- **Styling:** Vanilla CSS with CSS custom properties (NO Tailwind)
- **Deployment:** Docker Compose (nginx reverse proxy + Node.js)

---

## Directory Map

```
frontend/src/
├── App.jsx                 Router: /, /printer/:id, /files, /queue/:id, /spoolman, /maintenance, /settings
├── main.jsx                React entry point
├── index.css               Base styles, CSS variable system, ALL component styles
├── themes.css              Built-in theme definitions (VARIABLES ONLY — see Theming)
├── pages/
│   ├── DashboardPage.jsx       Grid of PrinterCards + status polling
│   ├── PrinterIframePage.jsx   Full-screen Mainsail iframe for a single printer (/printer/:id)
│   ├── FilesPage.jsx           G-code file browser + upload + folder management
│   ├── QueuePage.jsx           Per-printer print queue
│   ├── SpoolmanPage.jsx        Spool management + drag-to-assign
│   ├── MaintenancePage.jsx     Maintenance tasks/intervals config + printer cards
│   └── SettingsPage.jsx        Printer CRUD + theme + backup + connection settings
├── components/
│   ├── dashboard/
│   │   ├── PrinterCard.jsx ★ Most complex component — per-printer theming, CSS scoping
│   │   └── PrinterTab.jsx  Clone of PrinterCard stripped to name+badge; sidebar subtab
│   ├── maintenance/
│   │   └── MaintenancePrinterCard.jsx  Copy of PrinterCard shell with maintenance bars
│   └── layout/
│       ├── ThemeProvider.jsx  Global theme switcher + community theme loader
│       ├── Navbar.jsx
│       └── Sidebar.jsx        Dynamic: shows PrinterTab subtabs under Dashboard
├── contexts/
│   ├── PrinterStatusContext.jsx  Shares AppShell's polled status with Sidebar (no double-poll)
│   └── RightPanelContext.jsx     Selected-item state for right side panels
├── api/                    Fetch wrappers for each backend route group
├── hooks/                  usePolling, usePrinters, useStatus, etc.
├── utils/
│   └── scopeCSS.js         CSS scoping utility — shared by PrinterTab (PrinterCard keeps its own copy)
└── services/
    └── scrapedCssCache.js  Shared module-level Map — PrinterCard + MaintenancePrinterCard
                            both import this so scraped CSS is cached across page navigations

backend/src/
├── index.js                Entry point: DB init → Express listen → start poller + backup scheduler
├── app.js                  Express app: CORS, body-parser, route mounting (20+ routers)
├── db/                     SQLite schema, migrations (001–040), connection singleton
├── routes/
│   ├── printers.js         CRUD printers + scrape-theme endpoint
│   ├── control.js          Moonraker proxy: print start/pause/resume/cancel/gcode
│   ├── status.js           Cached printer status (from poller)
│   ├── files.js            G-code upload/list/delete + send-to-printer
│   ├── folders.js          File folder CRUD
│   ├── templates.js        Print templates CRUD + plate/filament management
│   ├── projects.js         Projects CRUD + plate/filament/template-instance management
│   ├── queue.js            Per-printer print queue management
│   ├── presets.js          Temperature presets CRUD
│   ├── themes.js           Community theme git clone/list/delete
│   ├── settings.js         GET/PUT flat key-value settings store
│   ├── stats.js            Fleet + per-file print statistics
│   ├── spoolman.js         Spoolman proxy + LAN IP + services status
│   ├── maintenance.js      Maintenance tasks, intervals, history, mark-done
│   ├── extras.js           POST /api/extras/swatch → generates STL via Python/CadQuery
│   ├── backup.js           Scheduled backup status/run/delete
│   ├── database.js         DB export/import (download/upload marathon.db)
│   ├── mcp.js              MCP tool registration + context endpoint
│   ├── setup.js            First-run setup wizard state
│   ├── updates.js          Docker image pull + restart
│   └── octoprint.js        OctoPrint-compatible stub (/api/version, /api/printer)
├── services/
│   ├── poller.js           Status polling loop (3s); logs print jobs + accumulates runtime_s
│   ├── backup.js           Scheduled backup (60s tick); Marathon DB + Spoolman via docker cp
│   └── swatch_generator.py Python/CadQuery script: loads swatch.step, debosses text, exports STL
├── swatch.step             STEP file for the swatch base shape (Autodesk, mm, Z-up)
└── middleware/
    ├── upload.js           Multer config for G-code uploads
    └── errorHandler.js     Global Express error handler

**Python dependency:** The swatch generator requires Python 3 + CadQuery (`pip install cadquery`).
In Docker this is installed automatically. For direct installs, set `PYTHON_BIN` env var if
`python3` is not on PATH (e.g. `PYTHON_BIN=python` on Windows).
```

---

## Theming System (READ THEMING.md)

The theming system is the most complex part of the codebase. Full documentation is
in `THEMING.md`. Here are the critical rules:

### Rules that MUST NOT be violated:

1. **`themes.css` must NEVER set direct CSS properties on component selectors.**
   All theme customizations must be CSS variables. If you add `border-color: #ff00ff`
   to `.printer-card` inside a theme, it will break per-printer isolation.

2. **`cardDefaults` must include ALL accent colors** (`--primary`, `--danger`,
   `--warning`, `--success`). If you remove any, global theme colors will leak
   into isolated cards.

3. **Do NOT try to detect Vuetify 3 vars in pure CSS.** The `var()` fallback chain
   fails because V3 vars resolve to empty strings (not undefined). Detection MUST
   be done in JavaScript by scanning the raw CSS text.

4. **Do NOT simplify the @import stripping regex.** Google Fonts URLs contain
   semicolons (`wght@400;500;600;700`). The multi-pass stripping in `scopeCSS()`
   is intentional. A naive `/@import\s[^;]+;/` regex breaks everything.

5. **`scopeCSS()` must scope ALL selectors.** Any unscoped rule causes cross-card
   bleeding. When adding new Vuetify/Mainsail selectors, add them to both `ROOT_RE`
   and `REPLACE_RE` in the function.

---

## API Routes

All routes are prefixed with `/api`.

### Printers
| Method | Endpoint | Description |
|---|---|---|
| GET | `/printers` | List all printers |
| POST | `/printers` | Add a printer |
| PUT | `/printers/:id` | Update printer settings |
| DELETE | `/printers/:id` | Remove a printer |
| POST | `/printers/scrape-theme` | Fetch Mainsail CSS from a printer |

### Status & Control (mounted under `/api/printers/:id`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/status` | All printer statuses (from poller cache) |
| POST | `/printers/:id/print/start` | Start a print |
| POST | `/printers/:id/print/pause` | Pause the current print |
| POST | `/printers/:id/print/resume` | Resume a paused print |
| POST | `/printers/:id/print/cancel` | Cancel the current print |
| POST | `/printers/:id/gcode` | Send raw G-code |
| GET | `/printers/:id/queue` | Get print queue for a printer |
| POST | `/printers/:id/queue` | Add item to queue |
| DELETE | `/printers/:id/queue/:itemId` | Remove item from queue |
| POST | `/printers/:id/queue/start` | Start the queue |

### Files & Folders
| Method | Endpoint | Description |
|---|---|---|
| GET | `/files` | List all uploaded G-code files + metadata |
| POST | `/files/upload` | Upload G-code to Marathon server |
| DELETE | `/files/:id` | Delete an uploaded file |
| POST | `/files/send` | Send file to a printer |
| GET | `/folders` | List folders |
| POST | `/folders` | Create a folder |
| PUT | `/folders/:id` | Rename a folder |
| DELETE | `/folders/:id` | Delete a folder |

### Templates & Projects
| Method | Endpoint | Description |
|---|---|---|
| GET | `/templates` | List templates |
| POST | `/templates` | Create a template |
| PUT | `/templates/:id` | Update a template |
| DELETE | `/templates/:id` | Delete a template |
| GET | `/projects` | List projects |
| POST | `/projects` | Create a project |
| PUT | `/projects/:id` | Update a project |
| DELETE | `/projects/:id` | Delete a project |

### Settings & Presets
| Method | Endpoint | Description |
|---|---|---|
| GET | `/settings` | Get all settings as `{ key: value }` map |
| PUT | `/settings` | Batch-save settings (`{ key: value }` body) |
| GET | `/presets` | List temperature presets |
| POST | `/presets` | Create a preset |
| DELETE | `/presets/:id` | Delete a preset |

### Themes
| Method | Endpoint | Description |
|---|---|---|
| GET | `/themes` | List community themes |
| POST | `/themes` | Install a community theme from GitHub |
| DELETE | `/themes/:name` | Remove a community theme |

### Stats
| Method | Endpoint | Description |
|---|---|---|
| GET | `/stats/fleet` | Aggregate fleet print statistics |
| GET | `/stats/files` | Per-file print statistics |

### Spoolman
| Method | Endpoint | Description |
|---|---|---|
| GET | `/spoolman/services/status` | Spoolman connection status + LAN IP + externalUrl |
| GET | `/spoolman/spools` | List spools from Spoolman |
| GET | `/spoolman/filaments` | List filament profiles from Spoolman |
| POST | `/spoolman/active/:printerId` | Set active spool on a printer |

### Maintenance
| Method | Endpoint | Description |
|---|---|---|
| GET | `/maintenance` | All tasks, printers (full row), intervals, last-done history |
| POST | `/maintenance/tasks` | Create a maintenance task |
| DELETE | `/maintenance/tasks/:id` | Delete a task and all its history |
| PUT | `/maintenance/intervals/:taskId/:printerId` | Set interval (hours) for a task+printer |
| POST | `/maintenance/done/:taskId/:printerId` | Record task completion at current runtime |

### Backup
| Method | Endpoint | Description |
|---|---|---|
| GET | `/backup/status` | Backup config + file lists from all configured dirs |
| POST | `/backup/run` | Manual trigger (`{ target: 'marathon'|'spoolman'|'all' }`) |
| DELETE | `/backup/:filename` | Delete a backup file from all dirs |

### Database
| Method | Endpoint | Description |
|---|---|---|
| GET | `/database/download` | Download `marathon.db` |
| POST | `/database/upload` | Upload + restore `marathon.db` |

### Updates
| Method | Endpoint | Description |
|---|---|---|
| POST | `/updates/pull` | `docker compose pull && up -d` |

### Extras
| Method | Endpoint | Description |
|---|---|---|
| POST | `/extras/swatch` | Generate swatch STL (Python/CadQuery) |

### Setup & MCP
| Method | Endpoint | Description |
|---|---|---|
| GET | `/setup/status` | Setup wizard completion state |
| PUT | `/setup/complete` | Mark setup wizard as done |
| GET | `/mcp/context` | MCP tool context (printers, spools, etc.) |

---

## Database

SQLite database at `backend/data/marathon.db`. Uses **`node:sqlite`** (`DatabaseSync`) — built into Node 22.
Schema is auto-applied from `backend/src/db/migrations/` (NNN_name.sql, run in order at startup).

### Key tables:
- `printers` — id, name, host, port, firmware_type, theme_mode, custom_css, runtime_s, etc.
- `settings` — key TEXT PK, value TEXT (flat key-value store for all app settings)
- `queue_items` — printer_id, filename, position, status
- `presets` — name, hotend_temp, bed_temp
- `gcode_files` — uploaded G-code file metadata
- `gcode_folders` — folder hierarchy for G-code files
- `gcode_print_jobs` — completed print log (duration, filament, spool info, status)
- `maintenance_tasks` — global named tasks (e.g. "Lubricate rails")
- `maintenance_intervals` — task_id + printer_id + interval_hours (PK: task_id, printer_id)
- `maintenance_history` — when each task was done on each printer, runtime_s at that time
- `templates` / `template_plates` / `template_plate_filaments` — reusable print templates
- `projects` / `project_plates` / `project_plate_filaments` — active print projects

### Settings table key namespaces:
- `marathon_backup_*` — Marathon backup config (enabled, interval, keep, include_uploads, last_backup)
- `spoolman_backup_*` — Spoolman backup config
- `backup_dir`, `backup_dir_2` — Backup destination paths (local or `smb://...`)
- `backup_smb_user_1`, `backup_smb_pass_1`, `backup_smb_user_2`, `backup_smb_pass_2` — SMB credentials
- `spoolman_data_dir` — Fallback Spoolman DB path for non-Docker installs
- `spoolman_url` — Spoolman base URL
- `teamster_*` — Teamster/MQTT connection settings
- `setup_complete` — First-run wizard flag

### Runtime tracking
`printers.runtime_s` accumulates when the poller detects a print transition from
`printing` to any terminal state (`complete`, `cancelled`, `error`). It is used by
the maintenance system to calculate how much print-time has elapsed since a task was
last performed.

### Maintenance status calculation
`hours_used = (printer.runtime_s - last_done.runtime_s_at_performance) / 3600`
`hours_remaining = interval_hours - hours_used`
- `< 0` → OVERDUE (red)
- `>= 0` and within 20% of interval → DUE (yellow)
- otherwise → OK (green)

---

## CSS Variable System

All styling uses CSS custom properties defined on `:root` (dark defaults):

```
--bg, --surface, --surface2     Backgrounds
--border                        Borders
--text, --text-muted            Text colors
--primary, --primary-d          Primary accent + darker variant
--danger, --warning, --success  Status colors
--offline                       Offline state color
--radius                        Border radius
--shadow                        Box shadow

Theme-specific (optional):
--card-glow, --card-glow-active  Card glow effects
--btn-text-shadow                Button text shadow
--btn-primary-bg                 Primary button background (can be gradient)
```

Components reference these with fallback defaults:
```css
.printer-card { box-shadow: var(--card-glow, var(--shadow)); }
```

---

## Printer Iframe View

Route `/printer/:id` renders `PrinterIframePage` — a full-screen `<iframe>` pointed at
`http://<printer.host>` (Mainsail, assumed port 80). The AppShell suppresses the right
sidebar for these routes and CSS `:has(.printer-iframe-page)` strips padding from
`.app-main` so the iframe fills wall-to-wall.

### Sidebar printer subtabs

`Sidebar.jsx` renders a `PrinterTab` (card-style button) under the Dashboard nav item
for each configured printer — expanding whenever the user is on `/` or `/printer/*`,
mirroring the Spoolman sub-item pattern.

`PrinterTab` is a clone of `PrinterCard` stripped to just the header (name + StatusBadge).
It carries the full per-printer CSS theming system (cardDefaults → scopedCss → tabPolyfill)
so each tab adopts its printer's accent colours.

`PrinterStatusContext` is provided by `AppShell` (which already polls `useStatus`) and
consumed by `Sidebar` — this avoids a second 3-second polling loop.

### scopeCSS — two copies, intentionally

`PrinterCard.jsx` keeps its own inline `scopeCSS()` (unchanged).
`PrinterTab.jsx` imports from `utils/scopeCSS.js`.
Do NOT merge them into a single import inside PrinterCard — that file should remain
self-contained.

---

## PrinterCard.jsx — The Complex One

This is the most intricate component. Key things to know:

### Per-printer CSS isolation
- `theme_mode: 'global'` → no isolation, inherits global theme
- `theme_mode: 'scrape'` or `'custom'` → fully isolated via:
  1. `cardDefaults` — resets ALL vars to dark defaults on the wrapper
  2. `scopedCss` — scoped Mainsail CSS (overrides defaults)
  3. `cardPolyfill` — bridges V2/V3 Vuetify vars to Marathon vars

### Vuetify class aliases on card elements
These exist so Mainsail CSS can target card interior elements:
```
.printer-card            → v-card theme--dark
.printer-card-header     → v-card__title
.printer-card-footer     → v-card__actions
.btn                     → v-btn
```

### CSS caching
`scrapedCssCache` is a shared Map in `frontend/src/services/scrapedCssCache.js`,
imported by both `PrinterCard` and `MaintenancePrinterCard`. Keyed by `host:port`.
Persists across page navigations within the SPA session. Clears on full page reload.

### MaintenancePrinterCard
Direct copy of the PrinterCard shell (scopeCSS, cardDefaults, cardPolyfill, isolation
wrapper) with the body replaced by maintenance task progress bars + Done buttons.
The `/api/maintenance` endpoint returns full printer rows (including `host`, `port`,
`theme_mode`, `custom_css`) so the card has everything it needs for theming.

---

## Common Pitfalls

1. **Don't add styles to `.printer-card` in `themes.css`** — use CSS variables.
   Direct property rules fight with the per-printer polyfill's `!important` rules.

2. **Don't modify `scopeCSS()` without testing with multiple printers on screen.**
   A single-printer test won't catch cross-card bleeding bugs.

3. **The backend needs Git installed** for community theme cloning. Docker images
   include it, but local dev might not have it in PATH.

4. **Moonraker must be accessible from the backend server**, not the user's browser.
   The backend proxies all requests.

5. **SQLite has no concurrent write support.** The poller and API routes write to the
   same DB — this works fine at low scale but may need WAL mode for heavy use.

6. **Use `node:sqlite` (DatabaseSync), NOT `better-sqlite3`.** Marathon uses the
   built-in Node 22 SQLite module. The API is synchronous and slightly different from
   `better-sqlite3` — check `backend/src/db/index.js` for the connection pattern.

7. **Backend tests require `--forceExit`** (already in `package.json`). The polling
   timer in `poller.js` keeps the process alive after tests complete without it.

8. **Spoolman always runs in Docker**, even in native dev mode. Use
   `docker cp marathon-spoolman:/home/app/.local/share/spoolman/spoolman.db <dest>`
   to access its DB. Do NOT assume Spoolman is accessible via the filesystem directly.

9. **SMB backup paths** use `smb://server/share/path`, `smb:/user@server/share/path`,
   or `//server/share/path`. Credentials go in `backup_smb_user_1`/`backup_smb_pass_1`
   settings and are passed to `smbclient` via a temp file (mode 0600) — never in a
   shell argument (visible in `ps`).

10. **Don't hardcode IP addresses or credentials** in source code or placeholders.
    Use `192.168.1.x` ranges as examples, never real home/office IPs.
