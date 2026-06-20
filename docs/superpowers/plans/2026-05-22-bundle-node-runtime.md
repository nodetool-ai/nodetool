# Bundle Vanilla Node Runtime for Packaged Backend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the packaged Electron app run its backend on a bundled, non-sandboxed Node 22.22.1 so the server-side GPU compositor works in production (matching dev).

**Architecture:** A build step downloads per-arch Node binaries (checksum-verified) into a gitignored cache. `bundle-backend.mjs` stages the `webgpu` (dawn.node) package. `after-pack.cjs` (runs per-arch) places the matching Node binary at `Resources/backend/runtime/node[.exe]`, prunes off-platform dawn.node binaries, and rebuilds `better-sqlite3` against Node 22.x's ABI. `server.ts`'s prod branch spawns that bundled Node via `child_process` (the Watchdog `command` path) instead of `utilityProcess.fork`.

**Tech Stack:** Node 22.22.1, electron-builder 26.8.1, esbuild, node-gyp, Jest (electron tests), CJS build scripts.

**Spec:** `docs/superpowers/specs/2026-05-22-bundle-node-runtime-design.md`

---

## File Structure

- **Create** `electron/scripts/node-runtime.constants.cjs` — single source of truth: pinned Node version + pure helpers (archive names, node binary name, dawn.node keep/all lists). Shared by the fetch script, after-pack, and tests.
- **Create** `electron/scripts/fetch-node-runtime.mjs` — downloads + checksum-verifies + extracts per-arch Node binaries into `electron/.node-runtime/`.
- **Create** `electron/src/__tests__/nodeRuntimeConstants.test.ts` — unit tests for the pure helpers.
- **Modify** `electron/scripts/bundle-backend.mjs` — add `webgpu` to externals + required list.
- **Modify** `electron/scripts/verify-bundle.mjs` — assert `webgpu` staged with a dawn.node binary.
- **Modify** `electron/src/server.ts` — prod branch uses bundled-Node `command` spawn.
- **Modify** `electron/scripts/after-pack.cjs` — place node binary, prune dawn binaries, rebuild only `better-sqlite3` against Node ABI.
- **Modify** `electron/src/__tests__/afterPack.test.ts` — cover node placement + dawn pruning.
- **Modify** `electron/scripts/rebuild-native.mjs` — postinstall builds for Node ABI (127), not Electron.
- **Modify** `electron/package.json` — wire `fetch-node-runtime` into the build pipeline.
- **Modify** `.gitignore` — ignore `electron/.node-runtime/`.

---

## Task 1: Shared runtime constants module

**Files:**
- Create: `electron/scripts/node-runtime.constants.cjs`
- Test: `electron/src/__tests__/nodeRuntimeConstants.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// electron/src/__tests__/nodeRuntimeConstants.test.ts
const c = require("../../scripts/node-runtime.constants.cjs") as {
  NODE_RUNTIME_VERSION: string;
  nodeBinaryName: (platform: string) => string;
  nodeArchive: (
    platform: string,
    arch: string
  ) => { dir: string; archive: string; binaryInArchive: string };
  dawnKeepFiles: (platform: string, arch: string) => string[];
  ALL_DAWN_FILES: string[];
};

describe("node-runtime.constants", () => {
  it("pins the Node version to 22.22.1", () => {
    expect(c.NODE_RUNTIME_VERSION).toBe("22.22.1");
  });

  it("names the node binary per platform", () => {
    expect(c.nodeBinaryName("win32")).toBe("node.exe");
    expect(c.nodeBinaryName("darwin")).toBe("node");
    expect(c.nodeBinaryName("linux")).toBe("node");
  });

  it("builds nodejs.org archive info per target", () => {
    const mac = c.nodeArchive("darwin", "arm64");
    expect(mac.dir).toBe("node-v22.22.1-darwin-arm64");
    expect(mac.archive).toBe("node-v22.22.1-darwin-arm64.tar.gz");
    expect(mac.binaryInArchive).toBe("node-v22.22.1-darwin-arm64/bin/node");

    const win = c.nodeArchive("win32", "x64");
    expect(win.dir).toBe("node-v22.22.1-win-x64");
    expect(win.archive).toBe("node-v22.22.1-win-x64.zip");
    expect(win.binaryInArchive).toBe("node-v22.22.1-win-x64/node.exe");
  });

  it("keeps only the target platform's dawn.node binaries", () => {
    expect(c.dawnKeepFiles("darwin", "arm64")).toEqual([
      "darwin-universal.dawn.node",
    ]);
    expect(c.dawnKeepFiles("darwin", "x64")).toEqual([
      "darwin-universal.dawn.node",
    ]);
    expect(c.dawnKeepFiles("win32", "x64")).toEqual([
      "win32-x64.dawn.node",
      "d3dcompiler_47.dll",
    ]);
    expect(c.dawnKeepFiles("linux", "x64")).toEqual(["linux-x64.dawn.node"]);
  });

  it("lists every shipped dawn binary so off-target ones can be pruned", () => {
    expect(c.ALL_DAWN_FILES).toEqual(
      expect.arrayContaining([
        "darwin-universal.dawn.node",
        "linux-x64.dawn.node",
        "linux-arm64.dawn.node",
        "win32-x64.dawn.node",
        "d3dcompiler_47.dll",
      ])
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd electron && npx jest nodeRuntimeConstants -i`
Expected: FAIL — `Cannot find module '../../scripts/node-runtime.constants.cjs'`.

