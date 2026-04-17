# Electron Guidelines

**Navigation**: [Root AGENTS.md](../../AGENTS.md) | [CLAUDE.md](../../CLAUDE.md) → **Electron**

Desktop application wrapping the NodeTool web UI with native capabilities (local file system, SQLite, Python/Conda integration).

## Prerequisites

- **Node.js 22.x required.** Electron 35 embeds a Node 22 fork (ABI 133). Native modules like `better-sqlite3` must be compiled against this ABI. Using Node 23+ or 24+ will cause `NODE_MODULE_VERSION` mismatch errors at startup.
- Use `nvm use` from the repo root (reads `.nvmrc`).
- `npm run electron:dev` automatically runs `electron-builder install-app-deps` to rebuild native modules before launching.

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
| Electron | 35.7.5 | Desktop shell |
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
├── agent.ts             # Claude Agent session (Electron-specific)
├── config.ts            # Conda environment detection
├── WorkflowRunner.ts    # Workflow execution in main process
└── components/          # React components for Electron UI
```

**Process model**: Main process (Node.js) ↔ Preload script (contextBridge) ↔ Renderer process (React).

## Rules

### Security (Critical)

- **Always** use `contextBridge` for IPC — never enable `nodeIntegration`.
- **Always** enable `contextIsolation` on all windows.
- Validate all IPC inputs in the main process before acting on them.
- Never pass unsanitized user data to `shell.openExternal` or file system APIs.
- Never expose Node.js APIs directly to the renderer.

### IPC Communication

- Define IPC channels as string constants — never use string literals inline.
- Use `ipcMain.handle` / `ipcRenderer.invoke` for request-response (async).
- Use `webContents.send` / `ipcRenderer.on` for main-to-renderer events.
- Always clean up IPC listeners when windows are destroyed.

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
