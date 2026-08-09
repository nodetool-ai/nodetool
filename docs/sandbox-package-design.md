# Sandbox Package System — JS/WASM packages for the QuickJS sandbox

Design for letting NodeTool packs ship code that runs **inside** the QuickJS
sandbox: pure-JS guest modules the Code node and CodeAct steps can `import`,
and WASM modules bridged in from the host. Distribution rides the existing
package manager — the `nodetool` manifest in a pack's package.json, the npm
install flow, and the registry index.

> Status: design. Nothing in this document is implemented yet.

## Problem

Every library the sandbox offers today is a **host bridge**: papaparse,
cheerio, exceljs, fflate and friends run on the host, lazily imported inside
their bridge in `packages/agents/src/js-sandbox.ts`, and the guest sees only
plain-data functions. That keeps the guest surface identical across dev,
packaged Electron, and the in-browser runner — but it has a hard ceiling:

- Adding a library means editing `js-sandbox.ts`, the sandbox manifest, and
  the drift tests, then shipping a NodeTool release. Third parties cannot
  extend the sandbox at all.
- A pack that ships nodes has no way to ship helper code for Code nodes in
  its example workflows.
- Compute-heavy pure functions (parsers, codecs, geometry, hashing) are
  exactly what WASM is for, and there is no way to bring one.

The goal: a pack installs through the normal package manager and its sandbox
modules become importable in the guest — without weakening the sandbox's
security contract or breaking surface parity across the three runtimes.

## Facts the design must respect

1. **The engine is quickjs-ng** (`@sebastianwessel/quickjs` ^3 over
   `quickjs-emscripten-core`). A fresh runtime/context per invocation;
   64 MB memory limit, 512 KB stack, interrupt handler on a deadline;
   `eval`/`Function` deleted so the guest cannot self-generate code.
2. **quickjs-ng has no `WebAssembly` global.** WASM cannot execute inside
   the guest. "WASM in the sandbox" therefore means: WASM instantiated on
   the **host** (Node and browsers both have `WebAssembly`), reached from
   the guest through a bridge — the same pattern as every existing library.
3. **There is no module loader today, on purpose.** `import`/`require` are
   rejected statically (`packages/node-sdk/src/code-node-validation.ts`,
   `code-analysis.ts`) and the prompts say so. But the machinery exists
   unused: the wrapper exposes `RuntimeOptions.mountFs` / `nodeModules`
   (a virtual FS the guest resolves imports against), backed by
   `runtime.setModuleLoader` in quickjs-emscripten-core. User code is
   already wrapped as an ES module (`wrapCode()`), so `import` statements
   are one loader away from working.
4. **The pack system already carries manifests.** Third-party packs are npm
   packages with a `nodetool` field in package.json, discovered by
   `packages/node-sdk/src/pack-loader.ts`, gated by a trust allowlist
   (`~/.config/nodetool/packs.json`), installed by Electron into
   `<userData>/optional-node`, and listed in the registry index
   (`nodetool-ai/nodetool-registry`). Today loading a pack means **running
   its `register` export in-process with full server privileges** — which is
   why untrusted packs are skipped entirely.
5. **Host-side value marshaling is settled.** Typed arrays serialize
   guest→host natively; host→guest bytes travel as tagged base64 revived by
   a guest prelude. Async bridge errors return tagged objects, never
   rejected promises. New bridges must follow these rules.
6. **Packaged Electron flattens paths.** Data files a package loads at
   runtime must be registered so `bundle-backend.mjs` stages them and
   `verify-backend-bundle.mjs` checks them.

## Design

### Two module kinds

| Kind | Runs | Capability model | Risk |
|---|---|---|---|
| **Guest JS module** | inside QuickJS | none beyond what user code already has; every existing limit (memory, deadline, interrupt, output caps) applies automatically | CPU/memory inside the guest budget — already contained |
| **Host WASM module** | on the host, behind a generated bridge | an empty import object: no I/O, no syscalls, no host references; memory capped at instantiation | host CPU and memory — needs its own bounds |

A guest JS module is the default answer. WASM is for compute a JS module
cannot do at acceptable speed. A pack can pair them: a WASM module plus a
guest JS wrapper that gives it an ergonomic API.

