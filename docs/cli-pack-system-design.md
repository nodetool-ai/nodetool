# CLI Pack System: On-Demand Node Packs for the npm CLI

Status: design, not implemented. Scope: the npm package `@nodetool-ai/cli`.
The desktop app and the Docker image keep their bundled backend.

This revision answers the adversarial review of the previous draft. Finding
codes F1 to F13 and question codes Q1 to Q5 refer to that review. Decisions
D1 to D7 are fixed. New items use D8 and later, R1 and later, and Q6 and later.

## 1. Summary

1. The core CLI stops depending on node packs and on heavy native libraries.
   Step 1 of the migration is this dependency cut plus a measured size gate.
   No installer work starts before it passes.
2. Packs are ordinary npm packages. They install into the npm project that
   already holds the CLI, so packs and core resolve from one tree.
3. A static generated catalog maps each node type to its pack. Every node type
   stays visible for search, validation, and the planner without its pack.
4. A run resolves missing packs before it starts. A missing pack produces a
   structured `missing_pack` error and exit code 3.
5. Only the CLI command layer can install. It needs its own authorization,
   separate from the permission gate. The server and MCP never install.
6. After an install, the CLI re-executes itself. One process sees one fixed
   set of packs.

## 2. Problem

`npm install @nodetool-ai/cli@0.8.3` installs about 1.2 GB on darwin-arm64.
The CLI depends on every node pack, and core packages depend on heavy native
libraries.

A read-only walk of the local workspace tree (method in section 8) gives
868 MB of apparent file size and 1,087 MB of disk usage for the current CLI
closure, in 884 packages. The difference from 1.2 GB comes from different
resolved versions in a clean install.

| Item | Apparent size | Pulled in by |
|---|---|---|
| `webgpu` | 67.9 MB | `gpu` `optionalDependencies` (`packages/gpu/package.json:22`) |
| `node-av` platform packages (`@seydx/*`) | 58.8 MB | `agents` → `@mediabunny/server` (`packages/agents/package.json:23`) |
| `@napi-rs/*` (canvas) | 48.6 MB | `agents`, `data-nodes`, `video-nodes`, `game-renderer` |
| `node-web-audio-api` | 40.8 MB | `audio-nodes` |
| `node-llama-cpp` and `@node-llama-cpp/*` | 48.0 MB | `cli` (`packages/cli/package.json:68`) |
| `pdfjs-dist`, `pdf-parse`, `@hyzyla/pdfium` | 65.9 MB | `document-nodes`, `websocket` |
| `@opentelemetry/*` | 23.6 MB | `runtime` (`packages/runtime/package.json:27-33`) |
| `typescript` (`@typescript/*`) | 23.2 MB | `execution` (`packages/execution/package.json:29`) |
| `js-tiktoken` | 21.4 MB | `runtime` (`packages/runtime/package.json:36`) |
| `three`, `playwright-core` | 34.0 MB | `game-renderer`, `video-nodes` |

All numbers in this document are local-tree estimates, not clean-install
measurements.

## 3. Goals and non-goals

Goals:

- A core install at or below the budget in section 8.4 that runs `--help`,
  `validate`, `run` and `debug` for core-node workflows (JSON and DSL),
  `node run` for core nodes, `serve`, and `mcp serve`.
- Every node type stays discoverable without its pack: `search_nodes`,
  `get_node_info`, `validate`, and the agent planner see the full catalog.
- A missing pack never fails silently. Every surface names the pack, its size,
  and the command that installs it.
- Packs install only with install authorization (D5).
- Installed packs always match the core version exactly.

Non-goals:

- The desktop app and the Docker image. They keep `@nodetool-ai/base-nodes`
  and the full bundle from `scripts/bundle-backend.mjs`.
- Python packs. They keep the Python bridge.
- Third-party packs. They keep the existing loader in
  `packages/node-sdk/src/pack-loader.ts`, which discovers packages that carry a
  `nodetool` field in `package.json`. First-party packs carry no such field
  today and must not gain one (D8).
- pnpm, Yarn, Bun, and `npx` installs. Section 11 defines how the CLI detects
  them and what it prints.

## 4. Tiers

| Tier | Contents | Installed |
|---|---|---|
| Core | `cli`, `protocol`, `config`, `security`, `auth`, `storage`, `models`, `node-sdk`, `kernel`, `runtime`, `execution`, `agents`, `chat`, `websocket`, `dsl`, `vectorstore`, `app-runtime`, `app-export`, `compute`, `model-pricing`, `timeline`, `gpu`, `storyboard`, `image-editor`, `model3d`, `browser`, `sandbox-compiler`, `huggingface`, `game-runtime`, `deploy`, `telegram`, `sdk`, `nodes-utils`, the core node packages `core-nodes`, `text-nodes`, `data-nodes`, `llm-nodes`, `code-nodes`, and the new `node-catalog` | with the CLI |
| Node pack | One npm package per pack id. Existing ids from `BUILTIN_NODE_PACKS` (`packages/protocol/src/builtin-packs.ts:61`): `whisper-cpp`, `elevenlabs`, `minimax`, `transformers-js`, `fal`, `kie`, `topaz`, `reve`, `atlascloud`, `higgsfield`, `together`, `replicate`, `huggingface`. New ids from the `base` split: `image`, `audio`, `video`, `document`, `game`, `blender`, `manimgx`, `automation`, `integration` | on demand |
| Runtime library | Third-party packages that a core code path loads lazily: `imaging` (`sharp`, `@napi-rs/canvas`), `llama` (`node-llama-cpp`), `typescript`, `tokenizer` (`js-tiktoken`), `tracing` (OpenTelemetry SDK packages), `game-renderer` (first-party, not a node pack) | on demand |

Rules:

- D16. Five libraries stay regular dependencies, because the features that
  use them have no fallback: `webgpu` (`gpu`), `mediabunny` with
  `@mediabunny/server` (`agents`), `@hyzyla/pdfium` (`websocket`,
  `document-nodes`), `chart.js` (`data-nodes`) and `node-web-audio-api`
  (`audio-nodes`, so it installs with the `audio` pack). The desktop app and
  the Docker image already require them.
- D8. A core package never declares a node pack in `dependencies`,
  `optionalDependencies`, or a non-optional peer.
- D9. A heavy library is a regular dependency of each pack that needs it. A
  core package that loads it lazily declares it as an optional peer with an
  exact version. This keeps the monorepo tree and the desktop bundle complete,
  because optional peers alone are never installed (R4).
- D10. A pack declares core packages as exact `peerDependencies`.
  `scripts/prepare-publish.mjs:53` already pins peers. A pack declares another
  pack it needs (for example `video` needs `audio`) as an exact regular
  dependency, and the catalog records it as `requires`.

The `base` pack in `BUILTIN_NODE_PACKS` is required today
(`packages/protocol/src/builtin-packs.ts:69-75`) and aggregates about 60 node
lists through `ALL_BASE_NODES` (`packages/base-nodes/src/index.ts:527`). The
split makes each npm package its own pack. Node type strings stay unchanged.
The generator in section 9 decides ownership, not this table.

