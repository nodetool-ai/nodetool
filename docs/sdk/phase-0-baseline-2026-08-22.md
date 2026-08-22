# SDK v1 Contract Baseline - 2026-08-22 (Phase 0)

This record freezes the SDK v1 server contract for Phase 0 of
[sdk-trpc-consolidation.md](sdk-trpc-consolidation.md). Everything below is
pinned by fixtures and tests; the convergence phases must keep these checks
green without regenerating the fixtures.

## Commit and commands

- Server commit: `8fb47bba9f59f214485680bbe0fa5aa42d5dc3f6`. Captures were
  made in this working tree while the Phase 1 protocol-registry commits
  (`322dbc0`..`8fb47bb`) landed in `packages/protocol`; all 23 checks were
  re-run green at this commit against the rebuilt protocol `dist`.
- Golden fixtures: `packages/protocol/fixtures/sdk-v1/` (11 HTTP files, 8
  WebSocket files, README with the format and regeneration rules).
- Reproduce:

```bash
cd packages/websocket
npx vitest run tests/sdk-v1-http-goldens.test.ts tests/sdk-v1-ws-goldens.test.ts \
  tests/sdk-v1-route-inventory.test.ts tests/sdk-v1-trpc-caller-inventory.test.ts
# Regenerate fixtures (then rerun without the flag and review the diff):
NODETOOL_UPDATE_SDK_V1_GOLDENS=1 npx vitest run tests/sdk-v1-http-goldens.test.ts tests/sdk-v1-ws-goldens.test.ts
```

The four files run 23 tests. The route plugins are booted exactly as
`server.ts` boots them (same plugins, same raw-Buffer body parser); services
are injected constants and the clock is frozen so bodies are byte-stable.

## HTTP inventory (11 implemented operations)

All Fastify mounts are registered in `server.ts:1337-1339` through three
plugins. `handleApiRequest` (`http-api.ts:2517`) is a second dispatcher used
by the standalone Node HTTP server path (`createHttpApiServer` /
`handleNodeHttpRequest`); it covers only 6 of the 11, which is the recorded
drift risk. `sdk-v1-route-inventory.test.ts` pins both sets.

| Operation | Route | Owner (Fastify mount) | In 2nd dispatcher | Auth | Feature flag |
| --- | --- | --- | --- | --- | --- |
| Node type inventory | `GET /api/sdk/v1/node-types` | `routes/nodes.ts:39` | yes | discovery | workflow-interface |
| Capabilities | `GET /api/sdk/v1/capabilities` | `routes/nodes.ts:45` | yes | discovery | lifecycle |
| Model catalog | `GET /api/sdk/v1/models` | `routes/nodes.ts:51` | no | discovery | none |
| List model downloads | `GET /api/sdk/v1/model-downloads` | `routes/nodes.ts:57` | no | authenticated | none |
| Start model download | `POST /api/sdk/v1/model-downloads` | `routes/nodes.ts:63` | no | authenticated | none |
| Cancel model download | `POST /api/sdk/v1/model-downloads/cancel` | `routes/nodes.ts:69` | no | authenticated | none |
| Preflight | `POST /api/sdk/v1/preflight` | `routes/nodes.ts:75` | yes | authenticated | lifecycle |
| Workflow summaries | `GET /api/sdk/v1/workflows` | `routes/workflows.ts:111` | yes | discovery | workflow-interface |
| Workflow interfaces | `POST /api/sdk/v1/workflow-interfaces` | `routes/workflows.ts:117` | yes | discovery | workflow-interface |
| One workflow interface | `GET /api/workflows/:id/interface` | `routes/workflows.ts:183` | yes | discovery | workflow-interface |
| Temporary asset upload | `POST /api/sdk/v1/assets/temporary` | `routes/assets.ts:220` | no | authenticated | lifecycle |

