# Electron Desktop App

Electron wrapper that packages NodeTool as a desktop application. Bundles the web editor and adds native features: system tray, file access, auto-updates.

**Key folders:**

- `src/` - Main process and preload scripts
- `assets/` - Icons and static resources
- `resources/` - Templates bundled in app
- `src/__tests__/` - Jest tests for the main process

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

Jest tests in `src/__tests__/` cover the main process: IPC handlers, server
spawning and watchdog, settings, the packaged-bundle verifier, window security,
and the updater.

```bash
npm test              # Run the suite
npm run test:watch    # Watch mode
npm run test:coverage # With coverage
npm run check         # tsc + eslint + jest
```

There is no Playwright suite in this workspace — the Electron E2E tests were
replaced with these Jest integration tests. Browser-level E2E lives in `web/`
(`npm run test:e2e`, `npm run test:e2e-runner`).

### Server Management

Electron **manages its own server**. On launch (dev/production):

1. Detects Python environment (`CONDA_PREFIX` or settings)
2. Finds available port (starting 7777)
3. Starts server via Watchdog process manager
4. Monitors health, handles restarts

### CI/CD

The Quality Gate's `test-app` leg runs the root `npm run test`, which includes
this workspace's Jest suite (`.github/workflows/quality-checks.yml`).

## GPU Detection

Electron uses [torchruntime](https://github.com/easydiffusion/torchruntime) to pick the PyTorch wheel index for the packs whose dependencies include torch, `nodetool-huggingface` and `nodetool-mlx`. The HuggingFace pack pins torch 2.14.x.

Before every install or update of either pack, the package manager:

1. Installs `torchruntime~=2.0` into the Python environment if needed
2. Detects the local GPU platform, so a new GPU or driver is picked up
3. Saves a successful result as `TORCH_PLATFORM_DETECTED` in `~/.config/nodetool/settings.yaml` (or `%APPDATA%/nodetool/settings.yaml` on Windows). Installs that do not detect, such as the Python runtime's core install, reuse it. A failed detection is never saved.
4. Passes `--torch-backend <backend>` to `uv pip install`. uv then takes torch packages only from `https://download.pytorch.org/whl/<backend>` and everything else from PyPI.

`mapTorchPlatform` in `electron/src/torchruntime.ts` maps the detected platform to a backend:

| Detected platform | Backend |
|---|---|
| `mps` | none, torch comes from PyPI |
| `cpu` | `cpu` |
| `xpu`, `ipex` | `xpu` |
| `cu120` to `cu127` | `cu126` |
| `cu128`, `cu129` | `cu128` |
| `cu130` and newer | `cu130` |
| `rocm6.x` | `rocm7.2` |
| `directml`, `cu118`, `rocm` below 6, unknown | `cpu`, with a warning |

When detection fails, the install uses the last saved result, else `--torch-backend auto` (no backend on macOS). When the chosen GPU index has no build of the pinned torch, the install falls back to the CPU build and logs a warning, so the pack still installs and Python nodes run on the CPU. Which of these indexes publish torch 2.14 was not verified here. Hardware limits for users are in [GPU requirements](../docs/installation.md#gpu-requirements).

Python packs install at their newest stable PyPI release, independent of the app version, with prereleases excluded. Each install or update resolves the requested pack together with every installed pack. Packs with a `platforms` list in `packages/protocol/src/python-packs.ts` are hidden and refused elsewhere: MLX runs only on `darwin-arm64`, and HuggingFace on every platform except `darwin-x64` (PyTorch 2.14 has no Intel Mac build). On a Mac, both also need macOS 14 or newer, the oldest release PyTorch 2.14 and MLX publish wheels for.

**Detection logs:**

```text
Detecting GPU platform before installing nodetool-huggingface...
Detecting GPU hardware...
Detected torch platform: rocm6.2 (GPUs: 1)
Platform detection complete: rocm6.2 -> rocm7.2
```

On failure, with no saved result:

```text
GPU detection failed: No GPUs found
Letting uv pick the PyTorch index from the installed GPU driver
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