## 5. Decisions and finding map

The [implementation plan](cli-pack-system-plan.md#2-plan-decisions) defines
D17 to D22, including the shared runtime registry and bundled server entry.

| Code | Status in this design |
|---|---|
| F1 | Fixed by D5 and section 13. The installer checks its own authorization. |
| F2 | Fixed by section 6. Step 1 of the migration. |
| F3 | Obsolete under D1. Packs resolve core from the same tree. Section 14.6 still verifies one copy. |
| F4 | Fixed by section 7. |
| F5 | Fixed by sections 14.6 and 17. Verification runs before scripts and imports. |
| F6 | Obsolete under D1. No generations, no hard links. |
| F7 | Obsolete under D1 and D2. One lock per install root, no GC, no live switching. |
| F8 | Fixed by D3 and section 9. Exact `node_type → pack` map. |
| F9 | Fixed by D6 and section 10. |
| F10 | Fixed by D4 and section 12. No mid-run retry. |
| F11 | Section 14 pins npm and flags. Section 19.3 is the matrix. |
| F12 | Section 8. Measured, with a budget. |
| F13 | Fixed by D7 and section 17. |

D1 needs one correction. The review of npm behavior in section 11.2 shows that
"the global prefix" cannot mean a separate `npm install -g <pack>`. It must mean
the CLI's own package directory inside the global prefix. Section 11 states the
rule.

## 6. Core dependency cut (F2)

### 6.1 Manifest edges from core to packs and heavy libraries

Read from the `package.json` files. "Cut" names the change.

| Edge | Location | Cut |
|---|---|---|
| `cli` → 14 node packs (`atlascloud`, `base`, `elevenlabs`, `fal`, `huggingface-nodes`, `minimax`, `replicate`, `reve`, `transformers-js-nodes`, `transformers-js-provider`, `video`, `whisper-cpp`) and `game-renderer` | `packages/cli/package.json:24-75` | Remove. Load through the pack loader (section 12). |
| `cli` → `reliability-harness` | `packages/cli/package.json:46` | Remove. It depends on `base-nodes` and `websocket` (`reliability/harness/package.json`). `nodetool reliability` already imports it dynamically (`packages/cli/src/commands/reliability.ts:98`) and reports "development checkout only" when absent. |
| `agents` → `blender-nodes`, `game-nodes`, `game-renderer`, `video-nodes` | `packages/agents/package.json:26,30,31,44` | Remove. Lazy pack import (6.2). |
| `agents` → `@mediabunny/server`, `mediabunny` | `packages/agents/package.json:23,61` | Keep as dependencies (D16). |
| `agents` → `@napi-rs/canvas` | `packages/agents/package.json:24` | Optional peer. Runtime library `imaging`. |
| `agents` → `office-text-extractor` | `packages/agents/package.json:98` (`optionalDependencies`) | Remove from `optionalDependencies`. It stays an optional peer (`:113`). |
| `websocket` → 18 node packs | `packages/websocket/package.json:35-81` | Remove. Lazy pack import. |
| `websocket` → `@hyzyla/pdfium`, `sharp` | `packages/websocket/package.json:29,78` | `@hyzyla/pdfium` stays a dependency (D16). `sharp` becomes an optional peer. Runtime library `imaging`. |
| `dsl` → `base-nodes`, `elevenlabs`, `huggingface-nodes`, `minimax`, `reve`, `transformers-js-nodes`, `whisper-cpp` | `packages/dsl/package.json:37-50` | Remove. Metadata comes from the catalog (6.2). |
| `execution` → `gpu` → `webgpu` | `packages/execution/package.json:20`, `packages/gpu/package.json:22` | Move `webgpu` from `optionalDependencies` to `dependencies` (D16). |
| `model-pricing` → `fal-nodes`, `kie-nodes` | `packages/model-pricing/package.json:18-19` | Move the generated unit-price JSON into `model-pricing`. Change the codegen output paths. The imports are `packages/model-pricing/src/index.ts:46-47`. |
| `runtime` → `js-tiktoken` | `packages/runtime/package.json:36` | Already an optional peer with a lazy import. Remove the remaining optional dependency from `runtime` and `agents` so clean installs omit it. Runtime id `tokenizer`. |
| `runtime` → `sharp` | `packages/runtime/package.json:40` | Optional peer. All four runtime uses are already dynamic. |
| `runtime` → OpenTelemetry SDK packages | `packages/runtime/package.json:28-33` | Keep `@opentelemetry/api`. Make `core`, `resources` and `sdk-trace-base` optional peers. They also pull in `sdk-trace` and `semantic-conventions`. Runtime library `tracing`. |
| `game-runtime` → `@dimforge/rapier3d-compat` | `packages/game-runtime/package.json:17` | Optional peer. Regular dependency of the `game` pack. The import is already dynamic (`packages/game-runtime/src/spatial3d/world.ts:11`). |
| `sandbox-compiler` → `esbuild` | `packages/sandbox-compiler/package.json:25` | Optional peer. Needed only by `nodetool packs compile`. |
| `data-nodes` → `@napi-rs/canvas`, `chart.js` | `packages/data-nodes/package.json:18,23` | `chart.js` stays a dependency (D16). `@napi-rs/canvas` becomes an optional peer. The chart node already imports it dynamically (`packages/data-nodes/src/nodes/lib-charts.ts:162-167`). |

D11. One new edge is required. `packages/cli/src/run-dsl.ts:11` imports
`tsx/esm/api`, but `tsx` is only a dev dependency (`package.json:232`,
`packages/dsl/package.json:54`). A clean install cannot run a DSL file through
that path. `tsx` becomes a regular dependency of `cli` (10.9 MB, 4 packages).
The two `npx tsx` calls (`packages/cli/src/nodetool-main.ts:586`,
`packages/cli/src/debug/target.ts:49`) are replaced by in-process `tsImport`.
`npx` fetches `tsx` from the registry when it is absent, which is an install
without consent.

### 6.2 Source import edges

A static scan of `src/` in every core package (tests excluded) found these
imports of node packs. A load-time trace confirmed which ones run on module
load: it imported each core package with a Node resolve hook and logged every
pack or heavy-library specifier.

| Import | Kind | Cut |
|---|---|---|
| `packages/cli/src/nodetool-main.ts:46`, `packages/cli/src/node-registry.ts:15` → `base-nodes/builtin-packs` | static | Replace `registerBuiltinPacks` with the catalog pack loader (section 12). |
| `packages/cli/src/providers.ts:38-39` → `transformers-js-provider`, `whisper-cpp` | static | Register each provider only when its pack is installed. |
| `packages/cli/src/commands/timeline-render.ts:267-430` → `video-nodes/nodes/timeline/*` | dynamic | `importPack("video", subpath)`. The type import at `:12` is erased. |
| `packages/cli/src/commands/game.ts:419-637`, `game-smoke.ts:11` → `game-renderer` | dynamic | `importRuntimeLibrary("game-renderer", subpath)`. |
| `packages/agents/src/capabilities/model3d.ts:28`, `timeline-bake.ts:22` → `blender-nodes` | static, inside a lazily loaded capability module | `importPack("blender")`. The capability returns `missing_pack`. |
| `packages/agents/src/timeline-preview/model3d.ts:32,161` → `video-nodes/nodes/model3d/*` | static and dynamic | `importPack("video", subpath)`. |
| `packages/agents/src/capabilities/game*.ts` → `game-nodes`, `game-renderer` | dynamic | `importPack("game")`, `importRuntimeLibrary("game-renderer")`. |
| `packages/agents/src/analysis/media-decode.ts:16`, `mediabunny-runtime.ts:12`, `sandbox-av-media.ts:22` → `mediabunny` | static | Keep. `mediabunny` is core (D16). |
| `@napi-rs/canvas` static imports in `agents` (`capabilities/agentic-storyboard-finish.ts:2`, `derive-shot.ts:13`, `storyboard-layout-check.ts:1`, `timeline-clip-frames.ts:1`, `evals/surfaces/sketch.ts:33`, `timeline-preview/compare.ts:16`, `frames.ts:23`, `model3d.ts:23`, `rasterize.ts:17`, `sheet.ts:14`) and `timeline` (`fonts/google-fonts-node.ts:15`, `fonts/register-node.ts:18`) | static | One `loadCanvas()` helper that throws `missingRuntimePackageError`. The trace shows `evals/surfaces/sketch.js` and the timeline font modules load on `import "@nodetool-ai/agents"`, so these block startup today. |
| `packages/websocket/src/node-registry-setup.ts:33` → `base-nodes/builtin-packs` | static | The server takes a pack source: `bundled` (desktop, Docker: `base-nodes` registrars) or `installed` (CLI: catalog loader). |
| `packages/websocket/src/server.ts:28-30` → `transformers-js-provider`, `whisper-cpp`, `base-nodes` (`setCodeNodeAgentsModule`) | static | Providers register only when installed. Import `setCodeNodeAgentsModule` from `code-nodes`, which stays core. |
| `packages/websocket/src/routes/nodes.ts:10` → `base-nodes` (`resolveComfyWorkflow`, `resolveKieDynamicSchema`) | static | `importPack("integration")`. The route returns `missing_pack`. |
| `packages/websocket/src/routes/documents.ts:17` → `document-nodes/lib/pdf-text` | static | `importPack("document", "lib/pdf-text")`. The route already handles `missingRuntimePackageOf` (`:16`). |
| `packages/websocket/src/triggers/file-watch.ts:35` → `automation-nodes` | static | Extract the file-watch predicates into core (`protocol` or `websocket`). They are pure functions. |
| `packages/websocket/src/trpc/routers/games.ts:9` → `game-renderer/preparation3d` | static | `importRuntimeLibrary("game-renderer")`. |
| `packages/websocket/src/routes/kie-pricing.ts:7` → `kie-nodes/kie-pricing-api` | static | Move `kie-pricing-api.ts` into `model-pricing`. It has no imports. |
| `packages/websocket/src/trpc/routers/models.ts:7,44` → `whisper-cpp`, `transformers-js-nodes` | static | Lazy. Return empty model lists with a pack hint when absent. |
| `packages/websocket/src/model-download-runtime.ts:16`, `routes/games.ts:110` | dynamic | Pack import with `missing_pack`. |
| `packages/dsl/src/export.ts:1`, `script-export.ts:22` → `ALL_BASE_NODES` | static | Read metadata from `@nodetool-ai/node-catalog`. `buildFactoryRefs` (`export.ts:116`) and `builtinMetadataFor` (`script-export.ts:228`) need metadata only, not classes. |
| `packages/dsl/src/registry.ts:30-69` → `base-nodes` and six packs | dynamic | Use the catalog pack loader. Catalog-only types are never Python candidates (section 10). |
| `packages/model-pricing/src/index.ts:46-47` | static | See 6.1. |
| `packages/websocket/src/lib/thumbnail.ts:29`, `mcp-agent-tools.ts:87`, `screenshot-docs-seed.ts:26`, `trpc/routers/games.ts:4` → `sharp` | static | Route through `runtime/src/image-codec.ts`, which already imports `sharp` dynamically. |
| `packages/runtime/src/run-trace-processor.ts:3` → `@opentelemetry/resources` | static | Lazy. Load only when a trace sink is configured. |
| `packages/sandbox-compiler/src/bundle.ts:17` → `esbuild` | static | Lazy. |

### 6.3 Loader helpers

Two helpers live in core. They are the only way core code reaches a pack or a
runtime library.

```ts
// @nodetool-ai/node-catalog
export function importPack<T>(packId: string, subpath?: string): Promise<T>;
export function importRuntimeLibrary<T>(libraryId: string, subpath?: string): Promise<T>;
```

Each resolves the npm name from the catalog, calls `importOptionalModule`
(`packages/config/src/optional-modules.ts:12`), and maps a module-not-found
error for that package to a `MissingPackError` carrying the `missing_pack`
payload (section 12.2). Other errors propagate. A lint rule forbids direct
imports of node packs from core packages, and the clean-core tests in 6.4 prove
it at runtime.

### 6.4 Clean-core tests

The monorepo tree contains every pack, so in-repo Jest cannot prove the cut.
`scripts/smoke-packed-cli.mjs` already installs packed tarballs into an empty
project and runs the CLI against an empty HOME. It gains a core-only variant
that installs the CLI tarball with no pack tarballs available:

1. `nodetool --help` lists every command, including those that need packs.
2. `node -e 'import("@nodetool-ai/dsl")'` from the install root succeeds.
3. `nodetool run examples/workflows/concat_text.ts` succeeds (DSL through `tsx`).
4. `nodetool workflows run` on a core-node JSON workflow succeeds.
5. `nodetool serve` answers `GET /health`.
6. `nodetool mcp serve` answers `initialize`, lists tools, and runs a core-node
   workflow through `execute_code`.
7. `nodetool validate` on a `fal.*` workflow reports `pack_not_installed` and
   runs property validation on the `fal.*` node.
8. `nodetool run` on that workflow exits 3 and prints the `missing_pack` JSON
   with `--json`.
9. A guard asserts that no `@nodetool-ai/*` node pack and none of the runtime
   libraries in section 4 exist under the install's `node_modules`. The check
   fails on a deliberately added pack before it is enforced.

## 7. Shared third-party identity (F4)

`ensureCodecs` (`packages/agents/src/analysis/mediabunny-runtime.ts:21-32`)
registers the `@mediabunny/server` codecs into whatever `mediabunny` instance
the server package resolves. `inputFrom` (`:35`) creates inputs with the
instance that `agents` resolves. The installed `@mediabunny/server` declares
`mediabunny` as a peer. Two instances mean codecs register on one and inputs
open on the other.

D12. A shared-identity library is a package whose module instance two
installed packages must share. The catalog marks it (`shared: true`). The rules:

1. Core and packs resolve shared-identity libraries from one tree (D1).
2. The catalog pins each shared-identity library to one exact version and
   integrity. Core declares it as an exact optional peer.
3. The installer refuses a plan that adds a second copy (section 14.5).
4. After install, the installer resolves the library from each dependent
   package directory and requires one realpath (section 14.6).
5. `mediabunny` and `@mediabunny/server` are regular dependencies of
   `agents` (D16), so one tree holds both.

Test: in the packed-tarball smoke, call `ensureCodecs()` and decode the first audio frame and the first video frame of
a checked-in fixture through `inputFrom`. The test asserts decoded sample
counts and frame dimensions, not only a successful import.

## 8. Size measurement and budget (F12)

### 8.1 Method

A read-only walker starts at the core workspace packages and follows
`dependencies`, `optionalDependencies`, and non-optional `peerDependencies`. It
resolves each name with Node's `node_modules` lookup from the dependent's real
directory. Workspace edges outside the core tier are not followed. Each
external package directory counts once, excluding its nested `node_modules`.
Workspace packages count `dist/`, `package.json`, and `README.md`, which match
their `files` fields. Apparent size sums `st_size`. Disk usage sums
`st_blocks × 512`. The tree is the local darwin-arm64 checkout with Node 24.

Step 1 commits this walker as a script so that CI can rerun it.

### 8.2 Results (local-tree estimates)

Run `npm run measure:cli-closure -- --json` for the current closure and
projected core. The walker rejects an incomplete dependency tree.

| Scenario | Apparent | Disk |
|---|---|---|
| S0: CLI closure with the prerequisite changes | 686 MB | 838 MB |
| S3: projected core with the section 6.1 cuts and D16 libraries | 453 MB | 586 MB |

These are local darwin-arm64 estimates. A9 sets the release gate from a clean
linux-x64 core-only install, with five percent headroom.

D16 cancels three cuts in the table below (`@hyzyla/pdfium`, `mediabunny`,
`chart.js`) and keeps `webgpu` and `node-av` in core. On the local tree the
five core additions use about 170 MB of disk: `webgpu` 68 MB, `node-av` with
its platform package 64 MB, `werift` 11 MB, `mediabunny` 11 MB,
`@hyzyla/pdfium` 11 MB, `chart.js` 6 MB. `node-web-audio-api` (41 MB) moves
with the `audio` pack. The projections in 8.3 and the gate in 8.4 predate D16.

Savings of each cut, measured on top of S1:

| Cut | Apparent | Disk |
|---|---|---|
| OpenTelemetry SDK packages | 30.2 MB | 47.3 MB |
| `@napi-rs/canvas` | 25.2 MB | 25.3 MB |
| `typescript` | 23.3 MB | 23.6 MB |
| `js-tiktoken` | 21.4 MB | 21.5 MB |
| `sharp` and `@img/*` | 18.3 MB | 18.4 MB |
| `@hyzyla/pdfium` | 10.8 MB | 10.8 MB |
| `esbuild` | 10.3 MB | 10.3 MB |
| `mediabunny` | 9.8 MB | 10.4 MB |
| `@dimforge/rapier3d-compat` | 7.9 MB | 8.0 MB |
| `chart.js` | 6.0 MB | 6.3 MB |

### 8.3 Adjustments for a clean install

| Adjustment | Apparent | Disk |
|---|---|---|
| `better-sqlite3`: the local tree holds a source build (17 MB `build/`), a prebuilt install holds one 1.9 MB `.node` file | −15 MB | −15 MB |
| Source maps in core `dist/` (do not publish `*.map`) | −16 MB | −27 MB |
| `tsx` added (D11) | +11 MB | +11 MB |
| Projected clean core | about 213 MB | about 314 MB |

The largest remaining items in S3: `better-sqlite3` (26.5 MB locally),
`drizzle-orm` (9.9 MB), `openai` (9.3 MB),
`@mixmark-io/domino` via `turndown` (7.4 MB), `@anthropic-ai/sdk` (6.1 MB), and
NodeTool's own `dist/` (50 MB apparent: 16 MB JavaScript, 15 MB maps, 14 MB
declarations).