### Package unit: the `nodetool.sandboxModules` manifest

Sandbox modules are **declared data, not executed code**. A pack lists them
in the existing `nodetool` field:

```jsonc
// package.json of @acme/nodetool-geo
{
  "name": "@acme/nodetool-geo",
  "version": "1.2.0",
  "nodetool": {
    "apiVersion": 1,
    // "register" is optional — a pack may ship ONLY sandbox modules
    "sandboxModules": [
      {
        "name": "geo",                      // import specifier: "@acme/nodetool-geo/geo"
        "kind": "js",
        "file": "sandbox/geo.js",           // relative to the package root
        "doc": "Great-circle distance, point-in-polygon, geohash."
      },
      {
        "name": "simplify-wasm",
        "kind": "wasm",
        "file": "sandbox/simplify.wasm",
        "memoryPagesMax": 256,              // 16 MB cap, enforced at instantiation
        "exports": [
          { "name": "simplify", "doc": "Douglas-Peucker on a Float64Array of [x,y] pairs." }
        ]
      }
    ]
  }
}
```

Manifest types live in `@nodetool-ai/protocol` (`SandboxModuleManifest`).
Rules enforced at discovery time (`pack-loader.ts`):

- `file` must resolve inside the package directory (same containment guard
  as the package-asset route).
- Size caps: 256 KB per JS module source, 4 MB per WASM binary, 8 MB per
  pack total. Oversize modules are skipped with a named reason, like the
  existing `skip` reasons (`not-allowed`, `collision`, …).
- JS modules are parsed with acorn at load time. Allowed: ES module syntax,
  `export`s, and `import`s **only of sibling modules declared by the same
  pack**. Rejected: `import` of anything else, `eval`/`Function` (they do
  not exist in the guest anyway — reject early with a good message).
- WASM binaries get a header/section sanity parse; declared `exports` are
  checked against the binary's export section.

### Config-only modules from npm packages

A pack does not have to author sandbox code at all. A manifest entry can
point at an npm package, and NodeTool produces the guest module from it —
no glue code:

```jsonc
{
  "name": "@acme/nodetool-validation",
  "dependencies": { "zod": "^3.24.0" },
  "nodetool": {
    "apiVersion": 1,
    "sandboxModules": [
      { "name": "zod", "kind": "js", "npm": "zod" }
      // "npm" replaces "file"; the version comes from the pack's own
      // dependencies, so npm resolves and checksums it as usual
    ]
  }
}
```

Mechanics, at pack discovery (still without executing any pack code):

- NodeTool bundles the package once with esbuild (already a repo
  dependency): entry = the package's ESM entry, `bundle: true`,
  `platform: "neutral"`, `format: "esm"`, no externals. The whole
  dependency subtree flattens into one file, so the guest resolver never
  has to walk `node_modules`, honor `exports` maps, or convert CJS —
  esbuild does all of that at build time.
- An import of a Node builtin fails the bundle. That is the filter, not a
  limitation to work around: a package that needs `fs`, `net`, or
  `crypto` cannot run in the guest anyway, and this turns the failure into
  a named skip at install time instead of a runtime surprise.
- The bundle output goes through the same static scan as authored modules,
  plus a forbidden-global check for names the guest deletes or blocks:
  `process`, `Buffer`, `require`, `eval`, `Function`, `setTimeout` /
  `setInterval`, `WebAssembly`, `document` / `window` / `XMLHttpRequest`.
  Hard references are an error; references behind feature-detection
  (`typeof process !== "undefined"`) are a warning, since such packages
  usually take the portable path.
- The output is cached at
  `<userData>/sandbox-bundles/<pack>/<name>@<resolvedVersion>.mjs`, keyed
  by the resolved version, and from there on behaves exactly like an
  authored guest JS module — same mounting, limits, validation, and
  browser-runner delivery. Bundled modules get a larger source cap (1 MB)
  than authored ones.

What fits: pure-computation ESM packages — schema validation (zod),
functional utilities (lodash-es, remeda), date math (date-fns), parsers
and formatters (marked, papaparse-style codecs). What cannot fit,
regardless of tooling: packages needing Node builtins, the DOM, network,
timers (blocked in the guest), `eval` (deleted), or WASM (no
`WebAssembly` in quickjs-ng — such packages need the host-WASM path
instead). The bundling step exists precisely to sort a package into one
of these two buckets before anything runs.