Handlers: `handleSdkNodeTypeInventory` (`http-api.ts:1929`),
`handleSdkCapabilities` (`:215`), `handleSdkModelCatalog` (`:263`), the three
model-download wrappers (`:286-332`), `handleSdkPreflight` (`:235`),
`handleSdkWorkflowSummaries` (`:1994`), `handleWorkflowInterface` (`:2053`),
`handleWorkflowInterfaces` (`:2092`), `handleSdkV1TemporaryAssetUpload`
(`sdk/sdk-temporary-asset-upload-http-handler.ts:49`).

### Auth policy

- The server `onRequest` hook (`server.ts:897`) lets a request through
  without credentials when `isSdkV1DiscoveryRequest`
  (`sdk/sdk-route-policy.ts`) matches it and SDK auth is not required. The
  discovery allowlist is exactly: `GET` capabilities, models, node-types,
  workflows, `/api/workflows/{id}/interface`, and `POST workflow-interfaces`.
- Preflight, model downloads, and temporary upload are never in the
  allowlist; the server hook authenticates them and answers
  `401 {"error":"Unauthorized"}` itself when it cannot.
- Inside the handlers, `getUserId` falls back to the `x-user-id` header and
  then `"1"`; only preflight carries its own 401
  (`AUTHENTICATION_REQUIRED`, captured in the goldens) when no principal is
  resolved. `bridge()` strips a client-sent `x-user-id` and forwards only the
  server-authenticated identity.
- The second dispatcher trusts `x-user-id` directly; its deployment
  (loopback Node server) provides the boundary.

### Feature flags (`sdk/sdk-feature-flags.ts`)

- `NODETOOL_REQUIRE_SDK_AUTH_V1` - opt-in, active only when exactly `"1"`;
  removes the discovery exemption.
- `NODETOOL_DISABLE_SDK_WORKFLOW_INTERFACE_V1` - kill switch; the feature is
  on unless the value is exactly `"1"`. Guards node-types, workflow
  summaries, workflow-interfaces, and the single interface route.
- `NODETOOL_DISABLE_SDK_LIFECYCLE_V1` - same semantics. Guards capabilities,
  preflight, and temporary upload. Models and model downloads check **no**
  flag.

Feature-disabled bodies are `503` with the SDK error shape:
`SDK_NODE_TYPE_INVENTORY_DISABLED`, `SDK_WORKFLOW_INTERFACE_DISABLED`, or
`SDK_LIFECYCLE_DISABLED`.

### Content types, statuses, error shapes

- Every SDK response body is `content-type: application/json` (no charset).
  Fastify's own responses (its 404 for a wrong method on a single-method
  path) use `application/json; charset=utf-8`.
- SDK error shape: `{code, message, retryable, detail}` with `detail`
  duplicating `message` for older clients.
- Statuses captured per operation: 200 success (202 for download start),
  400 bad input, 401 (preflight only, in-handler), 404 not-found
  (`WORKFLOW_NOT_FOUND`, `MODEL_DOWNLOAD_NOT_FOUND`), 413
  (`UPLOAD_TOO_LARGE`), 415 (preflight non-JSON content type), 500 redacted
  (`INTERNAL_ERROR`, `retryable: true`), 503 feature-disabled.
- **405 inconsistency (kept as-is):** the handlers written before the SDK
  error shape answer a wrong method with the legacy body
  `{"detail":"Method not allowed"}` - node-types, workflow summaries,
  workflow-interfaces, and the single interface route. The newer standalone
  handlers (capabilities, preflight, models, model downloads, temporary
  upload) answer the SDK shape with `code: "METHOD_NOT_ALLOWED"`. On the
  Fastify server a 405 is reachable only where a path has another method
  bound; otherwise the wrong method is Fastify's 404
  (`{"message":"Route POST:/api/sdk/v1/models not found", ...}`). The
  goldens capture all three behaviors.
