# Electron Desktop App

Electron wrapper that packages NodeTool as a desktop application. Bundles the web editor and adds native features: system tray, file access, auto-updates.

**Key folders:**

- `src/` - Main process and preload scripts
- `assets/` - Icons and static resources
- `resources/` - Templates bundled in app
- `tests/e2e/` - End-to-end Playwright tests

## Native Features

**File explorer bridge:** IPC handlers expose safe OS paths (HuggingFace cache, Ollama models) to renderer via `window.api.openModelDirectory` / `openModelPath`.

## Development

```bash
npm run dev      # UI with hot reload
npm run build    # Compile renderer and main
npm start        # Start desktop app
```

Output in `dist-electron/` for distribution.

## Testing

End-to-end tests verify desktop integration, IPC handlers, and server management using Playwright with Electron.

**Prerequisites:**
```bash
# Install Playwright browsers (one time)
npx playwright install chromium
```

**Run tests:**

```bash
# Build first
npm run vite:build
npx tsc

# Run tests
npm run test:e2e          # All tests
npm run test:e2e:ui       # Interactive mode
npm run test:e2e:headed   # See window
```

**Test structure** (`tests/e2e/`):

- **app-loads.spec.ts** - Basic launch without server (`NODE_ENV=test`)
  - Window creation, IPC communication
  - Quick, no Python backend needed

- **python-server.spec.ts** - Server initialization (`NODE_ENV=development`)
  - Python backend startup, health checks
  - Needs Python environment with nodetool installed

### Server Management

Electron **manages its own server**. On launch (dev/production):

1. Detects Python environment (`CONDA_PREFIX` or settings)
2. Finds available port (starting 7777)
3. Starts server via Watchdog process manager
4. Monitors health, handles restarts

Tests handle this by:
- Cleaning up existing processes before/after
- Using proper PID paths (`/tmp/nodetool-electron/server.pid`)
- Setting appropriate environment variables
- Waiting for server init when needed

### CI/CD

GitHub Actions (`.github/workflows/e2e.yml`):
1. Sets up conda with Python 3.11
2. Installs nodetool packages
3. Builds Electron app
4. Runs tests using conda environment

Tests inherit `CONDA_PREFIX` from activated environment.

## GPU Detection

Electron uses [torchruntime](https://github.com/easydiffusion/torchruntime) when a package needs a PyTorch-specific wheel index. This runs before installing or updating known torch-dependent packages such as `nodetool-huggingface` and `nunchaku`.

If no torch platform is cached, the package manager:

1. Installs `torchruntime~=2.0` into the Python environment if needed
2. Detects the local GPU platform
3. Saves the result as `TORCH_PLATFORM_DETECTED` in `~/.config/nodetool/settings.yaml` (or `%APPDATA%/nodetool/settings.yaml` on Windows)
4. Adds the matching PyTorch wheel index to the `uv pip install` command

If detection fails, it falls back to CPU wheels.

**Supported torch platforms:**

- **NVIDIA CUDA**: `cu118`, `cu124`, `cu128`, `cu129`
- **AMD ROCm**: `rocm5.2`, `rocm5.7`, `rocm6.2`, `rocm6.4`
- **Apple Silicon**: `mps` (uses the default PyPI index)
- **CPU-only**: `cpu`

**Detection logs:**

```text
Detecting GPU platform before installing nodetool-huggingface...
Detecting GPU hardware...
Detected torch platform: rocm6.2 (GPUs: 1)
PyTorch index URL: https://download.pytorch.org/whl/rocm6.2
```

Failure falls back to CPU:

```text
GPU detection failed: No GPUs found
Falling back to CPU-only installation
```

## Building for Distribution

### Standard Builds

From the repository root:

```bash
npm run build:packages
npm run build:web
npm run build:electron
```

From `electron/`:

```bash
npm run build        # Build and package for current platform
npm run dist         # Create distribution packages
```

Outputs to `dist/` directory.

### Local Non-Release Builds

The Electron build verifies that required Python wheels are published before packaging. For local test builds, you can skip this release-only registry check:

```bash
SKIP_PYTHON_REGISTRY_CHECK=1 npm run build:electron
```

or from `electron/`:

```bash
SKIP_PYTHON_REGISTRY_CHECK=1 npm run build
```

After packaging, verify the QuickJS WebAssembly asset is included with the externalized package:

```bash
find electron/dist -path "*/Resources/backend/node_modules/@jitl/quickjs-ng-wasmfile-release-sync/dist/emscripten-module.wasm" -print
```

Smoke-test the packaged app by running a `nodetool.code.Code` node:

```js
return { ok: true, answer: 42 };
```

### Linux Packaging

**AppImage (default):**
```bash
npm run dist         # Creates AppImage in dist/
```

**Flatpak:**
```bash
npm run dist         # Creates both AppImage and Flatpak
```

The Flatpak package provides sandboxed distribution for Linux with:
- Consistent runtime across distributions
- Automatic dependency management
- Easy installation via Flatpak

For detailed Flatpak information, see [FLATPAK.md](FLATPAK.md).

### Supported Platforms

- **Linux**: AppImage, Flatpak
- **macOS**: DMG, ZIP (x64, arm64)
- **Windows**: NSIS installer
