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

GitHub Actions (`.github/workflows/electron-e2e.yml`):
1. Sets up conda with Python 3.11
2. Installs nodetool packages
3. Builds Electron app
4. Runs tests using conda environment

Tests inherit `CONDA_PREFIX` from activated environment.

## GPU Detection

Uses [torchruntime](https://github.com/easydiffusion/torchruntime) to detect GPU hardware and install correct PyTorch variant.

**Supported:**

- **NVIDIA** - Auto CUDA selection (11.8, 12.4, 12.8, 12.9)
  - 50xx, 40xx, 30xx, 20xx, 16xx, 10xx, datacenter
- **AMD**
  - Linux: ROCm 5.2, 5.7, 6.2, 6.4 (7xxx, 6xxx, 5xxx series, APUs)
  - Windows: DirectML (all recent AMD GPUs)
- **Intel** - Arc and integrated via XPU or DirectML
- **Apple Silicon** - M1/M2/M3/M4 with MPS
- **CPU-only** - Automatic fallback

**How it works:**

During provisioning:
1. Create Python environment with micromamba
2. Install torchruntime from PyPI
3. Run GPU detection via PCI database
4. Determine PyTorch index URL
5. Install packages with correct variant
6. Cache results for future operations

**Detection logs:**

```
Detecting GPU hardware...
Detected torch platform: rocm6.2 (GPUs: 1)
PyTorch index URL: https://download.pytorch.org/whl/rocm6.2
```

Failure falls back to CPU:

```
GPU detection failed: No GPUs found
Falling back to CPU-only installation
```

**DirectML (AMD/Intel on Windows):**

```
DirectML support required for this platform
```

Note: ComfyUI nodes need `--directml` flag, auto-configured.

**Manual override:**

```bash
# Force CPU
TORCH_PLATFORM=cpu npm start

# Force CUDA 12.9
TORCH_PLATFORM=cu129 npm start

# Force ROCm 6.2
TORCH_PLATFORM=rocm6.2 npm start
```

Valid: `cu118`, `cu124`, `cu128`, `cu129`, `rocm5.2`, `rocm5.7`, `rocm6.2`, `rocm6.4`, `directml`, `xpu`, `mps`, `cpu`

## Building for Distribution

### Standard Builds

```bash
npm run build        # Build and package for current platform
npm run dist         # Create distribution packages
```

Outputs to `dist/` directory.

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
