# Failure-mode roadmap

Validated against `main` on 2026-08-22. Open items name the remaining code,
tests, and acceptance conditions. Completed work is recorded at the end.

Do not implement a check until it fails on a reproduction or positive-control
fixture. An audit must enumerate its targets and assert that it found them.

## 1. Add an authenticated production `/mcp` endpoint

Status: OPEN. Issue #5126.

`packages/websocket/src/server.ts` mounts `/mcp` only outside production. The
development mount always uses user `"1"`, so it cannot be enabled unchanged.
Python is not part of this item; its production opt-in already exists.

Implementation:

1. Add `NODETOOL_ENABLE_MCP=1`. Keep the production route absent by default.
2. When `enforceAuth` is true, use the existing global bearer-token hook and
   build `agentToolsScope` from `req.userId` with source `"http-session"`.
3. When `enforceAuth` is false, require a new `NODETOOL_MCP_TOKEN` of at least
   32 characters. Validate it inside the global `onRequest` hook, before the
   generic remote-client denial. Compare it in constant time. Do not add a
   general `/mcp` public-route exemption. Add `"http-token"` to the MCP scope
   source union and use user `"1"` only after the token passes.
4. Return 401 for missing or invalid credentials. Keep the global rate limit,
   CORS policy, and JSON-RPC input validation on the route.
5. Add both variables to the config setting catalog and its Zod validation.
6. Add production route tests under `packages/websocket/tests/` for both auth
   modes, a non-loopback client, invalid credentials, the default 404 result,
   and authenticated GET/DELETE requests after session initialization.
7. Add an opt-in probe to `scripts/docker-smoke.mjs`. Send a complete MCP
   `initialize` request, including `jsonrpc`, `id`, protocol version,
   capabilities, and client information.
8. Document the two MCP flags in `docs/configuration.md` and `AGENTS.md`.

Acceptance:

- Authenticated production derives the MCP user from the validated session.
- Local production requires the dedicated token.
- Production without the enable flag returns 404.
- `npm run test --workspace=packages/websocket` passes.

## 2. Run workflow preflight in `ExecutionSession`

Status: OPEN.

`runWorkflow` rejects bad models, providers, and credentials before job
acceptance. `ExecutionSession.create` does not, so `workflows run` can fail
after upstream work has started.

Implementation:

1. Add optional model catalogs and an optional provider-configuration checker
   to `ExecutionSessionOptions`. Default both to the runtime implementations
   used by `runWorkflow`. A custom provider host must supply both.
2. Select the `ProcessingContext` before bridge connection.
3. After normalization, call `modelSelectionErrors` and the selected
   provider-configuration checker.
4. Resolve secrets with `(key) => context.getSecret(key)`. Do not import the
   models database into `session.ts`.
5. Refuse before Python bridge connection and `persistence.onAccepted`.
6. Add a typed `ExecutionPreflightError` whose issue list is the common refusal
   contract used by the CLI and service adapters.
7. Update all hosts enumerated by
   `execution-session-hydration-audit.test.ts`. Custom-provider hosts must pass
   their catalogs.

Add `packages/execution/tests/session-preflight.test.ts`. Cover unknown models,
unregistered providers, missing credentials, default and injected secret
resolvers, no bridge connection, and no persistence acceptance.

Run `npm run test --workspace=packages/execution -- session-preflight`.

## 3. Include missing secrets in `validate_workflow`

Status: OPEN.

`validate_workflow` calls `validateGraph` in
`packages/agents/src/capabilities/workflows.ts`. Changing
`modelSelectionError` does not change this capability.

Implementation:

1. Add optional `availableSecrets(keys)` to `CreateCapabilityRunOptions` and
   propagate it through `createCapabilityRun` to `CapabilityRun`.
2. Pass it to `validateGraph` from `validate_workflow`.
3. Enumerate every `createCapabilityRun` call site in an audit test. Server,
   CLI, and MCP hosts with a real secret resolver must inject a callback that
   uses their `ProcessingContext`. Hermetic eval hosts must omit it explicitly.
4. A `missing_secret` issue must name the key and direct the agent to
   Settings > Credentials. Mention `request_secret` only when that capability
   is present in the run's registered capability set.

Tests must show that a missing key produces an issue, an available key clears
it, and an absent callback preserves current output. Run
`npm run test --workspace=packages/agents -- workflows`.

## 5. Preserve provider behavior through decorators

Status: OPEN. Issue #5109.

`CassetteProvider` inherits `generateLoop` and can drop an inner override. A
method-existence test cannot detect this.

1. For each decorator method, either forward it or reject construction when
   the behavior cannot be preserved.
