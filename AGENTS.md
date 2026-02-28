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
├── App.jsx                 Router: / → Dashboard, /files → Files, /queue/:id → Queue, /settings → Settings
├── main.jsx                React entry point
├── index.css               Base styles, CSS variable system, ALL component styles
├── themes.css              Built-in theme definitions (VARIABLES ONLY — see Theming)
├── pages/
│   ├── DashboardPage.jsx   Grid of PrinterCards + status polling
│   ├── FilesPage.jsx       G-code file browser + upload
│   ├── QueuePage.jsx       Per-printer print queue
│   └── SettingsPage.jsx    Printer CRUD + theme settings
├── components/
│   ├── dashboard/
│   │   └── PrinterCard.jsx ★ Most complex component — per-printer theming, CSS scoping
│   └── layout/
│       ├── ThemeProvider.jsx  Global theme switcher + community theme loader
│       ├── Navbar.jsx
│       └── Sidebar.jsx
├── api/                    Fetch wrappers for each backend route group
└── hooks/                  usePolling, etc.

backend/src/
├── index.js                Entry point: DB init → Express listen → start poller
├── app.js                  Express app: CORS, body-parser, route mounting
├── db/                     SQLite schema, migrations, connection singleton
├── routes/
│   ├── printers.js         CRUD printers + scrape-theme endpoint
│   ├── control.js          Moonraker proxy: gcode, pause, resume, cancel
│   ├── status.js           Cached printer status (from poller)
│   ├── files.js            G-code upload/list/delete + send-to-printer
│   ├── queue.js            Per-printer print queue management
│   ├── presets.js          Temperature presets CRUD
│   ├── themes.js           Community theme git clone/list/delete
│   └── octoprint.js        OctoPrint stub (partial implementation)
├── services/
│   └── poller.js           Status polling loop for all printers
└── middleware/
    └── upload.js           Multer config for G-code uploads
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

---

## Database

SQLite database at `backend/data/marathon.db`. Schema is auto-created on first run.

### Key tables:
- `printers` — id, name, host, port, theme_mode, custom_css, etc.
- `queue_items` — printer_id, filename, position, status
- `presets` — name, hotend_temp, bed_temp

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
Module-level `scrapedCssCache` Map, keyed by `host:port`. Persists across
page navigations within the SPA session. Clears on full page reload.

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