### 8.4 Budget

D13. The gate measures `du -sk node_modules` after a clean
`npm install <cli tarball>` in an empty project on linux-x64 in CI.

- Hard gate at the end of step 1: the walker's measurement of the D16 core.
  The earlier 320 MB figure excludes the D16 libraries.
- Ratchet target for a later release: 250 MB disk. It needs fewer declaration
  files in runtime-only packages and lazy provider SDKs. The fs-safe dependency
  has already been removed.

The previous 200 MB goal is not reachable with SQLite, the LLM provider SDKs,
the MCP SDK, and Fastify in core. The check must fail on a deliberately
oversized fixture before it is enforced.

## 9. The node catalog (D3, F8)

`@nodetool-ai/node-catalog` is a new core package. It holds:

- `index.json`: pack entries and the exact owner map. Runtime library ids use
  `RUNTIME_NPM_PACKAGES` from `protocol` (D17).
- `data/nodes.ndjson`: checked-in metadata, one node per line, sorted by
  `node_type` (D21). The package build writes `dist/nodes.ndjson.gz`.

Run `npm run generate:node-catalog` to rebuild the catalog and report its node
count. Run `npm run measure:cli-closure` to measure package sizes.

### 9.1 Format

```ts
interface NodeCatalogIndex {
  schemaVersion: 1;
  coreVersion: string;                       // equals the CLI version
  packs: CatalogPack[];
  owners: Record<string, string>;            // node_type -> pack id, total
}

interface PinnedPackage {
  name: string;
  version: string;                           // exact
  integrity: string;                         // sha512 of the published tarball
}

interface CatalogPack {
  id: string;                                // stable id, including split domain packs
  kind: "core" | "node-pack";
  npm: PinnedPackage;                        // version === coreVersion
  registrar: string;                         // named export, called with the registry
  provides: readonly string[];               // first-party packages carried by this pack (D18)
  requires: readonly string[];               // other pack ids
  runtimeLibraries: readonly string[];
  secrets: readonly string[];                // e.g. ["FAL_API_KEY"]
  scriptAllowlist: readonly PinnedPackage[]; // closure packages allowed to run install scripts
  installBytes: number;                      // disk, linux-x64, measured by the release job
  nodeCount: number;
}

interface CatalogNode {
  node_type: string;
  pack: string;
  metadata: NodeMetadata;                    // final registrar output
  declared: readonly DeclaredPropertyMetadata[];      // input to validateNodeProperties
}
```