2. Cover the actual `BaseProvider` contract: `generateMessage`,
   `generateMessages`, traced wrappers, `generateLoop`, model discovery, media
   generation, tool support, error classification, lifecycle, and cost.
3. Replace the diagnostic expectation in
   `packages/runtime/tests/providers/provider-decorator-inertness.test.ts`
   with behavioral equivalence checks using unique sentinel results.
4. Start with `CassetteProvider` and add each later wrapper to an explicit
   inventory. In record mode, compare forwarded behavior with the inner
   provider. In replay mode, compare the recorded normalized contract and cost;
   do not require calls to the inner provider.

The current implementation must fail the new test before the fix. Then run
`npm run test --workspace=packages/runtime -- provider-decorator-inertness`.

## 6. Detect generated provider metadata drift

Status: OPEN.

1. Add a deterministic fixture mode to the FAL and KIE generators. It reads
   checked-in schema fixtures only, excludes live pricing and timestamps, and
   fails if any requested fixture is absent. Keep live refresh as a separate
   command.
2. Add a checked-in generator manifest that lists every schema fixture and
   generated output path. Generate into a temporary directory and compare only
   those declared node-source and static-metadata outputs.
3. Add root commands `generate:fal:check` and `generate:kie:check`.
4. Create `.github/workflows/provider-codegen.yml`. Run both commands in strict
   mode and assert each compared at least one file.
5. Prove the gate by changing one generated metadata field, observing a
   non-zero exit, and restoring it.
6. Confirm that two consecutive fixture-mode runs are byte-stable.

## 7. Add live provider contract probes

Status: OPEN. This is separate from cassette replay.

Old cassettes cannot detect a response that changed today. Start with OpenAI,
Gemini, FAL, and KIE:

1. Check in a probe manifest. Each entry names the provider, model or endpoint,
   response decoder, maximum requests, and maximum USD cost. The first manifest
   is limited to one request and USD 0.05 per provider per nightly run.
2. Add raw HTTP response fixtures at each provider client boundary. Decoder
   tests use these fixtures; normalized `CassetteProvider` replay remains a
   separate contract test.
3. Parse live responses through production decoders. Do not overwrite
   checked-in cassettes automatically.
4. Report network failures separately from schema failures.
5. Redact credentials, prompts, user data, request IDs, and signed URLs from
   retained artifacts.

Acceptance: removing a field from a raw response fixture fails its decoder
test; a changed live shape fails the nightly probe; retained artifacts contain
no secrets or signed URLs.

## 8. Require an eval case for each agent capability

Status: OPEN. Evidence: #5095, #5100, #5103, #5105, and #5107.

1. Add a capability registry that maps each exported capability name to its
   implementation file, scripted selfcheck ID, and eval case IDs/files. Do not
   use broad `SurfaceEntry.paths` as capability coverage.
2. Audit exports from capability implementation and specification files. Fail
   when a new exported capability has no mapping. Infrastructure and adapter
   files are outside this export audit.
3. `nodetool harness gate --base <ref>` requires a new or changed mapping only
   when a capability is added or its declared contract changes. Ordinary
   refactors run the existing mapped checks without requiring an eval edit.
4. Extend `packages/cli/tests/harness-registry.test.ts` with fixtures for a new
   unmapped export and a mapped capability.
5. Add the rule to `packages/agents/AGENTS.md` and create
   `.github/pull_request_template.md`.
6. Invert each new gate once and record the failing command in the PR.

Tests must cover a capability-only failure, a capability-plus-eval pass, an
unregistered-file failure, and a non-agent surface that needs no eval.

## 9. Inventory and consolidate SSRF screening

Status: OPEN. Evidence: #5101.

1. Check in an inventory of every capability, tool, and node parameter that
   can fetch a caller-provided URL. Record owner, schemes, auth scope, redirect
   policy, and screening function.
2. Route the actual public HTTPS operation through redirect-aware `safeFetch`
   from `@nodetool-ai/runtime`. Predicate helpers may reject an initial URL but
   do not replace the protected fetch.
3. Record exemptions for fixed provider hosts and intentional private-network
   integrations.
4. Add an audit that asserts it found URL surfaces and that every entry names a
   policy.
5. Add a contribution checklist: input source, egress target, authorization,
   redirects, and CSP impact.
6. Decide and document DNS rebinding before enforcement: either resolve and pin
   public addresses for the connection, or name the deployment egress control
   as the security boundary. Add the chosen rule to the inventory schema.

