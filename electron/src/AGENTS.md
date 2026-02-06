# Electron Guidelines

**Navigation**: [Root AGENTS.md](../../AGENTS.md) → **Electron**

## Build, Lint & Test

```bash
cd electron
npm install              # Install dependencies
npm start                # Start electron app
npm run build            # Production build (tsc + vite + electron-builder)
npm run vite:build       # Vite build only
npm run typecheck        # TypeScript check
npm run lint             # ESLint
npm run lint:fix         # Auto-fix lint issues
npm test                 # Run tests
npm run test:e2e         # E2E tests
```

## Rules

### Security

- Use `contextBridge` for all IPC communication — never expose `nodeIntegration`.
- Enable `contextIsolation` on all windows.
- Validate all IPC inputs in the main process before acting on them.
- Never pass unsanitized user data to `shell.openExternal` or file system APIs.

### IPC Communication

- Define IPC channels as constants — don't use string literals.
- Use `ipcMain.handle` / `ipcRenderer.invoke` for request-response patterns.
- Use `webContents.send` / `ipcRenderer.on` for main-to-renderer events.
- Always clean up IPC listeners when windows are destroyed.

### Platform Code

- Guard platform-specific code with `process.platform` checks.
- Test on all target platforms (macOS, Windows, Linux).

### Performance

- Use worker threads for heavy operations in the main process.
- Implement proper cleanup on app quit.
- Use lazy loading for non-critical modules.

## Testing

```bash
cd electron
npm test                 # Unit tests
npm run test:e2e         # E2E tests (requires built app)
npm run test:e2e:headed  # E2E with visible window
```

- Build the app before running E2E tests: `npm run vite:build && npx tsc`.
- E2E tests use Playwright with Electron support.