- Order of checks differs per handler and is pinned by the goldens: the
  single interface route validates `version=1` before its feature flag
  (400 wins over 503), workflow-interfaces validates the body first, and
  preflight checks flag, then content type, then body, then principal.

### Multipart temporary upload

- Handler: `sdk-temporary-asset-upload-http-handler.ts`. Field name `file`
  is required; a non-multipart body is `400 INVALID_REQUEST`.
- Size limit: `getMaxUploadBytes()` - default 1 GiB, override
  `NODETOOL_MAX_UPLOAD_BYTES`; exceeding it is `413 UPLOAD_TOO_LARGE` with
  the limit in the message (goldens pin the limit at 64 bytes through the
  handler's injection point). The Fastify server additionally caps any
  request body at 100 MB (`bodyLimit`, `server.ts:702`).
- Media type defaults to `application/octet-stream`; an empty filename falls
  back to `<id>.<ext>` derived from the media type.
- Temporary ID shape: key `temp/sdk-inputs/<id>.<ext>`; the returned `uri`
  is the storage URI, except a `file://` URI is rewritten to
  `/api/storage/temp/sdk-inputs/<id>.<ext>`. Response:
  `{version: 1, uri, name, content_type, size, expires_at: null}`.
- Cleanup semantics: no `Asset` row and no thumbnail are created; retention
  belongs to the configured temporary store (`getTempAdapter()`), and
  `expires_at` is always `null` today.

## WebSocket inventory

Six request/response commands are implemented, all through
`UnifiedWebSocketRunner.handleCommand` (`unified-websocket-runner.ts:8666`),
answering a binary MessagePack `rpc_response` frame (`packWebSocketMessage`,
`useRecords: false`, `encodeUndefinedAsNil: true`):

| Command | Dispatch |
| --- | --- |
| `list_workflow_summaries` | in-process tRPC `workflows.sdkSummaries` (`:9011`) |
| `get_workflow_interface` | in-process tRPC `workflows.interface` (`:9019`) |
| `get_workflow_interfaces` | in-process tRPC `workflows.interfaces` (`:9027`) |
| `get_node_type_inventory` | in-process tRPC `nodes.sdkTypeInventory` (`:9059`) |
| `get_capabilities` | `handleSdkV1LifecycleRpc` (`:9067`, no tRPC hop) |
| `preflight_workflow` | `handleSdkV1LifecycleRpc` (`:9067`, no tRPC hop) |

No SDK v1 server events are implemented; `sdkV1LifecycleRpcCommand` also
names `submit_job`, `get_job_snapshot`, `subscribe_job`, and `cancel_job`
as planned commands the handler does not serve.

Two error-envelope shapes exist and both are pinned as msgpack goldens:

- Lifecycle commands: `error: {code, message, retryable}` (for example
  `SDK_LIFECYCLE_DISABLED`).
- tRPC-backed commands (`runRpc`, `:8591`):
  `error: {code, message, retryable, apiCode, trpcCode}` - the disabled
  workflow-interface capture is
  `{code: "SERVICE_UNAVAILABLE", message: "SDK discovery is disabled",
  retryable: false, apiCode: "SERVICE_UNAVAILABLE",
  trpcCode: "INTERNAL_SERVER_ERROR"}`.

## tRPC procedures and callers

All four are `protectedProcedure` queries validating with the schema objects
exported by `@nodetool-ai/protocol` (identity pinned by
`sdk-v1-trpc-caller-inventory.test.ts`):

| Procedure | Declaration | In-repo callers |
| --- | --- | --- |
| `workflows.sdkSummaries` | `trpc/routers/workflows.ts:472` | `unified-websocket-runner.ts:9014` |
| `workflows.interface` | `trpc/routers/workflows.ts:546` | `unified-websocket-runner.ts:9022` |
| `workflows.interfaces` | `trpc/routers/workflows.ts:561` | `unified-websocket-runner.ts:9030` |
| `nodes.sdkTypeInventory` | `trpc/routers/nodes.ts:126` | `unified-websocket-runner.ts:9062` |

Also name-referencing (not calling): `trpc/sandbox-coverage.ts:505,871`
classifies `nodes.sdkTypeInventory` and `workflows.sdkSummaries` in the
sandbox capability table; a rename must update that table too. The web app's
tRPC client, the CLI, and the agents package call none of the four.

### Out-of-repository consumer audit

Evidence commands (run at this commit from the repo root; all returned
nothing):

```bash
grep -rn "sdkSummaries" web/src electron/src mobile/src
grep -rn "sdkTypeInventory" web/src electron/src mobile/src
grep -rn "trpc.workflows.interface" web/src electron/src mobile/src
grep -rn "workflow-interfaces" web/src electron/src mobile/src
grep -rn "/api/sdk/v1" web/src electron/src mobile/src
grep -rn "list_workflow_summaries\|get_node_type_inventory\|get_workflow_interface" web/src electron/src mobile/src
```

Positive control: `grep -rn "trpc.workflows.list" web/src` returns hits, so
an empty result is a real absence, not a broken probe. This confirms the
plan's statement that the web app does not call the SDK routes. The known
external consumer remains the C#/VL SDK in `nodetool-sdk`, which uses the
public HTTP and WebSocket surface, not tRPC.

## Drift checks verified

Each new check was made to fail once by doctoring one input, then restored:

| Check | Doctored input | Observed failure |
| --- | --- | --- |
| `sdk-v1-http-goldens` | one byte in `http-get-workflows.json` success body (`"SDK Golden One"` -> `"SDK Golden 0ne"`) | `AssertionError: workflow_summaries/success: expected { …(2) } to deeply equal { next: null, workflows: [ …(2) ] }` |
| `sdk-v1-ws-goldens` | first hex char of `messagepack_response_hex` in `ws-get-workflow-interface.json` (`d` -> `f`) | `AssertionError: expected 'de0004a474797065ac7270635f…' to be 'fe0004a474797065ac7270635f…'` |
| `sdk-v1-route-inventory` | removed `GET /api/sdk/v1/capabilities` from the expected route list | `AssertionError: expected [ …(11) ] to deeply equal [ …(10) ]` |
| `sdk-v1-trpc-caller-inventory` | call-site pattern changed to `caller.nodes.sdkTypeInventoryX(` | `AssertionError: expected +0 to be 1` |

## Determinism notes

- `Date` is frozen at `2026-08-22T12:00:00.000Z`; `Workflow.beforeSave`
  bumps a same-instant `updated_at` by 1 ms, so the summaries `revision` is
  `…:00.001Z` and the interface `etag` (a hash of the row) is stable.
- `unavailable_packs` in the node-type inventory reflects the in-repo
  built-in pack catalog (7 packs disabled by default at this commit) with
  `NODETOOL_PACKS_CONFIG` pointed at a nonexistent file; a catalog change
  legitimately regenerates that fixture.
- The multipart boundary is the one random request element; it is not
  recorded (the fixture stores a multipart descriptor instead).

## Test-run record

- New Phase 0 files: 4 files, 23 tests, all passing
  (`sdk-v1-http-goldens` 11, `sdk-v1-ws-goldens` 8, `sdk-v1-route-inventory`
  2, `sdk-v1-trpc-caller-inventory` 2).
- `npm run lint --workspace=packages/websocket` (`tsc --noEmit`) passes. The
  package tsconfig excludes `tests/`, so the new test files were also
  typechecked directly (strict, same base config) with no errors.
- Full `npm run test --workspace=packages/websocket`: 218 files, 2,343
  tests, all passing (263 s, Linux sandbox, Node 22). No pre-existing
  failures in this environment; the Windows-sensitive failures listed in
  [non-regression-baseline-2026-07-24.md](non-regression-baseline-2026-07-24.md)
  do not reproduce here.