### 9.2 Generation

`scripts/generate-node-catalog.mjs` runs in a child process with a fixed
environment (an empty temporary home directory, no inherited secrets,
`NODE_ENV=production`):

1. For each pack, create a fresh `NodeRegistry`, call the pack's registrar, and
   record the registered types as that pack's ownership. Registrars are the
   source, not namespace prefixes. The core and audio registrars apply the
   compatibility metadata overrides (D19).
2. Fail when two packs register the same type (duplicate ownership).
3. Read `getMetadata()` and the class's declared properties for each type.
   Fail when a declared property holds a value that JSON cannot represent.
4. Sort packs by id, nodes by `node_type`, and object keys. Omit timestamps.
5. Write `data/index.json` and `data/nodes.ndjson`. The package build gzips
   the node file with level 9 and a zero mtime, and copies the index into `dist/`.

Pins (`integrity`, `installBytes`) and script allowlists come from the release
job (section 17). The repository file holds empty integrity strings, zero
install sizes and empty script allowlists that the release job replaces.

`npm run check:node-catalog` regenerates the catalog and diffs it. It fails on
any difference and asserts that it compared more than zero node types. Add it
to `test:affected` path checks and to the harness registry
(`packages/cli/src/harness/registry.ts`) for changes under node packages.

Namespace prefixes stay for display and search only. `findBuiltinPackForNodeType`
(`packages/protocol/src/builtin-packs.ts`) picks the first matching
namespace. `nodetool.control.If` (`core-nodes`), `nodetool.text.Concat`
(`text-nodes`), and `nodetool.game.SpriteSheet` (`image-nodes`) all start with
`nodetool`, and `kie` appears in both the `base` and the `kie` pack. The CLI
uses `owners` instead.

