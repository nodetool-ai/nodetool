# SDK Non-Regression Baseline - 2026-07-24

> Historical snapshot: the later default-on rollout replaced the positive
> lifecycle/workflow-interface enable flags with the emergency kill switches
> documented in `protocol-v1-scope.md`.

This record supports the Phase 0 gate in the SDK server-contract roadmap. It
separates contract-related results from pre-existing Windows, sandbox, and
dependency failures so later changes can be compared against the same
baseline.

## Passing checks

- Public protocol suite: 625 tests passed, including discovery, lifecycle,
  generated-artifact, framing, and baseline-fixture coverage.
- SDK-affected WebSocket suites: 116 tests passed.
- C# base/VL unit suite: 102 tests passed after adding nullable Python
  capability-metadata coverage.
- Headless VL document suite: 2 tests passed.
- Electron TypeScript check passed.
- CLI TypeScript check passed.
- CLI source smoke executed the base-node DSL fixture in pretty and JSON modes;
  both returned output value `99` with exit code zero.
- Live backend health returned NodeTool `0.7.0-rc.32`.
- Live Vite web root returned HTTP 200.
- Live web workspace loaded 81 workflows, connected to the local worker,
  emitted primitive outputs, and cancelled the test run cleanly. The saved
  primitive fixture did not terminate until its required `select` and list
  inputs were provided.
- Live C# TestConsole discovery fetched 2,527 hybrid node types, 81 workflows,
  and assets over MessagePack WebSocket.
- Live C# TestConsole execution completed `SDK Test - Primitives` with all
  seven graph-derived inputs/outputs after using the authoritative pin names.
- Unrouted capability/static/availability/execution preflight, authorization
  source, orchestration, route-policy, workflow-interface, and legacy
  read-only RPC coverage passes 77 focused tests; the related existing
  graph-validation and cost-estimation suites pass 21 tests.
- The default-off lifecycle flag, live capability snapshot adapter, validated
  response builder, and standalone redacting HTTP handler pass 18 focused
  tests. The production HTTP dispatcher still returns 404 for the reserved
  capabilities path.
- The standalone preflight HTTP adapter passes 10 transport-boundary tests for
  default-off behavior, validation, authenticated-principal injection,
  authorization-safe service errors, and redaction. Its reserved path also
  remains absent from the production dispatcher.
- Provider-scoped model availability passes 6 focused tests covering recorded
  provider/type context, registered and configured state, exact model
  presence in an injected cache/local inventory, bounded timeout, and
  conservative unknown results. It performs no implicit remote provider list.
- Cached model inventory composition passes 4 focused tests covering
  Python/TypeScript-shaped records, ID/repository aliases, explicit provider
  association, bridge readiness, and redacted cache failures.
- The combined feature-flag, disabled-current-route, REST/tRPC/WebSocket
  discovery, authorization, and existing execution/admission regression set
  passes 264 tests across 22 files.
- The WebSocket package TypeScript check passes after replacing the
  Sharp-namespace annotation with the constructor's inferred return type.

## Baseline failures outside this change

The full Node SDK run passed 602 tests, skipped 2, and failed 8:

- seven tests compare POSIX slash suffixes against Windows paths;
- one metadata-cache test depends on filesystem timestamp/cache behavior.

The full WebSocket run passed 1,460 tests and failed 31:

- Windows path and simulated POSIX-home expectations;
- sandboxed home/file access returning `FORBIDDEN`;
- restricted writes below the real roaming asset directory;
- macOS font/config fixtures on Windows;
- model discovery startup timing;
- one SDK inventory test timing out only in the full parallel run (it passes
  in the focused suite).

The full CLI run passed 371 tests and failed 8 before the Windows DSL import
fix:

- two output assertions expected POSIX separators;
- three source-level DSL imports failed because a Windows drive path was not
  converted to a `file://` URL;
- three dist-level integration checks used the stale pre-fix CLI build.

The source-level path and output issues are fixed. Rebuilding the CLI dist is
currently blocked by the repository's pre-existing `sharp` callable-type
errors in runtime/image-node workspaces. Direct source smoke coverage passes.

The first live C# discovery pass found Python metadata with
`supports_dynamic_outputs: null`. The portable SDK now maps null optional
capability flags to the same false default as omitted fields, and the live
discovery pass succeeds.

The Web TypeScript check did not complete within the 180-second local timeout.

## Phase 2 read-only readiness verification (2026-07-25)

- The SDK/lifecycle WebSocket regression selection passes 289 tests across 26
  files, including default-off route policy, package provenance, cached model
  inventory, active download state, persisted-worker readiness, authorization,
  capacity, and current workflow execution.
- The Hugging Face package passes its complete suite: 187 tests across 9 files.
- Node SDK package-provenance focused coverage passes 68 tests across registry,
  Python metadata, and third-party pack loading.
- The complete Node SDK suite passes 604 tests with 2 skipped and retains 8
  existing Windows-sensitive failures: six forward-slash path assertions, one
  environment path-list assertion, and one metadata-cache timing assertion.
  None exercises package provenance; the focused provenance tests pass.
- TypeScript checks pass for `node-sdk`, `huggingface`, and `websocket`.
- `git diff --check` passes, and lifecycle capabilities/preflight handlers
  remain absent from the production dispatcher.
- A live read-only check against the restarted development server returned
  HTTP 200 with the current node metadata payload, while
  `/api/sdk/v1/capabilities` still returned HTTP 404 as required before route
  activation.

## Interactive checks still required

Do not mark the Phase 0 client gate complete until these are rerun against the
current working tree:

- execute a terminal small workflow through the Electron shell (the browser
  client and C# TestConsole paths now pass);
- with SDK discovery enabled, open the VL help patch and execute primitives
  plus one asset/media workflow;
- restart with all newly introduced SDK flags disabled and verify a current
  Electron workflow plus current asset behavior. The new VL discovery surface
  is expected to be unavailable in this mode. This includes
  `NODETOOL_ENABLE_SDK_LIFECYCLE_V1=0`. Automated workflow, node, asset, and
  execution/admission coverage with the flags explicitly disabled passes.
