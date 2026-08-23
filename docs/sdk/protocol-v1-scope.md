# Public SDK Protocol v1 Scope

This document defines the first public NodeTool SDK transport boundary. The
declaration registry and generated artifacts are authoritative for individual
schemas and status codes.

## Transport split

SDK discovery and control use JSON HTTP under `/api/sdk/v1`. SDK execution and
live events use MessagePack WebSocket frames on `/ws`. C# clients do not use
tRPC; tRPC remains an internal product API for TypeScript clients.

The HTTP profile contains:

- workflow summaries and workflow interfaces;
- node-type inventory;
- capabilities and workflow preflight;
- model catalog and model-download control;
- temporary asset upload.

The single-workflow route is
`GET /api/sdk/v1/workflows/{id}/interface?version=1`. There is no legacy
`/api/workflows/{id}/interface` SDK alias.

The execution profile contains these client commands:

- `run_job`;
- `cancel_job`;
- `reconnect_job`;
- `stream_input`;
- `end_input_stream`;
- `update_node_properties`.

It also declares target selection, replay, live updates, terminal results, and
protocol errors consumed by the SDK. Discovery, capabilities, preflight, and
model operations are not duplicated as WebSocket RPC commands.

## HTTP behavior

One declaration-driven Fastify plugin owns every SDK v1 route and calls the
typed SDK service boundary directly. Multipart temporary upload is the only
specialized adapter.

Every SDK HTTP failure has exactly this JSON shape:

```json
{
  "code": "STABLE_MACHINE_CODE",
  "message": "Safe human-readable message",
  "retryable": false
}
```

Responses use `application/json`. The public error contract has no `detail`,
`apiCode`, `trpcCode`, stack trace, or provider/backend detail. Unexpected
failures are logged server-side and return `INTERNAL_ERROR` with
`Internal server error`.

Request schemas reject unknown fields. Response schemas are additive: clients
must ignore response fields they do not understand.

## WebSocket behavior

Binary frames contain one MessagePack object. Execution commands keep their
existing job correlation, cancellation, reconnect/replay, streaming input,
streaming output, live progress, and terminal delivery behavior. JSON-text mode
may remain available for NodeTool diagnostics, but it is not the C# SDK's
public execution encoding.

The byte-exact execution fixture is
`packages/protocol/fixtures/sdk-v1/execution-wire.json`. HTTP goldens are under
`packages/protocol/fixtures/sdk-v1/http-*.json`.

## Generated contract artifacts

The Zod declarations generate:

- `sdk-v1.openapi.json` and `sdk-v1.openapi.implemented.json`;
- `sdk-v1.asyncapi.json` and `sdk-v1.asyncapi.implemented.json`;
- discovery, lifecycle, and execution JSON Schema bundles;
- the operation manifest and artifact manifest.

Use `npm run generate:sdk-protocol --workspace=packages/protocol` to regenerate
them and `npm run check:sdk-protocol --workspace=packages/protocol` to detect
stale artifacts. Release bundles include the artifacts, fixtures,
compatibility policy, and deterministic digests.

## Authentication and feature policy

The normal Fastify authentication hook owns authenticated identity. The SDK
route layer never trusts a caller-supplied identity forwarded through a second
HTTP adapter. Missing and inaccessible workflows both map to
`WORKFLOW_NOT_FOUND`.

The emergency kill switches remain:

- `NODETOOL_DISABLE_SDK_WORKFLOW_INTERFACE_V1` for workflow discovery and
  node-type inventory;
- `NODETOOL_DISABLE_SDK_LIFECYCLE_V1` for capabilities, preflight, and
  temporary upload;
- `NODETOOL_REQUIRE_SDK_AUTH_V1` for deployments that require SDK discovery
  authentication in otherwise trusted-local mode.

These policies do not change non-SDK web, Electron, mobile, CLI, agent, asset,
or execution behavior.

## Not public SDK contracts

The following remain internal:

- tRPC procedures and batching details;
- Python bridge messages and process lifecycle;
- database schemas;
- editor and ReactFlow state;
- provider-specific request objects;
- runner implementation details and legacy full-workflow editor responses.

The SDK uses NodeTool's existing workflow, validation, runner, job, model, and
asset services; it does not introduce a second execution engine.
