# Bundle a vanilla Node runtime for the packaged Electron backend

**Date:** 2026-05-22
**Status:** Approved (design); plan pending
**Targets:** macOS arm64, macOS x64, Windows x64, Linux x64

## Problem

The server-side GPU compositor (`packages/gpu`, via the `webgpu`/dawn.node package) reads
pixels back from the GPU with `getMappedRange()`. Under Electron's embedded Node — which runs
with the compile-time V8 heap sandbox (`NODE_MODULE_VERSION` 140) — that call throws
`External buffers are not allowed`, because Dawn hands back an external (off-heap) ArrayBuffer
the sandbox refuses to wrap. No runtime flag disables the V8 sandbox, and `ELECTRON_RUN_AS_NODE`
is still sandboxed.

Dev already side-steps this: the backend is spawned as a separate, non-sandboxed system-Node
child process (`electron/src/server.ts` dev branch → Watchdog `command` path). **Prod still uses
`utilityProcess.fork`** (Electron's sandboxed embedded Node), so GPU compositing cannot work in
the packaged app. Separately, the `webgpu` package is not bundled at all today, so
`import("webgpu")` already fails in a packaged build.

## Goal

Make the packaged app run the backend on a **bundled, non-sandboxed vanilla Node**, so the GPU
compositor (and any future server-side GPU work) behaves identically in dev and prod. Ship for
all four targets.

## Non-goals

- No CPU/sharp compositor fallback (the compositor is intentionally GPU-only).
- No change to the dev backend launch path (already correct).
- Solving cross-arch native compilation in CI (pre-existing constraint; see Risks).

## Verified facts (current state)

- `electron/src/server.ts`: dev branch spawns `child_process` with
  `command = NODETOOL_NODE || npm_node_execpath || "node"` running `dev-server-runner.cjs`;
  prod branch uses `utilityProcess.fork({ modulePath: backendEntryPoint })`.
- `electron/src/watchdog.ts`: supports both — `command` (child_process, non-sandboxed) and
  `modulePath` (utilityProcess). No changes needed.
- `electron/scripts/bundle-backend.mjs`: esbuilds `packages/websocket/dist/server.js` →
  `backend-bundle/server.mjs`; externalizes native/optional deps to `backend-bundle/_modules/`.
  `webgpu` is **not** in `EXTERNAL_PACKAGES`.
- `electron/scripts/after-pack.cjs`: runs **per-arch**; promotes `_modules` → `node_modules`,
  and `rebuildNativeModulesForElectron()` runs `node-gyp rebuild --target=<electronVersion>
  --dist-url=https://electronjs.org/headers` against **every** staged module with a `binding.gyp`.
- `electron/scripts/rebuild-native.mjs` (postinstall): rebuilds the hoisted `better-sqlite3`
  for Electron ABI 140. This currently mismatches the dev backend (vanilla Node, ABI 127).
- `electron/entitlements.mac.plist`: already has `allow-jit`,
  `allow-unsigned-executable-memory`, `disable-library-validation`, `cs.debugger`.
- electron-builder 26.8.1 flow: copy extra resources → `emitAfterPack` → `doSignAfterPack`.
  So files added in `afterPack` are signed & notarized.
- `node_modules/webgpu/dist/`: ships `darwin-universal.dawn.node` (serves both mac arches),
  `linux-x64.dawn.node`, `linux-arm64.dawn.node`, `win32-x64.dawn.node` + `d3dcompiler_47.dll`.
  All N-API (ABI-stable). `index.js` loads `dist/<platform>-<arch>.dawn.node` (mac →
  `darwin-universal`) relative to its own path.
- Electron's main process (`electron/src`, bundled `dist-electron/main.js`) does **not** load
  `better-sqlite3`, `@nodetool-ai/models`, the sqlite DB, `sharp`, or `webgpu`. Only the
  backend Node process does. ⇒ nothing needs Electron ABI 140 anymore.

## Design

### 1. Runtime unification (server.ts)
Prod backend launches like dev — a non-sandboxed Node child process via the Watchdog `command`
path. Prod branch changes from:
```
{ modulePath: backendEntryPoint, ... }                       // utilityProcess.fork
```
to:
```
{ command: bundledNodePath, args: [backendEntryPoint], ... } // child_process.spawn
```
where
- `bundledNodePath = path.join(process.resourcesPath, "backend", "runtime",
  process.platform === "win32" ? "node.exe" : "node")`
- `backendEntryPoint = path.join(process.resourcesPath, "backend", "server.mjs")`
- env: production (no tsx, no `--conditions=nodetool-dev`); `NODE_PATH` →
  `Resources/backend/node_modules`.

No Watchdog change.

### 2. Node runtime acquisition — `electron/scripts/fetch-node-runtime.mjs`
- `NODE_RUNTIME_VERSION` pinned to `.nvmrc` (22.22.1).
- For each required target arch: download
  `https://nodejs.org/dist/v<ver>/node-v<ver>-<plat>-<arch>.(tar.gz|zip)`, download
  `SHASUMS256.txt`, verify the archive checksum, extract only `bin/node` (or `node.exe`) into a
  gitignored cache `electron/.node-runtime/<ver>/<plat>-<arch>/node[.exe]`.
- Fetches all arches a given build needs (mac builds both arm64+x64), independent of host arch.
- Wired into the `build` pipeline before `electron-builder` (e.g. invoked from
  `prepare-backend` or a new `prepare-runtime` step). Idempotent: skips download when the cached
  binary's checksum already matches.

### 3. Bundling — `bundle-backend.mjs`
- Add `"webgpu"` to `EXTERNAL_PACKAGES` so the package (with its `dist/*.dawn.node` binaries and
  `d3dcompiler_47.dll`) is copied into `_modules/`. The existing transitive copier copies the
  whole package; `webgpu/index.js` resolves the platform binary relative to its own location, so
  no path rewrites are needed.

### 4. Packaging — `after-pack.cjs` (per-arch)
- Keep the `_modules → node_modules` promotion.
- **Place the Node binary**: copy `electron/.node-runtime/<ver>/<plat>-<arch>/node[.exe]` →
  `<appOutDir>/.../Resources/backend/runtime/node[.exe]`, selecting by
  `context.electronPlatformName` + `context.arch`. `chmod 755` on mac/linux.
- **Prune cross-platform dawn.node binaries** to reclaim space: keep only the binary(ies) for
  the build's platform. On mac keep `darwin-universal.dawn.node` for **both** arches (do not
  prune it). On Windows keep `win32-x64.dawn.node` **and** `d3dcompiler_47.dll`. On Linux keep
  the matching `linux-<arch>.dawn.node`.
