# Sandbox Package System — JS/WASM packages for the QuickJS sandbox

Design for letting NodeTool packs ship code that runs **inside** the QuickJS
sandbox: JS guest modules the Code node and CodeAct steps can `import`, and
WASM modules bridged in from the host. Distribution rides the existing
package manager — the `nodetool` manifest in a pack's package.json, the npm
install flow, and the registry index.

> Status: design, revised after two review rounds. M0 is partially
> implemented. Protocol schemas, non-executing discovery, the initial catalog
> contract, and the sandbox-only host-loader guard are implemented in the
> current worktree. Electron's first-install path also skips lifecycle scripts
> and returns the installed artifact identity. Catalog injection, explicit
> trust/rebuild, and runtime loading are not. The first review killed four
> assumptions
> (corrected under "Facts"); the second pinned the contracts that were
> still loose — CodeAct session consent, the untrusted-doc policy, exact
> scalar WASM signatures and instance ownership, memory-manifest
> semantics, generated facades, cycle-safe catalog placement,
> capability-free admission probes, exact-artifact installation, and the
> M1 parity flag. M-1 is approved to start; M0 onward implements this
> text.

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
3. **`wrapCode()` cannot contain an `import`.** User code is emitted as the
   body of an async IIFE inside the module
   (`js-sandbox.ts:2194`: `export default await (async () => { ... })();`),
   so an `import` statement in user code is a syntax error where it lands.
   Supporting imports requires an AST transformation that hoists static
   imports out of the IIFE — touching implicit returns, Code-node and
   CodeAct preludes, streaming rewrites, source locations, and validation.
   And because an ES module's dependencies evaluate **before** the entry
   body, the timer-deletion hardening `wrapCode` emits would run *after*
   imported modules execute. Hardening must be applied before any loaded
   module evaluates, by the loader or an equivalent mechanism — not by the
   entry module.
4. **The wrapper's virtual FS is not empty.** `createVirtualFileSystem` in
   `@sebastianwessel/quickjs` unconditionally mounts Node-compat modules
   (`buffer`, `fs`, `path`, `process`, `timers`, `url`, …) into the guest's
   `node_modules`, and its normalizer maps `node:*` specifiers onto them —
   `await import("node:buffer")` succeeds under the wrapper's defaults.
   Passing `nodeModules` does **not** mean "nothing else resolves". The
   allowlist must therefore be enforced by a custom module loader and
   normalizer at runtime; static validation alone cannot hold it, because a
   computed dynamic import (`import("node:" + "buffer")`) bypasses any
   declaration check.
5. **The pack system already carries manifests.** Third-party packs are npm
   packages with a `nodetool` field in package.json, discovered by
   `packages/node-sdk/src/pack-loader.ts`, gated by a trust allowlist,
   installed by Electron into `<userData>/optional-node`, and listed in the
   registry index. Loading a pack with a `register` export means running it
   in-process with full server privileges, which is why untrusted packs are
   skipped.
6. **`npm install` executes lifecycle scripts unless disabled.** The Electron
   installer must use `npm install --ignore-scripts <spec>` before discovery
   reads the installed manifest. "Installing a sandbox-only pack runs no
   pack code" depends on that flag. This is part of the trust model, not
   later hardening.
7. **Host-side value marshaling is settled.** Typed arrays serialize
   guest→host natively; host→guest bytes travel as tagged base64 revived by
   a guest prelude. Async bridge errors return tagged objects, never
   rejected promises. New bridges must follow these rules.
8. **Packaged Electron flattens paths.** Data files a package loads at
   runtime must be registered so `bundle-backend.mjs` stages them and
   `verify-backend-bundle.mjs` checks them.

## Design

### Two module kinds

| Kind | Runs | Capability model | Risk |
|---|---|---|---|
| **JS guest module** | inside QuickJS, in the **same context as the node's code** | everything the node's code can reach: `fetch`, `workspace`, `getSecret`, asset bridges, injected globals; it can also mutate globals and prototypes for the rest of the invocation | cannot escape QuickJS, but shares the node's granted bridges — importing a module means trusting it with that node's capabilities |
| **Host WASM module** | on the host, behind a bridge | no imports: no I/O, no syscalls, no host references; memory bounded by binary validation | host CPU and memory, bounded by worker budgets |

A guest JS module is the default answer. WASM is for compute a JS module
cannot do at acceptable speed. A pack can pair them: a WASM module plus a
guest JS wrapper that gives it an ergonomic API.

### Trust model: explicit dependency consent

