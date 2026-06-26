# Electron Guidelines

**Navigation**: [Root AGENTS.md](../../AGENTS.md) | [CLAUDE.md](../../CLAUDE.md) → **Electron**

> **Read [docs/DEVELOPMENT_STANDARDS.md §12 Electron Security](../../docs/DEVELOPMENT_STANDARDS.md#12-electron-39-security) first.** It is the canonical source for Electron security, IPC, sandboxing, and platform standards. The rules below are the area-specific overlay.

Desktop application wrapping the NodeTool web UI with native capabilities (local file system, SQLite, Python/Conda integration).

## Prerequisites

- **Node.js 22.22.1 required.** Matches Electron 39's embedded Node so dev and packaged app run on the same Node version (same APIs, same V8). Note: Electron uses its own ABI tag (`NODE_MODULE_VERSION` 140) regardless of which Node version it embeds, so native modules like `better-sqlite3` are still rebuilt against Electron headers via `@electron/rebuild` (see `electron/package.json` `postinstall`).
- Use `nvm use` from the repo root (reads `.nvmrc`).
- `npm install` triggers `@electron/rebuild` automatically. To force a rebuild: `npm --prefix electron run postinstall`.

## Build, Lint & Test

```bash
cd electron
npm install              # Install dependencies
npm start                # Start Electron app (requires built web)
npm run build            # Production build (tsc + vite + electron-builder)
npm run vite:build       # Vite build only (main + preload)
npm run typecheck        # TypeScript check
npm run lint             # ESLint
npm run lint:fix         # Auto-fix lint issues
npm test                 # Run unit tests
npm run test:e2e         # E2E tests (requires built app + Playwright)
npm run test:e2e:headed  # E2E with visible window
```

### Development Modes

```bash
# From repo root:
npm run electron            # Build web + Electron, then start
npm run electron:dev        # Start against web Vite server (requires active conda env)
```

### E2E Test Setup

```bash
cd electron
npx playwright install chromium
npm run vite:build && npx tsc   # Build first
npm run test:e2e                # Run tests
```

## Key Technologies

| Library | Version | Purpose |
|---------|---------|---------|
| Electron | 39.8.8 | Desktop shell |
| React | 19.1 | UI framework |
| TypeScript | 5.3 | Type safety |
| Zustand | 5.0.3 | State management |
| Vite | 6.4 | Build tool (main + preload processes) |
| better-sqlite3 | — | Local SQLite database |
| sharp | — | Image processing |
| sqlite-vec | — | Vector embeddings |

## Architecture

```
electron/src/
├── main.ts              # Main process entry point
├── preload.ts           # Preload script (contextBridge)
├── config.ts            # Conda environment detection
├── WorkflowRunner.ts    # Workflow execution in main process
└── components/          # React components for Electron UI
```

**Process model**: Main process (Node.js) ↔ Preload script (contextBridge) ↔ Renderer process (React).

### Vaults (multiple databases)

A **vault** is a switchable, isolated data store — its own SQLite database plus
its own assets and vector-store directories. It lets a user keep separate sets
of workflows/data apart and switch between them from the desktop app. This is
distinct from the in-database `nodetool_workspaces` concept (a per-user working
directory for file tools); vaults sit one level above the database.

- `vaults.ts` — source of truth: the vault list + active id are persisted in
  `settings.yaml` (`vaults`, `activeVaultId`). The built-in **Default** vault
  has `null` paths, meaning "use the backend defaults", so existing installs are
  untouched. `getActiveVaultEnv()` returns `DB_PATH`/`ASSET_FOLDER`/
  `VECTORSTORE_DB_PATH` overrides for the active vault.
- `server.ts` merges those overrides into the backend's environment at startup
  (skipped when an external `DATABASE_URL` is set — vaults are SQLite-only).
- `vaultSwitch.ts` — `applyVaultSwitch(id)`: persist active id → restart the
  backend (so it opens the new database) → re-register shortcuts → reload the
  main window. Restarting the process is intentional: the backend holds its
  SQLite connection in a singleton, so a clean restart beats a live swap.
- UI: a native **Vaults** menu (quick switch + "Manage Vaults…") and a Vaults
  section in the Settings window (`pages/SettingsPage.tsx`) for create / rename /
  delete / switch, over `window.api.vaults.*` (IPC `VAULT_*`).

## Rules

### Security (Critical — non-negotiable)

> See [DEVELOPMENT_STANDARDS §12](../../docs/DEVELOPMENT_STANDARDS.md#12-electron-39-security) for the full checklist (CSP, auto-update signing, `setWindowOpenHandler`, sandbox flag, `webSecurity`).

- **`contextIsolation: true`** on every `BrowserWindow`. No exceptions.
- **`nodeIntegration: false`** on every `BrowserWindow`. No exceptions.
- **`sandbox: true`** on renderer windows whenever possible.
- **`webSecurity: true`** — never disable.
- **Always** use `contextBridge.exposeInMainWorld` for IPC. Never assign to `window` directly.
- **Validate every IPC input with Zod** in the main process before acting on it. Untrusted renderer is the attacker model.
- **`shell.openExternal`** only with an allowlisted URL scheme (`https:`, `mailto:`). Never pass user input directly.
- **`webContents.setWindowOpenHandler`** denies all by default; allow specific URLs only.
- **No `eval`, no `new Function`** anywhere in main or preload.
- **Auto-update** must verify code signatures (`electron-updater` with publisher verification).
- **CSP** is set in production builds. **target**: drop `'unsafe-inline'` for scripts.

### IPC Communication

- Define IPC channels as string constants — never use string literals inline.
- Use `ipcMain.handle` / `ipcRenderer.invoke` for request-response (async).
- Use `webContents.send` / `ipcRenderer.on` for main-to-renderer events.
- Always clean up IPC listeners when windows are destroyed.
- IPC handlers wrap their body in try/catch and return a discriminated `{ ok: true, data } | { ok: false, error }` — never throw across the IPC boundary.
- Every IPC handler is span-instrumented for tracing. See [DEVELOPMENT_STANDARDS §17](../../docs/DEVELOPMENT_STANDARDS.md#17-observability).

### Platform Code

- Guard platform-specific code with `process.platform` checks (`darwin`, `win32`, `linux`).
- Test on macOS, Windows, and Linux.
- Use `path.join()` for file paths — never hardcode path separators.

### Performance

- Use worker threads for heavy operations in the main process.
- Implement proper cleanup on app quit (close DB connections, stop servers).
- Use lazy loading for non-critical modules in the main process.
- The Electron app bundles the backend server — it starts on launch and stops on quit.

### Conda Integration

- The app detects the active Conda environment via `config.ts`.
- Python-based nodes (HuggingFace, MLX) require a Conda environment with the correct dependencies.
- See `environment.yml` in the repo root for the Conda spec.