Tests must reject alternate IPv4 forms, IPv4-mapped IPv6, loopback, private
networks, metadata addresses, and redirects to blocked addresses. Run
`npm run test --workspace=packages/runtime -- safe-url`.

## 10. Add property tests to seven pure helpers

Status: OPEN. Use one PR per row. Before adding `fast-check`, record why the
current dependencies and table-driven tests are insufficient, check its latest
maintenance date, and inspect its transitive tree with `npm ls fast-check`.
Add it only to the owning workspace.

| Issue | Helper | Workspace | Property |
|---|---|---|---|
| #4909 | `normalizeGraph` and graph validation | execution, node-sdk | Malformed arrays never execute; normalization is idempotent. |
| #4910 | `deriveImageSizePreset` | web | Rotated dimensions preserve the preset; positive dimensions return a valid preset. |
| #5035 | `clampTimeoutSeconds` | agents | Positive finite inputs stay in bounds; sub-second values never become zero. |
| #5091 | `matchesFileWatchPattern` | automation-nodes | Line terminators and glob metacharacters do not alter escaped filename semantics. |
| #4939 | `hasYieldStatement` | node-sdk | Comment markers in strings do not change executable `yield` detection. |
| #4987 | `findMissingModelNodes` | web | A missing provider is reported; a valid provider/model pair is not. |
| #5116 | `mergeIntoSequence` | web | Reassembly preserves track indexes and order, including duplicate indexes. |

Each PR pins the original counterexample, defines generator bounds and a replay
seed, runs in the normal workspace suite, and proves failure by restoring the
original defect once. Before generating values, the test must define its
independent oracle: the complete valid preset set for #4910, parser-derived
executable `yield` locations for #4939, documented glob semantics for #5091,
and stable source order as the tie-breaker for duplicate indexes in #5116.
Split #4909 into one execution normalization property and one node-sdk
validation property.

## 11. Complete editor input-path coverage

Status: OPEN. Use three separate PRs.

### 11A. Shortcut action mapping

`web/src/config/shortcuts.ts` already owns shortcuts and rejects duplicate
slugs. Add a typed action ID used by menus and handlers. Test missing actions,
duplicate normalized combinations within the same active editor context and
OS, Electron-only actions in web menus, and the command-menu shortcut on
Windows and macOS. Duplicate combinations in disjoint contexts remain valid.

### 11B. Canvas drop journeys

Add web Playwright journeys for file drop, node creation from a dropped
connection at the cursor, and run-selected with multiple nodes. Use
`npm --prefix web run test:e2e`. For the Windows Explorer defect, first add an
Electron Playwright dependency, config, script, packaged-app fixture, and
Windows CI job. Update `AGENTS.md` and Electron testing docs with the command.
Run the case on Windows; a Windows-style string on macOS is not sufficient.

### 11C. Dialog containment audit

`PositionedDialog` already clamps to the viewport. Enumerate other dialog
primitives and direct users in a checked-in audit with a non-zero count. A
dialog fails the audit when its rendered bounds extend outside a 600 x 600 px
viewport or its content cannot scroll into view. Migrate failing callers and
add one 600 x 600 px test per migrated primitive.

## Completed work

- **Workflow credential preflight:** shipped 2026-08-22 in node-sdk,
  execution, and CLI. The two execution credential suites cover it.
- **Production Python opt-in:**
  `NODETOOL_ALLOW_PYTHON_BRIDGE_IN_PRODUCTION=1` is implemented in
  `python-stdio-bridge.ts` and documented in `docs/configuration.md`.
- **tRPC POST batches:** issue #3979 is closed. Both tRPC clients set
  `methodOverride: "POST"`.
- **Vite preload recovery:** issue #4203 is closed. Dedicated tests cover stale
  deploys, non-stale failures, and the guard window.
- **Stale Prompt value:** issue #3786 is closed. `PromptComposerBody` commits
  edits synchronously; its commit and run-from-here suites cover the defect.
- **Media resolution as the browser rendering boundary:** shipped 2026-08-22.
  `ResolvedMediaUrl` in `web/src/utils/resolveMediaUri.ts` is the brand;
  `ResponsiveImage`, `VideoPlayer`, and the new `AudioPlayback` take a
  `locator` and resolve it. The rendering surfaces are inventoried in
  `web/src/__tests__/mediaResolutionBoundary.test.ts`, and
  `design-tokens/no-unresolved-media-src` (fixture
  `web/scripts/test-media-src-rule.mjs`) rejects a locator literal in a JSX
  url attribute.
- **Cross-origin media CSP:** issue #5125 is fixed and covered by
  `web/src/__tests__/contentSecurityPolicy.test.ts`.
