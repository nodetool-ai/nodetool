# Electron Desktop App

This folder contains the Electron wrapper that packages NodeTool into a desktop application.
It bundles the web editor and apps into a cross-platform executable and adds
native integrations such as the system tray, file access, and auto-updates.

Key folders:

- `src/` – main process code and preload scripts
- `assets/` – icons and other static resources used by Electron
- `resources/` – templates and additional files bundled into the app
- `tests/e2e/` – end-to-end tests using Playwright

## Native Integrations

- File explorer bridge: IPC handlers (`file-explorer-open-path`, `file-explorer-open-directory`) expose safe OS paths such as the Hugging Face cache and Ollama models directories to the renderer via `window.api.openModelDirectory` / `openModelPath`.

## Development

This app is built with React and Vite. In development you can launch the UI with
hot reload using:

```bash
npm run dev
```

To compile the Electron renderer and main process, run:

```bash
npm run build
```

Then start the desktop app with:

```bash
npm start
```

Use the build output in `dist-electron/` to create distributable packages.

## Testing

The Electron app has end-to-end tests that verify the desktop application integration, IPC handlers, and server management. The tests use Playwright with Electron support.

### Running E2E Tests

E2E tests require both a built Electron app and an available Python environment with nodetool installed:

```bash
# 1. Build the Electron app
npm run vite:build
npx tsc

# 2. Run e2e tests
npm run test:e2e          # Run all e2e tests
npm run test:e2e:ui       # Run with Playwright UI (interactive)
npm run test:e2e:headed   # Run in headed mode (see the window)
```

### E2E Test Structure

The e2e tests are located in `tests/e2e/`:

- **`app-loads.spec.ts`**: Tests basic app loading without server initialization (`NODE_ENV=test`)
  - Verifies the Electron app launches successfully
  - Tests window creation and IPC communication
  - Runs quickly without starting the Python backend

- **`python-server.spec.ts`**: Tests server initialization and management (`NODE_ENV=development`)
  - Verifies the Electron app starts the Python backend server
  - Tests server state, health checks, and IPC handlers
  - Requires Python environment and nodetool packages to be installed

### Important: Server Management in Tests

The Electron app **manages its own nodetool server**. When the app launches in development or production mode, it:

1. Detects the Python environment (via `CONDA_PREFIX` or settings)
2. Finds an available port (starting from 7777)
3. Starts the nodetool server using the Watchdog process manager
4. Monitors server health and handles restarts

The e2e tests account for this by:
- Cleaning up any existing server processes before/after tests
- Using proper PID file paths (`/tmp/nodetool-electron/server.pid`)
- Launching the Electron app with appropriate environment variables
- Waiting for server initialization when needed

### CI/CD

The GitHub Actions workflow (`.github/workflows/electron-e2e.yml`):
1. Sets up a conda environment with Python 3.11
2. Installs nodetool-core and nodetool-base packages
3. Builds the Electron app
4. Runs e2e tests using the conda environment

The tests inherit the activated conda environment via `CONDA_PREFIX`, which the Electron app automatically detects and uses.
