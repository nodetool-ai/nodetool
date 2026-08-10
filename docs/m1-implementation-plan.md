# M1 implementation plan — guest JS end to end (feature-flagged)

Task breakdown for milestone M1 of
[sandbox-package-design.md](sandbox-package-design.md). M0 shipped the
catalog, discovery, and install trust flow; M1 makes a declared sandbox
module importable in guest code, on every execution path, behind a parity
flag. Each task lands green on its own and carries its tests.

> **Landed.** Tasks 1 and 2 in `d7d0b47`, task 3 in `8ac8ebe`, tasks 4 and 5 in
> the commit that added this note. M1 is complete behind
> `NODETOOL_SANDBOX_MODULES_V1`; see the M1 checkpoint in
> [sandbox-package-design.md](sandbox-package-design.md).

## Task 1 — Entry builder: AST transform for static imports (landed, `d7d0b47`)

Replace `wrapCode()`'s string wrapping (`packages/agents/src/js-sandbox.ts:2194`)
with an AST-based entry builder for code that contains imports:

- Parse user code (acorn, as `code-analysis.ts` already does), hoist static
  `ImportDeclaration`s to module top level, and wrap the remainder in the
  async IIFE that keeps `return` and top-level `await` meaning what they
  mean today.
- Import-free code keeps the current fast path byte for byte, so existing
  behavior and tests do not move.
- The timer-deletion statements `wrapCode` emits stay in the entry module,
  but hardening for *loaded modules* moves to the loader (task 2): modules
  must evaluate under hardened globals, which the entry module runs too
  late to guarantee.
- Preserve the CodeNode `genProcess` streaming rewrite
  (`packages/code-nodes/src/nodes/code-node.ts:402`) on the transformed
  body.

Tests: extend `packages/agents/tests/js-sandbox.test.ts` `wrapCode`
describe — hoisting, implicit return, top-level await, `return` inside the
body, source of syntax errors still pointing at user code.

## Task 2 — Runtime loader: the enforcement boundary (landed, `d7d0b47`)

`runInSandbox` gains a `modules` option carrying a
`SandboxModuleResolution` (`@nodetool-ai/protocol`), and installs a custom
module loader/normalizer on the QuickJS context that resolves **only** the
resolved module ids and their intra-pack siblings:

- Everything else fails at resolve with an error naming the node's
  `packages` declaration: `node:*`, the wrapper's compat modules, absolute
  and encoded paths, computed dynamic imports, sibling escapes,
  module-cache hits.
- Hardening precedes evaluation: the deleted globals and timer removal are
  in effect before any loaded module's top-level code runs.
- Guest modules evaluate under the existing interrupt handler and memory
  limit. No new budget knobs.
- When `modules` is absent or empty, behavior is exactly today's: no
  loader surface, imports are a syntax/validation error.

Tests: adversarial fixtures in `js-sandbox.test.ts` — every denial case
above, plus a two-module pack with an `internal` helper, and a check that
a module cannot import another pack's module undeclared.

## Task 3 — Code node `packages` + validation + CLI/server wiring (landed, `8ac8ebe`)

- `CodeNode` (`packages/code-nodes/src/nodes/code-node.ts`) gains a
  `packages` property: a list of `SandboxModuleDeclaration`. `process` and
  `genProcess` resolve it through `context.sandboxModuleCatalog` and pass
  the resolution to `runInSandbox`. A missing catalog or failed resolution
  is a node error naming the pack.
- `validateCodeNodeBody` (`packages/node-sdk/src/code-node-validation.ts`)
  learns declarations: an import whose specifier is declared is legal; an
  import missing from `packages` stays an error (message updated — the
  "sandbox has no module loader" wording goes away); unknown specifier
  errors name the pack; declared-but-unused warns; version and digest
  mismatch warn (catalog statuses already carry these).
- `validateGraph` (`graph-validation.ts:708`) threads the catalog so
  offline validation resolves declarations; `nodetool validate`,
  `node run`, and `debug` reproduce a failing import headlessly through
  the same catalog the CLI already installs.

Tests: `code-node-validation.test.ts`, `code-node.test.ts` end-to-end with
a fixture pack, `context.test.ts` untouched (injection default already
covered).

## Task 4 — CodeAct session allowlist + one-line prompt tier (landed)

- `CodeActExecutorOptions` and `ChatCodeActSessionOptions` gain a session
  package allowlist (default: trusted packs only, per the design's trust
  model). Each step's generated code is parsed for imports; specifiers on
  the allowlist are resolved through the catalog and mounted, anything
  else is an action error the model sees as an observation.
- `buildCodeActSystemPrompt` advertises one line per session-allowed
  specifier — specifier plus the manifest-derived description under the
  strict length/character limits (`SandboxModuleSummary.description` is
  already capped at 160) — never the whole installed catalog.
- The sandbox manifest (`code-gen/sandbox-manifest.ts`) gains the
  `packages` section that pins this tier, and the drift tests
  (`codeact-prompt-drift.test.ts`, `sandbox-manifest-drift.test.ts`)
  extend to cover it. Every "no module loader" prompt string moves to the
  new truth: modules exist, only declared/allowed ones resolve.

Tests: `codeact-executor.test.ts` (allowlisted import mounts, undeclared
import fails as observation), drift tests, `chat-codeact.test.ts` (chat
sessions default to no packages).

## Task 5 — Parity flag, browser refusal, docs (landed)

- A `NODETOOL_SANDBOX_MODULES_V1` opt-in flag, placed where server, CLI,
  and validation can all read it (not in `websocket` — the existing SDK
  flag module is the pattern, not the home). While the flag is off the
  loader never mounts and validation treats imports as today.
- While flagged on, parity is the gap: validation reports the rollout
  issue — "Sandbox package imports are unavailable in the browser runner
  until module delivery is enabled" — for any graph using `packages`, and
  the browser runner refuses such nodes with the same message.
  `BrowserEligibility` (`web/src/lib/workflow/browserWorkflowRunner.ts`)
  becomes property-aware for this one check. Nothing persistent is
  written: no node platform metadata changes.
- Docs: design doc status line moves to "M1 implemented", CLAUDE.md
  sandbox notes updated in the same PR.

Tests: flag module unit tests, `browser-platform.test.ts`, a
graph-validation case for the rollout warning.

## Sequencing

Tasks 1 and 2 are one work package (both live in `js-sandbox.ts`; the
loader decides where hardening runs, which constrains the transform).
Task 3 depends on 1+2. Tasks 4 and 5 depend on 3 (validation wording,
resolution plumbing). Order: **(1+2) → 3 → (4+5)**, one agent per work
package, sequential on this branch.

## Exit criteria

- An authored fixture pack's module imports and runs in a Code node via
  server execution, CLI `node run`, and CodeAct — and is refused with the
  parity message in the browser runner.
- Every adversarial fixture (deny `node:*`, compat modules, computed
  imports, path escapes, undeclared siblings) fails on the loader, not
  only in static validation.
- `npm run check` green; drift tests pin the new prompt tier.
