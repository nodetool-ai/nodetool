# Sandbox Package System — JS/WASM packages for the QuickJS sandbox

Design for letting NodeTool packs ship code that runs **inside** the QuickJS
sandbox: JS guest modules the Code node and CodeAct steps can `import`, and
WASM modules bridged in from the host. Distribution rides the existing
package manager — the `nodetool` manifest in a pack's package.json, the npm
install flow, and the registry index.

> Status: design, revised after two review rounds. M0, M1, M2 and M3 are
> implemented. A declared sandbox module is importable in Code nodes, CodeAct
> actions, the CLI, the server **and the browser runner** — M2 delivered module
> source to the browser over `GET /api/sandbox-modules/*`, ran the same
> loading/denial contract there, and removed the `NODETOOL_SANDBOX_MODULES_V1`
> parity flag along with the browser refusal it covered. M3 adds the npm
> compiler: a config-only `npm` manifest entry is bundled, scanned,
> admission-probed, and cached by content. M0 provides:
> protocol schemas, non-executing discovery, the catalog contract and its
> concrete host, catalog injection into server and CLI contexts, the
> sandbox-only host-loader guard, scripts-disabled installation with an
> install ledger, and the integrity-verified trust/rebuild flow with its
> Package Manager surface. The first review killed four assumptions
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
  diagnostics(): readonly SandboxModuleStatus[];         // doctor / packs.list
}
```

`authorizeDelivery` is **not** part of the M0 contract. Delivery is the M2
subject, and an authorization method with no route behind it is an untested
promise, not a boundary. M2 adds it as the asynchronous, entitlement-aware
half of the browser route described under "Delivery and distribution" — one
operation resolving authorization and content together, returning
browser-safe bytes, media type, graph digest and dependency module ids, never
a filesystem path. Until then nothing outside the process can ask the catalog
for module source.

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
- a stable graph digest for authored JS, internal JS, and WASM files. An npm
  entry joins that graph once a host injects its compiled artifact (M3); one
  nothing has compiled yet is recorded as `pending-compile`.

`@nodetool-ai/runtime` now owns the read-only `SandboxModuleCatalog`
contract, and node-sdk provides `createSandboxModuleCatalog()` over the
discovery results. Its execution resolution returns browser-safe module graphs
without absolute paths, reporting missing modules as errors and version or
digest drift as warnings.

`discoverSandboxCatalog()` (`packages/node-sdk/src/sandbox-catalog-host.ts`)
is the concrete host: it scans the pack search paths, discovers every sandbox
package without executing pack code, and builds one catalog. Nothing throws
out of it — a pack that violates the static contract and a package name
claimed by two roots both become catalog diagnostics, and a duplicated name
is **dropped** rather than resolved by scan order, so shadowing never silently
picks a winner.

Injection: the server builds the catalog in `bootstrapNodeRegistry()` and
again on soft reload, the CLI builds it in `buildFullRegistry()`, and each
installs it as the process's catalog default
(`setProcessSandboxModuleCatalog`). `ProcessingContext` reads that default
only when its constructor is given no `sandboxModuleCatalog` option; an
explicit value — including `null` — always wins. The catalog stays an injected
dependency, and the default exists so the twenty-odd context construction
sites do not each thread it through. Runs already in flight keep the catalog
instance they captured. `packs.sandboxModules` over tRPC returns the
summaries and every diagnostic, kept separate from the node-pack snapshot
`packs.list` reports: sandbox modules and nodes are discovered by different
code and fail independently.

The host pack loader also treats `sandboxModules` without an explicit
`register` export as a sandbox-only manifest and skips it before resolving or
importing its entry point. A hybrid pack with an explicit `register` still
uses the existing host-pack trust path.

Electron's first-install path passes `--ignore-scripts`, reads the requested
package from the installed `node_modules` directory, and classifies it:
sandbox-only, register, hybrid, or unknown. The classification, the lockfile
identity of the pack (version, resolved URL, integrity), and the identity of
every package in its dependency closure are written to an install ledger at
`<userData>/optional-node/nodetool-packs.json`. A sandbox-only pack is
`active` immediately; register, hybrid, and unknown packs are recorded
inactive with scripts still disabled.

`trustNodePack(name)` is the approval flow. It re-classifies the pack from
disk, refuses if the mode moved, and compares the whole recorded closure
against the lockfile again — version, resolved URL and integrity, per
package — before anything runs. Only then does it run
`npm rebuild <pack> <closure…>` with scripts enabled, against the artifact
already on disk. There is no refetch, so there is no window in which a
different artifact could arrive; the closure is rebuilt because
`--ignore-scripts` suppressed the dependencies' scripts too. Success marks the
row `scripts: "ran"`, `active: true`. An unknown manifest can never be
approved, and a sandbox-only pack is refused because it runs no host code.

Trust here authorizes **lifecycle scripts**, which is a different question
from whether the pack loader may import the pack: that stays the
`~/.config/nodetool/packs.json` allowlist the Settings → Packages toggle
writes, and the approval message says so. A register pack therefore needs both
before it registers nodes.

The current `SKILL.md` check is also only a discovery warning. It verifies
the size and minimal frontmatter shape; it does not register the file with
the agent skill system. Full skill parsing and disclosure remain in M5.

Settings → Packages shows this rather than treating install as
authorization: each pack installed by NodeTool carries its mode, an
active/inactive chip, a sentence saying what that mode means, and — for an
inactive register or hybrid pack — a **Trust and rebuild** action. An install
that lands inactive reports as a warning with the mode named, not as a
failure.

What discovery still does not do: import a pack, compile npm modules,
authorize browser delivery, or make a module available to QuickJS. Duplicate
package names across roots and collisions after path normalization (for
example, two spellings of the same package-relative file) stay failures; the
catalog host preserves them as diagnostics instead of reintroducing
order-dependent resolution.

M0's exit criteria are met for the sandbox-only path: such a package installs
without running pack code, appears in `packs.sandboxModules` diagnostics,
resolves through the same catalog validation and execution share, and stays
unavailable to the guest until M1's loader is enabled. The regression suites
are `packages/node-sdk/tests/sandbox-pack-discovery.test.ts`,
`sandbox-module-catalog.test.ts`, `sandbox-catalog-host.test.ts`,
`pack-loader.test.ts`, `packages/runtime/tests/context.test.ts` for the
injection default, and
`electron/src/__tests__/nodePackManager.test.ts` for install classification
and the integrity-bound rebuild.

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


#### M1 checkpoint — imports end to end, behind the flag

M1 is implemented. It shipped gated by `NODETOOL_SANDBOX_MODULES_V1` (exact
opt-in on `"1"`), which M2 removed; the flag paragraph below records what it
covered.

What shipped:

- **Entry builder.** `buildEntryModule()` (`packages/agents/src/js-sandbox.ts`)
  parses a snippet as a module, hoists its static `ImportDeclaration`s above the
  async IIFE and blanks the ranges they vacate, so line numbers in a syntax
  error still point at the user's code. Import-free code takes the old
  `wrapCode` path byte for byte.
- **Normalizer-enforced loader.** `RunSandboxOptions.modules` installs a module
  loader *and normalizer* on the context. The normalizer is the enforcement
  point: QuickJS serves a cached module without consulting the loader but
  normalizes every specifier first, which is what makes the denial hold for the
  wrapper's own Node-compat bootstrap. Declared specifiers and their intra-pack
  siblings resolve; `node:*`, absolute and encoded paths, sibling escapes,
  another pack's internals and every dynamic `import()` do not. Loaded modules
  carry the timer deletions on their first line, so hardening precedes their
  evaluation.
- **Code node `packages`.** `CodeNode` (`packages/code-nodes/src/nodes/code-node.ts`)
  declares what it may import and resolves it through
  `context.sandboxModuleCatalog`; nothing declared installs no loader at all.
- **Validation.** `validateCodeNodeBody` and `validateGraph`
  (`packages/node-sdk/src/`) read the declarations offline: an undeclared import
  and a dynamic resolution are errors, an unused declaration and version/digest
  drift are warnings, and a specifier no installed pack offers is an error
  naming the pack. `nodetool validate`, `node run` and `debug` reproduce all of
  it headlessly.
- **CodeAct session consent.** `CodeActExecutorOptions.sandboxPackages` and
  `ChatCodeActSessionOptions.sandboxPackages` are the session allowlist
  (default: none). Each action's code is parsed for static imports; allowed
  specifiers are resolved and mounted, anything else is refused as the
  action's observation, naming the specifier. The prompt carries one sanitized
  line per allowed specifier — never the installed catalog — and says plainly
  when nothing is importable
  (`packages/agents/src/codeact/sandbox-packages.ts`).
- **The flag.** `NODETOOL_SANDBOX_MODULES_V1` gated all of the above while the
  browser runner could not fetch module sources. Off, the Code node refused a
  declaration before the guest started, CodeAct mounted nothing, and validation
  reported the declaration as an error; on, validation added a
  `code_package_browser_parity` warning because the browser runner refused such
  a graph outright. M2 removed the flag, the warning and the refusal. Nothing
  persistent was written while it existed — no node platform metadata changed —
  so no workflow saved during M1 needed migrating.

The canonical sentence every prompt surface now states — replacing "there is no
module loader" — is `SANDBOX_MODULE_RULE` in
`packages/agents/src/code-gen/sandbox-manifest.ts`, pinned by the drift tests.

Regression suites: `packages/agents/tests/js-sandbox-modules.test.ts`,
`codeact-sandbox-packages.test.ts`, `codeact-executor.test.ts`,
`codeact-prompt-drift.test.ts`, `sandbox-manifest-drift.test.ts`;
`packages/node-sdk/tests/code-node-validation.test.ts`,
`graph-validation.test.ts`; `packages/code-nodes/tests/code-node-packages.test.ts`;
and `web/src/lib/workflow/__tests__/browserWorkflowRunner.test.ts`.

### M2 — Delivery parity (removes the flag)

Browser delivery by opaque module id with digest verification; Electron
staging for bundled builtins; the same loading/denial fixtures running on
Node and browser. The M1 feature flag is removed here — parity restored
is the exit criterion.

#### M2 checkpoint — the browser runs what the server runs

M2 is implemented; there is no flag. What shipped:

- **The delivery half of the catalog.** `authorizeDelivery(moduleId)`
  (`packages/runtime/src/sandbox-module-catalog.ts`, implemented in
  `packages/node-sdk/src/sandbox-module-catalog.ts`) resolves authorization and
  content in one call and answers with browser-safe source, its media type, the
  module-graph digest, a per-file `contentSha256`, the delivered file's
  pack-relative id, and the opaque ids of everything it imports. Never a
  filesystem path. Public entry specifiers and internal graph-file ids
  (`<pack>::<file>`) are both deliverable, because the browser loader needs the
  whole graph.
- **The route.** `GET /api/sandbox-modules/*`
  (`packages/websocket/src/routes/sandbox-modules.ts`), a wildcard because ids
  contain `/`. It resolves only through the catalog: unknown id → 404, refusal →
  403, otherwise the body plus `X-Content-Digest`, `X-Content-Sha256`,
  `X-Sandbox-Module-Dependencies`, `X-Sandbox-File-Id` and a digest ETag with
  immutable caching.
- **The browser catalog.** `web/src/lib/workflow/sandboxModuleCatalog.ts`
  fetches by module id, verifies each body against `contentSha256` with
  `crypto.subtle` — a mismatch is never cached and never returned — walks the
  dependency header until the closure is complete, and turns the records into a
  `SandboxModuleCatalog` that answers synchronously. The digest versions the
  cache: a file reached from one root whose digest no longer matches is a
  leftover from a previous pack version and is re-fetched.
- **Prefetch before the run.** `runBrowserGraphJob` collects the graph's
  `packages` declarations and fetches the closure *before* either execution path
  starts, because the catalog contract is synchronous and fetching is not. A
  module that cannot be had fails the job right there, naming the pack, instead
  of surfacing as a resolve error inside the guest. The verified records are
  plain data, so the Web Worker path receives them across `postMessage` and
  builds its catalog in the worker — one verification, on the side that owns the
  origin and the auth header.
- **One contract, two runtimes.** The loading and denial cases are data
  (`@nodetool-ai/agents/sandbox-module-fixtures`): declared imports, an
  intra-pack internal helper, `node:*` and compat-module denials, path escapes
  and encoded traversals, undeclared specifiers, another pack's internals,
  computed and variable dynamic imports, and the module-level `setTimeout`/`eval`
  hardening. `packages/agents/tests/js-sandbox-modules.test.ts` drives them under
  vitest; `packages/workflow-runner/e2e/tests/sandbox-modules.spec.ts` drives the
  same array through a Code node in a real headless Chromium.
- **The flag is gone.** `packages/config/src/sandbox-feature-flags.ts` and every
  read of it are deleted, along with the `code_package_disabled` validation
  error, the `code_package_browser_parity` warning, and the browser runner's
  property-aware refusal. A graph with `packages` is browser-eligible when its
  node types are.

### M3 — npm compilation

The dedicated compiler module: content-addressed cache, explicit resolver
conditions, scope-aware scan, QuickJS admission probe.

#### M3 checkpoint — the compiler ships

M3 is implemented in `packages/sandbox-compiler`
(`@nodetool-ai/sandbox-compiler`), a workspace of its own because node-sdk
must not depend on esbuild or a JavaScript engine.

- `compileNpmModule({ packDir, npmName })` runs the pipeline in order:
  esbuild with `bundle`, `format: "esm"`, `platform: "neutral"`, pinned
  `conditions` (`import`, `module`, `default`) and `mainFields`
  (`module`, `main`), no externals and no minification; the scope-aware
  scan; the capability-free probe. Each way it can end short of admission
  is a named skip — `npm-module-builtin-import`,
  `npm-module-unresolved`, `npm-module-too-large`,
  `npm-module-forbidden-global`, `npm-module-scan-rejected`,
  `npm-module-probe-failed`.
- The scan (`scan.ts`) resolves every identifier against the real scope
  chain, so a shadowed `process` is not a hit. A free reference errors; a
  reference the module feature-detects — the argument of a `typeof`, or
  one in a branch a `typeof` on the same name guards — warns.
- The probe (`probe.ts`) instantiates quickjs-ng directly with
  `allowFetch: false`, `allowFs: false`, no env, no bridges, a 5 s
  deadline, a 64 MB heap and capped console output. Only the bundle
  resolves; every other specifier is denied by name.
- The cache (`cache.ts`) keys on a digest over every input file's content
  hash from esbuild's metafile, the esbuild version, the compiler's
  contract version, and the normalized options. Entries are written
  temp-file-plus-rename, keys are validated against `^[a-f0-9]{64}$`
  before they reach a path, and the cache root is
  `getNodetoolCacheDir()/sandbox-modules`. A pointer per
  `(pack directory, dependency)` lets a synchronous host read an entry
  back; it re-hashes every recorded input first, so content still decides.
- Discovery stays synchronous and engine-free. `discoverSandboxPack` takes
  an injected `compiled` lookup: an entry with an artifact joins the source
  graph as `npm:<name>`, one without becomes `pending-compile` naming
  `nodetool packs compile`. A compiled module's digest is over the bundled
  source plus the compiler version and options digest, so recompiling under
  different conditions reports drift rather than silently running different
  code.
- Compilation runs where the host is already async: the server's
  `refreshSandboxCatalog` (which imports the compiler lazily and degrades to
  a named `compiler-unavailable` warning), Electron's install hook, and
  `nodetool packs compile`. The CLI's synchronous `buildFullRegistry` only
  reads the cache.

The measured candidate table and the cap decision are in
[m3-implementation-plan.md](m3-implementation-plan.md). Regression suites:
`packages/sandbox-compiler/tests/`, `packages/node-sdk/tests/sandbox-npm-discovery.test.ts`,
`packages/websocket/tests/sandbox-catalog.test.ts`,
`packages/cli/tests/packs-command.test.ts`.

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

#### M6 checkpoint — three packs ship, four libraries stay host-side

The list above was written before M3 measured the candidates. A
config-only pack exists only for a library the compiler admits, so what
shipped in `packages/sandbox-packs/` is the admitted set:

| Pack | Library | State |
|---|---|---|
| `@nodetool-ai/sandbox-yaml` | js-yaml | ships |
| `@nodetool-ai/sandbox-zip` | fflate | ships |
| `@nodetool-ai/sandbox-dates` | date-fns | ships — not in the original list; admitted, so it earns a pack |
| `@nodetool-ai/sandbox-csv` | papaparse | not shipped — imports `node:stream` |
| `@nodetool-ai/sandbox-xml` | fast-xml-parser | not shipped — reads a bare `window` |
| `@nodetool-ai/sandbox-diff` | diff | not shipped — schedules with `setTimeout` |
| `@nodetool-ai/sandbox-html` | cheerio | not shipped — imports 25 Node builtins |

The four unshipped libraries stay on `data.parseCsv`, `data.parseXml`,
`data.diff`, and `data.selectHtml` until the library drops what the guest
lacks or a byte ABI makes the host call cheap enough not to care. The
design's alternative for them — an authored `kind: "js"` module — would
mean vendoring a fork of each library into the repo, which buys an import
path at the cost of owning someone else's code; M6 declined it rather than
ship a pack that is a maintenance liability.

Each pack is a package.json and a SKILL.md, nothing else. They are
deliberately **not** root workspaces (the `workspaces` array names every
path explicitly), so no host code can resolve `@nodetool-ai/sandbox-yaml`
in-process — the specifier exists only for the guest, through install and
the catalog. `nodetool.recommended` and the `sandboxModules` manifest are
the metadata the external registry index reads.

The zip-bomb boundary held: `MAX_UNZIP_TOTAL_BYTES` is untouched at 50 MB
and pinned by a drift test, and `sandbox-zip`'s SKILL.md and package
description both steer untrusted archives to `data.unzip`. Validation now
appends "Install `<pack>`" when an unresolved specifier is one NodeTool
ships (`sandbox-bridge-packs.ts` in node-sdk), and nothing else. The
end-to-end proof is `packages/sandbox-compiler/tests/packs.test.ts`:
discovery of the real pack directory, compilation, catalog resolution, and
`import yaml from "@nodetool-ai/sandbox-yaml"` running in the M1 loader.

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