The first draft claimed guest modules are capability-free and need no
trust. That was wrong — a malicious dependency can exfiltrate through
`fetch`, read what `getSecret` grants the node, act at module
initialization, and poison prototypes for the invocation. The corrected
statement: **a guest module cannot escape QuickJS directly, but it shares
the node's granted bridges.**

v1 adopts **explicit dependency consent**:

- Importing a module means trusting it with that node's sandbox
  capabilities. The Package Manager and the Code node UI say this in those
  words at install time and in the package picker.
- Sandbox-only packs (no `register`) still clear a far lower bar than
  register packs — no host execution, no lifecycle scripts (below), and
  the sandbox's hard limits — so they install without the register-pack
  allowlist. But the UI presents them as "runs inside your workflows with
  the node's capabilities", never as "no trust needed".
- Capability attenuation (packages in a separate QuickJS context with
  data-only arguments) is the stronger model and stays on the table as a
  later opt-in (`isolation: true` on a declaration); it is not v1 because
  it abandons normal in-context ESM semantics.

**Installation must not execute pack code, and classification must read
the exact artifact.** Registry metadata can describe a different artifact
than what a tag resolves to at install time, and a package can change
from sandbox-only to register between versions. The flow is therefore:

1. Every initial install runs with `--ignore-scripts`.
2. The **installed** manifest — the exact resolved artifact — is
   inspected.
3. Sandbox-only: done.
4. A register pack needing lifecycle scripts: request trust, then run
   scripts against **the artifact already on disk** (rebuild flow), or —
   if a reinstall is unavoidable — record the lockfile's resolved URL
   and integrity from step 1 and verify the refetched artifact's
   integrity is identical **before** scripts run. A version number is
   not integrity: a mutable private registry can serve a different
   artifact for the same version.

Note that `--ignore-scripts` also suppresses **dependency** lifecycle
scripts, not only the top-level pack's — the rebuild flow must cover
those too. The install UI shows which mode applied. The
security-sensitive decision never rests on a registry summary. This
lands in M0.

**SKILL.md is third-party prompt content, and quoting is risk reduction,
not isolation.** A model can follow malicious instructions inside quoted
documentation; no delimiter changes that. The v1 policy:

- **Trusted pack:** its skill registers through the normal skill system.
- **Untrusted pack:** docs are visible in the UI; the agent sees the body
  only as untrusted tool output, and only after the package has been
  chosen for the session.
- The ambient one-line tier is **derived from manifest fields under
  strict length and character limits** — never arbitrary pack text — so
  a description cannot smuggle instructions into every prompt.

**CodeAct requires session consent, not installed-equals-authorized.**
Code nodes carry a persisted declaration a user saved; CodeAct parses
model-generated imports, and auto-mounting anything installed would let
the model grant an unrelated pack the action's `fetch`, `workspace`,
`getSecret` and tool capabilities. CodeAct therefore mounts only packs on
the **session's package allowlist**, sourced from agent/session
configuration, user approval on first use, or the task/workflow's own
declarations — defaulting to trusted packs only. The prompt advertises
only session-allowed packages, not the installed catalog.

### Package unit: manifest + SKILL.md

A pack's sandbox configuration is two declarative files: the
`nodetool.sandboxModules` manifest in package.json and a `SKILL.md` at the
package root. Neither is code. Manifest types are **Zod-backed
discriminated unions** at the package boundary (per the repo's
untrusted-input rules), not bare TypeScript interfaces.

```jsonc
// package.json of @acme/nodetool-geo
{
  "name": "@acme/nodetool-geo",
  "version": "1.2.0",
  "nodetool": {
    "apiVersion": 1,
    "sandboxModules": [
      {
        "name": ".",                        // root entry → specifier "@acme/nodetool-geo"
        "kind": "js",
        "file": "sandbox/geo.js"
      },
      {
        "name": "extra",                    // subpath → "@acme/nodetool-geo/extra"
        "kind": "js",
        "file": "sandbox/extra.js"
      },
      {
        "name": "simplify-wasm",
        "kind": "wasm",
        "file": "sandbox/simplify.wasm",
        "memoryPagesMax": 256,              // binary's max must be ≤ this and ≤ host ceiling
        "exports": ["simplify"]             // scalar-only in v1; see WASM section
      }
    ]
  }
}
```

**Specifier rule** (one rule, used everywhere): the import specifier is
`<packageName>` when `name` is `"."`, else `<packageName>/<name>`. `name`
is a single path segment (no separators, no `..`, no reserved forms),
validated and normalized at discovery; duplicates are a discovery error.
A single-module pack uses `"."`, which is what the migrated bridge packs
do (`import Papa from "@nodetool-ai/sandbox-csv"`).

