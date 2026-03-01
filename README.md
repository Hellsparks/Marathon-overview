# Marathon

**Klipper Fleet Manager** — A web dashboard for monitoring and controlling multiple Klipper/Moonraker 3D printers from a single interface.

![GPL v3](https://img.shields.io/badge/license-GPL%20v3-blue.svg)

## Features

- **Multi-printer dashboard** — View all your printers at a glance with live status, temperatures, and progress
- **Per-printer theming** — Each card can adopt the CSS from its host Mainsail instance, so your dashboard mirrors each printer's UI
- **Global themes** — Built-in themes (Dark, Light, Cyberpunk, Ocean, Sunset) plus community Mainsail theme support via GitHub repos
- **Print control** — Start, pause, resume, cancel prints directly from the dashboard
- **Temperature control** — Set hotend and bed temperatures with presets
- **File management** — Upload, browse, and send G-code files to any printer
- **Print queue** — Per-printer queues with auto-start capability
- **Macro support** — Execute Klipper macros from the UI
- **Webcam integration** — Embedded webcam streams per printer
- **Spoolman integration** — View active spool info, track filament usage per print
- **Print history & statistics** — Tracks completed prints with duration, filament used, material, and spool data
- **Preventive maintenance tracking** — Track maintenance tasks (lubrication, belt checks, etc.) per printer based on cumulative print-time runtime hours

## Architecture

```
frontend/          React 18 + Vite (SPA)
backend/           Express + SQLite (REST API)
docker-compose.yml Production deployment (nginx + node)
```

The frontend talks to the backend API, which proxies requests to each printer's Moonraker instance. Status is polled at a configurable interval and cached in the backend.

---

## Running Locally

### Prerequisites

- **Node.js** ≥ 18
- **npm**
- **Git** (for community theme support)

### Quick Start

```bash
# Clone the repo
git clone https://github.com/Hellsparks/Marathon-overview.git
cd Marathon-overview

# Install all dependencies (root + backend + frontend)
npm run install:all

# Start both backend and frontend dev servers
npm run dev
```

This runs:
- **Backend** on `http://localhost:3000` (with nodemon for auto-reload)
- **Frontend** on `http://localhost:5173` (Vite dev server with HMR, proxies API to backend)

### Adding Printers

1. Go to **Settings** in the sidebar
2. Enter a name, hostname/IP, and Moonraker port (default 7125)
3. Set the theme mode: `Global` (uses app theme), `Scrape` (uses printer's Mainsail CSS), or `Custom`

---

## Running with Docker

### Prerequisites

- **Docker** and **Docker Compose**

### Deploy

```bash
docker compose up -d --build
```

This starts:
- **Frontend** — nginx serving the built React app on port **80**, proxying `/api` to the backend
- **Backend** — Node.js on port 3000 (internal only)

Data is persisted in Docker volumes:
- `backend_data` — SQLite database
- `gcode_uploads` — Uploaded G-code files

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Backend listen port |
| `DB_PATH` | `/app/data/marathon.db` | SQLite database path |
| `UPLOADS_DIR` | `/app/uploads` | G-code upload directory |

---

## Project Structure

```
Marathon-overview/
├── frontend/
│   ├── src/
│   │   ├── pages/          Dashboard, Files, Queue, Spoolman, Maintenance, Settings
│   │   ├── components/     UI components (PrinterCard, MaintenancePrinterCard, layout, etc.)
│   │   ├── api/            API client functions
│   │   ├── hooks/          Custom React hooks
│   │   ├── services/       Shared singletons (scrapedCssCache)
│   │   ├── index.css       Base styles + CSS variable system
│   │   ├── themes.css      Built-in theme definitions (variables only)
│   │   └── App.jsx         Router + layout
│   ├── Dockerfile          Multi-stage build (Vite → nginx)
│   └── nginx.conf          Reverse proxy config
├── backend/
│   ├── src/
│   │   ├── routes/         REST endpoints (printers, files, control, etc.)
│   │   ├── services/       Poller, Moonraker proxy
│   │   ├── db/             SQLite schema + migrations
│   │   ├── middleware/     Upload handling
│   │   └── app.js          Express app setup
│   └── Dockerfile          Node.js production image
├── docker-compose.yml      Production deployment
├── THEMING.md              Detailed theming architecture docs
├── AGENTS.md               AI agent system document
└── package.json            Dev runner (concurrently)
```

---

## TODO

### High Priority
- [ ] **WebSocket status updates** — Replace polling with Moonraker WebSocket subscriptions for real-time updates
- [ ] **Authentication** — Add user login / API key support for multi-user or public-facing deployments
- [ ] **Print status feedback** — Implement logic to check if assigned print finished or failed for tracking purposes
- [ ] **Project templates** — Create templates from a series of gcode files with tracking and prefered color per file. (to track and print multiple versions of the same project several time)

### Features
- [ ] **Multi-file upload** — Drag-and-drop multiple G-code files at once
- [ ] **Notifications** — Email/Discord/push alerts for print completion, errors, or temperature warnings
- [ ] **OctoPrint support** — Extend beyond Klipper/Moonraker to support OctoPrint instances (partially stubbed in `routes/octoprint.js`)
- [ ] **Mobile-responsive layout** — Optimize the grid and controls for phone/tablet screens
- [ ] **Timelapse viewer** — Integrate with Moonraker's timelapse plugin to view/download timelapses
- [ ] **Shopify addin?** — Able to take shopify orders and link an order to project templates with color wishes and put in project queue

### Theming
- [ ] **Theme editor** — Visual CSS variable editor in the Settings page
- [ ] **Cache invalidation** — Add a "refresh theme" button to re-scrape Mainsail CSS without full page reload

### Infrastructure
- [ ] **better-sqlite3 integration** — Currently using a lightweight SQLite wrapper; migrate to better-sqlite3 for WAL mode and better performance
- [ ] **Database backups** — Auto-export DB snapshots to a configurable path
- [ ] **HTTPS support** — Add TLS termination to the nginx config or a Traefik/Caddy alternative
- [ ] **CI/CD pipeline** — GitHub Actions for automated builds and Docker image publishing
- [ ] **OpenPrintTag support** — Ability to take spoolman spools and create RFID tags or reassign tags using a esp32 scanner device.

---

## License

This project is licensed under the **GNU General Public License v3.0** — see [LICENSE](LICENSE) for details.