- **ABI flip**: `rebuildNativeModulesForElectron()` → rebuild against the **bundled Node 22.x**
  (plain `node-gyp rebuild --target=<NODE_RUNTIME_VERSION> --arch=<arch>`, default Node headers,
  no electron dist-url), and rebuild **only `better-sqlite3`** (skip N-API modules — they are
  ABI-stable and don't need rebuilding). Rename the function accordingly.

### 5. Native-module ABI — `rebuild-native.mjs` (postinstall)
- Flip from Electron ABI 140 to the bundled/system Node 22.x ABI (127): a plain
  `node-gyp rebuild` against Node headers (no `--dist-url=electron`). This makes the **dev**
  backend's hoisted `better-sqlite3` correct (it runs on system Node) and matches prod.
- N-API modules unchanged.

### 6. Signing / notarization
- **mac**: `@electron/osx-sign` walks `Contents` and signs Mach-O files; since the `node` binary
  and `.node` files are added in afterPack (before signing), they are signed with the app's
  Developer ID under the existing hardened-runtime entitlements (already include allow-jit,
  allow-unsigned-executable-memory, disable-library-validation). Re-sign rather than relying on
  upstream Node's signature. Verify post-build:
  - `codesign -dv --entitlements :- .../Resources/backend/runtime/node`
  - `codesign --verify --deep --strict --verbose=2 Nodetool.app`
  - `spctl -a -vv Nodetool.app`
- **win**: Authenticode-sign `node.exe` and dlls (electron-builder signs packed files).
- **linux**: no signing; ensure the executable bit; Flatpak GPU via `--device=dri` (present).

### 7. Verification / tests
- `electron/scripts/verify-bundle.mjs`: assert `_modules/webgpu` with the target platform's
  dawn.node exists after bundling.
- `electron/src/__tests__/afterPack.test.ts`: assert per-arch `runtime/node[.exe]` is placed,
  webgpu is staged, cross-platform dawn.node binaries are pruned, and the rebuild targets the
  bundled Node version (not Electron).
- Manual packaged smoke (mac arm64 first): launch → `GET /health` → run the
  asset→Compositor repro workflow; confirm a composited PNG output and no crash.
- Existing `packages/gpu/tests` (incl. the dawn instance-GC guard) continue to pass.

## Risks / open items

- **Cross-arch `better-sqlite3`**: the native rebuild is host-arch; building mac x64 from an
  arm64 host (or vice-versa) needs per-arch CI runners or prebuilt binaries. Pre-existing
  constraint inherited from the current build; out of scope here, but the matrix must run each
  target on its own arch (as today).
- **App size**: +~50–80 MB (Node) and +~15–20 MB (one dawn.node after pruning) per build.
- **macOS hardened runtime + JIT**: dawn/V8 JIT in a separately-signed Node under hardened
  runtime; entitlements are in place but must be validated on a notarized build.
- **Linux glibc baseline**: official Node 22 + CI-built natives constrain AppImage distro range
  (status quo).