Discovery-time rules (`sandbox-pack-discovery.ts`), enforced without
executing pack code:

- `file` resolves inside the package directory (containment + symlink
  check).
- Size caps: 256 KB per authored JS source, 4 MB per WASM binary, 8 MB per
  pack; npm-bundled modules get 1 MB (below).
- JS modules parse with acorn. Allowed: ES module syntax and static
  `import` of sibling files of the same pack. Rejected: **all
  `ImportExpression` nodes** (dynamic import — in package and user code
  alike, v1), `require`, and imports of anything outside the pack.
- Helpers not meant for user code go in a **pack-level `internal` list**
  (`"internal": ["sandbox/util.js"]`): `.js` files, canonical id = the
  normalized pack-relative path, duplicates and cycles rejected at
  discovery. Internal files are mounted and importable by any public
  entry of the same pack (sharing is allowed), never valid in a node's
  `packages` declaration, and count toward the pack size caps and the
  graph digest.
- WASM binaries get a section-level parse; declared `exports` are checked
  against the export section, and the memory rule below is validated
  before compilation is ever attempted.
- SKILL.md is validated (frontmatter, 16 KB cap) — but an invalid or
  missing skill only disables agent discoverability with a warning. It
  never disables the module: a frontmatter typo must not break a workflow
  that imports working code.

### Guest import surface

User code imports a declared module by its specifier:

```js
import { haversine } from "@acme/nodetool-geo";
const km = haversine(a, b);
return { km };
```

Mechanics, in the order that matters:

- **AST transform, not string wrapping.** The entry is built by parsing
  user code, hoisting static `ImportDeclaration`s to module top level, and
  wrapping the remainder in the async IIFE that gives `return` and
  top-level `await` their current meaning. Preludes, streaming rewrites,
  and source maps ride the same transform. This is proven by the M-1 spike
  before anything else is built.
- **The loader is the authority.** `runInSandbox` installs a custom module
  loader and normalizer (via the underlying `setModuleLoader`) that
  resolve **only** the run's declared specifiers and their intra-pack
  siblings. Everything else — `node:*`, the wrapper's compat modules,
  absolute paths, encoded traversals, computed specifiers — fails at
  resolve with an error naming the node's `packages` declaration. Static
  validation is a courtesy layer for early errors; the loader holds the
  boundary at runtime.
- **Hardening precedes evaluation.** Timer deletion and global hardening
  are applied before any loaded module evaluates — not by the entry
  module's first statements. The M-1 spike proves the mechanism (loader
  hook, per-module preamble, or engine-level init).
- **Adversarial tests are part of the contract:** `node:*` in package and
  user code, computed dynamic imports, absolute and encoded paths, sibling
  escapes, and compat-module cache hits must all fail, on Node and in the
  browser runner.
- Guest modules evaluate under the same interrupt handler and memory limit
  as user code. No new budget knobs.

### Declaring usage on the node

Imports are explicit per node. The Code node's `packages` property is a
list of **declarations**, not bare strings:

```ts
interface SandboxModuleDeclaration {
  specifier: string;               // "@acme/nodetool-geo" or ".../extra"
  resolvedPackVersion?: string;    // stamped when the workflow is saved
  contentDigest?: string;          // digest of the resolved sources, same one delivery verifies
}
```

Resolution always uses the installed version; a mismatch between
`resolvedPackVersion` and the installed pack is a **validation warning**
(not a lock failure, not an auto-upgrade). `contentDigest` is stamped
from day one, and it is a **module-graph digest**, not an entry-file
hash: a canonical, sorted list of every transitive source with its
normalized module id, generated facade source and generator version,
compiler options and compiler version for npm modules, and WASM bytes
where applicable. The workflow declaration, the delivery response, the
bundle cache, and validation all use this same graph digest; a mismatch
warns with a distinct message. CodeAct parses each step's
imports and mounts exactly those — but only after checking them against
the **session package allowlist** from the trust model, never against
the whole installed catalog.

Why explicit: `nodetool validate` checks a workflow offline (typo,
missing pack, version drift) before anything runs; the loader mounts only
what is declared, so the guest surface stays deterministic; and a shared
workflow names its dependencies, so importing it elsewhere says exactly
which packs to install.

### One catalog, injected everywhere