## 10. Catalog-only nodes (D6, F9)

### 10.1 Origin and availability

`NodeMetadataSource` (`packages/node-sdk/src/registry.ts:28-32`) gains the
value `"catalog"`. `NodeRegistry` gains:

```ts
type NodeAvailability = "executable" | "catalog" | "python" | "unknown";

loadCatalog(entries: Iterable<CatalogNode>): void;   // source "catalog", packageId = pack id
availability(nodeType: string): NodeAvailability;
catalogEntry(nodeType: string): CatalogNode | undefined;
```

- `executable`: a class is registered. `has()` keeps its meaning (`:328`).
- `catalog`: catalog metadata, no class.
- `python`: metadata from `"python-package"` or `"python-bridge"`, no class.
- `unknown`: neither.

A registered class always wins over catalog metadata for the same type.

### 10.2 Call sites that must change

| Site | Today | Change |
|---|---|---|
| `packages/node-sdk/src/registry.ts:197` `validateNode` | Returns `[]` without a class | For `catalog`, call `validateNodeProperties` (`packages/node-sdk/src/validation.ts:167`) with `catalogEntry().declared` |
| `packages/node-sdk/src/graph-validation.ts:1398` | `unknown_node` when `!has()` | For `catalog`, emit `pack_not_installed` with pack id, size, and install command |
| `packages/node-sdk/src/graph-validation.ts:1444`, `:940`, `:1539` | Skip checks when `!has()` | Run property and edge checks for `catalog` from metadata |
| `packages/execution/src/service/workflow-run.ts:805-812` | `getMetadata && !has` means Python | Use `availability() === "python"` |
| `packages/websocket/src/plugins/websocket.ts:128`, `:163`, `packages/websocket/src/http-api.ts:381` | Same Python test | Use `availability() === "python"` |
| `packages/dsl/src/registry.ts:84-89`, `:107-113` | No TS class means Python candidate | Exclude `catalog` |
| `packages/execution/src/executor-resolver.ts:21-27` | Falls back to the Python executor | Throw `MissingPackError` for `catalog` |
| `packages/execution/src/session.ts:287` `hasTsExecutor` | `has()` | Unchanged. Catalog types never reach execution (section 12) |

No pack overrides `validateProperties` today (no `static validateProperties`
outside `node-sdk`). A parity test runs fixture property bags through the
class validator and the catalog validator for every node type in the catalog
and requires equal issue lists. Another test builds a graph with an unloaded
TypeScript node with invalid properties. It asserts the property issues and
asserts that `ensurePythonBridge` is never called.

## 11. Install layout (D1)

### 11.1 Install modes

The CLI finds its package root (`cliRoot`, the directory whose `package.json`
names `@nodetool-ai/cli`) from the realpath of its entry file.

| Mode | Detection | Install root | npm save mode |
|---|---|---|---|
| `global` | `dirname(cliRoot)` is `<npm root -g>/@nodetool-ai` | `cliRoot` | `--no-save`, full desired set every time |
| `local` | `cliRoot` is `<X>/node_modules/@nodetool-ai/cli` and `<X>/package.json` lists `@nodetool-ai/cli` | `<X>` | `--save --save-exact` |
| `npx` | `cliRoot` contains a `_npx` path segment | none | unsupported |
| `dev` | `cliRoot` is not under `node_modules` (workspace checkout) | none | packs are workspaces, nothing to install |
| `unsupported` | `.pnpm` in the path, a Yarn PnP file, a Bun global directory, or a local install that the project does not list | none | unsupported |

`npm root -g` runs only in `packs` commands and in the installer, never at
startup.

For `npx`, `unsupported`, and `dev`, the `missing_pack` payload sets
`install.supported: false` and a reason. For `npx` the text is:
`Packs need a global or local install. Run "npm install -g @nodetool-ai/cli" or "npm install @nodetool-ai/cli" in a project.`
This answers Q5. The CLI never writes into the npx cache.

### 11.2 Why the CLI package directory, not the global prefix

These experiments ran in a scratch directory against a local test registry
with three tiny packages: `cli` depends on `core`, and `pack-a` and `pack-b`
declare `core` as a peer. Each ran on npm 10.9.8 (Node 22.22.3) and npm 11.16.0
(Node 24.18.0) on macOS. The results matched.

- E1. `npm install -g pack-a` next to a global `cli` installs a second copy of
  `core` at `<prefix>/lib/node_modules/pack-a/node_modules/core`. Each global
  package is its own npm project. A separate global pack install breaks module
  identity.
- E2. `npm install --no-save pack-a` with the CLI package directory as the
  working directory places `pack-a` beside `core` and resolves its peer to the
  existing copy. No `package.json` or `package-lock.json` changes.