- [ ] **Step 3: Write the module**

```js
// electron/scripts/node-runtime.constants.cjs
// Single source of truth for the Node runtime bundled into the packaged
// backend. Pure, dependency-free helpers so the fetch script, after-pack, and
// tests all agree on versions, archive names, and which dawn.node binaries to
// keep per target.

// Pinned to .nvmrc. The backend runs on this exact Node; better-sqlite3 is
// rebuilt against its ABI, so bumping this requires re-fetching binaries and
// rebuilding native modules.
const NODE_RUNTIME_VERSION = "22.22.1";

/** Node executable filename for a platform. */
function nodeBinaryName(platform) {
  return platform === "win32" ? "node.exe" : "node";
}

/**
 * nodejs.org distribution archive for a build target.
 * platform: "darwin" | "win32" | "linux"; arch: "arm64" | "x64".
 */
function nodeArchive(platform, arch) {
  const plat = platform === "win32" ? "win" : platform; // darwin | linux | win
  const ext = platform === "win32" ? "zip" : "tar.gz";
  const dir = `node-v${NODE_RUNTIME_VERSION}-${plat}-${arch}`;
  const binaryInArchive =
    platform === "win32" ? `${dir}/node.exe` : `${dir}/bin/node`;
  return { dir, archive: `${dir}.${ext}`, ext, binaryInArchive, plat };
}

// Every binary the `webgpu` package ships in dist/. After staging we keep only
// the ones for the build's platform (see dawnKeepFiles) and delete the rest.
const ALL_DAWN_FILES = [
  "darwin-universal.dawn.node",
  "linux-x64.dawn.node",
  "linux-arm64.dawn.node",
  "win32-x64.dawn.node",
  "d3dcompiler_47.dll",
];

/** dawn.node (and sidecar) files to KEEP for a target; others are pruned. */
function dawnKeepFiles(platform, arch) {
  if (platform === "darwin") return ["darwin-universal.dawn.node"];
  if (platform === "win32") return ["win32-x64.dawn.node", "d3dcompiler_47.dll"];
  if (platform === "linux") return [`linux-${arch}.dawn.node`];
  return [];
}

module.exports = {
  NODE_RUNTIME_VERSION,
  nodeBinaryName,
  nodeArchive,
  ALL_DAWN_FILES,
  dawnKeepFiles,
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd electron && npx jest nodeRuntimeConstants -i`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add electron/scripts/node-runtime.constants.cjs electron/src/__tests__/nodeRuntimeConstants.test.ts
git commit -m "feat(electron): shared Node-runtime constants for backend bundling"
```

---

## Task 2: fetch-node-runtime.mjs + gitignore + build wiring

**Files:**
- Create: `electron/scripts/fetch-node-runtime.mjs`
- Modify: `.gitignore`
- Modify: `electron/package.json:build`

- [ ] **Step 1: Ignore the cache dir**

Add to `.gitignore` (below the existing `electron/backend-bundle/` line at `.gitignore:25`):

```
electron/.node-runtime/
```

- [ ] **Step 2: Write the fetch script**

```js
// electron/scripts/fetch-node-runtime.mjs
// Download + checksum-verify per-arch Node binaries for bundling into the
// packaged backend. Idempotent: skips a target whose cached binary already
// exists. Extraction uses platform tools available on each CI runner (tar for
// .tar.gz, PowerShell Expand-Archive for .zip on Windows).
//
//   node scripts/fetch-node-runtime.mjs                 # all default targets
//   node scripts/fetch-node-runtime.mjs darwin-arm64     # one target
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { NODE_RUNTIME_VERSION, nodeArchive, nodeBinaryName } = require(
  "./node-runtime.constants.cjs"
);