The first draft left registry ownership implicit, which does not survive
contact with the real wiring: `bootstrapNodeRegistry()` loads packs
asynchronously, the CLI's `buildFullRegistry()` is synchronous and loads no
installed packs, `validateGraph()` sees only a narrow registry interface,
and soft reload/uninstall differ from startup. The design therefore names
one deep module with an injected interface:

Placement respects the dependency order — `ProcessingContext` lives in
`@nodetool-ai/runtime`, and node-sdk already depends on runtime, so
runtime cannot import an interface defined in node-sdk. Data types
(declarations, summaries, statuses) go in `@nodetool-ai/protocol`; the
runtime-facing interface goes in `@nodetool-ai/runtime`; node-sdk
provides the discovery **adapter** that implements it without owning it.

The interface is split by consumer, so the general surface never hands
out raw absolute paths or skill bodies. Delivery is asynchronous —
entitlement checks may need database or remote state — and
authorization and retrieval are **one operation**: the resolved
`AuthorizedSandboxModuleDelivery` carries browser-safe content, media
type, the graph digest, and dependency module ids, never a filesystem
path, so the two checks cannot drift apart:

```ts
interface SandboxModuleCatalog {
  summaries(): readonly SandboxModuleSummary[];          // UI + prompt tier
  resolveForExecution(
    declarations: readonly SandboxModuleDeclaration[]
  ): SandboxModuleResolution;                            // sources for the loader
  authorizeDelivery(moduleId: string, principal: DeliveryPrincipal):
    Promise<AuthorizedSandboxModuleDelivery>;            // browser route
  diagnostics(): readonly SandboxModuleStatus[];         // doctor / packs.list
}
```

One catalog instance is constructed where packs are discovered and
injected into every consumer: kernel execution (via ProcessingContext),
validation, CodeAct prompt generation, the websocket delivery route, and
the CLI (which constructs its own from the same discovery code). No
second global snapshot next to `pack-snapshot.ts`; catalog statuses are
their own set, separate from node-pack loading statuses. Soft reload
swaps the catalog's contents; in-flight runs keep the resolution they
started with.

### Config-only modules from npm packages

A pack does not have to author sandbox code. A manifest entry can point at
an npm dependency, and NodeTool produces the guest module from it:

```jsonc
{
  "name": "@nodetool-ai/sandbox-yaml",
  "dependencies": { "js-yaml": "^4.1.0" },
  "nodetool": {
    "apiVersion": 1,
    "sandboxModules": [{ "name": ".", "kind": "js", "npm": "js-yaml" }]
  }
}
```

Mechanics, at pack discovery, in a **dedicated compiler module** (not
esbuild concerns spread through node-sdk):

- esbuild bundles the package: `bundle: true`, `format: "esm"`,
  `platform: "neutral"`, **explicit `conditions` and `mainFields`**
  (neutral alone does not pin which conditional export is chosen), no
  externals. An import of a Node builtin fails the bundle — that is the
  filter, surfaced as a named skip at install time.
- The output goes through the authored-module static checks plus a
  **scope-aware** forbidden-global scan (`process`, `Buffer`, `require`,
  `eval`, `Function`, timers, `WebAssembly`, DOM names). Hard references
  error; feature-detected references warn — and a warning is a heads-up,
  not a compatibility guarantee. Only the QuickJS probe below
  establishes that initialization actually works.
- **Bundling proves resolution, not compatibility.** Admission ends with a
  probe: the bundle is imported in the actual QuickJS engine — and the
  probe context is **capability-free**, because importing executes
  top-level code. No `fetch`, no `workspace` or secret bridges, no tools;
  a short deadline, normal memory limits, output/log caps. Discovery must
  never grant package code capabilities before a workflow imports it. The
  probe proves module initialization only — it cannot prove every export
  works — and runtime loading stays authoritative after admission. A
  module that fails the probe is skipped with the probe's error.
