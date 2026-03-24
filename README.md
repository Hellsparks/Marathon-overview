# Marathon

**Klipper Fleet Manager** — A web dashboard for monitoring and controlling multiple 3D printers from a single interface. Supports Klipper/Moonraker, Bambu Lab, OctoPrint, and Duet/RepRapFirmware.

![GPL v3](https://img.shields.io/badge/license-GPL%20v3-blue.svg)

## Features

- **Multi-printer dashboard** — Live status, temperatures, and progress across all printers at a glance
- **Print control** — Start, pause, resume, cancel from the dashboard
- **Temperature control** — Set hotend and bed temperatures with presets
- **Print queue** — Per-printer queues with auto-start
- **File management** — Upload, browse, and send G-code files to any printer
- **Macro support** — Execute Klipper macros from the UI
- **Webcam integration** — Embedded webcam streams per printer
- **Bambu Lab support** — AMS slot display, LAN mode control
- **Per-printer theming** — Each card can adopt the CSS from its host Mainsail instance
- **Global themes** — Built-in themes (Dark, Light, Cyberpunk, Ocean, Sunset) plus community Mainsail theme support
- **Spoolman integration** — Active spool tracking, filament inventory, swatch STL generation, OrcaSlicer profile export, HueForge catalogue export
- **Shrinkage calibration** — Ported Calistar/fleur_de_cali workflow for dimensional accuracy calibration with per-axis correction output
- **Print history & statistics** — Completed prints with duration, filament used, material, and spool data
- **Preventive maintenance tracking** — Per-printer maintenance tasks based on cumulative print-time hours
- **One-click updates** — Pull new Marathon versions from GHCR directly from the UI
- **Setup wizard** — Guided first-run setup for Spoolman, printers, and optional features

---

## Running with Docker (recommended)

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose

### First-time setup

```bash
curl -fsSL https://raw.githubusercontent.com/Hellsparks/Marathon-overview/main/install.sh | bash
```

Then open `http://localhost` — done.

Or if you already have the repo cloned:

```bash
docker compose up -d --build
```

The wizard walks you through:
- Fresh install, or restore from a Marathon/Spoolman database backup
- Spoolman URL configuration (auto-creates all required extra fields)
- Adding your printers (Klipper, Bambu Lab, OctoPrint, Duet)
- Enabling optional features (OrcaSlicer profiles, swatch generation, HueForge)

### Installing Spoolman

You don't need to set up Spoolman separately. After the wizard, go to **Settings → Docker Setup** and click **Install Spoolman**. Marathon pulls the container, starts it, and configures the URL automatically.

### Swatch generator (optional)

The swatch generator produces printable STL colour swatches per filament. Two options, both managed from **Settings → Swatch Generator**:

| Option | Requirements | Notes |
|---|---|---|
| **Docker** | Docker (already running) | Marathon pulls and manages the container for you |
| **Local (uv)** | [uv](https://docs.astral.sh/uv/) | No Docker needed. First start downloads cadquery (~500 MB). |

Install uv:
```bash
# Mac/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows
winget install astral-sh.uv
```

### How Marathon manages Docker containers

Marathon mounts the host Docker socket (`/var/run/docker.sock`) into the backend container. When it installs Spoolman or the swatch service, it talks directly to the host Docker daemon via the socket API — no `docker` CLI needed inside the container. All containers Marathon creates are **siblings** on the host daemon:

```
Host Docker Daemon
├── marathon-backend    ← mounts /var/run/docker.sock
├── marathon-frontend
├── marathon-swatch     ← installed via Settings
└── marathon-spoolman   ← installed via Settings
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Backend listen port |
| `DB_PATH` | `/app/data/marathon.db` | SQLite database path |
| `UPLOADS_DIR` | `/app/uploads` | G-code upload directory |
| `SWATCH_SERVICE_URL` | `http://swatch:7321` | Swatch generator URL (overridden by DB setting) |

Data is persisted in Docker volumes:
- `backend_data` — SQLite database + Spoolman data
- `gcode_uploads` — Uploaded G-code files

---

## Running Locally (development)

### Prerequisites

- **Node.js** ≥ 18
- **npm**

### Quick start

```bash
git clone https://github.com/Hellsparks/Marathon-overview.git
cd Marathon-overview

npm run install:all
npm run dev
```

This starts:
- **Backend** on `http://localhost:3000` (nodemon, auto-reloads)
- **Frontend** on `http://localhost:5173` (Vite HMR, proxies `/api` to backend)

### Swatch generator in dev

Use the combined dev scripts to start the swatch service alongside the app:

```bash
npm run dev:docker   # backend + frontend + swatch via Docker
npm run dev:local    # backend + frontend + swatch via uv (Python 3.12)
```

Or start the swatch service on its own:

```bash
npm run swatch:docker
npm run swatch:local
```

---

## Architecture

```
frontend/          React 18 + Vite (SPA)
backend/           Express + SQLite (REST API)
swatch-service/    Python/CadQuery STL generator (Flask microservice)
mcp-server/        MCP server for AI assistant integration
docker-compose.yml Production deployment (nginx + node + swatch)
```

```
Marathon-overview/
├── frontend/
│   ├── src/
│   │   ├── pages/          Dashboard, Files, Queue, Spoolman, Calibration, Maintenance, Settings, Setup
│   │   ├── components/     UI components (PrinterCard, dialogs, layout, etc.)
│   │   ├── api/            API client functions
│   │   ├── hooks/          Custom React hooks
│   │   ├── utils/          Color, CSS scoping utilities
│   │   ├── index.css       Base styles + CSS variable system
│   │   ├── themes.css      Built-in theme definitions
│   │   └── App.jsx         Router + layout
│   ├── Dockerfile          Multi-stage build (Vite → nginx)
│   └── nginx.conf          Reverse proxy config
├── backend/
│   ├── src/
│   │   ├── routes/         REST endpoints (printers, spoolman, files, setup, extras, etc.)
│   │   ├── services/       Poller, Moonraker/Bambu clients, swatch generator
│   │   ├── db/             SQLite schema + migrations
│   │   └── app.js          Express app setup
│   └── Dockerfile
├── swatch-service/
│   ├── server.py           Flask microservice
│   ├── start.js            Cross-platform launcher (docker|local)
│   └── Dockerfile
├── mcp-server/
├── docker-compose.yml
├── THEMING.md
└── package.json            Dev runner (concurrently)
```

---

## TODO

### High priority
- [ ] **WebSocket status updates** — Replace polling with Moonraker WebSocket subscriptions for real-time updates
- [ ] **Authentication** — User login / API key support for multi-user or public-facing deployments
- [ ] **Print status feedback** — Detect print completion/failure for accurate tracking
- [ ] **Project templates** — Templates from a series of G-code files with per-file colour tracking

### Features
- [ ] **Multi-file upload** — Drag-and-drop multiple G-code files at once
- [ ] **Notifications** — Email/Discord/push alerts for print completion, errors, temperature warnings
- [ ] **Mobile layout** — Optimise grid and controls for phone/tablet screens
- [ ] **Timelapse viewer** — Integrate with Moonraker's timelapse plugin
- [ ] **Shopify integration** — Link orders to project templates with colour preferences and print queue
- [ ] **OpenPrintTag support** — RFID spool tagging via ESP32 scanner + Spoolman

### Theming
- [ ] **Theme editor** — Visual CSS variable editor in Settings
- [ ] **Cache invalidation** — "Refresh theme" button to re-scrape Mainsail CSS without reload

### Infrastructure
- [ ] **HTTPS support** — TLS termination in nginx config or Traefik/Caddy
- [ ] **Database backups** — Auto-export DB snapshots to a configurable path

---

## License

This project is licensed under the **GNU General Public License v3.0** — see [LICENSE](LICENSE) for details.
