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
- **Backend:** Express.js + SQLite (REST API, proxies to Moonraker)
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
│   ├── FilesPage.jsx           G-code file browser + upload
│   ├── QueuePage.jsx           Per-printer print queue
│   ├── SpoolmanPage.jsx        Spool management + drag-to-assign
│   ├── MaintenancePage.jsx     Maintenance tasks/intervals config + printer cards
│   └── SettingsPage.jsx        Printer CRUD + theme settings
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
├── index.js                Entry point: DB init → Express listen → start poller
├── app.js                  Express app: CORS, body-parser, route mounting
├── db/                     SQLite schema, migrations (001–012), connection singleton
├── routes/
│   ├── printers.js         CRUD printers + scrape-theme endpoint
│   ├── control.js          Moonraker proxy: gcode, pause, resume, cancel
│   ├── status.js           Cached printer status (from poller)
│   ├── files.js            G-code upload/list/delete + send-to-printer
│   ├── queue.js            Per-printer print queue management
│   ├── presets.js          Temperature presets CRUD
│   ├── themes.js           Community theme git clone/list/delete
│   ├── stats.js            Fleet + per-file print statistics
│   ├── spoolman.js         Spoolman proxy (spool list, active spool assignment)
│   ├── maintenance.js      Maintenance tasks, intervals, history, mark-done
│   ├── extras.js           Extras: POST /api/extras/swatch → generates STL via Python/CadQuery
│   └── octoprint.js        OctoPrint stub (partial implementation)
├── services/
│   ├── poller.js           Status polling loop; logs print jobs + accumulates runtime_s
│   └── swatch_generator.py Python/CadQuery script: loads swatch.step, debosses text, exports STL
├── swatch.step             STEP file for the swatch base shape (Autodesk, mm, Z-up)
└── middleware/
    └── upload.js           Multer config for G-code uploads

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

| Method | Endpoint | Description |
|---|---|---|
| GET | `/printers` | List all printers |
| POST | `/printers` | Add a printer |
| PUT | `/printers/:id` | Update printer settings |
| DELETE | `/printers/:id` | Remove a printer |
| POST | `/printers/scrape-theme` | Fetch Mainsail CSS from printer |
| GET | `/status` | All printer statuses (from poller cache) |
| POST | `/control/gcode` | Send G-code to a printer via Moonraker |
| POST | `/control/pause` | Pause a print |
| POST | `/control/resume` | Resume a print |
| POST | `/control/cancel` | Cancel a print |
| GET | `/files/:printerId` | List G-code files on a printer |
| POST | `/files/upload` | Upload G-code to Marathon server |
| POST | `/files/send` | Send uploaded file to a printer |
| GET | `/queue/:printerId` | Get print queue for a printer |
| POST | `/queue/:printerId` | Add file to queue |
| DELETE | `/queue/:printerId/:itemId` | Remove from queue |
| GET | `/presets` | List temperature presets |
| POST | `/presets` | Create a preset |
| DELETE | `/presets/:id` | Delete a preset |
| GET | `/themes` | List community themes |
| POST | `/themes` | Install community themes from GitHub |
| DELETE | `/themes/:name` | Remove a community theme |
| GET | `/stats/fleet` | Aggregate fleet print statistics |
| GET | `/stats/files` | Per-file print statistics |
| GET | `/spoolman/spools` | List spools from Spoolman |
| POST | `/spoolman/active/:printerId` | Set active spool on a printer |
| GET | `/maintenance` | All tasks, printers (full row), intervals, last-done history |
| POST | `/maintenance/tasks` | Create a maintenance task |
| DELETE | `/maintenance/tasks/:id` | Delete a task and all its history |
| PUT | `/maintenance/intervals/:taskId/:printerId` | Set interval (hours) for a task+printer |
| POST | `/maintenance/done/:taskId/:printerId` | Record task completion at current runtime |

---

## Database

SQLite database at `backend/data/marathon.db`. Schema is auto-created on first run.

### Key tables:
- `printers` — id, name, host, port, theme_mode, custom_css, runtime_s (cumulative print seconds), etc.
- `queue_items` — printer_id, filename, position, status
- `presets` — name, hotend_temp, bed_temp
- `gcode_files` — uploaded G-code file metadata
- `gcode_print_jobs` — completed print log (duration, filament, spool info, status)
- `maintenance_tasks` — global named tasks (e.g. "Lubricate rails")
- `maintenance_intervals` — task_id + printer_id + interval_hours (PK: task_id, printer_id)
- `maintenance_history` — when each task was done on each printer, runtime_s at that time

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