This also opens a later pack-less form: a user-level declaration (e.g.
`sandboxNpm: ["zod@^3"]` in `packs.json`) that installs into the existing
`optional-node` root and surfaces as an implicit pack. Deferred to
Phase 3 — the pack-based form ships first because trust, listing, and
delivery already exist for packs.

### Guest import surface

User code in a Code node or CodeAct step imports a declared module by its
npm-style specifier:

```js
import { haversine } from "@acme/nodetool-geo/geo";
const km = haversine(a, b);
return { km };
```

Mechanics:

- `runInSandbox` gains `modules?: ResolvedSandboxModule[]`. When present,
  the sources are mounted into the wrapper's virtual `node_modules`
  (`RuntimeOptions.nodeModules`) so the engine's own resolver serves them.
  Nothing else is mounted, so any other specifier fails at resolve with
  "module not found — declare it in the node's packages list".
- The static check (`code-node-validation.ts` / `code-analysis.ts`) stops
  rejecting `import` wholesale. New rule: every import specifier must match
  a module declared on the node (see below); `export` (other than the
  wrapper's own) and `require` stay rejected. Unknown specifiers keep a
  variant of today's `code_module` error naming the fix.
- Guest modules are evaluated inside the same context, under the same
  interrupt handler and memory limit as user code. No new budget knobs.

### Declaring usage on the node

Imports are explicit per node, not ambient. The Code node
(`nodetool.code.Code`) gains a `packages` property: a list of module
specifiers the code may import. CodeAct exposes the installed catalog in its
prompt and mounts what the step's code actually imports (the executor
already parses the code before running it).

Why explicit: `nodetool validate` can check a workflow offline (specifier
typos, module not installed, version drift) before anything runs; the
sandbox mounts only what is declared, so the guest surface stays
deterministic and the prompt stays small; and a shared workflow states its
dependencies, so import on another machine can name exactly which packs to
install.

### Host WASM modules

Instantiation and exposure:

- The host compiles each WASM binary once per process
  (`WebAssembly.compile`, cached by pack+version) and creates a **fresh
  instance per sandbox invocation** — no state leaks between runs.
- The import object is **empty** in v1. No WASI, no host functions, no
  shared memory. A module that needs an allocator exports its own
  (`malloc`/`free` convention, as Emscripten/wasm-bindgen standalone builds
  do).
- `memoryPagesMax` from the manifest is enforced by instantiating the
  memory with that `maximum` (or validating the module's own declared max).
- The guest reaches exports through one generated bridge per invocation:
  `__wasm(pack, exportName, args)` — args and returns limited to numbers
  and typed arrays, marshaled by the existing serializer/byte-tagging
  rules. The pack's guest JS wrapper module turns that into a typed API, so
  user code never calls `__wasm` directly.

Bounding host CPU — the one real risk, since a WASM call cannot be
interrupted by the guest's interrupt handler:

- **Node:** WASM calls execute on a worker thread with a hard per-call
  timeout (default 5 s, pack can declare lower, never higher); timeout
  terminates the worker. Compiled modules are `postMessage`-transferable,
  so the worker does not recompile.
- **Browser runner:** a Web Worker, same contract, `Worker.terminate()` on
  timeout.
- The call is async from the guest's point of view (all bridges already
  are), so the worker hop changes no guest-visible semantics.

### Trust model

The payoff of "declared data, not executed code": sandbox modules do not
need the trust bar that `register` packs need.

| Pack content | Untrusted (not on allowlist) | Trusted |
|---|---|---|
| `register` (in-process nodes) | skipped, as today | loaded |
| Guest JS modules | **loaded** — they run inside the sandbox with zero added capability | loaded |
| WASM modules | **loaded** — empty imports + memory cap + worker timeout bound them | loaded |

A pack that ships only `sandboxModules` (no `register`) is therefore
installable and usable without touching the allowlist. Discovery reads
package.json and module files; it never imports pack code. The `packs`
tRPC router reports sandbox modules in `list` with their own status so the
Package Manager UI can show "sandbox-only, no trust needed".

