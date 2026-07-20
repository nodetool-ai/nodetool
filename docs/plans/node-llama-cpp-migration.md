# Technical Design: Replace llama.cpp Server with node-llama-cpp

**Issue**: #4366
**Status**: Draft
**Date**: 2026-07-20

## Summary

Replace the current llama.cpp integration (conda-installed `llama-server` binary managed as an external process) with [node-llama-cpp](https://github.com/withcatai/node-llama-cpp), a native Node.js binding for llama.cpp. This eliminates the conda/micromamba dependency chain, the external process management, and the HTTP-based OpenAI-compatible API layer — replacing all of it with direct in-process inference via N-API.

## Current Architecture

The existing llama.cpp integration spans four layers:

### 1. Binary Installation (Electron only)

`electron/src/installer.ts` installs the `llama-server` binary via conda/micromamba:

- Downloads micromamba (~15 MB) on first launch
- Creates a conda environment (~50 MB base)
- Installs the `llama.cpp` conda package: CPU (~200 MB) or CUDA (~500+ MB)
- Total first-run download: **250-550 MB** depending on GPU

### 2. Process Management (Electron only)

`electron/src/server.ts` manages `llama-server` as a child process via `Watchdog`:

- Finds an available port (default 8080)
- Spawns `llama-server --host 127.0.0.1 --port <port>`
- Health-checks via `GET /health`
- Injects `LLAMA_CPP_URL` into the backend's environment
- Restart-on-model-download via `restartLlamaServer()`
- System tray controls: start/stop/status

### 3. Provider (Runtime)

`packages/runtime/src/providers/llama-provider.ts` talks to `llama-server` via its OpenAI-compatible `/v1` API:

- Uses `OpenAICompatClient` for HTTP requests
- `hasToolSupport()` always returns `false` — relies on tool emulation (regex parsing of `function_name(key=value)` patterns in model output)
- No native JSON schema / grammar support
- No embedding support
- Message normalization: flattens system messages, enforces strict user/assistant alternation

### 4. Model Management

`packages/huggingface/src/llama-cpp-download.ts` downloads GGUF models from HuggingFace to the llama.cpp native cache directory (`~/.cache/llama.cpp/` or platform equivalent).

### Problems with the current approach

1. **Heavy dependency chain**: conda/micromamba + the llama.cpp conda package add 250-550 MB and introduce a non-Node.js package manager
2. **External process**: `llama-server` runs as a separate process, requiring port management, health checks, and IPC over HTTP
3. **No grammar support**: tool calling relies on regex-based emulation of `function_name(key=value)` output, which is fragile
4. **No embedding support**: the llama.cpp provider does not implement `generateEmbedding()`
5. **Single-model**: `llama-server` loads one model at startup; switching models requires a full restart
6. **Electron-only setup**: the conda install flow only works in the desktop app; CLI users must manually install and configure `llama-server`

## Proposed Architecture

### New Provider: `NodeLlamaCppProvider`

A new provider class in `packages/runtime/src/providers/` that uses node-llama-cpp's API directly:

```
packages/runtime/src/providers/
  node-llama-cpp-provider.ts   # new — direct binding provider
  llama-provider.ts            # keep — still useful for remote llama-server
```

The existing `LlamaProvider` (OpenAI-compat client for remote `llama-server`) stays for users who run a standalone llama-server elsewhere. The new provider is registered under a new ID `node_llama_cpp` and becomes the default local inference backend.

### Provider Implementation

```typescript
// Sketch — not final API
import { getLlama, LlamaChatSession, LlamaJsonSchemaGrammar } from "node-llama-cpp";

export class NodeLlamaCppProvider extends BaseProvider {
  private llama: Llama;
  private modelCache: Map<string, LlamaModel>;

  constructor(secrets: { NODE_LLAMA_CPP_MODELS_DIR?: string }) {
    super("node_llama_cpp");
  }

  // Direct in-process inference — no HTTP overhead
  async *generateMessages(args) {
    const model = await this.getOrLoadModel(args.model);
    const context = await model.createContext();
    const session = new LlamaChatSession({ context });

    // Grammar-constrained tool calling (no emulation needed)
    if (args.tools?.length) {
      const response = await session.prompt(message, {
        functions: this.convertToolsToFunctions(args.tools)
      });
    }

    // Streaming via onTextChunk
    await session.prompt(message, {
      onTextChunk(chunk) { /* yield chunk */ }
    });
  }

  // Native embedding support
  async generateEmbedding(args) {
    const model = await this.getOrLoadModel(args.model);
    const ctx = await model.createEmbeddingContext();
    return ctx.getEmbeddingFor(args.text);
  }

  // Grammar-based JSON output
  async generateWithSchema(args) {
    const grammar = new LlamaJsonSchemaGrammar(this.llama, args.schema);
    const response = await session.prompt(args.prompt, { grammar });
    return grammar.parse(response);
  }

  // Multi-model: load/unload from cache without process restart
  async getAvailableLanguageModels() {
    // Scan GGUF files in the models directory
  }
}
```

### Key Capability Gains

| Feature | Current (llama-server) | Proposed (node-llama-cpp) |
|---|---|---|
| Tool calling | Regex emulation | Grammar-constrained native |
| JSON schema output | Not supported | `LlamaJsonSchemaGrammar` |
| Embeddings | Not supported | `LlamaEmbeddingContext` |
| Multi-model | Requires restart | In-process model cache |
| GPU backends | Depends on conda build | Metal, CUDA, Vulkan, CPU (auto-detected) |
| Streaming | HTTP SSE over localhost | Direct callback (lower latency) |
| Process management | Watchdog + port + health | None (in-process) |

### Registration

```typescript
// packages/runtime/src/providers/index.ts
import { NodeLlamaCppProvider } from "./node-llama-cpp-provider.js";

// Replace the existing llama_cpp registration for desktop/CLI:
if (!_cloudProfile) {
  registerBuiltinProvider(
    PROVIDER_IDS.NODE_LLAMA_CPP,
    NodeLlamaCppProvider,
    {},
    { NODE_LLAMA_CPP_MODELS_DIR: getDefaultModelsDir() }
  );

  // Keep the remote llama-server provider for users with external servers
  registerBuiltinProvider(PROVIDER_IDS.LLAMA_CPP, LlamaProvider, {
    LLAMA_CPP_URL: ""
  });
}
```

### Protocol Update

Add `NODE_LLAMA_CPP` to `PROVIDER_IDS` in `packages/protocol/src/api-types.ts`:

```typescript
export const PROVIDER_IDS = {
  // ... existing
  NODE_LLAMA_CPP: "node_llama_cpp",
} as const;
```

## Electron Integration Changes

### What Gets Removed

The following can be removed from the Electron app once node-llama-cpp is the default:

1. **`electron/src/installer.ts`**: The `ensureLlamaCppInstalled()` function, `CUDA_LLAMA_SPEC`/`CPU_LLAMA_SPEC` constants, and `installCondaPackages()` for llama.cpp. The conda/micromamba infrastructure stays if other conda packages (like ffmpeg) still need it.

2. **`electron/src/server.ts`**: The `llamaWatchdog`, `startLlamaServer()`, `restartLlamaServer()`, `startLlamaCppService()`, `stopLlamaCppService()`, and the `LLAMA_CPP_URL` injection into the backend env.

3. **`electron/src/tray.ts`**: The llama-server status indicators and start/stop menu items.

4. **`electron/src/config.ts`**: `getLlamaServerPath()`.

### What Gets Added

1. **electron-builder.json**: Add `node-llama-cpp` native binaries to `extraResources` or configure `asarUnpack` for the `.node` addon:

```json
{
  "asarUnpack": [
    "**/node-llama-cpp/**/*.node",
    "**/node-llama-cpp/**/llama/**"
  ]
}
```

2. **Binary path configuration**: In packaged Electron, the prebuilt llama.cpp binary lives outside the asar archive. The provider must pass the correct path to `getLlama()`:

```typescript
const llama = await getLlama({
  // In packaged app, point to unpacked resources
  buildFolder: app.isPackaged
    ? path.join(process.resourcesPath, "node-llama-cpp-bins")
    : undefined
});
```

3. **GPU selection UI**: Expose node-llama-cpp's GPU detection in the settings panel so users can override auto-detection (`metal` / `cuda` / `vulkan` / `cpu`).

## Impact Assessment

### App Size

| Component | Current Size | With node-llama-cpp | Delta |
|---|---|---|---|
| npm package (JS layer) | N/A | ~1 MB | +1 MB |
| Native binary (Metal, macOS) | N/A (conda) | ~10-30 MB | — |
| Native binary (CUDA, Win/Linux) | N/A (conda) | ~50-150 MB | — |
| Native binary (Vulkan) | N/A (conda) | ~20-50 MB | — |
| Native binary (CPU fallback) | N/A (conda) | ~5-15 MB | — |
| Conda/micromamba runtime | ~50 MB base | 0 (removed for llama) | -50 MB |
| llama.cpp conda package (CPU) | ~200 MB | 0 (replaced) | -200 MB |
| llama.cpp conda package (CUDA) | ~500+ MB | 0 (replaced) | -500 MB |

**Net effect**: The app ships with the platform-appropriate prebuilt binary (10-150 MB depending on GPU backend) baked into the installer or downloaded on first use, instead of requiring a 250-550 MB conda download post-install. The initial installer grows by 10-150 MB, but eliminates the first-run conda download entirely for llama.cpp inference.

If binaries are downloaded on demand (node-llama-cpp's default behavior via `getLlama()`), the installer size stays unchanged and the first-inference download is 10-150 MB instead of 250-550 MB.

### Server Management

**Before**: External `llama-server` process with:
- Port discovery and allocation
- `Watchdog` health monitoring
- HTTP health endpoint polling
- System tray status + controls
- Process restart on model download
- SIGTERM/SIGKILL shutdown sequence

**After**: In-process inference:
- No ports, no HTTP, no process management
- Model load/unload is a function call
- GPU memory management handled by node-llama-cpp
- No tray status needed (inference is part of the backend process)
- Graceful shutdown = dispose the Llama instance

### Package Manager

**Before**:
- `micromamba` downloaded and managed by Electron (`electron/src/installer.ts`)
- conda environment created for `llama.cpp` package
- Platform-specific conda specs (`llama.cpp=*=cuda126*` vs `llama.cpp`)
- Lock file management, stale lock cleanup
- ~400 lines of installer code

**After**:
- `node-llama-cpp` installed via `npm install` like any other dependency
- Prebuilt binaries fetched from GitHub Releases (by node-llama-cpp's postinstall or on first use)
- No conda/micromamba needed for llama inference
- Native module rebuild for Electron handled by the existing `rebuild-native.mjs` script (same pattern as `better-sqlite3`)

If conda/micromamba is still needed for other packages (e.g., ffmpeg), it stays but with a smaller footprint. If llama.cpp was the only conda consumer, the entire micromamba infrastructure can be removed.

## Implementation Plan

### Phase 1: Provider Implementation

1. Add `node-llama-cpp` as an optional dependency in `packages/runtime/package.json`
2. Create `packages/runtime/src/providers/node-llama-cpp-provider.ts`
3. Implement `generateMessage()`, `generateMessages()` (streaming), `generateEmbedding()`
4. Implement grammar-constrained tool calling via `LlamaChatSession.functions`
5. Implement `getAvailableLanguageModels()` — scan local GGUF directory
6. Add `NODE_LLAMA_CPP` to `PROVIDER_IDS` in protocol
7. Register the provider in `providers/index.ts` (local-only, behind `!_cloudProfile`)
8. Add settings: `NODE_LLAMA_CPP_MODELS_DIR`, `NODE_LLAMA_CPP_GPU_BACKEND`

### Phase 2: Model Management Integration

1. Update `packages/huggingface/src/llama-cpp-download.ts` — the GGUF download code stays (node-llama-cpp uses the same GGUF format), but update cache directory to be shared or configurable
2. Update `web/src/stores/ModelDownloadStore.ts` — on `llama_cpp_model` download completion, no longer call `window.api.restartLlamaServer()` (model loads dynamically)
3. Wire up node-llama-cpp's built-in `createModelDownloader()` as an alternative download path (supports `hf:` URI scheme)

### Phase 3: Electron Cleanup

1. Remove llama-server process management from `electron/src/server.ts`
2. Remove llama.cpp conda installation from `electron/src/installer.ts`
3. Remove tray llama-server controls from `electron/src/tray.ts`
4. Update `electron-builder.json` for node-llama-cpp native binary packaging
5. Update the native module rebuild script to include node-llama-cpp
6. If llama.cpp was the only conda consumer, remove the entire micromamba infrastructure

### Phase 4: CLI and Agent Integration

1. Update `packages/cli/src/providers.ts` — add `node_llama_cpp` to `KNOWN_PROVIDERS` and `LOCAL_PROVIDERS`, set a default model
2. Update `packages/agents/src/tools/find-model-tool.ts` — add `node_llama_cpp` to `LOCAL_PROVIDER_IDS`
3. Update settings registry: replace `LLAMA_CPP_URL` / `LLAMA_CPP_CONTEXT_LENGTH` settings with `NODE_LLAMA_CPP_MODELS_DIR` / `NODE_LLAMA_CPP_GPU_BACKEND`

### Phase 5: Frontend

1. Update model selection UI to show node-llama-cpp models (reuse existing `LlamaModelSelect` component)
2. Add GPU backend selector in settings (Metal / CUDA / Vulkan / CPU)
3. Remove llama-server–specific UI (start/stop controls, URL configuration)

## Risks and Mitigations

### Risk: Native module build complexity in Electron

node-llama-cpp ships prebuilt binaries via GitHub Releases and uses N-API for ABI stability, so it should not require per-Electron-version rebuilds. However, the binary must be unpacked from the asar archive, and the path resolution differs between dev and packaged mode.

**Mitigation**: Follow node-llama-cpp's [Electron guide](https://node-llama-cpp.withcat.ai/guide/electron). The existing `rebuild-native.mjs` pattern used for `better-sqlite3` applies.

### Risk: VRAM management in shared process

Running inference in-process means the backend server and inference engine share memory. A large model could OOM the Node.js process.

**Mitigation**: node-llama-cpp provides VRAM estimation APIs. Implement a model-size check before loading and expose a configurable memory limit. The current `llama-server` has the same OOM risk but in a separate process, so a crash there doesn't take down the backend — consider spawning node-llama-cpp in a `Worker` thread for isolation.

### Risk: CUDA binary size in installers

Shipping the CUDA-enabled binary increases the platform installer by 50-150 MB.

**Mitigation**: Use on-demand binary download (node-llama-cpp's default). The first call to `getLlama()` downloads the appropriate binary for the detected GPU. This keeps the installer lean and avoids shipping unused GPU backends.

### Risk: Breaking change for users with custom llama-server setups

Users who run their own remote `llama-server` and configure `LLAMA_CPP_URL` would lose their setup if we remove the old provider.

**Mitigation**: Keep `LlamaProvider` (registered as `llama_cpp`) alongside the new `node_llama_cpp` provider. Users with remote servers continue using `--provider llama_cpp`. The new provider becomes the default for local inference.

## Decision: Optional vs Required Dependency

node-llama-cpp should be an **optional dependency** in `packages/runtime/package.json`:

- Cloud deployments (`NODETOOL_NODE_PROFILE=cloud`) never use local inference
- The binary download on first use (10-150 MB) should not block `npm install` for web-only developers
- The provider registration should check for the package's presence (`try { await import("node-llama-cpp") }`) and skip registration if absent
- The Electron app and CLI will install it as a regular dependency since they need local inference

This matches the existing pattern used for `@anthropic-ai/claude-agent-sdk` (soft dependency, presence-checked at runtime).

## Migration Path

1. Ship `node_llama_cpp` as a new provider alongside the existing `llama_cpp`
2. Default the Electron installer to `node_llama_cpp` (remove conda llama.cpp from the install flow)
3. Keep `llama_cpp` (remote server) indefinitely for users with dedicated inference servers
4. Deprecate the conda-based local `llama-server` management in Electron
5. Remove conda llama.cpp code after one release cycle