- E3. A following `npm install --no-save pack-b` removes `pack-a` ("added 1
  package, and removed 1 package"). The installer must pass every desired pack
  in every call.
- E4. A reinstall with `npm install -g cli` removes every pack from the CLI
  directory.
- E5. In a local project, `npm install --save-exact pack-a` records the pack in
  the project's `package.json` and resolves its peer to the hoisted `core`.

E4 means a global CLI upgrade removes packs. Section 13.3 handles restoring
them.

### 11.3 State

D14. The installed set is what exists in the tree. On start the CLI reads
`<root>/node_modules/@nodetool-ai/` once and keeps the entries that the catalog
lists with `version === coreVersion`. A pack with another version is ignored
and reported by `packs doctor`.

The desired set lives in `<data dir>/cli-packs.json`, keyed by the realpath of
the install root: `{ root, coreVersion, packs: string[], runtimeLibraries: string[] }`.
The data directory is the one the CLI resolves for its database. Writes are
atomic (temporary file and rename) under the install lock. The file records
what the user asked for. It never authorizes an install.

## 12. Missing-pack resolution (D4)

### 12.1 Before a run

At start the CLI registers core node classes, then the registrars of installed
packs, then catalog entries for every other type (section 10). Commands that
need no registry skip this.

```ts
function findMissingPacks(graph: GraphInput, registry: NodeRegistry): MissingPackSet;
```

It walks every node type in the graph, including nodes inside embedded
subgraphs and the graphs of referenced sub-workflows loaded through the same
lookup the run uses. Each `catalog` type maps to its pack through `owners`,
plus the transitive `requires` and runtime libraries. `findMissingPacks` runs
inside the execution preflight that already returns structured errors
(`packages/execution/src/service/workflow-run.ts:795-804`), so every entry
point gets it: `run`, `debug`, `node run`, `workflows run`, the HTTP and
WebSocket run handlers, and `run_workflow` inside MCP.

The CLI then applies the install policy (section 13). If it installs, it
re-executes (section 16). Otherwise it fails with `missing_pack`. A DSL file
builds its graph first and goes through the same check. A DSL file that imports
a pack package directly fails inside `tsImport` with a module-not-found error
for a catalog npm name. The CLI maps it to `missing_pack`.

Calls that pick a node type at run time cannot be scanned: CodeAct
`invoke_node` and `open_node_stream`, `run_node`, and agent control tools. They
return `missing_pack` as a structured tool error to the agent. The run
continues. Nothing retries (F10). A lazily loaded runtime library behaves the
same way through `importRuntimeLibrary`.

### 12.2 The `missing_pack` error (Q1)

```json
{
  "error": "missing_pack",
  "packs": [
    { "id": "fal", "npm": "@nodetool-ai/fal-nodes", "version": "0.8.3", "installBytes": 12582912, "requires": [] }
  ],
  "runtimeLibraries": [],
  "nodeTypes": ["fal.image.FluxDev"],
  "install": { "supported": true, "reason": null, "command": "nodetool packs add fal" },
  "restartRequired": false
}
```

| Surface | Form |
|---|---|
| CLI run commands | stderr text, the JSON above with `--json`, exit code 3 |
| `nodetool validate` | `pack_not_installed` issues. Exit 3 when every error is `pack_not_installed`, else exit 1 |
| HTTP run endpoints | status 424 with a preflight detail of kind `missing_pack` |
| WebSocket run | a job error message with the same payload |
| MCP | a tool result with `isError: true` and the payload as structured content. `restartRequired: true`, because a running MCP server cannot load new packs |

No production code in `packages/cli/src` assigns exit code 3. It uses 0, 1,
130, and 143. `packages/cli/src/child-exit.ts:15` forwards any child status, so
`serve` and `chat` can pass a 3 from a child. Callers must check the
`missing_pack` discriminator, not the exit code alone.

## 13. Install authorization (D5, F1, Q3)

### 13.1 Sources

An install proceeds only with one of these:

1. An explicit `nodetool packs add <id...>` or `packs add --restore`.
2. `--install-missing` on `run`, `debug`, `node run`, or `workflows run`.
3. `NODETOOL_AUTO_INSTALL=1` in the environment of those commands.
4. An interactive prompt, when stdin and stderr are TTYs and `CI` is unset. The
   default answer is No.

The prompt names each pack and runtime library with version and size, the
packages that will run install scripts, and the files that change in local
mode (`package.json`, `package-lock.json`).

`serve`, `mcp serve`, the headless job runner, chat, and every agent tool never
install. They ignore `NODETOOL_AUTO_INSTALL` and return `missing_pack`.

### 13.2 Enforcement inside the installer

The permission gate cannot carry this. `decidePermission` allows every
category in `auto` mode (`packages/runtime/src/permission-gate.ts:57-59`), and
`headlessGate()` returns mode `auto` (`:197`). MCP uses it
(`packages/websocket/src/mcp-agent-tools.ts:367`).

- The installer lives in `packages/cli`. No package that `websocket`, `agents`,
  or `runtime` depends on exports it.
- `installPacks(request, authorization)` requires an `InstallAuthorization`
  value. Only the CLI command layer constructs it, with the source, the exact
  pack and runtime library ids, and the script allowlist the user saw.
- The installer rejects a request for any id outside the authorization.
- The `serve` and `mcp serve` entry points set a process flag. The installer
  refuses to run in a process with that flag.
- There is no `packs.install` capability. The agent-facing `packs` capability
  module stays limited to sandbox packages.

### 13.3 Upgrades and restore

After a global CLI upgrade, the new CLI finds the previous desired set in
`cli-packs.json` and packs missing from the tree (E4). It prints one stderr
line: `2 packs from 0.8.3 are not installed for 0.8.4: fal, video. Run "nodetool packs add --restore".`

The CLI never reinstalls without authorization from 13.1. In a run with
`--install-missing` or `NODETOOL_AUTO_INSTALL=1`, it installs only what that
graph needs. The desired set records intent. It never authorizes new install
scripts or new runtime libraries. When a restore would run scripts from
packages not in the previous version's allowlist, the prompt lists them.

## 14. The installer

### 14.1 npm

- Use the npm that ships with the running Node: `npm-cli.js` beside
  `process.execPath` (`../lib/node_modules/npm/bin/npm-cli.js` on Unix,
  `node_modules/npm/bin/npm-cli.js` on Windows), run with `process.execPath`.
  Fall back to `npm` on `PATH`. On Windows, never spawn `npm.cmd` through a
  shell.
- D15. Minimum npm 10.9.0. Supported and tested: 10.9.x and 11.x (section
  19.3). The installer refuses older versions with an upgrade command. It warns
  on npm 12 or later.
- The installer rejects `--preserve-symlinks` and `--preserve-symlinks-main` in
  `process.execArgv` and `NODE_OPTIONS`, because they change module identity.

### 14.2 Flags

Forced on every call as command-line flags, which take precedence over
`.npmrc` files and `npm_config_*` environment variables:

```
--ignore-scripts --omit=dev --include=prod --include=optional
--strict-peer-deps --legacy-peer-deps=false --install-strategy=hoisted
--prefer-dedupe --package-lock=true --global=false --workspaces=false
--force=false --dry-run=false --no-audit --no-fund --update-notifier=false
```

Plus, by mode:

- `global`: `--no-save`, working directory `cliRoot`, and every desired pack
  and runtime library spec in each call (E3).
- `local`: `--save --save-exact --save-prod`, working directory the project
  root.

Honored user configuration: `registry`, scoped registries, auth tokens, `proxy`,
`https-proxy`, `noproxy`, `ca`, `cafile`, `cert`, `key`, `strict-ssl`, `cache`,
`offline`, `prefer-offline`, the `fetch-*` retry and timeout settings,
`maxsockets`, `userconfig`, and `globalconfig`. A corporate mirror works
because verification uses content integrity, not the registry host.

### 14.3 Lock

One lock per install root: `<root>/node_modules/.nodetool-packs.lock`, created
with exclusive create (`wx`). It holds the pid, host name, a random token, and
the start time. The owner rewrites its mtime every 5 seconds. Another installer
waits up to 10 minutes and prints a line every 10 seconds. A lock with an mtime
older than 60 seconds is stale and is removed. Creation, stale removal and
release are serialized through a short-lived sibling `.guard` directory. The
guard is never stolen, because deleting a replacement owner’s lock can admit
concurrent installers. If its owner stops while holding the guard, installation
times out and names the directory to remove after confirming that owner stopped. A user's own concurrent `npm`
command is not covered. `packs doctor` detects its effects.

### 14.4 Flow

1. Detect the mode (11.1). Stop for `npx`, `dev`, and `unsupported`.
2. Check the authorization (13.2) and the npm version (14.1).
3. Expand the request with `requires` and runtime libraries. Compute the new
   desired set.
4. Take the lock.
5. Snapshot the tree: every installed package's path, name, version, and
   integrity from `node_modules/.package-lock.json`.
6. Plan with `npm install --dry-run` and the same flags and specs (14.5).
7. Run `npm install` with `--ignore-scripts`.
8. Verify the tree (14.6). No install script and no pack import has run yet.
9. Run install scripts only for allowlisted packages present in the new set:
   `npm rebuild <name> --ignore-scripts=false --foreground-scripts`. Each must
   match its pinned version and integrity.
10. Load-check in a child process:
    `nodetool packs doctor --installed --json --pack <ids>`. It registers each
    new pack in a fresh registry, compares the owned types with the catalog,
    and checks that the pack resolves `@nodetool-ai/node-sdk` to the core's
    realpath.
11. Write `cli-packs.json`. Release the lock.
12. Re-execute or print the restart notice (section 16).

### 14.5 Plan check

npm 11 prints `add`, `change`, and `remove` arrays with `--dry-run --json`.
npm 10.9.8 prints only counts in JSON. Both print `add <name> <version>`,
`remove <name> <version>`, and `change` lines in text form. The installer
parses the text lines on npm 10 and the arrays on npm 11. A unit test pins both
formats.

The plan is refused when:

- It changes or removes any package that exists before the install, except the
  packages a `packs remove` request owns exclusively.
- It adds a core package or a second copy of a shared-identity library.
- It adds an `@nodetool-ai` package whose version differs from the core
  version.

Installs are therefore additive. A running `serve` process keeps working,
because no file it loaded changes.

### 14.6 Verification (F5)

Before any install script or import:

1. Every `@nodetool-ai` package in the tree has the core version, and each core
   package exists exactly once.
2. The integrity of each installed pack, each allowlisted script package, and
   each shared-identity library equals the catalog pin. The installer reads
   integrity from `node_modules/.package-lock.json` and fails when it is
   missing.
3. The tree diff against the snapshot contains only additions (14.5).
4. Each shared-identity library resolves to one realpath from every dependent
   (D12).

Other third-party packages float within their declared ranges, as they do for
the core CLI install today (R1).

### 14.7 Rollback

A failure in steps 7 to 10 triggers rollback:

- `global`: rerun `npm install --no-save` with the previous desired set, which
  removes the added packages (E3).
- `local`: `npm uninstall --save` for the added specs.

Then the installer compares the tree with the snapshot. When it matches, the
installer releases the lock and exits 1 with the original error. When it does
not match, `cli-packs.json` records `dirty: true`, and every later start prints
a one-line pointer to `nodetool packs doctor --repair`.

## 15. Command surface

`nodetool packs` exists today with `compile` for sandbox packs
(`packages/cli/src/commands/packs.ts:21`). The new verbs join it (Q6).

```
nodetool packs list [--json]              id, kind, installed, version, size, node count, required by
nodetool packs add <id...> [--yes]        install packs or runtime libraries with their requirements
nodetool packs add --restore              install the desired set recorded for this root
nodetool packs add --for <workflow|file>  install every pack one graph needs
nodetool packs remove <id...>             remove, keeping packs that another installed pack requires
nodetool packs doctor [--json] [--repair] mode, npm version, versions, integrity, single copies, registration, dirty state
nodetool packs why <node_type|id>         owner pack, requirements, runtime libraries, installed state
nodetool packs compile                    unchanged (sandbox packs)

nodetool run|debug|node run|workflows run ... --install-missing
```

`--yes` on `packs add` skips the prompt. The explicit command is the
authorization. `packs remove` warns that running `serve` and `mcp serve`
processes may fail on a later lazy import from the removed pack.

## 16. Process model and caches (D2, Q4)

After an install from `run`, `debug`, `node run`, or `workflows run`, the CLI
re-executes: `spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)])`
with inherited stdio and `NODETOOL_PACKS_REEXEC=1`. It exits with
`childExitCode` (`packages/cli/src/child-exit.ts:12`). A re-executed process
never installs. If packs are still missing, it exits 3.

`packs add` from a terminal prints:
`Restart running "nodetool serve" and "nodetool mcp serve" processes to load fal.`

Because of re-exec, no cache needs a refresh path. These are the snapshots
that a long-running `serve` or `mcp serve` keeps, which is why they need a
restart:

| Cache | Location |
|---|---|
| DSL builtin registry promise | `packages/dsl/src/registry.ts:13,23-26` |
| DSL factory references and script-export metadata | `packages/dsl/src/export.ts:107-114`, `packages/dsl/src/script-export.ts:226-235`. Catalog-backed after the cut, so they stop depending on installed packs. |
| CLI validation registry | `packages/cli/src/validate/index.ts:45-51` |
| Sandbox module catalog | `packages/websocket/src/sandbox-catalog.ts:34-40` (`refreshSandboxCatalog`), `packages/cli/src/sandbox-catalog.ts` |
| Provider registry (packs register local providers) | `packages/runtime/src/providers/provider-registry.ts:39` |
| Mediabunny codec registration, which also memoizes a rejected promise | `packages/agents/src/analysis/mediabunny-runtime.ts:18-31` |
| Optional-module fallback directory | `packages/config/src/optional-modules.ts:39`, read per call |

Registry metadata and search caches invalidate on mutation
(`packages/node-sdk/src/registry.ts` revision counter). REST and tRPC metadata
endpoints read the registry per request. MCP builds a fixed capability list,
not one tool per node.

## 17. Publishing (D7, F13)

1. Remove `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`
   (`.github/workflows/publish.yaml:96`). Configure npm trusted publishing
   (OIDC) for every package. The workflow already grants `id-token: write`
   (`:19`). Delete the `NPM_TOKEN` secret.
2. Pack each package once. Publish the tarball files, not directories, so the
   bytes that CI pinned are the bytes on the registry.
3. Order: build, pack the node packs, compute pins, generate `node-catalog`
   with the pins, pack the core packages, run the packed smoke tests (core-only
   and with packs), publish everything under the dist-tag `staging`.
4. Verify for every catalog pack and runtime library pin: `npm view
   <name>@<version> dist.integrity` equals the pin, and a provenance
   attestation exists whose source repository is `nodetool-ai/nodetool` and
   whose workflow is `publish.yaml`. Then install the CLI from the registry
   with `staging` and run one pack install.
5. Promote with `npm dist-tag add <name>@<version> latest` for every package,
   the CLI last. A failure in step 4 leaves `latest` unchanged.

`unmetDeps` in `scripts/publish-packages.mjs:180` blocks a package only on its
declared dependencies. Once packs leave the CLI's dependencies, step 4 is the
gate that keeps the catalog from advertising a missing pack.

## 18. Security

| Threat | Control |
|---|---|
| An agent or a headless run installs code (F1) | Install authorization separate from the permission gate (13.2). No install capability. Server and MCP processes refuse. |
| A tampered or substituted pack tarball | Integrity pin from the catalog, which ships inside the provenance-attested core tarball (14.6, 17). |
| A malicious install script in a pack's closure | `--ignore-scripts` for every install. Allowlisted packages run scripts only after integrity verification, pinned to version and integrity (14.4 step 9). |
| A stolen long-lived publish token | OIDC-only publishing (17). |
| A partial release | Staging tag, verification, then promotion (17). |
| Implicit downloads | Remove the `npx tsx` calls (D11). The CLI never invokes `npx`. |
| Privilege escalation | The installer never runs `sudo`. EACCES on a root-owned prefix fails with instructions. |
| Third-party pack loader confusion | First-party packs carry no `nodetool` manifest field (D8). The third-party loader keeps its allowlist and reserved namespaces (`packages/node-sdk/src/pack-loader.ts:19-37`). |
| An install changes files under a running process | Additive plan check (14.5). |
| Drifting transitive dependencies | Residual risk R1. |

Every install prints one stderr line per installed package with name, version,
and whether it ran a script.

## 19. Test plan

### 19.1 Unit

- Catalog generator: ownership per registrar, duplicate ownership error,
  deterministic output, non-JSON property error, non-zero comparison.
- `availability()` for each origin. Validation parity (section 10.2). Python
  routing never sees `catalog` types.
- `findMissingPacks` over subgraphs, sub-workflows, `requires`, and runtime
  libraries.
- `missing_pack` payload and exit code per surface.
- Authorization matrix: each source, each refusing process, ids outside the
  authorization.
- Mode detection on Unix and Windows paths, including `_npx`, `.pnpm`, and a
  workspace checkout.
- npm flag builder, version check, and plan parser for npm 10 text and npm 11
  JSON output.
- Lock: exclusive create, heartbeat, stale removal.

### 19.2 Integration

- A local test registry fixture serves packuments for packed tarballs, as in
  the section 11.2 experiments. It runs the real installer against packed
  NodeTool tarballs without the public registry.
- Clean-core tests (6.4).
- Real decode with `media` (section 7).
- Re-exec: a TTY-simulated `run` with a missing pack installs, re-executes,
  and finishes with the child's exit code.
- Additive plan refusal: a fixture pack that requires a different version of
  an installed package is refused, and the tree is unchanged.
- Rollback: a fixture pack whose load check fails is removed, and the tree
  equals the snapshot.
- Each new gate (size budget, catalog drift, clean-core guard) fails on
  deliberately invalid input before it is enforced.

### 19.3 npm matrix (F11)

Run in CI on macOS arm64, Linux x64 (glibc), and Windows x64, each with
Node 22 (npm 10.9.x) and Node 24 (npm 11.x):

| Case | Expected |
|---|---|
| Global default prefix, add one pack | Pack beside core, one copy of each core package |
| Global, add a second pack | First pack stays (E3 avoided by full desired set) |
| Global custom prefix (`--prefix`, nvm) | Same as default |
| Global CLI reinstall | Packs gone, restore line printed (E4) |
| Local project, add and remove | `package.json` updated, user `npm ci` keeps the pack |
| `npx` | `missing_pack` with `install.supported: false` |
| pnpm and Yarn installs | `unsupported` with a message |
| `.npmrc` with `ignore-scripts=true`, `legacy-peer-deps=true`, `global=true`, `install-strategy=nested`, `omit=optional`, `package-lock=false` | Forced flags win. Allowlisted scripts still run. |
| Registry mirror with custom CA | Install succeeds, integrity matches |
| Offline with a warm cache | Install succeeds |
| Offline with a cold cache | Clear network error, tree unchanged |
| Two concurrent `packs add` | Second waits, both succeed |
| Install killed during `npm install` | `packs doctor` reports, `--repair` restores |
| Root-owned global prefix | EACCES message, no `sudo` |
| Windows long paths and the global `%APPDATA%\npm` layout | Mode detection and installs succeed |
| `NODE_OPTIONS=--preserve-symlinks` | Refused |

## 20. Migration plan

1. **Dependency cut and measurement.** No installer work.
   - Commit the walker from 8.1 and add a report-only size check to the packed
     smoke.
   - Generate `@nodetool-ai/node-catalog` with the drift check (section 9).
     DSL export and validation need it without packs.
   - Add catalog availability and the call-site changes (section 10).
   - Apply every cut in 6.1 and 6.2, add the loader helpers (6.3), and fix
     D11.
   - Add the core-only smoke variant (6.4). It installs a CI-built CLI tarball
     whose manifest has the node packs removed. The published CLI keeps its
     packs during this step, so users see no change.
   - Exit criteria: the core-only smoke passes, the size check reports at or
     below 320 MB disk (D13), and `npm run backend:smoke` passes for the
     desktop bundle.
2. **Publishing hardening** (can run beside step 1). OIDC-only, tarball
   publishing, staging tag, verification, and promotion (section 17).
3. **Pack loader.** Installed-pack discovery, catalog registration,
   `findMissingPacks`, `missing_pack`, and exit code 3. Users can install packs
   with plain npm in this step.
4. **Installer and `packs` commands** behind `NODETOOL_PACKS_INSTALLER=1`, with
   the npm matrix (19.3) in CI.
5. **Switch.** Remove the node packs from the CLI manifest. Enforce the size
   gate. Remove the installer flag. Update `docs/cli.md`.

## 21. Risks

- R1. Third-party transitive dependencies of packs float within their ranges.
  A new upstream release can change a pack's closure after the CLI ships. Only
  NodeTool packages, allowlisted script packages, and shared-identity libraries
  are pinned.
- R2. A global CLI upgrade removes packs (E4). The restore line and
  `packs add --restore` cover it, but an unattended upgrade leaves runs failing
  with `missing_pack` until someone authorizes a restore.
- R3. `packs remove` can break a running server on a later lazy import.
- R4. Moving a library to an optional peer removes it from the monorepo tree
  and the desktop bundle unless a pack depends on it (D9). `npm run
  backend:smoke` and `bundle-backend.mjs` must cover each moved library.
- R5. Making `sharp` optional removes thumbnails and image resizing from a
  core-only `serve` until `imaging` is installed.

## 22. Open questions

- Q6. `nodetool packs` already means sandbox pack tooling, and the agent
  capability `packs` lists sandbox packages. Keep one command for both kinds,
  or rename the new verbs to `nodetool nodes add` and similar?
- Q8. Should `llm-nodes` and `code-nodes` stay core? They have no heavy
  dependencies, and the Agent and Code nodes are common in core workflows.
- Q9. Local mode writes the user's `package.json` and lockfile. Is that
  acceptable, or should local mode require an explicit `npm install` and only
  print the command?

Q7 is resolved: chat compaction uses the existing character-count fallback
when the `tokenizer` runtime package is absent.

Q2 from the review becomes the matrix in 19.3. Q1, Q3, Q4, and Q5 are answered
in sections 12.2, 13.3, 16, and 11.1.
