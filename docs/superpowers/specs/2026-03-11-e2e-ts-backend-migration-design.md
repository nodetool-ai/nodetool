# E2E Test Migration to TypeScript Backend

## Summary

Migrate the Playwright e2e tests from targeting the Python backend (`nodetool serve --port 7777 --mock`) to the TypeScript backend (`node packages/websocket/dist/server.js`). No test changes — if tests fail, fix the TS backend implementation.

## Changes

### 1. `web/playwright.config.ts`

Replace the Python backend start command:
- **Before:** `conda run -n nodetool nodetool serve --port 7777 --mock`
- **After:** `npm run build:packages && node packages/websocket/dist/server.js`
- Set env vars: `PORT=7777`, `HOST=127.0.0.1`
- Working directory: repo root (where `packages/` lives)

### 2. `.github/workflows/e2e.yml` — Web Tests job

Remove:
- Conda/miniconda setup step
- Python package installation steps (`uv pip install ...`)
- `nodetool` CLI verification step

Replace:
- "Start nodetool server" step: use `node packages/websocket/dist/server.js` instead of `nodetool serve`
- Add a "Build TS packages" step before starting the server: `npm run build:packages`
- Update `npm ci` to run at repo root (not just `web/`) since we need all workspace packages

Keep:
- Health check against `http://localhost:7777/health` (TS backend serves this)
- Frontend start (`npm start` in `web/`)
- Playwright browser install
- All artifact upload steps
- Server PID tracking and cleanup

### 3. `.github/workflows/e2e.yml` — Electron Tests job

Same Python removal pattern. The Electron job also installs Python/Conda which is no longer needed.

### 4. Backend fixes (if tests fail)

If any Playwright tests fail due to API response differences, fix the TS backend (`packages/websocket/src/http-api.ts`) to match the Python API contract. Do not modify tests.

## Out of Scope

- No new test files
- No changes to test helpers, fixtures, or mock data
- No Vitest migration
- No changes to test assertions or structure
