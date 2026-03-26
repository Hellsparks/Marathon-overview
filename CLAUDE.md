# Marathon — Claude Code Guide

This file is auto-loaded by Claude Code at the start of every session.
See `AGENTS.md` for architecture, conventions, and common pitfalls.

---

## Mandatory: Run Tests Before Committing

Always run tests before any commit. Use the `/run-tests` skill:

```
/run-tests
```

Or manually:
```bash
cd backend && npm test              # Jest + Supertest (node)
cd frontend && npm test             # Vitest + @testing-library/react (unit + component)
cd frontend && npm run test:smoke   # Playwright E2E smoke tests (no backend needed)
```

Backend tests use an in-memory SQLite DB — no real data is touched.
Frontend unit/component tests run in jsdom.
Smoke tests use Playwright with mocked API — run in CI before every Docker build.

After **intentional UI changes**, update visual baselines:
```bash
cd frontend && npm run test:visual:update   # regenerate screenshots
# then commit the new snapshots in tests/e2e/visual.spec.js-snapshots/
```

---

## Available Skills (use these — don't re-invent them)

| Skill | When to use |
|---|---|
| `/run-tests` | Before every commit, after any backend/frontend change |
| `/add-migration` | Adding a new DB column, table, or settings key |
| `/add-route` | Adding a new API endpoint |
| `/add-settings-key` | Adding a new key to the `settings` table |

---

## Key Conventions

### Database / Migrations
- SQLite via **`node:sqlite`** (built-in Node 22, `DatabaseSync` — synchronous API). **Not** `better-sqlite3`.
- Migrations live in `backend/src/db/migrations/NNN_name.sql`. Next number: check highest existing NNN + 1.
- Settings are stored as TEXT key-value pairs in the `settings` table. Use `PUT /api/settings` to batch-save from the frontend.
- **Always add a migration** when adding a new settings key — use `INSERT OR IGNORE`.

### API Routes
- All routes prefixed `/api`. Mount in `backend/src/app.js`.
- Router file goes in `backend/src/routes/`. Tests go in `backend/src/tests/routes/`.
- Use the existing `getDb()` singleton — never open a second DB connection.

### Frontend
- Vanilla CSS with CSS custom properties — **no Tailwind**.
- All styles in `frontend/src/index.css`. Theme vars in `themes.css`.
- Fetch wrappers go in `frontend/src/api/`. One file per route group.

### Theming (critical — read `THEMING.md` before touching)
- `themes.css` must NEVER set direct CSS properties on component selectors — CSS vars only.
- `scopeCSS()` has two intentional copies (PrinterCard inline + `utils/scopeCSS.js`). Do NOT merge them.

### Docker
- Backend Dockerfile: `node:24-slim` + `git` + `smbclient` + Docker CLI + Compose plugin.
- Spoolman always runs in Docker even in native dev mode. Use `docker cp marathon-spoolman:...` to access its DB.
- Docker socket is mounted into the backend container — `docker` CLI commands work from inside.

---

## Project Structure Quick Reference

```
backend/src/
├── index.js          Entry: DB init → listen → start poller + backup scheduler
├── app.js            Route mounting (20+ routers)
├── db/migrations/    NNN_name.sql — auto-applied on startup
├── routes/           One file per feature group
├── services/
│   ├── poller.js     Printer status polling (setInterval, 3s)
│   └── backup.js     Scheduled backup (setInterval, 60s tick)
└── tests/routes/     Jest + Supertest tests

frontend/src/
├── pages/            One page component per route
├── api/              Fetch wrappers (one per route group)
├── utils/            colorUtils, materialUtils, etc.
└── tests/            Vitest tests mirroring src/ structure
```

---

## When Adding Features — Checklist

- [ ] Migration SQL added if schema changes
- [ ] Backend route + test added
- [ ] Frontend API wrapper updated
- [ ] `/run-tests` passes
- [ ] No hardcoded IPs, credentials, or local paths in code
