# Public SDK Protocol v1 Scope

This document classifies the current NodeTool protocol before new SDK
operations are added. It is a scope boundary, not the final protocol reference.

The current automated and interactive gate status is recorded in
`docs/sdk/non-regression-baseline-2026-07-24.md`.

## Current public core

The initial public SDK profile contains:

- compact workflow summaries;
- graph-derived workflow interface v1;
- bounded bulk workflow-interface retrieval;
- bounded hybrid TypeScript/Python node-type inventory;
- correlated read-only WebSocket RPC envelopes;
- JSON HTTP responses;
- MessagePack WebSocket frames.

The current public discovery operations are:

| Operation           | HTTP                                         | WebSocket command         |
| ------------------- | -------------------------------------------- | ------------------------- |
| Workflow summaries  | `GET /api/sdk/v1/workflows`                  | `list_workflow_summaries` |
| Workflow interface  | `GET /api/workflows/:id/interface?version=1` | `get_workflow_interface`  |
| Workflow interfaces | `POST /api/sdk/v1/workflow-interfaces`       | `get_workflow_interfaces` |
| Node-type inventory | `GET /api/sdk/v1/node-types`                 | `get_node_type_inventory` |
| Capabilities        | `GET /api/sdk/v1/capabilities`               | `get_capabilities`        |
| Workflow preflight  | `POST /api/sdk/v1/preflight`                 | `preflight_workflow`      |
| Temporary input     | `POST /api/sdk/v1/assets/temporary`          | -                         |

The same workflow-interface services and authorization rules back all
transports.

## Current transport behavior

MessagePack is the supported and default SDK encoding on `/ws`. The current
server also accepts JSON-text commands, and a client can send `set_mode` to
request JSON-text responses. That behavior is captured for regression and
diagnostic coverage, but is not part of the initial public SDK guarantee.
Correlated read-only SDK commands require a non-empty `request_id`.

Each WebSocket frame carries exactly one top-level message object. Binary
frames contain one MessagePack object; text frames contain one UTF-8 JSON
object. The connection starts in `binary` outbound mode. Sending
`{"command":"set_mode","data":{"mode":"text"}}` selects JSON-text responses;
using `"binary"` selects MessagePack again. The `set_mode` acknowledgement is
encoded in the previous mode because the change takes effect after that
acknowledgement is queued.

The baseline payloads are stored in
`packages/protocol/fixtures/sdk-v1-baseline.json`. Tests validate the REST
shapes, JSON text, and exact MessagePack bytes.

## Generated contract artifacts

The current public discovery profile is published from the Zod source schemas
as:

- `packages/protocol/schema/sdk-v1.discovery.schema.json`;
- `packages/protocol/schema/sdk-v1.manifest.json`.

The manifest records protocol version 1, the public and optional profiles,
the default WebSocket encoding, and a SHA-256 digest for each artifact.
`npm run generate:sdk-protocol --workspace=packages/protocol` regenerates the
bundle. `npm run check:sdk-protocol --workspace=packages/protocol` and the
protocol tests fail when committed artifacts are stale.

The bundle also contains draft OpenAPI 3.1 and AsyncAPI 3.0 documents for the
current discovery profile. They remain marked `draft` while the wider job and
asset profiles are still being designed.

The lifecycle vocabulary and state-machine semantics are defined in
`docs/sdk/lifecycle-v1-draft.md` and generated as
`packages/protocol/schema/sdk-v1.lifecycle.schema.json`. Capabilities,
preflight, and temporary SDK input upload are additive and enabled by default.
Deployments can disable
lifecycle v1 with `NODETOOL_DISABLE_SDK_LIFECYCLE_V1=1`; later job operations
remain explicitly marked planned. AsyncAPI lifecycle entries are marked
partial because their union contains both implemented and planned commands.

## Errors and correlation

Public SDK errors share these required fields:

- `code`: stable machine-readable identifier;
- `message`: safe human-readable summary;
- `retryable`: whether retrying without changing the request may succeed.

HTTP discovery errors retain `detail` during migration. Correlated WebSocket
errors retain `apiCode` and `trpcCode`. Those compatibility fields must not be
used as the portable error contract.