### Distribution and delivery

Nothing new is invented:

- **Install:** the existing Electron npm installer
  (`electron/src/nodePackManager.ts`) — `sandboxModules` needs no changes
  there. Server restart picks them up, same as node packs.
- **Registry:** the index (`nodetool-ai/nodetool-registry/index.json`)
  entries gain an optional `sandboxModules: string[]` summary so the
  Package Manager can filter/search "packages for the Code node".
  Integrity remains npm's (tarball checksums); a later phase can add
  per-file `sha256` to the manifest for defense in depth.
- **Builtin packs** may ship sandbox modules too (e.g. moving some current
  host bridges' pure-JS parts into importable modules stays possible but is
  a non-goal for now).
- **Browser runner:** module sources reach the browser via a new
  authenticated route, `GET /api/sandbox-modules/:pack/:name`, streaming
  from the resolved pack directory with the same path-containment guards as
  `/api/assets/packages/...`. The browser runner fetches and caches
  sources/binaries keyed by pack version, then mounts/instantiates exactly
  as Node does. Surface parity holds: same modules, same limits, same
  errors.
- **Packaged Electron:** sandbox module files of bundled packs are staged
  by `bundle-backend.mjs` into `_sandbox/<pack>/<file>` (a per-pack
  directory, avoiding the flat-basename constraint of
  `PACKAGE_RUNTIME_ASSETS`) and checked by `verify-backend-bundle.mjs`.
  Resolution order in `resolveSandboxModuleFile`: real package dir first,
  `_sandbox/` fallback in the flattened layout.

### Surfacing to agents and validation

- **Sandbox manifest** (`packages/agents/src/code-gen/sandbox-manifest.ts`)
  gains a `packages` section generated from the installed registry — name,
  specifier, `doc`, export docs. It appears in prompts only when modules
  are installed, and the drift test pins the shape.
- **`nodetool validate` / `validate_workflow`:** new checks — a `packages`
  entry naming a module no installed pack provides (error, names the pack
  to install), an `import` in code of a specifier missing from `packages`
  (error), a declared package the code never imports (warning).
- **`nodetool node run` / `debug`:** work unchanged; the harness resolves
  declared modules the same way the kernel does, so a failing import
  reproduces headlessly.

### Registry plumbing (where the code goes)

- `@nodetool-ai/protocol`: `SandboxModuleManifest`, resolved-module types.
- `packages/node-sdk/src/pack-loader.ts`: discovery + static validation of
  `sandboxModules`, feeding a `SandboxModuleRegistry` (new file in
  node-sdk) that maps specifier → `{pack, version, kind, file, doc}`.
- `packages/agents/src/js-sandbox.ts`: `modules` option, virtual-FS mount,
  the `__wasm` bridge, worker-pool call path.
- `packages/websocket`: the delivery route; `packs.list` additions.
- `web`: browser-runner fetch/cache; Package Manager UI additions; Code
  node property editor with specifier autocomplete from `packs.list`.

## Alternatives considered

- **Keep host bridges as the only extension point.** Safest, but it makes
  every library a NodeTool core change and gives third parties nothing.
  Bridges remain the right tool for anything needing real I/O or native
  code with host access — this design does not replace them.
- **Inject packages as globals instead of imports.** Avoids touching the
  no-import invariant, but invents a second module system, breaks editor
  tooling/typing, and still needs the same declaration, validation, and
  delivery machinery. The static analyzer already parses ES modules;
  imports are the smaller change.
- **Run WASM inside the guest.** Impossible on quickjs-ng (no
  `WebAssembly`). Swapping engines or compiling WASM→JS costs far more than
  a host bridge and would break the memory-limit story.
- **Arbitrary npm imports in the guest at runtime.** Rejected. Most npm
  code assumes Node builtins or the DOM and would fail confusingly; the
  audit surface would be unbounded. The config-only npm form above is the
  answer instead: a declared package, bundled and vetted once at install
  time, size-capped — not a live resolver over `node_modules`.

## Limits summary

