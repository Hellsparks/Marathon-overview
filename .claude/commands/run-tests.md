Run the full Marathon test suite (backend + frontend) and report results.

## Steps

1. Run backend tests:
   ```bash
   cd /mnt/ssd/Github/Marathon-overview/backend && npm test
   ```
   Backend uses Jest + Supertest. Tests are in `backend/src/tests/routes/`.
   The `--forceExit` flag is already in package.json (needed due to timer leak in poller).

2. Run frontend tests:
   ```bash
   cd /mnt/ssd/Github/Marathon-overview/frontend && npm test
   ```
   Frontend uses Vitest + @testing-library/react. Tests are in `frontend/src/tests/`.

3. Report: show pass/fail counts for each suite. List any failing tests with their error messages.

4. If tests fail: investigate the root cause and fix before committing.
   Do NOT use `--forceExit` to hide failures, or skip failing tests.