- **Cache keys are digests, not versions.** `pack/name@version` is wrong —
  output changes under linked packs, transitive updates, lockfile changes,
  esbuild upgrades, and option changes while the version stays put. The
  cache key is concrete: a hash over esbuild's **metafile input list**
  (every input file's content hash), the esbuild version, and the
  normalized build options. Writes are atomic; every path component is
  sanitized. Bundled modules cap at 1 MB — and M-1 measures real
  candidates (zod, date-fns, cheerio) before that number is promised
  anywhere.

What fits: pure-computation ESM (schema validation, functional utilities,
date math, parsers). What cannot, regardless of tooling: Node builtins,
DOM, network, timers, `eval`, WASM-shipping packages (no `WebAssembly` in
the guest — those need the host-WASM path).

### Host WASM modules

**v1 is scalar-only, with exact signatures.** The v1 call contract:
arguments and returns are `i32`, `f32`, or `f64` only; exactly one scalar
return (or none — a void export resolves to `undefined`); argument count
bounded (8). Binary validation rejects exports using `i64` (maps to
`bigint`, not `number`), `v128`, reference types, multi-value returns, or
excess arity — an export outside the contract is named in the skip
reason, not silently dropped — and verifies every named export is a
**function**, not a memory, table, or global. Manifest export names must
be valid, non-reserved JavaScript identifiers; a binary export that is
not (`"foo-bar"`) is mapped explicitly:
`{ "wasm": "foo-bar", "as": "fooBar" }`.

Conversion is validated host-side before dispatch — never left to
implicit WebAssembly coercion, so Node and browser behave identically:
an `i32` argument must be a finite integer in int32 range (no wrapping —
out-of-range rejects), `f32`/`f64` accept any JS number including `NaN`
and infinities, and `f32` rounds by WebAssembly's normal rules.

Byte-oriented calls wait for a future ABI, informed by the M-1 reference
module from a documented toolchain. There is no interim workaround:
guest JS cannot reach the host instance's linear memory, so typed-array
work is simply out of scope until that ABI exists.

Memory: a host cannot cap a module-defined memory at instantiation — with
an empty import object the binary's own limits rule. The v1 rule is
therefore validation, not override. The manifest declares
`memoryPagesMax`; the binary's own declared maximum must be at or below
**both** the manifest request and the host hard ceiling (4096 pages /
256 MB), every memory must declare a maximum, shared memories are
rejected, and a module that imports its memory makes the import object
non-empty and is rejected — all checked in the binary before compilation.
A manifest cannot lower a larger baked-in maximum except by rejecting the
module.

**Instance ownership: instance per call, stateless.** Each call
instantiates fresh from the cached module inside the worker, runs, and
discards the instance. Mutable globals and linear-memory contents do
**not** persist between calls, and the docs say so — stateless semantics
is the contract, not an accident. This is what makes pooling, concurrent
calls, and timeout-terminate-replace coherent: a killed worker destroys
nothing an invocation owns. Packs needing cross-call state keep it in
guest JS and pass it in as scalars, or wait for the byte ABI.

**The import surface is a generated facade.** For a WASM entry,
`import { simplify } from "@acme/nodetool-geo/simplify-wasm"` resolves to
an ESM facade the catalog generates: named async exports matching the
manifest's `exports`, calling into a per-run dispatcher. Authored JS in
the same pack may import a sibling WASM entry by the same specifier
rules; it resolves to the same facade.

The security contract is enforceable behavior, not an unobservable
handle — a facade needs *some* guest-visible binding to receive the host
function, and other modules evaluate during dependency loading:

- The dispatcher serves **only** WASM modules declared for the run.
- Every call validates module identity, export allowlist, and argument
  count and scalar types before the worker runs.
- The static analyzer and the runtime loader both deny direct imports of
  the private bridge module.
- The dispatcher binding is removed before the user IIFE starts.
- A module that discovers the temporary binding anyway gains nothing
  beyond the run's declared WASM surface — the dispatcher checks, not
  the hiding, are the boundary.

M-1 proves the hiding mechanism before the design promises anything
stronger.

Execution and budgets:

- Compile once per process, cached (`WebAssembly.Module` is
  **structured-cloneable**, so it crosses to workers without
  recompiling).
- Calls run on workers (Node `worker_threads`, browser Web Worker) with a
  hard per-call timeout; a timed-out worker is terminated **and
  replaced**.
- Per-call timeout alone does not bound aggregate use, so the budgets are
  layered, with defaults fixed now rather than left open until M4:
  process-wide worker pool of 4; per-invocation call concurrency of 2;
  256 calls per invocation; an aggregate WASM wall-clock budget of 30 s
  per invocation (matching the sandbox default timeout). A manifest may
  lower these, never raise them. Byte caps belong to the future byte
  ABI.

### How agents learn a pack: SKILL.md, progressive disclosure

A sandbox pack **may** provide a SKILL.md — the compressed docs page for
using the library inside the sandbox: the specifier, the main functions
with one example each, and the gotchas that matter there (input caps,
the 64 MB guest heap, no timers). A pack without one stays runnable;
only agent discoverability suffers. Format and parser are the existing
`AgentSkill` machinery (`packages/agents/src/agent.ts`), hoisted so
node-sdk can call it.

Disclosure is two-tier so prompt size stays flat: **one line per
specifier** (specifier + a description derived from manifest fields
under strict length/character limits) always — and for CodeAct, only
specifiers on the session allowlist; the full body on demand when the
agent reaches for the pack, under the trust rules above (trusted: normal
skill registration; untrusted: untrusted tool output after the package
is chosen for the session). The Code node's package picker renders the
same file for the human. A pack exposing several specifiers carries one
skill with a section per module.

### Delivery and distribution

- **Install:** the existing Electron npm installer, with the
  `--ignore-scripts` split described under the trust model.
- **Registry:** index entries gain a `sandboxModules: string[]` summary
  for search; per-file hashes come with the ecosystem milestone.
- **Browser runner:** module sources are fetched by **opaque module id** —
  `GET /api/sandbox-modules/:moduleId` — never by path segments: scoped
  names contain `/`, and encoded slashes behave inconsistently across
  routers and proxies. The server resolves the id through the catalog (no
  route-to-filesystem translation), responses carry a content digest the
  client verifies, and the browser caches by digest. Whether private
  packs' source may be delivered to a given browser client is an
  entitlement question the route must answer through the catalog, not
  assume from authentication alone.
- **Packaged Electron:** installed packs arrive through the optional-node
  root as today. Only if a bundled builtin ever ships sandbox modules does
  `bundle-backend.mjs` stage them (under `_sandbox/<pack>/`), verified by
  `verify-backend-bundle.mjs`.

### Validation and harnesses

- `nodetool validate` / `validate_workflow`: unknown specifier (error,
  names the pack), declared-but-unused (warning), version mismatch
  (warning), import in code missing from `packages` (error).
- `nodetool node run` / `debug`: resolve through the same catalog, so a
  failing import reproduces headlessly.
- The sandbox manifest's generated `packages` section and its drift test
  pin the one-line disclosure tier.
- Node and browser run the **same contract-test fixtures** for loading,
  denial, hardening order, and WASM budgets.

## Alternatives considered

- **Keep host bridges as the only extension point.** Safest, but every
  library becomes a NodeTool core change. Bridges remain the right tool
  for real I/O and native code — this design does not replace them.
- **Inject packages as globals instead of imports.** Avoids the AST work,
  but invents a second module system and still needs the same
  declaration, validation, loader, and delivery machinery.
- **Run WASM inside the guest.** Impossible on quickjs-ng.
- **Arbitrary npm imports at runtime.** Rejected; the config-only form —
  declared, bundled and vetted at install time, admission-probed — is the
  answer, not a live resolver over `node_modules`.
- **Trust-free guest modules.** The first draft's position; withdrawn.
  Guest modules share the node's capabilities, so the model is explicit
  consent (v1) with capability attenuation as a later opt-in.

## Limits summary

| Bound | Value | Enforced |
|---|---|---|
| JS module source (authored) | 256 KB | pack discovery |
| JS module source (npm-bundled) | 1 MB (validated in M-1) | compiler + admission probe |
| WASM binary | 4 MB | pack discovery |
| Per-pack total | 8 MB | pack discovery |
| SKILL.md | 16 KB | pack discovery (warning-grade) |
| Guest eval of modules | existing 64 MB / deadline / interrupt | engine |
| WASM memory | binary-declared max ≤ `memoryPagesMax` ≤ host ceiling (4096 pages); no shared, no imported memory (v1) | binary validation |
| WASM signatures | `i32`/`f32`/`f64` only, ≤1 return, ≤8 args; no `i64`/`v128`/ref types/multi-value | binary validation |
| WASM per-call wall clock | 5 s default, pack may lower | worker timeout + replacement |
| WASM aggregate | worker pool size, per-invocation call count + concurrency + wall-clock budget | host bridge |
| WASM imports | none | binary validation |
| WASM state | none across calls (instance per call) | execution model |
| Dynamic `import()` | rejected everywhere | validation + loader |

## Non-goals

- WASI, filesystem, network, host-function or memory imports for WASM.
- `require`, Node builtins, the wrapper's compat modules, or undeclared
  npm packages in the guest.
- Typed-array WASM ABI in v1 (scalar-only until the reference-module spike
  pins a contract).
- Per-workflow version pinning (recorded versions warn on mismatch;
  resolution uses the installed version).
- Replacing existing host bridges.

## Milestones

Revised order: prove the risky mechanics first, then build outward. Each
milestone lands green on its own.

### M-1 — Proof and threat model

- AST transform spike: static imports + IIFE body semantics (implicit
  return, top-level await, streaming, source locations) on real Code/
  CodeAct corpora.
- Loader spike: custom loader/normalizer denying `node:*`, compat
  modules, computed imports, path escapes — on Node and browser. An
  explicit pass/fail criterion: the wrapper's own
  `prepareNodeCompatibility()` bootstrap imports still work while the
  same modules are denied to guest code, **including module-cache
  hits**. If bootstrap and guest loading cannot be distinguished
  reliably, the answer is to bypass or patch the wrapper's compatibility
  setup, not to ship a loader that cannot hold the line.
- Hardening-order spike: prove globals are hardened before any module
  evaluates.
- One scalar WASM and one byte-oriented WASM reference module from a
  documented toolchain (the byte one informs the future ABI, not v1).
- Measure bundle sizes of the real npm candidates against the 1 MB cap.
- Document exactly what capabilities imported code can reach; test npm
  lifecycle-script behavior with and without `--ignore-scripts`.

### M0 — Catalog and safe discovery

- Zod manifest schemas; the specifier + declaration model (versions
  included).
- `SandboxModuleCatalog` interface with injected ownership (kernel,
  validation, prompts, delivery, CLI); statuses separate from node-pack
  statuses.
- Sandbox-only installation with `--ignore-scripts`, the install-mode
  UI, and the direct-URL/unknown-manifest policy.
- Discovery validation: containment, symlinks, sizes, import-expression
  rejection, collisions; SKILL.md as warning-grade.

#### M0 checkpoint — manifest and artifact discovery

The first M0 slice is deliberately independent of pack execution. It is
implemented by `SandboxPackManifestSchema` and
`SandboxModuleDeclarationSchema` in
`packages/protocol/src/sandbox-package.ts`, and by
`discoverSandboxPack()` in
`packages/node-sdk/src/sandbox-pack-discovery.ts`.

It now provides:

- normalized root and one-segment specifiers, with duplicate declarations
  rejected at the manifest boundary. The sandbox schema covers only the
  sandbox fields; discovery extracts those fields from the larger existing
  `nodetool` manifest so `register`, `nodes`, and other pack metadata keep
  their current ownership;
- package-relative file checks with realpath containment and symlink
  rejection;
- authored-JS, WASM, per-pack, and `SKILL.md` size limits;
- static JS dependency discovery, rejection of dynamic imports, host imports,
  and undeclared helpers, internal-file cycle detection, and a complete source
  graph;
- section-level WASM checks for imports, memories, exports, and scalar
  signatures; and
- a stable graph digest for authored JS, internal JS, and WASM files. npm
  entries are recorded as skipped until the M3 compiler supplies their
  bundled source graph and compiler metadata.

`@nodetool-ai/runtime` now owns the read-only `SandboxModuleCatalog`
contract, and node-sdk provides `createSandboxModuleCatalog()` over the
discovery results. Its execution resolution returns browser-safe module graphs
without absolute paths, reporting missing modules as errors and version or
digest drift as warnings. `ProcessingContext` accepts that catalog and keeps
it when copied. This is a contract and adapter only: hosts do not yet
construct or inject it for CLI or server runs.

The host pack loader also treats `sandboxModules` without an explicit
`register` export as a sandbox-only manifest and skips it before resolving or
importing its entry point. A hybrid pack with an explicit `register` still
uses the existing host-pack trust path.

Electron's first-install path now passes `--ignore-scripts`, reads the
requested package from the installed `node_modules` directory, and returns a
structured classification: sandbox-only, register, hybrid, or unknown. It
returns the lockfile's version, resolved URL, and integrity when present.
Until the trusted rebuild flow exists, register, hybrid, and unknown packages
remain inactive with scripts still disabled. This does not persist a trust
decision or perform an integrity-bound rebuild; those remain separate work.

The current `SKILL.md` check is also only a discovery warning. It verifies
the size and minimal frontmatter shape; it does not register the file with
the agent skill system. Full skill parsing and disclosure remain in M5.

The discovery result is data for the future catalog. It does not import a
pack, run lifecycle scripts, compile npm modules, authorize browser
delivery, or make a module available to QuickJS. The remaining M0 work is
therefore an explicit boundary:

1. Construct and inject the discovery-backed catalog into CLI validation and
   server contexts, keeping catalog diagnostics separate from the existing
   node-pack snapshot.
2. Add an explicit trust approval flow for register and hybrid packs, then
   verify the recorded integrity before a script-enabled rebuild. The Package
   Manager must show the installed mode rather than treating install as
   authorization.
3. Keep direct URLs rejected and report an unknown installed manifest without
   granting trust or enabling lifecycle scripts.

Discovery rejects duplicate package names across roots and collisions after
path normalization (for example, two spellings of the same package-relative
file). Catalog construction must preserve those failures rather than
reintroducing order-dependent resolution.

M0 exits only when a sandbox-only package can be installed without running
pack code, appears in catalog diagnostics, resolves through the same catalog
used by validation and execution, and is still unavailable to the guest
until M1's loader is enabled. The discovery tests in
`packages/node-sdk/tests/sandbox-pack-discovery.test.ts`, catalog tests in
`packages/node-sdk/tests/sandbox-module-catalog.test.ts`, and host-loader
tests in `packages/node-sdk/tests/pack-loader.test.ts` are the lowest-level
regression suites for the implemented slices; each later boundary needs its
own contract test before the milestone can close.

### M1 — Guest JS end to end (feature-flagged)

Authored modules through Code node, CodeAct, validation, CLI, and server
execution together — import support is not claimed until the user-facing
execution and validation paths agree. Prompt strings ("no module loader")
and their drift tests change here.

Two things belong to M1 that earlier drafts deferred:

- **The one-line catalog tier and the session allowlist.** CodeAct
  cannot generate approved imports unless its prompt advertises the
  session-allowed specifiers, so the strict manifest-derived one-liner
  ships with import execution. M5 stays the documentation milestone
  (full SKILL.md retrieval, package picker, Package Manager
  presentation).
- **The parity feature flag.** Without it, a Code node using imports
  runs on the server and fails in the browser runner. While flagged,
  validation reports a rollout issue — "Sandbox package imports are
  unavailable in the browser runner until module delivery is enabled" —
  and the browser runner refuses such nodes with the same message.
  Nothing persistent is written: no node platform metadata is rewritten,
  so a workflow saved during M1 carries no stale server-only
  classification after M2.

### M2 — Delivery parity (removes the flag)

Browser delivery by opaque module id with digest verification; Electron
staging for bundled builtins; the same loading/denial fixtures running on
Node and browser. The M1 feature flag is removed here — parity restored
is the exit criterion.

### M3 — npm compilation

The dedicated compiler module: content-addressed cache, explicit resolver
conditions, scope-aware scan, QuickJS admission probe.

### M4 — WASM (scalar-only)

Binary validation including the memory and signature rules, worker pool
with global and per-invocation budgets, timeout-terminate-replace,
instance-per-call execution, and the generated facades over a scoped
per-run bridge. The typed-array ABI waits for the M-1 reference results.

### M5 — Agent and UI disclosure

The one-line tier and session allowlist already shipped with M1; this
milestone is the documentation layer, landing only after the
untrusted-content trust handling is settled: on-demand SKILL.md
retrieval, package-picker rendering, Package Manager consent language.

### M6 — Bridge packs

One config-only pack per migratable library — `@nodetool-ai/sandbox-csv`
(papaparse), `-yaml` (js-yaml), `-xml` (fast-xml-parser), `-diff` (diff),
`-zip` (fflate), `-html` (cheerio, if the bundle admits it) — living in
the monorepo under `packages/sandbox-packs/`, consumed only via install.
This is an **added import path, not a migration**: the `data.*` bridges
stay, and bridge-specific safety limits stay with them — fflate's 50 MB
decompression cap is a zip-bomb policy the 64 MB guest heap does not
replicate, so the bridge remains the hardened route. Disposition of the
rest is unchanged from the bridge table in the CLAUDE.md: exceljs (Node
streams), turndown (DOM), `format.*` (no Intl in the guest), image/canvas
(native), and every capability bridge stay host-side permanently.

Presence is never assumed: a missing pack fails validation with "install
<pack>", prompts advertise only installed packs, and the registry marks
the bridge packs recommended.

## Release invariants

Each invariant binds from the milestone that introduces its subject
onward — WASM invariants from M4, browser parity from M2.

- Explicit per-node declarations; no ambient npm resolution.
- The loader, not static analysis, is the enforcement boundary.
- Fresh guest context per invocation; fresh WASM instance per **call**.
- Static size caps on everything a pack ships.
- Empty WASI/network/filesystem surface for WASM.
- Existing bridges retained; their safety limits not weakened by the
  import path's existence.
- The same fixtures and contract tests on Node and browser (once
  browser delivery exists).
- Validation before execution.
