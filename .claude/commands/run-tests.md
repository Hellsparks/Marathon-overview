Run the full Marathon test suite (backend + frontend + E2E) and report results.

## Steps

1. Run backend tests:
   ```bash
   cd /mnt/ssd/Github/Marathon-overview/backend && npm test
   ```
   Backend uses Jest + Supertest. Tests are in `backend/src/tests/routes/`.
   `--forceExit` is already in package.json (needed due to timer leak in poller).

2. Run frontend unit + component tests:
   ```bash
   cd /mnt/ssd/Github/Marathon-overview/frontend && npm test
   ```
   Frontend uses Vitest + @testing-library/react. Tests are in `frontend/src/tests/`.
   Includes component tests for PrinterCard (states: offline, idle, printing, paused).

3. Run E2E smoke tests:
   ```bash
   cd /mnt/ssd/Github/Marathon-overview/frontend && npm run test:smoke
   ```
   Uses Playwright (Chromium). Mocks all API calls — no real backend needed.
   Verifies each page loads and key UI elements are present.

4. Report: show pass/fail counts for each suite. List any failing tests with their error messages.

5. If tests fail: investigate root cause and fix before committing.

## Visual Regression Tests (run locally, not in CI)

When you make intentional UI changes, update the visual baselines:
```bash
cd /mnt/ssd/Github/Marathon-overview/frontend && npm run test:visual:update
```
Then commit the updated screenshots in `tests/e2e/visual.spec.js-snapshots/`.

To compare against current baselines (without updating):
```bash
npm run test:visual
```

## When to run what

| Command | When |
|---|---|
| `npm test` (backend) | Any backend `.js` file changed |
| `npm test` (frontend) | Any frontend `.jsx/.js` file changed |
| `npm run test:smoke` | Before committing, after any UI change |
| `npm run test:visual:update` | After intentional UI changes (commit the new snapshots) |