| Bound | Value | Enforced |
|---|---|---|
| JS module source (authored) | 256 KB | pack discovery |
| JS module source (npm-bundled) | 1 MB | pack discovery |
| WASM binary | 4 MB | pack discovery |
| Per-pack total | 8 MB | pack discovery |
| Guest eval of modules | existing 64 MB / deadline / interrupt | engine |
| WASM instance memory | `memoryPagesMax` (≤ 4096 pages / 256 MB) | instantiation |
| WASM call wall clock | 5 s default, pack may lower | worker timeout |
| WASM imports | none | instantiation |

## Non-goals

- WASI, filesystem, network, or host-function imports for WASM modules.
- `require`, Node builtins, or undeclared npm packages in the guest.
- Per-workflow version pinning of modules (the workflow records the pack
  version it was built with; `validate` warns on mismatch — resolution
  always uses the installed version).
- Replacing existing host bridges.

## Implementation plan

Each milestone is one or two PRs, lands green on its own, and the system
works at every point in between.

### M0 — Types and discovery (no runtime change)

- `@nodetool-ai/protocol`: `SandboxModuleManifest`, `ResolvedSandboxModule`
  types; extend the pack manifest type.
- `packages/node-sdk`: parse `sandboxModules` in `pack-loader.ts`
  discovery; static validation (containment, size caps, acorn parse,
  intra-pack imports only); new skip reasons; a `SandboxModuleRegistry`
  (specifier → resolved module) populated at pack load, with no consumer
  yet.
- Tests: fixture packs (valid, oversize, escaping path, bad import) in
  `packages/node-sdk/tests/`.

### M1 — Guest mounting in the sandbox

- `packages/agents/src/js-sandbox.ts`: `RunSandboxOptions.modules`;
  build the wrapper's `nodeModules` virtual FS from resolved sources;
  map resolve failures to a clear error naming the `packages`
  declaration.
- Sandbox manifest + drift test: a generated `packages` section that
  appears only when modules are mounted.
- Tests: import works, undeclared specifier fails at resolve, module code
  hits the same memory/deadline limits, guest cannot reach undeclared
  siblings.

### M2 — Code node, CodeAct, and validation

- `packages/code-nodes`: `packages` property on `nodetool.code.Code`;
  resolve declared specifiers through the registry and pass `modules`
  to `runInSandbox`.
- `packages/node-sdk` (`code-analysis.ts`, `code-node-validation.ts`):
  replace the blanket `import` rejection with "every specifier must be
  declared and installed"; keep rejecting `require` and stray `export`s.
- `nodetool validate` / `validate_workflow`: unknown-module error naming
  the pack to install; declared-but-unused warning.
- CodeAct (`codeact-executor.ts`): advertise the installed catalog in the
  prompt; parse each step's imports and mount what it uses.
- Update every "no module loader" prompt string and its drift test in the
  same PR — the phrase becomes "imports are limited to declared sandbox
  packages".

### M3 — Delivery: browser runner and packaged Electron

- `packages/websocket`: `GET /api/sandbox-modules/:pack/:name` with the
  package-asset containment guards; `packs.list` reports sandbox modules
  and their status.
- `web`: browser runner fetches and caches sources by pack version and
  mounts them identically; Code node property editor with autocomplete
  from `packs.list`.
- `scripts/bundle-backend.mjs` / `verify-backend-bundle.mjs`: stage
  builtin packs' module files under `_sandbox/<pack>/`; resolution
  fallback in the flattened layout; covered by `npm run backend:smoke`.

### M4 — Config-only npm modules

- Bundler in `node-sdk` (esbuild, `platform: "neutral"`, no externals) run
  at discovery for `npm`-sourced entries; forbidden-global scan on the
  output; cache at `<userData>/sandbox-bundles/` keyed by resolved
  version; new skip reasons for bundle failures.
- Tests: fixture packs wrapping a pure package (bundles, imports, runs)
  and a builtin-dependent package (skipped with the right reason).

### M5 — WASM host modules

- Manifest `kind: "wasm"`; binary section parse + export check at
  discovery.
- `packages/agents`: compile cache; per-invocation instances; the
  `__wasm` bridge with number/typed-array marshaling; worker execution
  (Node `worker_threads`, browser Web Worker) with hard timeout and
  terminate; memory cap at instantiation.
