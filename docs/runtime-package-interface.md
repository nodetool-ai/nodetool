# Runtime Package Interface

Status: **implemented** — see `electron/src/runtime/packages/`.

The Package Manager (`electron/src/packageManager.ts`) currently branches per
install backend (`conda` / `npm` / `electron`) for status, install, uninstall,
update, and consumer resolution. This design replaces the branching with a
single interface every runtime package implements, regardless of backend.

## Goals

- One interface covers every runtime: language interpreters (python, ruby),
  CLI tools (ffmpeg, pandoc), and npm libraries (transformers-js).
- Consumers (workflow nodes) resolve runtimes by id and get back binary paths
  and env vars — they don't care how it was installed.
- Lifecycle operations (install / update / repair / uninstall) are explicit
  and independent.
- Progress is structured, not stringly-typed log lines.

## Core interface

```ts
interface RuntimePackage {
  // Identity
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: "language" | "tool" | "library";
  readonly approxSizeMB?: number;
  readonly homepage?: string;
  readonly platforms?: NodeJS.Platform[];   // omit = all
  readonly dependsOn?: string[];            // other runtime ids

  // Version policy — declared compatible range
  readonly versionRange: string;            // semver range, e.g. ">=6 <7"

  // Probe — pure, fast, no side effects
  status(ctx: RuntimeContext): Promise<RuntimeStatus>;

  // Lifecycle — each independent and idempotent
  install(ctx: RuntimeContext, signal: AbortSignal): AsyncIterable<RuntimeProgress>;
  update(ctx: RuntimeContext, signal: AbortSignal): AsyncIterable<RuntimeProgress>;
  repair(ctx: RuntimeContext, signal: AbortSignal): AsyncIterable<RuntimeProgress>;
  uninstall(ctx: RuntimeContext): Promise<void>;

  // Consumer-facing resolution — what nodes need to USE the runtime
  resolve(ctx: RuntimeContext): Promise<RuntimeResolution | null>;
}
```

### Supporting types

```ts
interface RuntimeContext {
  userDataDir: string;
  condaEnvPath: string;
  optionalNodeRoot: string;
  platform: NodeJS.Platform;
  arch: string;
  log(level: "info" | "warn" | "error", msg: string): void;
}

interface RuntimeStatus {
  installed: boolean;
  installedVersion?: string;
  latestVersion?: string;        // populated by registry
  updateAvailable?: boolean;     // computed by registry
  brokenReason?: string;         // partial / corrupted install
}

type RuntimeProgress =
  | { type: "stage"; label: string }
  | { type: "percent"; value: number }            // 0..100
  | { type: "log"; line: string; level?: "info" | "warn" }
  | { type: "done" }
  | { type: "error"; message: string };

interface RuntimeResolution {
  binPaths?: string[];                            // prepend to PATH for child procs
  env?: Record<string, string>;                   // env vars to inject
  binaries?: Record<string, string>;              // logical name → absolute path
  nodeModulePaths?: string[];                     // for require/import resolution
}
```

## Design decisions

### Versioning: ranges, not pins

`versionRange` is a semver range. The registry resolves the newest version
satisfying the range when installing or updating.

- `status.installedVersion` comes from the install backend (`conda list`,
  `package.json`).
- `status.latestVersion` is fetched by the registry (npm registry API, conda
  search, or a hardcoded "latest known good"). Cacheable, off the hot path.
- `updateAvailable = installed && latestVersion && satisfies(latestVersion, versionRange) && gt(latestVersion, installedVersion)`.
  Computed in the registry, not per-package.

### Update is separate from install

