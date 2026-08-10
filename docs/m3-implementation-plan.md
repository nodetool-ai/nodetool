# M3 implementation plan — npm compilation

Task breakdown for milestone M3 of
[sandbox-package-design.md](sandbox-package-design.md): the config-only
module form. A pack declares `{"name": ".", "kind": "js", "npm": "js-yaml"}`
and NodeTool produces the guest module from the npm dependency — bundled,
statically scanned, admission-probed, and cached by content.

Grounding, verified against the tree:

- Discovery already parses the `npm` field and records the entry as a
  skip: `sandbox-pack-discovery.ts` emits `npm-module-unsupported`
  ("requires the M3 compiler") and gives the module id `npm:<name>` with
  an empty dependency list. The catalog excludes those ids from
  resolution. M3 replaces that skip with a compiled artifact.
- The QuickJS engine dependencies live only in `packages/agents`, and
  agents depends on node-sdk — so node-sdk can never import the engine
  for the admission probe. esbuild is likewise not a node-sdk
  dependency. The compiler cannot live inside node-sdk without
  spreading esbuild concerns through it, which the design forbids
  anyway.

## Task 1 — Pay down the M-1 measurement debt

The 1 MB npm-bundle cap is promised "validated in M-1", and the design
says to measure before the number lands anywhere user-visible. Bundle
the real candidates with the exact Task 2 options — zod, date-fns,
js-yaml, papaparse, fast-xml-parser, diff, fflate, cheerio — record the
sizes in this document, and keep or move the cap on evidence. cheerio
is the expected casualty (the design already hedges "if the bundle
admits it"); a candidate that fails is recorded as out of scope for the
bridge-pack milestone, not silently dropped.

### Measured candidates

esbuild 0.28.1, conditions `["import","module","default"]`, mainFields
`["module","main"]`, `platform: "neutral"`, `format: "esm"`, `target:
"es2022"`, no externals, no minification — the exact Task 2 options.
Bundled from the versions installed in this tree.

| candidate | version | bundle | inputs | verdict |
|---|---|---:|---:|---|
| zod | 4.4.3 | 483.3 KB | 80 | scan error — `const F = Function` (×2); warns on `navigator` |
| date-fns | 4.4.0 | 175.6 KB | 305 | **admitted** — 250 exports through the probe |
| js-yaml | 4.3.0 | 101.4 KB | 2 | **admitted** — 15 exports through the probe |
| papaparse | 5.5.3 | — | — | bundle failed — imports `node:stream` |
| fast-xml-parser | 5.7.3 | 142.1 KB | 27 | scan error — `window && window.parseInt` (×3) |
| diff | 4.0.4 | 35.1 KB | 2 | scan error — `setTimeout` (×2) |
| fflate | 0.8.3 | 60.8 KB | 2 | **admitted** — 49 exports; warns on `queueMicrotask`, `setTimeout` |
| cheerio | 1.2.0 | — | — | bundle failed — imports 25 Node builtins |

Every rejection is a real one rather than a tooling artifact: zod reaches
the `Function` constructor for its compiled validators, fast-xml-parser
reads a bare `window` with no `typeof` guard, diff schedules with
`setTimeout`. Each would throw in the guest at the line the scan names.
cheerio is the expected casualty and papaparse joins it — both need the
host bridge path, so both are out of scope for the bridge-pack milestone.

**Cap decision: keep 1 MB.** The largest bundle measured is zod at 483 KB;
the largest *admitted* one is date-fns at 176 KB. The cap is about 2× the
worst candidate and 6× the worst realistic one, no candidate fails on size,
and nothing measured argues for moving the number either way. It lives in
`NPM_BUNDLE_MAX_BYTES` (`packages/sandbox-compiler`) and is re-checked
against `SANDBOX_PACKAGE_LIMITS.npmBundledJsBytes` in node-sdk, so an
artifact that grew past it after compilation is still refused at discovery.

Reproduce with `nodetool packs compile --json` against a pack declaring the
candidate, or drive `bundleNpmModule` / `scanBundle` / `probeBundle` from
`@nodetool-ai/sandbox-compiler` directly.

## Task 2 — The compiler package

New workspace package `packages/sandbox-compiler`, the dedicated
compiler module. It depends on esbuild, acorn, and the QuickJS variant
directly; node-sdk stays free of all three.

- `compileNpmModule({ packDir, npmName, options })` runs esbuild:
  `bundle: true`, `format: "esm"`, `platform: "neutral"`, **explicit
  `conditions` and `mainFields`** pinned as constants (neutral alone
  does not pin which conditional export wins), no externals, no
  minification (digests and review beat bytes here).
- An import of a Node builtin fails the bundle; the failure becomes a
  named skip status at discovery ("imports node:fs — needs the host
  bridge path"), never a generic error.
- Output larger than the cap is a named skip carrying the measured
  size.

## Task 3 — Scope-aware forbidden-global scan

The bundle then passes the authored-module static checks plus a
scope-aware scan (acorn scope analysis, not a regex): free references
to `process`, `Buffer`, `require`, `eval`, `Function`, timer globals,
`WebAssembly`, and DOM names. A hard reference errors; a
feature-detected reference (`typeof process !== "undefined"`) warns —
and the warning is a heads-up, not a compatibility promise. Local
bindings that shadow those names are not hits; that is what
"scope-aware" buys.

## Task 4 — QuickJS admission probe

Admission ends by importing the bundle in the real engine, because
bundling proves resolution, not compatibility:

- The probe context is **capability-free**: no `fetch`, no workspace or
  secret bridges, no tools, nothing from `js-sandbox.ts`'s bridge
  surface. The compiler package instantiates the engine directly with
  a short deadline, the normal memory limit, and output/log caps.
- The probe proves module initialization only — top-level code runs
  and the exports object materializes. It cannot prove every export
  works; runtime loading stays authoritative after admission.
- A module that fails the probe is skipped with the probe's error.

## Task 5 — Content-addressed cache

Cache keys are digests, never `pack/name@version` (linked packs,
transitive updates, lockfile changes, and esbuild upgrades all change
output while the version stays put):

- Key: hash over esbuild's **metafile input list** (every input file's
  content hash), the esbuild version, the compiler package's own
  version, and the normalized build options.
- Value: the bundled source, the metafile summary, the scan report,
  and the probe verdict — so a warm cache skips the probe too.
- Writes are atomic (temp file + rename); every path component is
  sanitized; the cache lives under the existing per-user cache root
  from `@nodetool-ai/config` paths.

## Task 6 — Catalog and host integration

- `discoverSandboxPack` accepts compiled-artifact input (an injected
  lookup, keeping discovery synchronous and engine-free): an npm entry
  with a cached artifact joins the source graph like an authored file;
  one without becomes a `pending-compile` status instead of today's
  `npm-module-unsupported`.
- The graph digest for npm entries incorporates what the design
  requires: the bundled source, compiler options, and compiler
  version. `computeSandboxModuleGraphDigest` already hashes authored
  files; the npm branch lands here.
- Compilation runs where the process is already async: the server's
  `bootstrapNodeRegistry` path and soft reload, the Electron
  installer after a sandbox pack lands, and an explicit
  `nodetool packs compile` CLI command. The CLI's synchronous
  `buildFullRegistry` never compiles — it reads the cache, and a miss
  surfaces as the `pending-compile` diagnostic naming the command.
  In-flight runs keep the resolution they started with, as with every
  catalog swap.
- `packs.sandboxModules` diagnostics carry the new statuses; the
  Package Manager shows a pending/failed compile per module with the
  skip reason.

## Task 7 — Fixtures and tests

- Fixture npm packages checked in under the compiler package's test
  directory (tiny, dependency-free, no network): a clean ESM utility,
  one importing `node:fs` (named skip), one with a hard `process`
  reference (scan error), one with a feature-detected reference (scan
  warning, admitted), one whose top-level throw fails the probe, one
  over the size cap.
- Cache tests: identical input hits; changing one source file, the
  esbuild version, or an option misses; concurrent writes stay atomic.
- An end-to-end test through the catalog: the fixture pack's npm
  module resolves for execution with the compiled source and correct
  digest, and runs in the M1 loader.

## Sequencing

Task 2 → 3 → 4 are the compile pipeline, in execution order. Task 5
wraps them; Task 6 wires the result into discovery, hosts, and CLI;
Task 1 runs first (its numbers are Task 2 constants); Task 7 grows
with each piece. M3 depends on M1's loader for the end-to-end proof
but not on M2 — a compiled npm module is server/CLI-usable while
browser delivery ships separately, and delivery of compiled modules
rides M2's route unchanged (they are catalog modules like any other).

## Exit criteria

- `@nodetool-ai/sandbox-yaml`-shaped fixture (config-only manifest, no
  authored code) installs, compiles, probes, and its module imports
  and runs through the M1 loader on server and CLI.
- A builtin-importing, a scan-failing, a probe-failing, and an
  oversized candidate each surface as named skips in
  `packs.sandboxModules`, not errors.
- Cache invalidates on content, never on version alone.
- The measured candidate table exists in this document with the cap
  decision recorded; `npm run check` green.