- Guest wrapper convention documented; one reference pack used in tests.

### M6 — Migrate existing host-bridge libraries into normal packs

The migrated libraries ship as **normal packs** — one small npm package
per library, config-only (`sandboxModules` with an `npm` source, no
`register`, no glue code), listed in the registry index, installed and
uninstalled through the ordinary flow. Nothing is compiled into NodeTool;
these packs dogfood exactly the path a third party would use, including
the trust rule (sandbox-only, so no allowlist entry needed).

| Bridge | Library | Disposition | Why |
|---|---|---|---|
| `data.parseCsv` / `toCsv` | papaparse | migrate → `@nodetool-ai/sandbox-csv` | pure JS |
| `data.parseYaml` / `toYaml` | js-yaml | migrate → `@nodetool-ai/sandbox-yaml` | pure JS |
| `data.parseXml` / `toXml` | fast-xml-parser | migrate → `@nodetool-ai/sandbox-xml` | pure JS |
| `data.diff` | diff | migrate → `@nodetool-ai/sandbox-diff` | pure JS |
| `data.zip` / `unzip` | fflate | migrate → `@nodetool-ai/sandbox-zip` | pure JS; the 50 MB host cap becomes the guest 64 MB memory limit |
| `data.selectHtml` | cheerio | decided by the bundle: if it bundles neutral and fits the cap, migrate → `@nodetool-ai/sandbox-html`; else stays a bridge | large dependency tree |
| `data.parseXlsx` | exceljs | stays a bridge | Node streams/Buffer |
| `data.htmlToMarkdown` | turndown | stays a bridge | needs a DOM |
| `format.*` | host `Intl` | stays a bridge | quickjs-ng ships no Intl |
| `image.*`, `canvas.*` | @napi-rs/canvas | stays a bridge | native code |
| `fetch`, `crypto`, `getSecret`, `workspace`, assets, `progress` | — | stays a bridge | capabilities, not libraries |

The packs live in the monorepo under `packages/sandbox-packs/<name>/` as
publishable workspaces (versioned and released like the other
`@nodetool-ai/*` packages) but are consumed only via install — dev
environments get them through the normal optional-node root, not through
the workspace build. The import specifier is the pack name:
`import Papa from "@nodetool-ai/sandbox-csv"`.

Consequences of "normal pack" instead of builtin:

- **Presence is not guaranteed.** A Code node that imports
  `@nodetool-ai/sandbox-csv` on a machine without it fails validation
  with "install @nodetool-ai/sandbox-csv" — the same behaviour as any
  third-party pack, surfaced before the run by `nodetool validate`.
- The registry index marks them **recommended** and the Package Manager
  shows them as a one-click group; the desktop app may offer them during
  onboarding. But no code path assumes they exist.
- CodeAct and the sandbox manifest advertise only **installed** packs, so
  prompts stay truthful on every machine.
- No Electron bundle staging is involved — they arrive through the
  optional-node install root like every other pack. The `_sandbox/`
  staging from M3 remains only for any builtin pack that ships modules.

Compatibility rules for the migration:

- **No existing workflow breaks.** The `data.*` bridges stay, unchanged,
  for at least one major release. Migration adds the import path; it does
  not remove the bridge path — which also covers machines where the packs
  are simply not installed.
- The sandbox manifest marks migrated bridges "prefer
  `import ... from "@nodetool-ai/sandbox-..."`" **when the pack is
  installed**, so CodeAct and the Code-node planner steer new code to
  imports while old code keeps running.
- The `codeact` and `code-gen` eval suites run before and after the
  prompt change; a regression blocks the switch, not the pack.
- Bridge removal, if ever, is its own decision later — the bridges are
  cheap to keep and heavy ones (`Intl`, canvas, xlsx) are permanent.

### M7 — Ecosystem

Registry-index `sandboxModules` summaries and Package Manager search/UI,
per-file hashes in the manifest, `nodetool package init --sandbox`
scaffolding, the pack-less `sandboxNpm` user declaration, docs and an
example third-party pack.

Dependency order: M0 → M1 → M2 → M3 ship in sequence; M4 and M5 are
independent of each other after M3; M6 needs M4; M7 is last.
