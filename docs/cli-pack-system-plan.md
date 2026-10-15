# CLI Pack System Implementation Plan

**Design:** [CLI Pack System](cli-pack-system-design.md), called "the pack spec"
below. **Related:** [Runtime Install Design](runtime-install-design.md).

This plan turns the five migration steps of the pack spec (section 20) into
assignments. Each assignment names the assignments that block it, the files it
changes, the work, and its acceptance checks. Assignments A1 to A9 are the
step 1 items. A10 and later are new. Decisions D17 and later continue the
decision codes of the pack spec.

## 1. Execution rules

| Code | Rule |
|---|---|
| A0.1 | Start an assignment only when every assignment that blocks it is on `main`, unless the user explicitly authorizes dependent work on a fork of the prerequisite branch. Keep that work in a stacked PR. |
| A0.2 | Re-read the files in section 3 before you edit them. The line numbers in the pack spec date from its review. |
| A0.3 | Land each assignment as one commit, or as a series that is green at each commit. Run the [mandatory post-change verification](https://github.com/nodetool-ai/nodetool/blob/main/AGENTS.md#mandatory-post-change-verification) before each commit. |
| A0.4 | Run `npm run backend:smoke` for each assignment that changes a manifest, the server entry, or a lazy import. The desktop bundle flattens modules, so a cut can pass in the monorepo and fail in the artifact. |
| A0.5 | Make each new gate fail on deliberately invalid input before you enforce it (pack spec 19.2). |
| A0.6 | Do not change the published CLI until A24. Before A24, the CLI manifest keeps its node packs, and the installer stays behind `NODETOOL_PACKS_INSTALLER=1`. |
| A0.7 | When an assignment changes a decision, update the pack spec in the same commit. |

## 2. Plan decisions

The pack spec leaves these points open, or the code has changed since the
spec was written.

### D17. One registry for runtime libraries

The runtime library tier of the pack spec uses the ids of
`RUNTIME_NPM_PACKAGES` (`packages/protocol/src/runtime-npm-packages.ts`).
These rules apply:

- A missing library throws `missingRuntimePackageError`.
- `nodetool packs add` installs node packs or runtime library ids through
  the pinned, authorized installer. The existing `nodetool runtime add`
  remains available for compatibility.
- The catalog has no `CatalogRuntimeLibrary` entries. A pack lists runtime
  package ids in `runtimeLibraries`.
- No `importRuntimeLibrary` helper is built. Core code calls
  `importOptionalModule` and throws the runtime package error.

`3f9f9c2c98` loads `js-tiktoken` through the `tokenizer` id. The runtime id
registry and typed runtime errors remain shared. Node-pack management adds
those same ids to its pinned installation boundary.

| Pack spec library | Runtime package id |
|---|---|
| `imaging` (`sharp`, `@napi-rs/canvas`) | `imaging` (new) |
| `llama` | `node-llama-cpp` (exists) |
| `typescript` | `typescript` (new) |
| `tokenizer` | `tokenizer` (exists) |
| `tracing` (OpenTelemetry) | `tracing` (new) |
| `esbuild` (6.1 row, not in the tier list) | `esbuild` (new) |
| `@dimforge/rapier3d-compat` (optional physics peer) | `rapier` (new) |
| `game-renderer` | none, see D18 |

The desktop app and the Docker image bundle the new libraries. Their
registry entries name the hosts that bundle them. The desktop Package Manager
shows these entries as included and never offers an install.

### D18. First-party libraries belong to a pack

`game-renderer` becomes a regular dependency of `game-nodes`, so the `game`
pack carries it. `transformers-js-provider` belongs to the `transformers-js`
pack in the same way.

- `CatalogPack` gains `provides: string[]`. This is the list of first-party
  npm names in the pack closure other than the pack package itself.
- `importPack(packId, specifier?)` accepts a specifier under the pack's own
  name or under a `provides` name.
- `nodetool game`, the game capabilities and the games router return
  `missing_pack` for `game`.

A first-party package then never needs a runtime library pin that follows the
core version.

### D19. Each node package exports its own registrar

No domain node package exports a registrar today. `registerBaseNodes`
(`packages/base-nodes/src/index.ts`) registers the merged `ALL_BASE_NODES`
list. The generator in pack spec 9.2 needs one registrar per pack.

- Each domain node package exports `register<Name>Nodes(registry)` from its
  `src/index.ts`. The domain packages are `core`, `text`, `llm`, `code`,
  `data`, `document`, `image`, `audio`, `video`, `integration`, `automation`,
  `game`, `blender` and `manimgx`.
- The Workflow, App and Subgraph metadata overrides move into
  `registerCoreNodes`. Preview belongs to audio and its override moves into
  `registerAudioNodes`.
- `registerBaseNodes` calls the domain registrars in a staging registry and
  registers the resulting classes and metadata in the existing interleaved
  `ALL_BASE_NODES` order. The desktop app sees no change.

### D20. The bundled server entry moves to a private workspace

`packages/websocket/src/server.ts` imports `base-nodes`, the local providers
and `setCodeNodeAgentsModule` statically (`:28-30`).
`scripts/bundle-backend.mjs` bundles `packages/websocket/dist/server.js`.
After the cut, `websocket` cannot import packs. The bundle still needs a
static import of every pack.

- `websocket` exports `startServer({ packSource })`. Its main block uses the
  catalog pack source (D22). `nodetool serve` starts this main block.
- A new private workspace `packages/server` (`@nodetool-ai/server`,
  `"private": true`) has the entry `src/main.ts`. It imports
  `@nodetool-ai/base-nodes/builtin-packs` and the local providers, and it
  calls `startServer` with the bundled pack source.
- These consumers start `@nodetool-ai/server`:
  - the bundle entry (`ENTRY_POINT` in `scripts/bundle-backend.mjs`)
  - the Docker image, which uses the same bundle script
  - `scripts/dev-server.mjs`
  - `dev:server:dist`
- `@nodetool-ai/server` declares each optional peer of a core package as a
  regular dependency. This keeps the monorepo tree, the desktop bundle and the
  image complete (pack spec R4).

### D21. The catalog stores node metadata as sorted text

The repository stores `packages/node-catalog/data/nodes.ndjson`, with one
node per line, sorted by `node_type`. The package build writes
`dist/nodes.ndjson.gz`. A gzip file in git changes completely on each node
edit, so its history cannot be compressed and its diff cannot be reviewed.
`index.json` stays as specified in the pack spec.

### D22. Steps 1 and 2 register every pack that resolves

The pack spec cuts the static pack imports in step 1, but it builds the
installed-pack loader in step 3. Between these steps, the CLI must still load
the packs that its manifest installs (A0.6).

`registerAvailablePacks(registry, policy)` is part of A2. It works in four
steps:

1. Read the catalog.
2. Call `importPack` for each pack that the policy enables.
3. Call the registrar of each pack that resolves.
4. Load catalog entries for the node types of every other pack.

With all packs installed, the result is equal to `registerBuiltinPacks`. With
no packs installed, the result is the core nodes plus catalog entries. A15
replaces the "resolves" test with the installed set and its version check.

### D23. Compiler dependencies required by core packages

The core-only guard permits `esbuild` because `tsx` requires it (D11).
It permits TypeScript because `@trpc/client` and `@trpc/server` declare a
non-optional TypeScript peer. Both tRPC packages remain core dependencies.
When that peer resolves to `@typescript/typescript6`, its declared
`@typescript/old` compiler alias is part of the same required closure.
Removing these compiler packages would require replacing the TypeScript
workflow loader or the API framework.

The smoke guard verifies that these packages resolve from their core
dependents and satisfy the declared dependency or peer ranges. Every other
runtime library and every on-demand node pack remains forbidden. Making a
core package's library peer optional does not remove a library that another
dependency still requires.

### D24. Install identities in the release catalog

`index.installPins` holds exact version and integrity records for provided
companions, npm runtime libraries and shared `mediabunny` packages. An alias
records its registry name in `name` and its installed folder in `installName`.
The protocol runtime table remains the only mapping from runtime ids to npm
specs. Shared records have `shared: true`. Runtime pins also carry `installBytes`
from fresh Linux production-tree measurements with scripts disabled. Summed
estimates can overlap because each includes its own dependency tree.

Release packing hashes original companion tarballs and reads exact external
registry metadata. Staging verifies every record. Source generation and a new
cohort clear these release-specific pins. The installer refuses missing pins.

### D25. Global installation baseline without a hidden lock

A real npm global install has no hidden lockfile. When that file is absent in
global mode, the initial snapshot records package paths, names, versions and
realpaths without claiming integrity. Existing malformed or stale locks still
fail. Local mode still requires its hidden lock.

The dry-run plan remains additive. Post-install verification requires a valid
hidden lock and every release pin before scripts or imports. Existing package
identities must remain unchanged, and known initial integrities must match.
This trusts the already-running CLI installation. Lock metadata does not verify
pre-existing file contents.

### D26. Verified replay actions in npm plans

npm can report `change` when replaying a pack at the same version. The matrix
requires a second global add to preserve the first pack. Normalize this action
only for a catalog-owned node pack or provided companion whose known initial
integrity matches its release pin and whose version matches the core cohort.

For npm 11 JSON, reported before/after names, versions and paths must match the
exact snapshot identity. npm 10 text must match the complete same-version
`change <name> <version> => <version>` action. Its name must identify exactly
one snapshot entry in the expected hoisted package folder, with a matching
canonical realpath. Nested or ambiguous entries remain refused.

Core, shared, runtime and project packages retain strict change refusal.
Unproven replay actions are refused. Scripts stay disabled. Post-install checks
compare every previous path, name, version, integrity and realpath before
rebuilds and imports.

## 3. Current seams

| Area | Starting point | Consequence |
|---|---|---|
| Pack ids | `packages/protocol/src/builtin-packs.ts` (`BUILTIN_NODE_PACKS`, 14 ids, `base` required) | The desktop keeps these ids. The catalog adds the split ids. `findBuiltinPackForNodeType` picks by namespace, which is ambiguous (pack spec 9.2). |
| Registrars | `packages/base-nodes/src/builtin-packs.ts` (`BUILTIN_PACK_REGISTRARS`, `registerBuiltinPacks`, `CLI_BUILTIN_PACK_POLICY`), `packages/base-nodes/src/index.ts` (`ALL_BASE_NODES`, `registerBaseNodes`) | D19 and D22. Keep the policy semantics: the CLI excludes `kie`, `topaz`, `higgsfield` and `together`, and local runs also exclude `atlascloud`. |
| Server registry | `packages/websocket/src/node-registry-setup.ts:28-33` | It imports `registerBuiltinPacks`, `setBuiltinPackEnabled`, `applyBuiltinNodePolicy` and `builtinPackUnavailableReason`. The pack source interface (A12) covers these four calls. `applyBuiltinNodePolicy` uses `protocol` only, so it moves to core. |
| Server entry | `packages/websocket/src/server.ts:28-30`, `scripts/bundle-backend.mjs:42-48`, `scripts/dev-server.mjs:79` | D20. |
| CLI serve | `packages/cli/src/nodetool-main.ts:452` | It spawns `node ../../websocket/dist/server.js`. Keep the path, and use `process.execPath` instead of `node`. |
| CLI registry | `packages/cli/src/node-registry.ts:12-15`, `packages/cli/src/nodetool-main.ts:46`, `packages/cli/src/providers.ts:38-42` | Static pack and provider imports. |
| Lazy modules | `packages/config/src/optional-modules.ts`, `packages/cli/src/optional-node-root.ts`, `packages/cli/src/commands/runtime.ts` | `importOptionalModule` and the `runtime` command exist. A19 extracts the npm runner from `optional-node-root.ts`. |
| Image codecs | `packages/runtime/src/image-codec.ts` | `sharp` is lazy already. Its error text names `npm install sharp`. A4.1 changes it to the `imaging` runtime error. |
| Packed smoke | `scripts/smoke-packed-cli.mjs` | Packs every public workspace and installs the CLI tarball into a throwaway project with `overrides`. A7 and A8 extend it. |
| Publishing | `.github/workflows/publish.yaml:19,83-97`, `scripts/publish-packages.mjs`, `scripts/prepare-publish.mjs` | Uses `NODE_AUTH_TOKEN` and `--provenance`. A13. |
| Test selection | `scripts/test-affected.mjs` (`PATH_CHECKS`), `packages/cli/src/harness/registry.ts` | A1 adds the catalog drift check. |
| Validation | `packages/node-sdk/src/registry.ts` (`NodeMetadataSource`), `packages/node-sdk/src/graph-validation.ts` | A3. |

## 4. Phase 0: prerequisites

### A10. Land the open work and correct the pack spec

**Blocked by:** none.

1. Commit the two design docs.
2. Commit the `runtime` command and D16 in a separate commit.
3. Correct the stale parts of the pack spec:
   - 6.1 and 6.2 still list cuts that are done. The done cuts are
     `typescript` (`aa3b120861`), `js-tiktoken` (`3f9f9c2c98`) and
     `node-llama-cpp` in `cli`. `office-text-extractor` is uncommitted.
   - The OpenTelemetry row says six packages. Three remain (`core`,
     `resources`, `sdk-trace-base`). They also pull in `sdk-trace` and
     `semantic-conventions`.
   - Q7 is answered. Q10 and the fs-safe part of the 8.4 ratchet are
     obsolete, because `fefdcafc37` removed fs-safe.
4. Add D17 to D22 to the pack spec, or link this plan from section 5.

**Acceptance:** the working tree has no packs or runtime work outside a commit.
The pack spec names no cut that is already done.

### A11. Domain registrars (D19)

**Blocked by:** none.

**Files:** `packages/*-nodes/src/index.ts` for the 14 domain packages, and
`packages/base-nodes/src/index.ts`.

1. Add a registrar to each domain package. It registers the lists that
   `ALL_BASE_NODES` takes from that package, in the same order.
2. Move Workflow, App and Subgraph overrides into `registerCoreNodes`, and
   Preview into its owning `registerAudioNodes`.
3. Change `registerBaseNodes` to call the 14 registrars and replay their
   metadata in the original interleaved order.

**Acceptance:**

- A new test in `packages/base-nodes/tests/` builds a registry with the old
  `registerBaseNodes` logic and a registry with the new logic. It requires
  equal node type lists and deeply equal metadata for each type. Keep the
  snapshot of the old logic as a fixture. Do not keep the old code.
- Each domain registrar registers only the types of its own package. The test
  fails when two registrars register one type.
- `npm run backend:smoke` passes.

### A12. The pack source and the server entry (D20)

**Blocked by:** A11.

**Files:** `packages/websocket/src/server.ts`,
`packages/websocket/src/node-registry-setup.ts`, the new `packages/server/`,
`scripts/bundle-backend.mjs`, `scripts/dev-server.mjs`, the root
`package.json`, `Dockerfile` and `electron/` only if a path changes.

1. Define `PackSource` in `websocket`. It has `register`, `setEnabled`,
   `unavailableReason` and `registerProviders`.
2. Move `applyBuiltinNodePolicy` into `node-sdk`. Re-export it from
   `base-nodes` for existing callers.
3. Split `server.ts` into `startServer(options)` and a main block.
4. Create `packages/server` with `src/main.ts` and the bundled pack source.
   Add the optional peers of the core packages as regular dependencies.
5. Point the bundle entry, `dev-server.mjs` and `dev:server:dist` to the new
   entry.
6. Import `setCodeNodeAgentsModule` from `code-nodes`, not `base-nodes`.

Until A2 lands, the main block in `websocket` uses the bundled source through
a dynamic import of `@nodetool-ai/server` when that private workspace resolves.
The packed CLI excludes private workspaces, so it falls back to the same
factory exported by `base-nodes/server-pack-source`. Errors within a resolved
source propagate. A4.6 replaces both temporary paths with the catalog source.

**Acceptance:**

- `npm run backend:smoke` passes.
- `npm run dev:server` serves `/health`.
- The desktop node list is unchanged. Use the A11 snapshot against
  `GET /api/nodes/metadata`.
- A test asserts that every optional peer of a core package is a regular
  dependency of `@nodetool-ai/server` or of a pack.
- The test fails when you remove `sharp` from `@nodetool-ai/server`.

## 5. Phase 1: dependency cut and measurement (pack spec step 1)

### A7. The size walker (report only)

**Blocked by:** none. Do this first, so that each cut reports its effect.

**Files:** new `scripts/measure-cli-closure.mjs`, new
`scripts/node-catalog/tiers.mjs`, `scripts/smoke-packed-cli.mjs`.

1. Write the tier list in `scripts/node-catalog/tiers.mjs`. It contains the
   core packages, the node packs and the runtime libraries. The walker, the
   lint rule (A2), the generator (A1) and the smoke guard (A8) all read this
   file.
2. Implement the walker as pack spec 8.1 describes. Print apparent size, disk
   usage, the package count and the 20 largest packages. `--json` writes the
   same data.
3. In the packed smoke, run `du -sk node_modules` after the install and print
   the result. Do not fail on it yet.

**Acceptance:**

- The walker prints the current S0 and S3 scenarios. Record both numbers in
  pack spec 8.2, because the commits since the review changed the tree.
- A test in `scripts/__tests__/` runs the walker on a fixture tree with known
  sizes and asserts the totals.
- The test also asserts that the walker visited more than zero packages.

### A1. The node catalog

**Blocked by:** A11, A7 (for the tier list).

**Files:** new `packages/node-catalog/`, new
`scripts/generate-node-catalog.mjs`, new `scripts/node-catalog/packs.mjs`,
`packages/config/src/package-asset-registry.ts`, `scripts/test-affected.mjs`,
`packages/cli/src/harness/registry.ts`.

1. **A1.1 Package.** Create `@nodetool-ai/node-catalog`. Its dependencies are
   `config`, `protocol` and `node-sdk`, and it has no pack dependency. Export
   these items:
   - the 9.1 types, with D17 and D18 applied
   - `readCatalogIndex()`
   - `readCatalogNodes()`, which loads the nodes lazily and gunzips them
   - `packForNodeType(nodeType)`, which uses `owners`

   Register both data files in `PACKAGE_RUNTIME_ASSETS`, so the desktop bundle
   finds them. Add a binary loader to the asset registry if it has none.
2. **A1.2 Pack definitions.** `scripts/node-catalog/packs.mjs` lists each
   pack with these fields:
   - id
   - npm name
   - registrar export
   - `provides`
   - `runtimeLibraries`
   - `secrets`

   The generator derives `requires` from the pack manifests (D10). It derives
   `nodeCount` from the registrars.
3. **A1.3 Generator.** Follow pack spec 9.2. Write `data/index.json` and
   `data/nodes.ndjson` (D21). Write placeholder pins: `integrity: ""` and
   `installBytes: 0`. A13.3 replaces them at release.
4. **A1.4 Drift gate.** Add `npm run check:node-catalog`. It regenerates the
   catalog and fails on a difference. It also asserts that it compared more
   than zero node types. Add the check in three places:
   - to `PATH_CHECKS` for `scripts/node-catalog/**` and
     `scripts/generate-node-catalog.mjs`
   - to the harness registry for changes in node packages
   - to the CI quality checks

**Acceptance:**

- Generator unit tests cover these cases (pack spec 19.1):
  - ownership per registrar
  - the duplicate ownership error
  - deterministic output for two runs
  - the error for a property value that JSON cannot represent
  - the non-zero comparison
- The generator writes equal output on linux-x64 and darwin-arm64 (R6).
- `check:node-catalog` fails after a deliberate edit of `index.json`.
- `owners` maps `nodetool.control.If` to the core pack and
  `nodetool.game.SpriteSheet` to `image`. It maps every `kie.*` type to the
  pack that registers it.

### A2. The loader helpers

**Blocked by:** A1.

**Files:** `packages/node-catalog/src/`, `packages/protocol/src/`
(the runtime ids), `electron/src/runtime/packages/definitions.ts`,
`tools/oxlint/` or the lint config, `packages/cli/src/commands/runtime.ts`
(help text).

1. **A2.1** `importPack(packId, specifier?)` and `MissingPackError` follow
   pack spec 6.3 and 12.2, with D18 applied. Until A14 lands, the `install`
   field reports `supported: false` with the reason "Pack installs are not
   available in this version."
2. **A2.2** `registerAvailablePacks(registry, policy)` follows D22. The
   policy semantics stay the same as in `builtinPackUnavailableReason`.
3. **A2.3** A lint rule blocks static and dynamic imports of node pack names
   from core packages. It reads the tier list. The only allowed path is
   `importPack`.
4. **A2.4** Add the runtime ids `imaging`, `typescript`, `tracing` and
   `esbuild` to `RUNTIME_NPM_PACKAGES`, `RuntimePackageId` and the desktop
   definitions (D17). Add the bundling hosts to each entry.

To keep A2 and the dependent A4 cuts independently verifiable, the import rule
temporarily permits existing import sites listed in
`tools/oxlint/pack-boundaries/migration-baseline.json`. Each entry names a file,
specifier, exact AST statement and occurrence count. New imports fail, including
additional occurrences in a listed file. Each A4 cut removes its entries, and
unused entries fail lint. Type-only imports are erased and remain allowed.

**Acceptance:**

- With all packs in the tree, `registerAvailablePacks` produces the same types
  and metadata as `registerBuiltinPacks` with the same policy. Test it for the
  CLI policy and the local policy.
- A test hides one pack through the module resolver. Its types become
  `catalog`, and the other packs still register.
- The lint rule fails on a deliberate `import "@nodetool-ai/fal-nodes"` in
  `websocket`.
- A test checks each runtime registry version against the optional peer range
  of the core package that loads it.

### A3. Catalog-only nodes

**Blocked by:** A1.

**Files:** `packages/node-sdk/src/registry.ts`,
`packages/node-sdk/src/graph-validation.ts`,
`packages/execution/src/service/workflow-run.ts`,
`packages/execution/src/executor-resolver.ts`,
`packages/websocket/src/plugins/websocket.ts`,
`packages/websocket/src/http-api.ts`, `packages/dsl/src/registry.ts`.

1. Add the `"catalog"` source, `loadCatalog`, `availability` and
   `catalogEntry` (pack spec 10.1).
2. Change each call site in the 10.2 table.

**Acceptance:**

- `availability()` returns the correct value for each origin.
- The parity test from 10.2 runs fixture property bags through the class
  validator and the catalog validator for every catalog type. It requires
  equal issue lists.
- A graph with an unloaded TypeScript node and invalid properties reports the
  property issues. `ensurePythonBridge` is never called.
- `validate` reports `pack_not_installed` for a catalog type.

### A4 and A5. The manifest cuts and the source cuts

A4 is the manifest cuts (pack spec 6.1), and A5 is the source cuts (6.2).
Each batch below lands one package's A4 row with its A5 rows in one change. A
manifest cut without its source cut breaks a clean install. A source cut
without its manifest cut saves nothing.

| Batch | Package | A4 manifest cut | A5 source cut | Blocked by |
|---|---|---|---|---|
| A4.1 | `runtime` | `sharp` and the three OpenTelemetry packages become optional peers | Make `run-trace-processor.ts` load OpenTelemetry only when a trace sink is set. The `image-codec.ts` error uses `imaging`. Add `loadCanvas()` in `runtime/src/canvas-codec.ts`, which throws the `imaging` error. | A2 |
| A4.2 | `timeline`, `data-nodes` | `@napi-rs/canvas` in `data-nodes` becomes an optional peer. `timeline` has this already. | `fonts/google-fonts-node.ts` and `fonts/register-node.ts` use `loadCanvas()`. | A4.1 |
| A4.3 | `agents`, `game-nodes` | Remove `blender-nodes`, `game-nodes`, `game-renderer` and `video-nodes` from `agents`. `@napi-rs/canvas` becomes an optional peer. `game-nodes` gains `game-renderer` (D18). | The 10 static canvas imports use `loadCanvas()`. `model3d.ts` and `timeline-bake.ts` use `importPack("blender")`. `timeline-preview/model3d.ts` uses `importPack("video", …)`. The game capabilities use `importPack("game", …)`. | A2, A4.1 |
| A4.4 | `model-pricing` | Remove `fal-nodes` and `kie-nodes`. | Move both unit-price catalogs and `kie-pricing-api.ts` into `model-pricing`. Change the output paths in `fal-codegen` and `kie-codegen`. Do not edit prices by hand. Refresh the fixtures with `scripts/provider-codegen-check.mjs --write`. | none |
| A4.5 | `dsl` | Remove the 7 packs. | `export.ts` and `script-export.ts` read metadata from the catalog. `registry.ts` uses `registerAvailablePacks` and never treats catalog types as Python candidates. | A2, A3 |
| A4.6 | `websocket` | Remove the 18 packs. `sharp` becomes an optional peer. | The main block uses `registerAvailablePacks`, which removes the A12 temporary path. Providers register through the pack source. The other source cuts are below this table. | A2, A3, A4.4, A12 |
| A4.7 | `cli` | Remove `reliability-harness`. Keep the 14 node packs and `game-renderer` until A24. | `node-registry.ts` and `nodetool-main.ts:46` use `registerAvailablePacks`. `providers.ts` registers providers through the pack. `timeline-render.ts` uses `importPack("video", …)`. `game.ts` and `game-smoke.ts` use `importPack("game", …)`. | A2, A6 |
| A4.8 | `game-runtime`, `sandbox-compiler` | `@dimforge/rapier3d-compat` and `esbuild` become optional peers. | Make the `esbuild` import in `sandbox-compiler/src/bundle.ts` lazy. A missing `esbuild` throws the `esbuild` runtime error. | A2 |

These are the other A4.6 source cuts:

- `routes/nodes.ts` uses `importPack("integration")`.
- `routes/documents.ts` uses `importPack("document", "lib/pdf-text")`.
- The file-watch predicates move from `automation-nodes` into `nodes-utils`,
  shared with `websocket` without adding Node path imports to the browser
  protocol entrypoint.
- `routes/kie-pricing.ts` reads from `model-pricing`.
- `trpc/routers/models.ts` returns empty model lists with a pack hint.
- `trpc/routers/games.ts`, `routes/games.ts` and `model-download-runtime.ts`
  use `importPack`.
- The 4 static `sharp` imports go through `image-codec.ts`.

**Acceptance for each batch:**

- No `src/` file of the package imports a node pack outside `importPack`. The
  A2.3 lint rule checks this.
- The walker reports the saving of the batch. Record the number in the
  commit message.
- `npm run backend:smoke` passes.
- Each changed lazy path has a test with the dependency hidden. The test
  asserts the error kind and the runtime id or pack id.

### A6. `tsx` in the CLI (D11)

**Blocked by:** none.

1. Add `tsx` to the `cli` dependencies.
2. Replace the `npx tsx` calls at `nodetool-main.ts:588` and
   `debug/target.ts:49` with an in-process `tsImport`.

**Acceptance:**

- No `npx` call remains in `packages/cli/src`. A source scan test asserts
  this.
- `nodetool run examples/workflows/concat_text.ts` works in the packed smoke.

### A8. The core-only smoke

**Blocked by:** A2, A3, A4.1 to A4.8, A6.

**Files:** `scripts/smoke-packed-cli.mjs`, a new test fixture for the
mediabunny decode.

1. Add `--core-only`. It writes the CLI tarball again with the node packs and
   `game-renderer` removed from its manifest. Then it installs that tarball
   with no pack tarballs available.
2. Run checks 1 to 7 and check 9 of pack spec 6.4. For check 8, this step
   asserts only that the run fails and names `fal`. A16 adds the
   `missing_pack` JSON and exit code 3.
3. Add the pack spec 7 decode test. Call `ensureCodecs()`, then decode the
   first audio frame and the first video frame of a checked-in fixture. Assert
   the sample counts and the frame dimensions.
4. Run the core-only smoke in CI beside the existing packed smoke.

**Acceptance:**

- The core-only smoke passes in CI.
- The check 9 guard fails when a pack tarball is deliberately added.

### A9. The size gate

**Blocked by:** A8.

1. Measure `du -sk node_modules` of the core-only install on linux-x64 in CI
   (D13).
2. Set the hard gate to that value plus 5 %. Write the value in pack spec 8.4.
3. Make the core-only smoke fail above the gate.

**Acceptance:** the gate fails on a deliberately oversized fixture before you
enforce it.

### Step 1 exit criteria

- The core-only smoke passes, with the size gate enforced.
- `npm run backend:smoke` passes.
- The published CLI is unchanged. The full packed smoke still passes.

## 6. Phase 2: publishing (pack spec step 2)

### A13. Publishing hardening

**Blocked by:** none for A13.1 and A13.2. A1 for A13.3. This phase can run
beside phase 1.

**Files:** `.github/workflows/publish.yaml`, `scripts/publish-packages.mjs`,
`scripts/prepare-publish.mjs`, new `scripts/release/pin-catalog.mjs`, new
`scripts/release/verify-staging.mjs`.

1. **A13.1 OIDC.** Remove `NODE_AUTH_TOKEN` (`publish.yaml:96`). An npm
   organization owner must configure trusted publishing for each package on
   npmjs.com and then delete the `NPM_TOKEN` secret. The plan cannot do this
   step.
2. **A13.2 Tarballs.** Pack each package once and publish the tarball files.
3. **A13.3 Pins.** Use this order:
   1. Pack every catalog registrar package, including core registrars, and
      its first-party companion packages. Preserve these original tarballs.
   2. Compute the integrity and `installBytes` of each pack on linux-x64.
      Measure a fresh production install with scripts disabled, matching the
      default pack installer policy. Include its production dependency tree.
      Before final core tarballs exist, pack temporary core measurement
      tarballs with scripts disabled. Use them only as install overrides,
      then remove them. Keep them outside the final release artifact map.
   3. Write the pins into `node-catalog/data/index.json`.
   4. Rebuild the pinned catalog artifact, then pack the remaining core
      packages. Do not repack the earlier registrar or companion artifacts.
4. **A13.4 Staging.** Publish everything under the dist-tag `staging`. Then
   verify these points:
   - For each pin, `npm view <name>@<version> dist.integrity` equals the pin.
   - A provenance attestation exists with the source `nodetool-ai/nodetool`
     and the workflow `publish.yaml`.

   Before A22, the release job installs one pack beside the CLI with plain npm.
   After A22, it uses `packs add`.
5. **A13.5 Promotion.** Run `npm dist-tag add <name>@<version> latest` for
   each package, with the CLI last. A verification failure leaves `latest`
   unchanged.

**Acceptance:**

- Unit tests cover the pin writer, and the verifier with a fake `npm view`.
- A dry run of the workflow on a fork or a test scope reaches the promotion
  step.
- The verifier fails on a deliberately wrong pin.

## 7. Phase 3: pack loader (pack spec step 3)

### A14. Install mode and installed set

**Blocked by:** A2.

**Files:** new `packages/cli/src/packs/mode.ts`, new
`packages/cli/src/packs/installed.ts`.

1. Detect the install mode from the realpath of the CLI entry (pack spec
   11.1). Do not run `npm root -g` at startup.
2. Read the installed set (pack spec 11.3, D14). Ignore a pack whose version
   differs from the core version, and record it for `packs doctor`.
3. Fill the `install` field of `MissingPackError` for each mode. Use the npx
   text from 11.1.

**Acceptance:** the unit tests of pack spec 19.1 for mode detection pass on
Unix and Windows paths. They cover `_npx`, `.pnpm`, Yarn PnP, the Bun global
directory and a workspace checkout.

### A15. The installed pack source

**Blocked by:** A14, A4.6, A4.7.

1. Replace the "resolves" test in `registerAvailablePacks` with the installed
   set.
2. Use the same source in the CLI commands and in the `websocket` main block
   (`nodetool serve`).

**Acceptance:**

- A pack with a wrong version stays catalog-only.
- `packs doctor` reports the wrong version. Before A22, a unit test of the
  report function covers this.

### A16. `missing_pack` on every surface

**Blocked by:** A15, and runtime install step 2 for the shared exit code.

**Files:** `packages/execution/src/service/workflow-run.ts`, the CLI run
commands, `packages/websocket` run handlers, the MCP tool result path.

1. Add `findMissingPacks` (pack spec 12.1). It covers subgraphs,
   sub-workflows, `requires` and runtime libraries. Call it in the execution
   preflight.
2. Map the error to each surface in the 12.2 table:
   - exit code 3 in the CLI, and the JSON with `--json`
   - status 424 in HTTP
   - a job error in WebSocket
   - `isError` with `restartRequired: true` in MCP
3. Make `validate` exit with 3 when every error is `pack_not_installed`.
4. Add check 8 of pack spec 6.4 to the core-only smoke.

Runtime install step 2 also adds exit code 3, for missing runtime packages.
Build one mapping from error to exit code in the CLI. Make both errors use it.

**Acceptance:**

- One test for each surface asserts the payload and the status or the exit
  code.
- A graph whose sub-workflow uses `fal` reports `fal`.

### A17. Node types that a run picks at run time

**Blocked by:** A16.

1. CodeAct `invoke_node`, `open_node_stream`, `run_node` and agent control
   tools return `missing_pack` as a structured tool error.
2. The run continues, and nothing retries (pack spec 12.1).

**Acceptance:** a test for each tool calls a catalog-only type and asserts
the structured error. The run continues after the error.

## 8. Phase 4: installer (pack spec step 4)

The installer stays behind `NODETOOL_PACKS_INSTALLER=1` until A24.

### A18. The install lock

**Blocked by:** none. If runtime install step 1 has landed, reuse its lock.

1. Build one lock implementation for both installers (pack spec 14.3). It has
   exclusive create, a token, a heartbeat every 5 seconds, a 10-minute wait
   and stale removal after 60 seconds.
2. `packs` uses `<root>/node_modules/.nodetool-packs.lock`. The runtime
   installer uses its own path inside its target.

**Acceptance:** the unit tests of pack spec 19.1 for the lock pass. A test
with two processes shows that the second process waits.

### A19. The npm runner

**Blocked by:** none.

**Files:** `packages/cli/src/optional-node-root.ts`, new
`packages/cli/src/npm-runner.ts`.

1. Extract the npm call from `optional-node-root.ts` into `npm-runner.ts`.
   Then `runtime add` and `packs add` use one runner.
2. Locate `npm-cli.js` beside `process.execPath` (pack spec 14.1). Check
   npm 10.9.0 or later (D15). Refuse `--preserve-symlinks`.
3. Build the forced flags of pack spec 14.2 for each mode.

**Acceptance:** unit tests cover the flag builder and the version check. The
`runtime` tests still pass.

### A20. The install flow

**Blocked by:** A14, A18, A19, A13.3 (for real pins), Q9 (for local mode).

**Files:** new `packages/cli/src/packs/installer.ts`.

1. Implement pack spec 14.4 steps 1 to 11:
   - the snapshot
   - the dry-run plan, which parses npm 10 text and npm 11 JSON (14.5)
   - the install with `--ignore-scripts`
   - the verification (14.6)
   - the allowlisted rebuilds
   - the load check in a child process
   - the write of `cli-packs.json`
2. Implement rollback (pack spec 14.7) and the `dirty` flag.

**Acceptance:**

- The plan parser tests pin both npm output formats.
- The pack spec 19.2 integration tests pass against a local test registry
  fixture: additive plan refusal, rollback, and verification failure on a
  wrong integrity.

### A21. Install authorization

**Blocked by:** A20.

1. Only the CLI command layer constructs `InstallAuthorization` (pack spec
   13.2).
2. The installer rejects any id outside the authorization.
3. `serve` and `mcp serve` set a process flag. The installer refuses to run
   when the flag is set.
4. Add the interactive prompt (13.1). Its default answer is No.

**Acceptance:**

- The authorization matrix test of pack spec 19.1 covers each source, each
  refusing process, and ids outside the authorization.
- No module that `websocket`, `agents` or `runtime` imports exports the
  installer. A source scan test asserts this.

### A22. The commands and the re-exec

**Blocked by:** A21. Q6 is resolved: the user selected `nodetool packs`.

1. Add `list`, `add`, `add --restore`, `add --for`, `remove`, `doctor` and
   `why` (pack spec 15).
2. Add `--install-missing` to `run`, `debug`, `node run` and `workflows run`,
   and support `NODETOOL_AUTO_INSTALL=1`.
3. Re-execute after an install (pack spec 16), and print the restart notice.
4. Print the restore line after an upgrade (pack spec 13.3).

**Acceptance:** a TTY-simulated `run` with a missing pack does these steps:

1. It installs the pack.
2. It re-executes.
3. It ends with the exit code of the child.

A second re-executed process never installs.

### A23. The npm matrix

**Blocked by:** A22.

1. Add a CI workflow for the pack spec 19.3 matrix:
   - macOS arm64, Linux x64 (glibc) and Windows x64
   - Node 22 with npm 10.9 and Node 24 with npm 11
2. Run it on changes under `packages/cli/src/packs/`, on changes to
   `npm-runner.ts`, and every night.

**Acceptance:** every case in the 19.3 table passes on each platform.

## 9. Phase 5: switch (pack spec step 5)

### A24. Remove the node packs from the CLI

**Blocked by:** every assignment above.

1. Remove the 14 node packs and `game-renderer` from
   `packages/cli/package.json`.
2. Make the full packed smoke install packs through `packs add`.
3. Remove `NODETOOL_PACKS_INSTALLER`.
4. Update `docs/cli.md` and `docs/node-packs.md`. Add a release note about
   `packs add --restore`.

**Acceptance:**

- A clean `npm install -g @nodetool-ai/cli@<staging>` is within the size
  gate.
- `packs add fal` followed by a `fal` workflow run succeeds.

## 10. Dependency order

| Assignment | Blocked by |
|---|---|
| A10, A11, A7, A6, A4.4, A13.1, A13.2, A18, A19 | none |
| A12 | A11 |
| A1 | A11, A7 |
| A2, A3 | A1 |
| A4.1, A4.8 | A2 |
| A4.2, A4.3 | A4.1 (A4.3 also A2) |
| A4.5 | A2, A3 |
| A4.6 | A2, A3, A4.4, A12 |
| A4.7 | A2, A6 |
| A8 | A2, A3, A4.1 to A4.8, A6 |
| A9 | A8 |
| A13.3 to A13.5 | A1 |
| A14 | A2 |
| A15 | A14, A4.6, A4.7 |
| A16 | A15, runtime install step 2 |
| A17 | A16 |
| A20 | A14, A18, A19, A13.3, Q9 |
| A21 | A20 |
| A22 | A21, Q6 |
| A23 | A22 |
| A24 | all |

The critical path is A11, A1, A2, the A4 and A5 batches, A8 and A9. Run A13
and the runtime install steps 1 and 2 beside it.

## 11. Open questions

- **Q6.** The user selected `nodetool packs` for installer management.
  The existing `nodetool packs compile` subcommand remains available.
- **Q8.** This plan keeps `llm-nodes` and `code-nodes` in core, as the
  pack spec tier table does.
- **Q9.** The user authorized local installer updates to the selected project’s
  package.json and package-lock.json. CLI authorization still binds the root
  and mutation paths and names those files in the prompt.

## 12. Risks of this plan

- **R6.** A registrar can register different types on different platforms.
  The catalog then differs between a darwin checkout and the linux release
  job. A1 compares the generator output on both platforms.
- **R7.** D19 changes the order of registration. A metadata override can then
  apply to a different class. The A11 snapshot test catches this.
- **R8.** From A2 to A15, two registration paths exist: bundled and catalog.
  The A2 equality test keeps them equal while both exist.
- **R9.** A dependency from `node-catalog` on a pack would make
  `test:affected` select the CLI and server suites for every node change. The
  generator therefore lives in `scripts/`, and `node-catalog` depends on no
  pack.