- **`install`** — assumes nothing is installed. If something is, no-op or
  upgrade-to-satisfy-range (impl's choice). Must succeed on a clean machine.
- **`update`** — assumes installed. Resolves the newest version satisfying
  `versionRange` and moves to it. No-op if already on it. Errors if not
  installed (caller should show "Install" instead).

### Server cannot resolve runtimes (Electron-only for v1)

The registry lives in Electron. CLI / `npm run dev:server` cannot call
`resolve()`. If a node needs a runtime in the server context, it must fail
with a clear error directing the user to run via Electron or install the
runtime manually.

Future expansion (moving the registry to a shared package) is possible but
out of scope.

### Repair is separate from install

- **`repair`** — assumes installed-but-broken. Re-runs whatever step
  `status()` flagged in `brokenReason`. For conda runtimes: re-run
  `conda install` for missing packages. For npm runtimes: re-install the
  package. May silently overlap with `install`/`update`.

`repair()` and `status()` share internal probe helpers; `repair()` re-probes
from scratch rather than trusting a stale `brokenReason` from a previous
`status()` call.

### Resolution is literal

`RuntimeResolution.binaries` is a flat map of logical name → absolute path
(`{ ffmpeg: "/abs/path/to/ffmpeg" }`). No semantic capability layer
(`{ canRunPython: true, ... }`). Simpler, and good enough — multi-source
capabilities (e.g. system Python vs conda Python) can be layered on later if
ever needed.

## Consumer usage

```ts
// In a node:
const ffmpeg = await registry.resolve("ffmpeg");
if (!ffmpeg) throw new Error("FFmpeg runtime not installed");
spawn(ffmpeg.binaries!.ffmpeg, ["-i", input, output], {
  env: { ...process.env, ...ffmpeg.env },
});

// In the UI:
const controller = new AbortController();
for await (const ev of pkg.install(ctx, controller.signal)) {
  if (ev.type === "percent") setProgress(ev.value);
  if (ev.type === "stage") setStage(ev.label);
  if (ev.type === "error") showError(ev.message);
}
```

## Backend implementations

Most packages share install logic. Provide base classes:

- **`CondaRuntimePackage`** — constructor takes `{ id, name, condaPackages,
  verifyBinary, windowsBinSubdir?, versionRange, ... }`. Implements all five
  methods against the conda env.
- **`NpmRuntimePackage`** — constructor takes `{ id, name, npmPackages,
  packageNames, versionRange, ... }`. Implements against
  `optional-node/node_modules`. `resolve()` returns `nodeModulePaths`.
- **`ElectronRuntimePackage`** — bundled. `status()` always `installed: true`,
  `install()` yields `done` immediately, `resolve()` returns Electron's
  bundled node path.

Adding a new conda tool becomes one `new CondaRuntimePackage({...})` entry,
not a new class. Bespoke packages with non-standard install flows can
implement `RuntimePackage` directly.

## Registry responsibilities

The registry (replaces `RUNTIME_DEFINITIONS`) wraps the package list and
provides cross-cutting concerns:

- **Concurrency guard** — at most one `install`/`update`/`repair` per package
  id at a time (today's `runtimeInstalling: Set`).
- **Latest-version fetching and caching** — drives `status.latestVersion` and
  `updateAvailable`.
- **Dependency resolution** — `dependsOn` enforced before install.
- **Platform filtering** — packages with `platforms` not including the
  current OS are hidden.
- **IPC surface** — exposes `status` / `install` / `update` / `repair` /
  `uninstall` / `resolve` to the renderer and to nodes.

## Migration

1. Define interface and base classes in `electron/src/runtime/packages/`.
2. Port existing entries from `RUNTIME_DEFINITIONS` to base-class instances.
3. Replace `installRuntimePackage` / `uninstallRuntimePackage` callsites with
   registry methods.
4. Add `resolve()` callsites in nodes that currently hardcode conda env paths.
5. Remove the old `RUNTIME_DEFINITIONS` map and per-type branches.

## Open items

- Latest-version fetch backends: npm registry is straightforward; conda is
  slower (`mamba search` / Anaconda API). Acceptable to skip
  `latestVersion`/`updateAvailable` for conda packages in v1.
- IPC channel shape for streaming `RuntimeProgress` to the renderer — likely
  one channel with a request id, similar to existing log streaming.
- Telemetry on install failures — not in scope here, but the structured
  `RuntimeProgress` events make it easy to add later.
