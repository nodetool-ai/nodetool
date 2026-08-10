# M2 implementation plan — delivery parity (removes the flag)

Task breakdown for milestone M2 of
[sandbox-package-design.md](sandbox-package-design.md). M1 makes declared
sandbox modules importable on the server and CLI behind the
`NODETOOL_SANDBOX_MODULES_V1` parity flag; the browser runner refuses
them. M2 delivers module source to the browser, runs the same
loading/denial contract there, and removes the flag. Parity restored is
the exit criterion.

Grounding: browser runs execute the kernel `WorkflowRunner` client-side
through `runBrowserWorkflow` (`packages/workflow-runner/src/browser.ts`),
routed by `web/src/lib/workflow/browserWorkflowRunner.ts` and
`browserRunnerCore.ts` (worker first, main-thread fallback).
`ProcessingContext` reads the process catalog default, which nothing sets
in the browser — the browser catalog is the missing piece, not the
runner.

## Task 1 — `authorizeDelivery`: the catalog's delivery half

The design deferred this method until a route exists; M2 is that route.

- Extend the `SandboxModuleCatalog` contract
  (`packages/runtime/src/sandbox-module-catalog.ts`) with the
  asynchronous, entitlement-aware operation:
  `authorizeDelivery(moduleId, requester): Promise<AuthorizedSandboxModuleDelivery | SandboxDeliveryRefusal>`.
  Authorization and retrieval are one operation, so the checks cannot
  drift apart.
- `AuthorizedSandboxModuleDelivery` (schema in
  `packages/protocol/src/sandbox-package.ts`) carries browser-safe
  content (JS source now; bytes later for WASM), media type, the
  module-graph digest, and dependency module ids — never a filesystem
  path.
- The node-sdk implementation (`createSandboxModuleCatalog`) resolves
  the opaque module id against the discovery graph. v1 entitlement
  policy: any authenticated client of this server may fetch modules of
  installed packs; the seam exists so a later private-pack policy is a
  policy change, not a plumbing change.

Tests: `sandbox-module-catalog.test.ts` — unknown id, internal file id
(delivered — the browser loader needs the whole graph), digest matches
the resolution's digest.

## Task 2 — Server route: `GET /api/sandbox-modules/:moduleId`

- New route module in `packages/websocket/src/routes/` following the
  existing route pattern (`routes/assets.ts` et al). Delivery is by
  **opaque module id**, never path segments: scoped names contain `/`
  and encoded slashes are router-hostile.
- The route resolves through the catalog's `authorizeDelivery` only —
  no route-to-filesystem translation. Responses carry the content
  digest (header) and long-lived caching headers keyed on it;
  unknown id → 404; refusal → 403.
- The registry summary field (`sandboxModules: string[]`) and
  per-file hashes stay out of scope (ecosystem milestone).

Tests: websocket route tests — happy path, 404, digest header, and the
response never containing an absolute path.

## Task 3 — Browser catalog: fetch, verify, cache

- A web-side `SandboxModuleCatalog` implementation
  (`web/src/lib/workflow/sandboxModuleCatalog.ts`): fetches by module
  id from the route, **verifies the content digest client-side**
  (`crypto.subtle`), and caches by digest (in-memory; digest-keyed, so
  a pack upgrade is a natural miss).
- `resolveForExecution` is synchronous by contract, and fetching is
  not: the run path prefetches. `runBrowserGraphJob` /
  `updateBrowserJobNodeProperties`
  (`web/src/lib/workflow/browserWorkflowRunner.ts`) collect the
  `packages` declarations from the graph's Code nodes, prefetch every
  declared module and its dependency ids before the run starts, then
  hand the warmed catalog to the run's `ProcessingContext` (both the
  worker and the main-thread fallback — the worker needs the
  declarations or the fetched sources passed across the boundary).
- A fetch or digest failure before the run is a job error naming the
  pack, same wording as the server's resolution errors.

Tests: `browserWorkflowRunner.test.ts` (prefetch collection, failure
surfaces as job error), catalog unit tests with a mocked route (digest
mismatch rejects and does not cache).

## Task 4 — One contract, two runtimes: shared fixtures

- Extract the M1 loading/denial fixtures (declared-import happy path,
  intra-pack helper, `node:*` denial, compat-module denial, computed
  dynamic import, path escapes, undeclared specifier, hardening order)
  into data-driven fixture definitions importable from both suites —
  home: `packages/agents` with a browser-safe export, mirroring the
  `js-sandbox` subpath pattern.
- Node side: the M1 vitest suite consumes the shared fixtures.
- Browser side: a Playwright leg in the existing e2e-runner harness
  (`web/src/e2e_runner/`, `npm run test:e2e-runner`) runs the same
  fixtures through a real browser QuickJS, via a fixture pack the
  e2e server has installed.

Exit gate for the milestone: both suites green on identical fixture
data.

## Task 5 — Electron staging for bundled builtins

- `scripts/bundle-backend.mjs` learns to stage sandbox module files of
  **bundled builtin** packs under `_sandbox/<pack>/`, and
  `scripts/verify-backend-bundle.mjs` verifies them. Installed packs
  are unaffected (they resolve through the optional-node root as
  today).
- No builtin ships sandbox modules yet, so this lands as mechanism
  plus a fixture-driven verification test; `npm run backend:smoke`
  stays the proof that staging did not break the artifact.

## Task 6 — Remove the flag

- Delete `NODETOOL_SANDBOX_MODULES_V1`, the validation rollout issue
  ("Sandbox package imports are unavailable in the browser runner…"),
  and the browser-runner refusal from M1's Task 5. The
  property-aware eligibility check stays only if the flag removal
  leaves no other use for it.
- Because M1 wrote nothing persistent (no node platform metadata),
  removal is code-only — workflows saved during M1 need no migration.
- Docs: design doc status line moves to "M2 implemented"; CLAUDE.md
  browser-runner notes updated in the same PR.

Tests: the M1 rollout-issue and refusal tests flip to asserting the
paths are gone; `browser-platform.test.ts` gains the positive case.

## Sequencing

Task 1 → Task 2 → Task 3 form the delivery chain. Task 4 needs 3
(browser loading exists) and is the parity proof. Task 5 is
independent and can run any time. Task 6 lands last — the flag comes
out only after Task 4's both-runtimes gate is green.

## Exit criteria

- The M1 fixture pack's module imports and runs in the browser runner,
  fetched by opaque id, digest-verified, cached by digest.
- The shared denial fixtures fail identically on Node and in the
  browser.
- The parity flag, the rollout validation issue, and the browser
  refusal no longer exist in the tree.
- `npm run check` and the e2e-runner leg green.