const ELECTRON_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CACHE_ROOT = path.join(ELECTRON_DIR, ".node-runtime", NODE_RUNTIME_VERSION);
const BASE_URL = `https://nodejs.org/dist/v${NODE_RUNTIME_VERSION}`;

const DEFAULT_TARGETS = [
  { platform: "darwin", arch: "arm64" },
  { platform: "darwin", arch: "x64" },
  { platform: "win32", arch: "x64" },
  { platform: "linux", arch: "x64" },
];

function targetsFromArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0) return DEFAULT_TARGETS;
  return args.map((a) => {
    const [platform, arch] = a.split("-");
    return { platform, arch };
  });
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function expectedChecksum(shasumsText, archiveName) {
  for (const line of shasumsText.split("\n")) {
    const [hash, name] = line.trim().split(/\s+/);
    if (name === archiveName) return hash;
  }
  throw new Error(`No SHASUMS entry for ${archiveName}`);
}

function extractBinary(archivePath, info, destBinary) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "node-rt-"));
  try {
    if (info.ext === "zip") {
      // Windows runner: PowerShell is available; Expand-Archive is built in.
      const r = spawnSync(
        "powershell",
        ["-NoProfile", "-Command", `Expand-Archive -Force -Path '${archivePath}' -DestinationPath '${tmp}'`],
        { stdio: "inherit" }
      );
      if (r.status !== 0) throw new Error("Expand-Archive failed");
    } else {
      const r = spawnSync("tar", ["-xzf", archivePath, "-C", tmp], { stdio: "inherit" });
      if (r.status !== 0) throw new Error("tar extraction failed");
    }
    const extracted = path.join(tmp, info.binaryInArchive);
    fs.mkdirSync(path.dirname(destBinary), { recursive: true });
    fs.copyFileSync(extracted, destBinary);
    if (info.ext !== "zip") fs.chmodSync(destBinary, 0o755);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function fetchTarget({ platform, arch }) {
  const info = nodeArchive(platform, arch);
  const destDir = path.join(CACHE_ROOT, `${platform}-${arch}`);
  const destBinary = path.join(destDir, nodeBinaryName(platform));
  if (fs.existsSync(destBinary)) {
    console.log(`  cached: ${platform}-${arch}`);
    return;
  }
  console.log(`  fetching: ${info.archive}`);
  const [archiveBuf, shasums] = await Promise.all([
    download(`${BASE_URL}/${info.archive}`),
    download(`${BASE_URL}/SHASUMS256.txt`).then((b) => b.toString("utf8")),
  ]);
  const want = expectedChecksum(shasums, info.archive);
  const got = sha256(archiveBuf);
  if (got !== want) {
    throw new Error(`checksum mismatch for ${info.archive}: got ${got}, want ${want}`);
  }
  const archivePath = path.join(os.tmpdir(), info.archive);
  await fsp.writeFile(archivePath, archiveBuf);
  try {
    extractBinary(archivePath, info, destBinary);
  } finally {
    await fsp.rm(archivePath, { force: true });
  }
  console.log(`  -> ${destBinary}`);
}

async function main() {
  console.log(`Fetching Node ${NODE_RUNTIME_VERSION} runtime binaries...`);
  for (const t of targetsFromArgs()) {
    await fetchTarget(t);
  }
  console.log("Node runtime fetch complete.");
}

main().catch((err) => {
  console.error("fetch-node-runtime failed:", err);
  process.exit(1);
});
```

- [ ] **Step 3: Run the script for the host arch to verify it works**

Run: `cd electron && node scripts/fetch-node-runtime.mjs darwin-arm64`
Expected: prints `fetching: node-v22.22.1-darwin-arm64.tar.gz` then `-> .../.node-runtime/22.22.1/darwin-arm64/node`; the binary exists and runs:
`./.node-runtime/22.22.1/darwin-arm64/node --version` → `v22.22.1`.

- [ ] **Step 4: Verify idempotency**

Run again: `cd electron && node scripts/fetch-node-runtime.mjs darwin-arm64`
Expected: prints `cached: darwin-arm64`, no download.

- [ ] **Step 5: Wire into the build pipeline**

In `electron/package.json`, change the `build` script to fetch the runtime before bundling. Current:

```
"build": "tsc && vite build && npm run verify:bundle && npm run prepare-backend && electron-builder",
```

to:

```
"build": "tsc && vite build && npm run verify:bundle && node scripts/fetch-node-runtime.mjs && npm run prepare-backend && electron-builder",
```

- [ ] **Step 6: Commit**

```bash
git add electron/scripts/fetch-node-runtime.mjs electron/package.json .gitignore
git commit -m "feat(electron): fetch per-arch Node runtime binaries at build time"
```

---

## Task 3: Stage the webgpu package in the backend bundle

**Files:**
- Modify: `electron/scripts/bundle-backend.mjs` (`EXTERNAL_PACKAGES`, `REQUIRED_EXTERNAL_PACKAGES`)
- Modify: `electron/scripts/verify-bundle.mjs`

- [ ] **Step 1: Add `webgpu` to the external + required lists**

In `electron/scripts/bundle-backend.mjs`, add `"webgpu"` to `REQUIRED_EXTERNAL_PACKAGES`:

```js
const REQUIRED_EXTERNAL_PACKAGES = [
  "sharp",
  "better-sqlite3",
  "@jitl/quickjs-ng-wasmfile-release-sync",
  "webgpu",
];
```

And add it under the native-modules group in `EXTERNAL_PACKAGES` (so esbuild leaves the variable-specifier `import("webgpu")` external and the copier stages it with its dist binaries):

```js
const EXTERNAL_PACKAGES = [
  // Native modules (contain .node binaries)
  "better-sqlite3",
  "sqlite-vec",
  "sharp",
  "@img/sharp-*",
  "node-web-audio-api",
  "keytar",
  "onnxruntime-node",
  "webgpu",
  // ... rest unchanged
```

- [ ] **Step 2: Add a webgpu assertion to verify-bundle.mjs**

Append to `electron/scripts/verify-bundle.mjs` (before its final success exit), a check that the staged bundle contains webgpu with at least one dawn.node binary:

```js
// --- webgpu (dawn.node) staging check ---
// The server-side GPU compositor loads `webgpu` via a variable-specifier
// dynamic import, so esbuild can't see it. It must be copied to _modules/ or
// the packaged compositor fails with "requires the optional 'webgpu' package".
{
  const webgpuDist = path.join(
    ELECTRON_DIR,
    "backend-bundle",
    "_modules",
    "webgpu",
    "dist"
  );
  let dawnFiles = [];
  try {
    dawnFiles = readdirSync(webgpuDist).filter((f) => f.endsWith(".dawn.node"));
  } catch {
    fail(
      `webgpu not staged: ${webgpuDist} missing. Add "webgpu" to EXTERNAL_PACKAGES in bundle-backend.mjs.`
    );
  }
  if (dawnFiles.length === 0) {
    fail(`webgpu staged but no *.dawn.node binary found in ${webgpuDist}`);
  }
  console.log(`verify-bundle: webgpu staged with ${dawnFiles.length} dawn.node binary(ies)`);
}
```

- [ ] **Step 3: Build packages, then run prepare-backend to stage**

Run: `cd ~/workspace/nodetool2 && npm run build:packages >/dev/null 2>&1; cd electron && npm run prepare-backend 2>&1 | tail -5`
Expected: `Copied webgpu` appears in the output; exit 0.

- [ ] **Step 4: Verify the staged binary is present**

Run: `ls electron/backend-bundle/_modules/webgpu/dist/*.dawn.node`
Expected: lists `darwin-universal.dawn.node`, `linux-*.dawn.node`, `win32-x64.dawn.node`.

- [ ] **Step 5: Commit**

```bash
git add electron/scripts/bundle-backend.mjs electron/scripts/verify-bundle.mjs
git commit -m "feat(electron): stage webgpu (dawn.node) in the backend bundle"
```

---

## Task 4: Prod backend spawns the bundled Node

**Files:**
- Modify: `electron/src/server.ts` (prod `watchdogOpts` branch ~lines 466-476; add a path helper)

- [ ] **Step 1: Read the current prod branch**

Run: `sed -n '442,478p' electron/src/server.ts`
Expected: see the `isDevMode() ? { command: devNodeBinary, ... } : { modulePath: backendEntryPoint, ... }` ternary.

- [ ] **Step 2: Replace the prod branch to spawn the bundled Node**

In `electron/src/server.ts`, change the prod (else) branch of `watchdogOpts` from the `modulePath` form to a `command` form that runs the bundled Node on `server.mjs`. The bundled Node sits next to the entry point at `runtime/node[.exe]`:

```ts
  const watchdogOpts: import("./watchdog").WatchdogOptions = isDevMode()
    ? {
        name: "nodetool",
        command: devNodeBinary,
        args: [
          path.join(__dirname, "..", "dev-server-runner.cjs"),
          backendEntryPoint,
        ],
        env: backendEnv,
        cwd: rootDir,
        pidFilePath: PID_FILE_PATH,
        healthUrl: `http://127.0.0.1:${selectedPort}/health`,
        onOutput: (line) => handleServerOutput(Buffer.from(line)),
        logOutput: false,
      }
    : {
        // Production: run the backend on the bundled, non-sandboxed Node
        // (Resources/backend/runtime/node) via child_process — NOT Electron's
        // sandboxed utilityProcess. The V8 heap sandbox in Electron's embedded
        // Node rejects Dawn's external GPU-readback buffers, breaking the GPU
        // compositor. The bundled Node has no such sandbox.
        name: "nodetool",
        command: path.join(
          path.dirname(backendEntryPoint),
          "runtime",
          process.platform === "win32" ? "node.exe" : "node"
        ),
        args: [backendEntryPoint],
        env: backendEnv,
        cwd: path.dirname(backendEntryPoint),
        pidFilePath: PID_FILE_PATH,
        healthUrl: `http://127.0.0.1:${selectedPort}/health`,
        onOutput: (line) => handleServerOutput(Buffer.from(line)),
        logOutput: false,
      };
```

- [ ] **Step 3: Update the now-stale log line**

Change the log at `electron/src/server.ts:388` from:

```ts
  logMessage(`Starting backend server via utilityProcess.fork: ${backendEntryPoint}`);
```

to:

```ts
  logMessage(`Starting backend server: ${backendEntryPoint}`);
```

- [ ] **Step 4: Typecheck**

Run: `cd electron && npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Build the electron bundle and confirm the prod branch is present**

Run: `cd electron && npm run vite:build >/dev/null 2>&1 && grep -c 'runtime' dist-electron/main.js`
Expected: ≥ 1 (the `runtime/node` join is bundled).

- [ ] **Step 6: Commit**

```bash
git add electron/src/server.ts
git commit -m "feat(electron): run packaged backend on bundled Node via child_process"
```

---

## Task 5: after-pack places Node, prunes dawn, rebuilds for Node ABI

**Files:**
- Modify: `electron/scripts/after-pack.cjs`
- Modify: `electron/src/__tests__/afterPack.test.ts`

- [ ] **Step 1: Write failing tests for the two new exported helpers**

Append to `electron/src/__tests__/afterPack.test.ts`:

```ts
const afterPackExtra = require("../../scripts/after-pack.cjs") as {
  placeNodeRuntime: (
    context: Record<string, unknown>,
    cacheRoot: string
  ) => Promise<void>;
  pruneDawnBinaries: (backendDir: string, platform: string, arch: string) => void;
  resolveResourcesDir: (context: Record<string, unknown>) => string;
};

describe("placeNodeRuntime", () => {
  let tempDir: string;
  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "nt-place-node-"));
  });
  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it("copies the matching-arch node binary into backend/runtime", async () => {
    const cacheRoot = path.join(tempDir, "cache");
    const srcDir = path.join(cacheRoot, "darwin-arm64");
    await fs.promises.mkdir(srcDir, { recursive: true });
    await fs.promises.writeFile(path.join(srcDir, "node"), "#!fake-node\n");

    const appOutDir = path.join(tempDir, "dist");
    const context = {
      electronPlatformName: "darwin",
      arch: "arm64",
      appOutDir,
      packager: { appInfo: { productFilename: "Nodetool" } },
    };

    await afterPackExtra.placeNodeRuntime(context, cacheRoot);

    const placed = path.join(
      afterPackExtra.resolveResourcesDir(context),
      "backend",
      "runtime",
      "node"
    );
    expect(fs.existsSync(placed)).toBe(true);
    expect((fs.statSync(placed).mode & 0o111) !== 0).toBe(true); // executable
  });
});

describe("pruneDawnBinaries", () => {
  let tempDir: string;
  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "nt-prune-dawn-"));
  });
  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it("keeps darwin-universal and deletes off-platform binaries on mac", async () => {
    const dist = path.join(tempDir, "node_modules", "webgpu", "dist");
    await fs.promises.mkdir(dist, { recursive: true });
    for (const f of [
      "darwin-universal.dawn.node",
      "linux-x64.dawn.node",
      "linux-arm64.dawn.node",
      "win32-x64.dawn.node",
      "d3dcompiler_47.dll",
    ]) {
      await fs.promises.writeFile(path.join(dist, f), "x");
    }

    afterPackExtra.pruneDawnBinaries(tempDir, "darwin", "arm64");

    const remaining = fs.readdirSync(dist).sort();
    expect(remaining).toEqual(["darwin-universal.dawn.node"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd electron && npx jest afterPack -i`
Expected: FAIL — `afterPackExtra.placeNodeRuntime is not a function`.

- [ ] **Step 3: Implement the helpers and rewire the rebuild in after-pack.cjs**

In `electron/scripts/after-pack.cjs`:

(a) At the top, after the existing requires, import the constants:

```js
const {
  NODE_RUNTIME_VERSION,
  nodeBinaryName,
  ALL_DAWN_FILES,
  dawnKeepFiles,
} = require("./node-runtime.constants.cjs");
```

(b) Add the two helpers (place them above `module.exports`):

```js
const ELECTRON_DIR = path.dirname(__dirname);

/** Copy the build target's bundled Node binary into backend/runtime/. */
async function placeNodeRuntime(context, cacheRoot) {
  const platform = context.electronPlatformName;
  const arch = resolveArch(context);
  const binName = nodeBinaryName(platform);
  const src = path.join(cacheRoot, `${platform}-${arch}`, binName);
  if (!fs.existsSync(src)) {
    throw new Error(
      `Bundled Node binary not found: ${src}. Run scripts/fetch-node-runtime.mjs.`
    );
  }
  const runtimeDir = path.join(resolveResourcesDir(context), "backend", "runtime");
  await fsp.mkdir(runtimeDir, { recursive: true });
  const dest = path.join(runtimeDir, binName);
  await fsp.copyFile(src, dest);
  if (platform !== "win32") await fsp.chmod(dest, 0o755);
  console.info(`Placed bundled Node (${platform}-${arch}) at ${dest}`);
}

/** Delete dawn.node binaries that don't belong to this build's platform. */
function pruneDawnBinaries(backendDir, platform, arch) {
  const dist = path.join(backendDir, "node_modules", "webgpu", "dist");
  if (!fs.existsSync(dist)) return;
  const keep = new Set(dawnKeepFiles(platform, arch));
  for (const f of ALL_DAWN_FILES) {
    if (keep.has(f)) continue;
    const p = path.join(dist, f);
    if (fs.existsSync(p)) fs.rmSync(p, { force: true });
  }
}
```

(c) Replace `nodeGypRebuild` so it targets the bundled Node ABI (no Electron dist-url — node-gyp defaults to nodejs.org headers):

```js
function nodeGypRebuild(modulePath, nodeVersion, arch) {
  const nodeGypBin = require.resolve("node-gyp/bin/node-gyp.js");
  const result = spawnSync(
    process.execPath,
    [
      nodeGypBin,
      "rebuild",
      "--release",
      `--target=${nodeVersion}`,
      `--arch=${arch}`,
    ],
    { cwd: modulePath, stdio: "inherit" }
  );
  if (result.status !== 0) {
    throw new Error(
      `node-gyp rebuild failed for ${modulePath} (exit ${result.status})`
    );
  }
}
```

(d) Replace `rebuildNativeModulesForElectron` with a version that rebuilds ONLY the V8-locked module (`better-sqlite3`) against the bundled Node, leaving N-API modules untouched:

```js
// Only V8/NAN-locked modules need a rebuild to match the bundled Node's ABI.
// N-API modules (sharp, dawn.node, bufferutil, keytar, msgpackr-extract,
// onnxruntime-node) are ABI-stable across Node versions and must NOT be rebuilt.
const V8_LOCKED_MODULES = new Set(["better-sqlite3"]);

async function rebuildNativeModulesForBackend(context) {
  const backendDir = path.join(resolveResourcesDir(context), "backend");
  const arch = resolveArch(context);
  const runtimeNodeModulesPath = path.join(backendDir, "node_modules");
  const found = findNativeModuleNames(runtimeNodeModulesPath);
  const toRebuild = found.filter((n) => V8_LOCKED_MODULES.has(n));

  if (!toRebuild.includes("better-sqlite3")) {
    throw new Error(
      `better-sqlite3 not found in ${runtimeNodeModulesPath}. ` +
      `Did bundle-backend.mjs stage modules correctly?`
    );
  }

  console.info(
    `Rebuilding ${toRebuild.join(", ")} for Node ${NODE_RUNTIME_VERSION} (${arch})`
  );
  for (const name of toRebuild) {
    nodeGypRebuild(path.join(runtimeNodeModulesPath, name), NODE_RUNTIME_VERSION, arch);
  }
  console.info("Native backend module rebuild complete.");
}
```

(e) Update the default export to call the new pieces, and export the new helpers:

```js
module.exports = async function afterPack(context) {
  try {
    await promoteBackendNodeModules(context);
    await placeNodeRuntime(
      context,
      path.join(ELECTRON_DIR, ".node-runtime", NODE_RUNTIME_VERSION)
    );
    pruneDawnBinaries(
      path.join(resolveResourcesDir(context), "backend"),
      context.electronPlatformName,
      resolveArch(context)
    );
    await rebuildNativeModulesForBackend(context);
  } catch (error) {
    console.error("afterPack failed", error);
    throw error;
  }
};

module.exports.promoteBackendNodeModules = promoteBackendNodeModules;
module.exports.resolveResourcesDir = resolveResourcesDir;
module.exports.findNativeModuleNames = findNativeModuleNames;
module.exports.placeNodeRuntime = placeNodeRuntime;
module.exports.pruneDawnBinaries = pruneDawnBinaries;
```

Remove the now-unused `resolveElectronVersion` function.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd electron && npx jest afterPack -i`
Expected: PASS — all existing tests plus `placeNodeRuntime` and `pruneDawnBinaries`.

- [ ] **Step 5: Commit**

```bash
git add electron/scripts/after-pack.cjs electron/src/__tests__/afterPack.test.ts
git commit -m "feat(electron): place bundled Node, prune off-platform dawn binaries, rebuild for Node ABI"
```

---

## Task 6: Flip postinstall rebuild to Node ABI

**Files:**
- Modify: `electron/scripts/rebuild-native.mjs`

- [ ] **Step 1: Rewrite the script to build against Node, not Electron**

Nothing (dev backend, prod backend, or Electron main) needs Electron's ABI 140 anymore — the backend always runs on vanilla Node. Replace the body of `electron/scripts/rebuild-native.mjs` so `better-sqlite3` is built for the system/bundled Node ABI:

```js
// Rebuild the V8/NAN-locked native module(s) against the Node ABI the backend
// runs on (system Node in dev, the bundled Node 22.x in prod — same ABI).
//
// The backend always runs on vanilla Node, NOT Electron's embedded Node, so we
// build against Node headers (node-gyp's default dist-url), not Electron's.
// Only better-sqlite3 is V8-locked; N-API modules are ABI-stable and skipped.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname } from "node:path";

const require = createRequire(import.meta.url);
const arch = process.arch;
const moduleDir = dirname(require.resolve("better-sqlite3/package.json"));
const nodeGyp = require.resolve("node-gyp/bin/node-gyp.js");

console.log(`Rebuilding better-sqlite3 for Node ${process.versions.node} (${arch})`);

const result = spawnSync(
  process.execPath,
  [nodeGyp, "rebuild", "--release", `--arch=${arch}`],
  { cwd: moduleDir, stdio: "inherit" }
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
```

- [ ] **Step 2: Run it and confirm better-sqlite3 loads under system Node**

Run: `cd electron && node scripts/rebuild-native.mjs && cd ~/workspace/nodetool2 && node -e "require('better-sqlite3'); console.log('better-sqlite3 loads on', process.versions.modules)"`
Expected: prints `better-sqlite3 loads on 127` (system Node 22.x ABI), no `NODE_MODULE_VERSION` error.

- [ ] **Step 3: Confirm the dev backend still boots (smoke)**

Run: `cd ~/workspace/nodetool2 && timeout 25 npm run dev:server 2>&1 | grep -m1 -iE "listening|7777|ready" && echo OK`
Expected: server logs a ready/listening line (`OK`); no sqlite ABI error. (Ctrl-C / timeout ends it.)

- [ ] **Step 4: Commit**

```bash
git add electron/scripts/rebuild-native.mjs
git commit -m "fix(electron): rebuild better-sqlite3 for Node ABI (backend runs on vanilla Node)"
```

---

## Task 7: Packaged-app verification (manual)

**Files:** none (verification only)

- [ ] **Step 1: Full packaged build (mac arm64)**

Run: `cd electron && npm run build 2>&1 | tail -30`
Expected: fetch-node-runtime runs, prepare-backend stages webgpu, electron-builder packs and afterPack logs `Placed bundled Node (darwin-arm64)` + `Rebuilding better-sqlite3 for Node 22.22.1`. Build succeeds.

- [ ] **Step 2: Confirm the bundled Node + single dawn binary are in the app**

Run:
```bash
APP="electron/dist/mac-arm64/Nodetool.app/Contents/Resources/backend"
ls "$APP/runtime/node" && "$APP/runtime/node" --version
ls "$APP/node_modules/webgpu/dist/"*.dawn.node
```
Expected: `node` exists and prints `v22.22.1`; exactly `darwin-universal.dawn.node` remains (off-platform binaries pruned).

- [ ] **Step 3: Verify signing of the bundled binaries**

Run:
```bash
codesign --verify --deep --strict --verbose=2 electron/dist/mac-arm64/Nodetool.app
codesign -dv "$APP/runtime/node" 2>&1 | grep -i "Authority\|Identifier"
spctl -a -vv electron/dist/mac-arm64/Nodetool.app
```
Expected: `valid on disk`, `node` signed with the Developer ID authority, `spctl` accepts the app. (If signing/notarization isn't configured locally, record that this must pass in CI.)

- [ ] **Step 4: Launch and run the compositor end-to-end**

Launch the packaged app, open a workflow with `ConstantImage (asset) → Compositor`, run it. Confirm a composited image renders and the backend process does not crash.

Cross-check the backend is the bundled Node (not Electron):
```bash
ps aux | grep -i "Resources/backend/runtime/node" | grep -v grep
```
Expected: a process running `.../Resources/backend/runtime/node .../backend/server.mjs`.

- [ ] **Step 5: Record results in the spec**

Append a short "Verification — <date>" note to `docs/superpowers/specs/2026-05-22-bundle-node-runtime-design.md` capturing: app size delta, dawn binary present, signing result, and that the compositor produced output. Commit:

```bash
git add docs/superpowers/specs/2026-05-22-bundle-node-runtime-design.md
git commit -m "docs: record packaged-backend GPU verification results"
```

---

## Self-Review notes

- **Spec coverage:** §1 unify runtime → Task 4; §2 fetch script → Task 2; §3 webgpu external → Task 3; §4 afterPack place/prune/ABI → Task 5; §5 postinstall ABI → Task 6; §6 signing → Task 7 Step 3; §7 tests → Tasks 1/3/5 + Task 7. All covered.
- **Cross-arch better-sqlite3** (spec Risk): mac x64 / win / linux builds must run on their own arch runners (status quo). The plan's verification targets mac arm64; CI matrix runs the others per-arch. Noted, not solved.
- **Naming consistency:** helper `rebuildNativeModulesForBackend` (renamed from `...ForElectron`); exports `placeNodeRuntime`, `pruneDawnBinaries`; constants `nodeBinaryName`, `nodeArchive`, `dawnKeepFiles`, `ALL_DAWN_FILES`, `NODE_RUNTIME_VERSION` — used consistently across Tasks 1, 4, 5.