Expected SDK errors use an allowlisted public message. Unexpected HTTP and
WebSocket failures return `INTERNAL_ERROR` with `Internal server error`; the
internal exception is logged server-side and is not placed on the wire.
Protocol v1 does not expose stack traces, database errors, credentials,
provider responses, or arbitrary exception details.

Every read-only WebSocket RPC request requires a non-empty, client-generated
`request_id`. The server echoes it unchanged in exactly one `rpc_response`.
Clients should not reuse a request ID while an earlier request with that ID is
pending.

## Additive compatibility

Generated request schemas reject unknown fields. A new request shape or
command therefore requires a protocol version or advertised capability.

Generated response schemas allow additional fields at every object level.
Clients must ignore response fields they do not understand. Event consumers
must likewise ignore an unknown event type after safely advancing its stream
position; they must not reinterpret it as a known event. Required fields are
not removed or repurposed within protocol v1.

The full v1 change rules, released-bundle layout, digest scheme, and semantic
diff categories are specified in `docs/sdk/protocol-v1-compatibility.md`.

## Authentication boundary

Current local discovery behavior is preserved by default. When NodeTool's
server authentication is enabled, SDK discovery always uses the normal
authentication hook. `NODETOOL_REQUIRE_SDK_AUTH_V1=1` can additionally require
that hook in a local deployment. Trusted loopback behavior remains controlled
by NodeTool's existing local-trust settings.

The Fastify-to-Web-API bridge strips caller-supplied `x-user-id` and forwards
only the server-authenticated identity. Missing and inaccessible workflows
both return `WORKFLOW_NOT_FOUND`, so discovery does not reveal whether another
user owns a requested workflow.

## Feature flags

| Flag                                         | Default                     | Owner                       | Protected behavior                                                                                                      |
| -------------------------------------------- | --------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `NODETOOL_DISABLE_SDK_WORKFLOW_INTERFACE_V1` | Enabled unless exactly `1`  | WebSocket/API server        | Emergency kill switch for SDK workflow summaries, interfaces, and node-type inventory                                   |
| `NODETOOL_REQUIRE_SDK_AUTH_V1`               | Disabled unless exactly `1` | Fastify authentication hook | Require verified identity for SDK discovery even when the server otherwise runs in local mode                           |
| `NODETOOL_DISABLE_SDK_LIFECYCLE_V1`          | Enabled unless exactly `1`  | WebSocket/API server        | Emergency kill switch for capabilities, preflight, and temporary SDK input upload; later job-lifecycle operations remain unregistered |

The two additive SDK profiles are available without special server startup.
Their kill switches preserve the existing non-SDK workflow, execution, asset,
web, Electron, CLI, and agent behavior. Authentication and deployment policy
remain server-owned and cannot be enabled by a client.

## Optional profiles

These areas require separate versioning or capability advertisement before
they become public SDK behavior:

- acknowledged job submission, snapshots, replay, and cancellation;
- durable canonical asset retention, leases/cleanup, and result manifests;
- agent chat and tool-call transport;
- offline workflow/model bundles.

## Internal implementation

The following are not public SDK contracts:

- Python bridge messages and process lifecycle;
- database schemas and Drizzle models;
- tRPC router internals;
- editor and ReactFlow state;
- provider-specific request objects;
- in-memory queue and runner implementation details;
- legacy full-workflow responses used by the current editor.

Public endpoints extend the existing validation, workflow, runner, job, and
asset services. They do not introduce a second execution engine.

Readiness adapters follow least-authority boundaries:

- node-package requirements use exact provenance recorded by registry loaders
  and registrars; namespaces are not package identities;
- model availability reads cache/local inventory, and download readiness may
  read immutable snapshots of already-tracked downloads;
- remote-worker readiness may read persisted worker rows, but does not refresh
  provider status, reconcile, attach, resume, or provision;
- preflight does not install packages, download models, reserve capacity,
  create jobs, or call paid inference operations.

## Compatibility policy

Current NodeTool behavior must remain operational while the SDK profile grows.
New routes and commands are additive and initially opt-in. Existing `run_job`
and current discovery routes remain available until current clients migrate
and their cutover tests pass.

The SDK does not promise compatibility with retired NodeTool server releases.
