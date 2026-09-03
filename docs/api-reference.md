---
layout: page
title: "API Reference"
description: "REST, WebSocket, and OpenAI-compatible API endpoints for NodeTool workflows, chat, and model access."
---



## Server Architecture

NodeTool runs a single Fastify HTTP + WebSocket server (`@nodetool-ai/websocket` — `packages/websocket/src/server.ts`). The same process serves:

- REST routes under `/api/*` (workflows, assets, storage, and the surfaces in the matrix below). Jobs, models, and settings are tRPC procedures, not REST.
- OpenAI-compatible `/v1/chat/completions` and `/v1/models`.
- WebSocket endpoints for workflow execution, chat, the browser extension, and downloads.
- Health and liveness probes.

Start it with `nodetool serve` (default `127.0.0.1:7777`). `serve` accepts only `--host` and `--port` — there is no `--mode` flag.

## Endpoint Matrix

For detailed schemas, see [Chat API](chat-api.md) and [Workflow API](workflow-api.md).

| Area       | Path                              | Method / Protocol | Auth                                           | Streaming                   | Notes |
|-----------|-----------------------------------|-------------------|------------------------------------------------|-----------------------------|-------|
| Models    | `/v1/models`                      | `GET`             | Bearer when `AUTH_PROVIDER` enforces           | no                          | OpenAI-compatible model listing |
| Chat      | `/v1/chat/completions`            | `POST`            | Bearer when `AUTH_PROVIDER` enforces           | SSE when `"stream": true`   | OpenAI-compatible chat; SSE or single JSON |
| Workflows | `/api/workflows`                  | `GET`             | Depends on `AUTH_PROVIDER`                     | no                          | List workflows |
| Workflows | `/api/workflows/{id}/run`         | `POST`            | Depends on `AUTH_PROVIDER`                     | no                          | Run a workflow once, return final outputs as one JSON response |
| Workflows | `/api/workflows/names`            | `GET`             | Depends on `AUTH_PROVIDER`                     | no                          | `{id: name}` for the caller's workflows (up to 1000) |
| Workflows | `/api/workflows/tools`            | `GET`             | Depends on `AUTH_PROVIDER`                     | no                          | Workflows saved with `run_mode: "tool"`, as `{name, tool_name, description}` |
| Workflows | `/api/workflows/{id}/dsl-export`  | `GET`             | Depends on `AUTH_PROVIDER`                     | no                          | Graph as TypeScript DSL source (`text/plain`) |
| Workflows | `/api/workflows/{id}/export-bundle` | `GET`           | Depends on `AUTH_PROVIDER`                     | no                          | One workflow and its assets as a `.nodetool` zip |
| Workflows | `/api/workflows/export-bundle`    | `POST`            | Depends on `AUTH_PROVIDER`                     | no                          | Several workflows in one `.nodetool` zip, by `workflow_ids` |
| Workflows | `/api/workflows/import-bundle`    | `POST`            | Depends on `AUTH_PROVIDER`                     | no                          | Import a `.nodetool` zip into the caller's library |
| Workflows | `/api/debug/sessions/{id}`        | `GET`             | Depends on `AUTH_PROVIDER`                     | no                          | State of an interactive run: the escalation it is parked on, or its final report |
| Workflows | `/api/debug/sessions/{id}/verdict` | `POST`           | Depends on `AUTH_PROVIDER`                     | no                          | Answer the parked escalation, then wait for the next one or the final report |
| Workflows | `/api/debug/sessions/{id}/cancel` | `POST`            | Depends on `AUTH_PROVIDER`                     | no                          | Cancel the run and return its final report |
| SDK       | `/api/sdk/v1/workflows/{id}/interface` | `GET`        | Depends on `AUTH_PROVIDER`                     | no                          | One workflow's input and output pins; `?version=1` is required |
| Workflows | `/api/workflows/public`           | `GET`             | none                                           | no                          | Workflows the owner marked `access: "public"` |
| Workflows | `/api/workflows/public/{id}`      | `GET`             | none                                           | no                          | One public workflow; `404` when it is not public |
| Examples  | `/api/workflows/examples`         | `GET`             | none                                           | no                          | Shipped example templates — metadata only, `graph` is empty |
| Examples  | `/api/workflows/examples/search`  | `GET`             | none                                           | no                          | Same list filtered by `?query=` over name, description, tags |
| Examples  | `/api/workflows/examples/thumbnails/{filename}` | `GET` | none                                     | no                          | Example thumbnail; `.jpg` and `.png` only |
| Examples  | `/api/workflows/examples/{package}/{example}` | `GET`  | none                                           | no                          | One example with its full `graph`, unlike the list; `404` when the package has no example by that name |
| Triggers  | `/api/webhooks/{token}`           | `POST`            | `x-webhook-secret` header (no session)         | no                          | Deliver an event to a `webhook` trigger registration; wakes the workflow without waiting for the next poll |
| Integrations | `/api/integrations/{provider}/link/start` | `POST`     | `NODETOOL_INTEGRATION_TOKEN` bearer (no session) | no                        | Mint a one-time link code and the URL that redeems it; 10-minute TTL |
| Integrations | `/api/integrations/{provider}/link/complete` | `POST`  | `NODETOOL_INTEGRATION_TOKEN` bearer (no session) | no                        | Redeem a link code, binding the external account to a NodeTool user |
| Integrations | `/api/integrations/{provider}/token` | `POST`            | `NODETOOL_INTEGRATION_TOKEN` bearer (no session) | no                        | Exchange a linked external id for a one-hour delegated user token; `409` in local single-user mode |
| Integrations | `/api/integrations/{provider}/link` | `DELETE`           | `NODETOOL_INTEGRATION_TOKEN` bearer (no session) | no                        | Unlink an external account; `{"unlinked": false}` when it was not linked |
| MCP OAuth | `/.well-known/oauth-protected-resource` | `GET`       | none                                           | no                          | RFC 9728 resource metadata for `/mcp`; `404` unless the flow is enabled. The path-inserted form `…/mcp` returns the same document |
| MCP OAuth | `/.well-known/oauth-authorization-server` | `GET`     | none                                           | no                          | RFC 8414 authorization-server metadata — the endpoint URLs a client discovers; `404` unless the flow is enabled |
| MCP OAuth | `/oauth/authorize`                | `GET`             | none (PKCE)                                    | no                          | Park an authorization request and `302` to the consent page `/oauth/consent?request_id=…` |
| MCP OAuth | `/oauth/token`                    | `POST`            | none (PKCE)                                    | no                          | Exchange an authorization code or refresh token for an `nta_` access token |
| MCP OAuth | `/oauth/register`                 | `POST`            | none                                           | no                          | RFC 7591 dynamic client registration |
| MCP OAuth | `/oauth/revoke`                   | `POST`            | none                                           | no                          | RFC 7009 revocation of an access or refresh token |
| Nodes     | `/api/nodes/metadata`             | `GET`             | none                                           | no                          | The node registry the editor loads at boot; slim summaries by default, one node's full metadata with `?node_type=` |
| Workspaces | `/api/workspaces/{id}/download/{path}` | `GET`        | Depends on `AUTH_PROVIDER`                     | streaming                   | One file out of a workspace as an attachment; `403` when `NODETOOL_ENV=production` |
| Assets    | `/api/assets/{id}/extract-audio`  | `POST`            | Depends on `AUTH_PROVIDER`                     | no                          | Extract a video asset's audio track into a new WAV asset |
| Assets    | `/api/assets/packages/{package}/{file}` | `GET`       | none                                           | streaming                   | Bytes behind a `package://` ref, from a node pack's assets directory |
| Assets    | `/api/assets/packages`            | `GET`             | none                                           | no                          | Stub — always `{"assets": [], "next": null}`; there is no package listing |
| Assets    | `/api/assets/packages/{package}`  | `GET`             | none                                           | no                          | Stub — same empty page. Fetch a package's files by name, not by listing |
| Assets    | `/api/assets/download`            | `POST`            | Depends on `AUTH_PROVIDER`                     | no                          | Bulk ZIP download; `501` on this server |
| Apps      | `/api/applications/{id}/released-document` | `GET`    | Depends on `AUTH_PROVIDER`                     | no                          | The snapshot a published app should run, with each operation's pinned graph; `null` when nothing is published |
| Apps      | `/api/applications/{id}/export-bundle` | `GET`        | Depends on `AUTH_PROVIDER`                     | no                          | One app and the full graph of every workflow it binds, as a downloadable `ApplicationBundle` |
| Apps      | `/api/applications/build`         | `POST`            | Depends on `AUTH_PROVIDER`                     | no                          | Build a mini app from a prompt or a pinned spec; returns the `BuildReport`. `poll: true` returns a session id instead |
| Apps      | `/api/applications/debug`         | `POST`            | Depends on `AUTH_PROVIDER`                     | no                          | Simulate a saved app by `application_id`, or a draft posted inline as `document`; returns the compacted debug report |
| Apps      | `/api/applications/examples`      | `GET`             | none                                           | no                          | The shipped example apps — slug, name, description, workflow names, operation count |
| Apps      | `/api/applications/examples/{slug}` | `GET`           | none                                           | no                          | One example's full `ApplicationBundle`; `404` when the slug names nothing shipped |
| Apps      | `/api/applications/examples/{slug}/install` | `POST`  | Depends on `AUTH_PROVIDER`                     | no                          | Install an example into the caller's library, creating the workflows it binds |
| Storyboards | `/api/storyboards/{id}/export-zip` | `GET`           | Depends on `AUTH_PROVIDER`                     | no                          | One board as a zip of Markdown plus its stills and clips; `404` when the caller does not own it |
| Providers | `/api/fal/credits`                | `GET`             | Depends on `AUTH_PROVIDER`                     | no                          | The server's fal.ai account balance; `204` when no `FAL_API_KEY` is configured |
| Providers | `/api/fal/pricing`                | `GET`             | Depends on `AUTH_PROVIDER`                     | no                          | Unit price per fal.ai endpoint, one or more `?endpoint_id=`; cached an hour |
| Providers | `/api/fal/pricing/estimate`       | `POST`            | Depends on `AUTH_PROVIDER`                     | no                          | What a fal.ai endpoint costs for a given quantity; `204` when no `FAL_API_KEY` is configured |
| Providers | `/api/kie/credits`                | `GET`             | Depends on `AUTH_PROVIDER`                     | no                          | The server's kie.ai credit balance; `204` when no `KIE_API_KEY` is configured |
| Providers | `/api/kie/pricing`                | `GET`             | Depends on `AUTH_PROVIDER`                     | no                          | Credit price per kie.ai model, one or more `?model_id=`; cached an hour |
| Providers | `/api/kie/resolve-dynamic-schema` | `POST`            | Depends on `AUTH_PROVIDER`                     | no                          | Pasted kie.ai model docs to a node's dynamic properties, inputs, and outputs |
| JS Scripts | `/api/js-scripts/{id}/run`       | `POST`            | Depends on `AUTH_PROVIDER`                     | no                          | Run a saved JS script document in the sandbox and return its outputs |
| SDK       | `/api/sdk/v1/capabilities`        | `GET`             | Depends on `AUTH_PROVIDER`                     | no                          | What this server supports — profiles, encodings, execution options, limits |
| SDK       | `/api/sdk/v1/node-types`          | `GET`             | Depends on `AUTH_PROVIDER`                     | no                          | Paged inventory of the pin types in the registry and which nodes use them |
| SDK       | `/api/sdk/v1/workflows`           | `GET`             | Depends on `AUTH_PROVIDER`                     | no                          | Workflow summaries with the revision an interface was read at |
| SDK       | `/api/sdk/v1/workflow-interfaces` | `POST`            | Depends on `AUTH_PROVIDER`                     | no                          | Up to 100 workflows' interfaces in one call, with per-workflow errors |
| SDK       | `/api/sdk/v1/preflight`           | `POST`            | Depends on `AUTH_PROVIDER`                     | no                          | Whether a workflow is runnable, what it needs, and what it will cost |
| SDK       | `/api/sdk/v1/assets/temporary`    | `POST`            | Depends on `AUTH_PROVIDER`                     | no                          | Store one execution input in temporary storage; creates no asset row |
| SDK       | `/api/sdk/v1/models`              | `GET`             | Depends on `AUTH_PROVIDER`                     | no                          | Paged model catalog with per-model availability and the wire value a node property takes |
| SDK       | `/api/sdk/v1/model-downloads`     | `GET`             | Depends on `AUTH_PROVIDER`                     | no                          | Snapshot of this caller's model downloads, running and finished |
| SDK       | `/api/sdk/v1/model-downloads`     | `POST`            | Depends on `AUTH_PROVIDER`                     | no                          | Start a model download; `202` with the operation's first state |
| SDK       | `/api/sdk/v1/model-downloads/cancel` | `POST`         | Depends on `AUTH_PROVIDER`                     | no                          | Cancel one download by `operation_id` |
| Extension | `/api/extension/download`         | `GET`             | Depends on `AUTH_PROVIDER`                     | no                          | The built Chrome extension as a zip; `404` when the server has no build |
| Workflow WS | `/ws`                           | WebSocket         | Bearer header or `api_key` query when enforced | yes                         | Workflow execution, chat, job control, live editor tools, and live updates (MessagePack or JSON) |
| Extension WS | `/ws/extension`                | WebSocket         | Follows global auth settings                   | yes                         | Browser extension channel |
| Download WS | `/ws/download`                  | WebSocket         | Follows global auth settings                   | yes                         | Model/file downloads |
| Storage   | `/api/storage/*`                  | `HEAD/GET`        | Depends on `AUTH_PROVIDER`                     | streaming for `GET`         | Asset bytes at `<userId>/<assetId>.<ext>`, scoped to the caller. Read-only: writes and deletes go through the asset API (tRPC `assets.delete` removes an asset's stored objects). `storage.signUrl` is the only tRPC storage procedure |
| Config    | `/api/config`                     | `GET`             | none                                           | no                          | How this server is configured, for a client that has not signed in yet: auth mode, Supabase URL and anon key, Google Workspace scopes, version |
| Admin     | `/admin/secrets/import`           | `POST`            | none                                           | no                          | Stub — always `501`. Bulk secret import is not part of the standalone server |
| Health    | `/health`                         | `GET`             | none                                           | no                          | JSON: `{status, timestamp, uptime, services}` (`200`/`503`) |
| Health    | `/api/health`                     | `GET`             | none                                           | no                          | JSON: `{version, uptime}` |
| Liveness  | `/ready`                          | `GET`             | none                                           | no                          | Always `200` with `{status:"ok"}` |

> When `AUTH_PROVIDER` is `local` or `none`, endpoints accept requests without a token for convenience. When it is `static` or `supabase`, include `Authorization: Bearer <token>` on every request except the health/liveness routes.

## Authentication and Headers

NodeTool uses Bearer token authentication. The behavior depends on your `AUTH_PROVIDER` setting:

| AUTH_PROVIDER | Token Required? | Use Case |
|---------------|----------------|----------|
| `local` / `none` | No | Local development, desktop app |
| `static` | Yes — use the configured static token | Simple deployments with a shared secret |
| `supabase` | Yes — use a Supabase JWT | Production deployments with user management |

### How to include credentials

- **HTTP requests:** `Authorization: Bearer <token>` header on all non-public routes
- **WebSocket:** `Authorization: Bearer <token>` header (preferred) or `api_key` query parameter
- **SSE streams (`/v1/chat/completions`):** `Authorization: Bearer <token>` and `Accept: text/event-stream`

> **Local development:** When running locally with the default config (`AUTH_PROVIDER=local`), no token is needed. You can omit the `Authorization` header entirely.

See [Authentication](authentication.md) for full token handling rules.

## Streaming Behavior

- `/v1/chat/completions` uses OpenAI-style SSE when `stream` is true; otherwise it returns a single JSON response.
- `POST /api/workflows/{id}/run` does **not** stream — it runs the workflow to completion and returns one JSON response.
- The `/ws` WebSocket streams workflow/job events (`job_update`, `node_update`, `node_progress`, `output_update`, `chunk`, …) and chat tokens/tool calls. See the [WebSocket API](websocket-api.md) for the full protocol.
- Storage routes stream file contents for large assets.

---

## Headless Mode: Running Workflows via CLI/API

NodeTool can run entirely without the UI—perfect for automation, CI/CD pipelines, and programmatic integrations. This section shows how to execute workflows from the command line or via HTTP requests.

### Quick Start: Run a Workflow via cURL

```bash
# Run a workflow and get results (non-streaming)
curl -X POST "http://localhost:7777/api/workflows/YOUR_WORKFLOW_ID/run" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "params": {
      "prompt": "A cyberpunk cityscape at sunset",
      "style": "photorealistic"
    }
  }'
```

Response:
```json
{
  "job_id": "job_abc123",
  "workflow_id": "YOUR_WORKFLOW_ID",
  "status": "completed",
  "outputs": {
    "image": {
      "type": "image",
      "uri": "http://localhost:7777/api/storage/assets/abc123.png"
    },
    "caption": "Generated image of a cyberpunk cityscape..."
  },
  "error": null,
  "message_count": 12,
  "background": false
}
```

`outputs` is an object keyed by output-node name. The route does not stream — for
real-time progress, run the workflow over the [WebSocket API](websocket-api.md).

### Interactive Runs: Answering a Failed Node

By default a node that throws ends the run. Post `"interactive": true` to
`/api/workflows/{id}/run` or `/api/workflows/{id}/debug` and the failure comes
back to you instead: the run parks on the node and the response returns at once
with the escalation. Your client decides what happens next, standing where the
`--supervise` LLM supervisor otherwise would.

Reach for it when the caller (an agent, a test harness, a batch script) is the
one that knows whether a given failure should be retried, skipped, or fatal.

```bash
curl -X POST "http://localhost:7777/api/workflows/YOUR_WORKFLOW_ID/run" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"interactive": true}'
```

```json
{
  "status": "escalated",
  "session_id": "8629a9bc-052f-4af9-96fd-56779be0d94e",
  "job_id": "180129ebe0864d7ea5f70c1de80b22af",
  "workflow_id": "YOUR_WORKFLOW_ID",
  "escalation_id": "esc-1",
  "escalation": {
    "nodeId": "work",
    "nodeType": "nodetool.code.Code",
    "correlationLineage": [],
    "invocationKey": "",
    "allowedActions": ["skip", "fail"],
    "detail": "boom 42",
    "inputs": { "code": "throw new Error(\"boom 42\");" },
    "declaredOutputs": {},
    "attempt": 1,
    "spentCostUsd": 0,
    "createdAssets": false,
    "retrySafe": false,
    "emitted": false
  },
  "resolve": "POST /api/debug/sessions/8629a9bc-052f-4af9-96fd-56779be0d94e/verdict with {\"escalation_id\": \"esc-1\", \"verdict\": {\"action\": ...}} — allowed actions: skip, fail. The run is parked on this node until a verdict arrives; an unanswered escalation fails closed on the decision timeout."
}
```

`inputs`, `detail`, and `candidateOutput` are redacted and truncated before they
leave the kernel. `allowedActions` is computed per invocation and enforced there
too, so a verdict outside the list is refused however it was produced. `retry`
appears only when the invocation is replayable — `retrySafe`, nothing spent,
no assets created. `substitute` appears only when the node produced a malformed
value a validator can check. A node reading a stream gets `end_stream` and
`fail` and nothing else; `skip` and `fail` are always available.

Answer on the session. `escalation_id` identifies the escalation you are
answering, and `verdict.action` is one of `retry`, `substitute` (with
`outputs`), `skip`, `end_stream`, or `fail`:

```bash
curl -X POST "http://localhost:7777/api/debug/sessions/SESSION_ID/verdict" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"escalation_id": "esc-1", "verdict": {"action": "skip"}}'
```

The call blocks until the run escalates again, in the same `"status":
"escalated"` shape, or finishes. A finished run returns the ordinary run payload
with `session_id` added:

```json
{
  "job_id": "180129ebe0864d7ea5f70c1de80b22af",
  "workflow_id": "YOUR_WORKFLOW_ID",
  "status": "completed",
  "outputs": { "out": [] },
  "error": null,
  "message_count": 9,
  "background": false,
  "session_id": "8629a9bc-052f-4af9-96fd-56779be0d94e"
}
```

Two more calls round out the session:

```bash
# Where is the run right now? Never blocks.
curl "http://localhost:7777/api/debug/sessions/SESSION_ID" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Stop it. Returns the final report with status "cancelled".
curl -X POST "http://localhost:7777/api/debug/sessions/SESSION_ID/cancel" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Sessions belong to the user who started the run, so an unknown, foreign, or
expired id answers `404` with `{"detail": "Debug session not found"}` rather
than `403`. A verdict whose action is not one of the five is a `400`.

Every boundary resolves as `fail`, including an escalation nobody answers: the
decision timeout is ten minutes by default. Three optional fields in the run
body move the bounds, each clamped server-side — `decision_timeout_ms` (up to 30
minutes), `max_decisions` (default 10, up to 100), and `max_retries_per_node`
(default 2, up to 20). A settled session stays readable for ten minutes.

Agents reach the same machinery through the `run_workflow` and `debug_workflow`
tools with `interactive: true`, answering with `resolve_workflow_escalation`.
See [Workflow Debugging](workflow-debugging.md) and the
[supervisor design](workflow-supervisor-design.md) for the verdict vocabulary.

### Triggering a Workflow by Webhook

A workflow whose graph carries a `WebhookTrigger` node gets a registration with
its own path token and shared secret. `POST /api/webhooks/{token}` is where an
outside system delivers the event, and the route sits on the public allowlist —
there is no session, so the `x-webhook-secret` header is the only thing standing
between the caller and the run.

```bash
curl -X POST "http://localhost:7777/api/webhooks/YOUR_TOKEN" \
  -H "x-webhook-secret: YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"order_id": 41, "status": "paid"}'
```

```json
{
  "status": "accepted",
  "input_id": "webhook:YOUR_TOKEN:9f2c…",
  "duplicate": false
}
```

The trigger node receives `{body, headers, query, method}`. `headers` has the
shared secret stripped out before anything is stored. A body that is not JSON is
passed through as the raw string, so form posts and plain text work without a
content type the server has to recognize.

Send `x-webhook-id` to make retries safe: it becomes the delivery's idempotency
key, and a repeat answers `200` with `"duplicate": true` having stored nothing.
Without that header the key is a hash of token, body, and the current minute — an
identical body resent within the same minute is one event, the same body an hour
later is two.

The failures are distinct on purpose:

| Status | Meaning |
|--------|---------|
| `404`  | No registration carries this token. Checked before the secret, so a wrong token never reveals whether a secret would have matched |
| `401`  | `x-webhook-secret` missing or wrong; compared in constant time against the stored sha256 |
| `410`  | The registration exists but is disabled |
| `413`  | Body over 1 MiB |
| `429`  | Over the route's own limit of 120 deliveries per minute |

```bash
curl -X POST "http://localhost:7777/api/webhooks/nosuchtoken" \
  -H "Content-Type: application/json" -d '{"hello":1}'
```

```json
{ "error": "Unknown webhook token" }
```

### Linking an External Messaging Account

A messaging bridge — the `nodetool telegram` bot, and later Discord — is not a
browser and holds no user credential. It proves *which external account* is
speaking, and the server decides which NodeTool user that is. The four
`/api/integrations/{provider}/*` routes are that exchange. `{provider}` is
`telegram` or `discord`; anything else is `400`.

These routes authenticate with `NODETOOL_INTEGRATION_TOKEN` — the server's own
service token, sent as a bearer and compared in constant time — rather than a
session, which is why they sit outside the session-auth hook the way the webhook
route does. **A server with that variable unset, or set to fewer than 16
characters, never registers them: every path answers `404`, not `401`.** Set the
same value on the bridge process.

Linking runs in one of two directions, and which one you are in decides which
route redeems the code. Either way the code is 24 random bytes, base64url, good
for ten minutes and spent on first use.

**Bot-initiated.** The bridge mints a code bound to the external account and
sends the URL into the chat:

```bash
curl -X POST "http://localhost:7777/api/integrations/telegram/link/start" \
  -H "Authorization: Bearer $NODETOOL_INTEGRATION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"external_id": "482913044"}'
```

```json
{
  "code": "Yb3xK9_qLm2vR7nT4pWzA1sD6fG8hJ0c",
  "url": "http://localhost:7777/integrations/link?code=Yb3xK9_qLm2vR7nT4pWzA1sD6fG8hJ0c",
  "expires_at": "2026-08-23T12:41:07.000Z"
}
```

`url` is built from the request's own `Host` header unless `NODETOOL_PUBLIC_URL`
is set — set that when the bridge reaches the server at an address the user's
browser cannot, such as `http://nodetool:7777` inside a compose network.

The bridge stops there. The user opens that URL, and the confirmation page spends
the code over tRPC (`integrations.describeLinkCode`, then
`integrations.confirmLink`) under their own session, so the account that gets
linked is the one they are signed in as — never one the code named.

**Web-initiated.** The mirror image, and the one `/link/complete` exists for.
Settings → Integrations mints a code bound to the signed-in user
(`integrations.createLinkCode`) and renders it as `t.me/<bot>?start=<code>`.
Pressing **Start** delivers `/start <code>` to the bot, which redeems it with the
external id it can see:

```bash
curl -X POST "http://localhost:7777/api/integrations/telegram/link/complete" \
  -H "Authorization: Bearer $NODETOOL_INTEGRATION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"external_id": "482913044", "code": "Yb3xK9_qLm2vR7nT4pWzA1sD6fG8hJ0c"}'
```

```json
{ "linked": true }
```

A user-bound code already carries the user who minted it, and that user wins, so
`user_id` in the body is ignored here. Send it only when redeeming a code that
`link/start` minted — a code bound to an external account names no user, and the
call is `400` without one.

With the link in place either way, the bridge exchanges identity for access on
every connection:

```bash
curl -X POST "http://localhost:7777/api/integrations/telegram/token" \
  -H "Authorization: Bearer $NODETOOL_INTEGRATION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"external_id": "482913044"}'
```

```json
{
  "token": "ndt_eyJ2IjoxLCJ1IjoiM2Y5YSIsImUiOjE3ODc0OTE4Njd9.9c1f…",
  "expires_at": "2026-08-23T13:31:07.000Z",
  "user_id": "3f9a…"
}
```

The token lasts one hour and authenticates as that user on `/ws`, `/trpc`, and
asset URLs. Tenant isolation is then the server's usual rules — threads, tools,
permissions, and cost tracking all stay server-side, and the bridge holds no
conversation state of its own.

Unlinking takes the external id in the body of a `DELETE`:

```bash
curl -X DELETE "http://localhost:7777/api/integrations/telegram/link" \
  -H "Authorization: Bearer $NODETOOL_INTEGRATION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"external_id": "482913044"}'
```

```json
{ "unlinked": true }
```

`"unlinked": false` means there was nothing to remove. The failures across all
four routes:

| Status | Meaning |
|--------|---------|
| `404`  | The routes are not registered (`NODETOOL_INTEGRATION_TOKEN` unset or under 16 characters), or — on `/token` — the external id is not linked to any user |
| `401`  | Missing or wrong service token |
| `400`  | Unknown `provider`, missing `external_id`, or a code issued for a different account |
| `410`  | The link code expired or was already used |
| `409`  | `/token` only: the server runs in local single-user mode, where every request is already user `1`, so a delegated token would isolate nothing. Run with an enforcing auth provider (Supabase) |

Design and the bot's side of the flow:
[Telegram bot design](telegram-bot-design.md). The bridge command is
[`nodetool telegram`](cli.md#nodetool-telegram).

### MCP OAuth Discovery

For `/mcp`, NodeTool is both the OAuth authorization server and the protected
resource. An MCP client that meets a `401` on `/mcp` follows the
`WWW-Authenticate` challenge to two discovery documents and takes the endpoint
URLs from there — so a client needs no NodeTool-specific configuration beyond
the server's address.

```bash
curl "https://nodetool.example.com/.well-known/oauth-protected-resource"
```

```json
{
  "resource": "https://nodetool.example.com/mcp",
  "authorization_servers": ["https://nodetool.example.com"],
  "scopes_supported": ["mcp"],
  "bearer_methods_supported": ["header"],
  "resource_name": "NodeTool MCP"
}
```

```bash
curl "https://nodetool.example.com/.well-known/oauth-authorization-server"
```

```json
{
  "issuer": "https://nodetool.example.com",
  "authorization_endpoint": "https://nodetool.example.com/oauth/authorize",
  "token_endpoint": "https://nodetool.example.com/oauth/token",
  "registration_endpoint": "https://nodetool.example.com/oauth/register",
  "revocation_endpoint": "https://nodetool.example.com/oauth/revoke",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["none"],
  "scopes_supported": ["mcp"],
  "client_id_metadata_document_supported": true,
  "authorization_response_iss_parameter_supported": true
}
```

Both documents come back with `Cache-Control: public, max-age=3600`. Deployed
under a sub-path, RFC 8414 and RFC 9728 put them at the path-inserted forms
instead — issuer `https://host/base` publishes at
`/.well-known/oauth-authorization-server/base`, and the resource document for
`https://host/base/mcp` at `/.well-known/oauth-protected-resource/base/mcp`. At
the origin root the resource form is `/.well-known/oauth-protected-resource/mcp`,
which returns the same document as the bare path above.

**All six routes answer `404` unless the flow can actually complete**, and four
conditions decide that: `NODETOOL_DISABLE_MCP_OAUTH` is not `1`, the `/mcp`
mount is enabled (in production that needs `NODETOOL_ENABLE_MCP=1`; in dev it is
on by default), `NODETOOL_PUBLIC_URL` is set, and that URL is HTTPS or loopback.
The server never advertises a discovery document it would then refuse to serve —
with the flow off, `/mcp` sends no `WWW-Authenticate` challenge at all.

The flow itself is authorization code with PKCE (`S256`) and no client secret.
`GET /oauth/authorize` parks the request and `302`s to `/oauth/consent?request_id=…`,
a page the web app renders; approving it mints the code that `POST /oauth/token`
exchanges for an `nta_` access token. Replaying a code revokes the grant, per the
OAuth 2.1 rule.

Pasting an `ntk_` token minted in **Settings → MCP → Connect an agent remotely**
stays the alternative for a client that does not do OAuth. See
[MCP in production](mcp-production.md) for the operator's walkthrough and
[MCP OAuth design](mcp-oauth-design.md) for the full flow.

### Chat API (OpenAI-Compatible)

NodeTool exposes OpenAI-compatible endpoints, so you can use standard OpenAI clients:

```bash
# Simple chat completion
curl -X POST "http://localhost:7777/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "model": "gpt-5.6",
    "messages": [
      {"role": "user", "content": "Explain quantum computing in simple terms"}
    ]
  }'
```

Response:
```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1699000000,
  "model": "gpt-5.6",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Quantum computing uses quantum mechanics..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 150,
    "total_tokens": 160
  }
}
```

### Streaming Chat

```bash
# Streaming chat (prints tokens as they arrive)
curl -X POST "http://localhost:7777/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "model": "gpt-5.6",
    "messages": [
      {"role": "user", "content": "Write a haiku about programming"}
    ],
    "stream": true
  }'
```

Streaming response:
```
data: {"id":"chatcmpl-123","choices":[{"delta":{"role":"assistant"},"index":0}]}

data: {"id":"chatcmpl-123","choices":[{"delta":{"content":"Code"},"index":0}]}

data: {"id":"chatcmpl-123","choices":[{"delta":{"content":" flows"},"index":0}]}

data: {"id":"chatcmpl-123","choices":[{"delta":{"content":" like"},"index":0}]}

data: [DONE]
```

### List Available Models

```bash
curl "http://localhost:7777/v1/models" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Response:
```json
{
  "object": "list",
  "data": [
    {"id": "gpt-5.6", "object": "model", "owned_by": "openai"},
    {"id": "gpt-5-mini", "object": "model", "owned_by": "openai"},
    {"id": "claude-opus-5", "object": "model", "owned_by": "anthropic"},
    {"id": "gpt-oss:20b", "object": "model", "owned_by": "ollama"}
  ]
}
```

### Node Metadata

`GET /api/nodes/metadata` is the node registry — every node type the server can
run, with its properties, inputs, and outputs. The editor fetches it at boot,
before anyone has signed in, so the route takes no token. Reach for it when you
are building a client, a palette, or a graph by hand and need to know what a
node type is called and what it accepts.

The default response is a slim summary, because the full registry is large:

```bash
curl "http://localhost:7777/api/nodes/metadata?limit=2"
```

```json
[
  {
    "node_type": "fal.3d_to_3d.Hunyuan3dV31Part",
    "title": "Hunyuan 3d V31Part",
    "description": "Split 3D models into parts with Hunyuan 3D\nprocessing, 3d-to-3d, 3d, mesh, hunyuan, part",
    "namespace": "fal.3d_to_3d"
  },
  {
    "node_type": "fal.3d_to_3d.Hunyuan3dV31SmartTopology",
    "title": "Hunyuan 3d V31Smart Topology",
    "description": "Optimize 3D mesh topology with Hunyuan 3D Smart Topology.\nprocessing, 3d-to-3d, 3d, mesh, hunyuan, smart, topology",
    "namespace": "fal.3d_to_3d"
  }
]
```

Five query parameters narrow it:

| Parameter | Effect |
|-----------|--------|
| `node_type` | Exact lookup. Returns that one node's **full** metadata — `properties`, `outputs`, `recommended_models`, layout — or `404` |
| `namespace` | Keep nodes whose namespace starts with this prefix |
| `query` | Comma-separated terms scored against title, description, node type, and namespace; unmatched nodes drop out and the best matches come first |
| `fields` | `summary` (default) or `full` to get complete metadata for every node in the result |
| `limit` | Truncate the result |

```bash
curl "http://localhost:7777/api/nodes/metadata?node_type=nodetool.text.Concat"
```

```json
{
  "title": "Concat",
  "description": "Concatenates text inputs into a single output. …",
  "namespace": "nodetool.text",
  "node_type": "nodetool.text.Concat",
  "layout": "default",
  "body": "content_card",
  "properties": [],
  "outputs": [{"name": "output", "type": {"type": "str", "type_args": []}}],
  "recommended_models": []
}
```

### List Workflows

```bash
# List all workflows
curl "http://localhost:7777/api/workflows" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Moving Workflows Between Servers

A `.nodetool` bundle is a zip holding one or more workflow graphs plus the bytes
of every asset they reference, so a workflow travels as a single file instead of
a graph whose `asset://` refs dangle on the far side. Three routes cover the
round trip; the CLI's `workflows export-bundle` / `import-bundle` and the
editor's command menu go through the same packer.

`GET /api/workflows/{id}/export-bundle` returns one workflow:

```bash
curl "http://localhost:7777/api/workflows/<workflow_id>/export-bundle" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o my-workflow.nodetool
```

The response is `application/zip` with
`content-disposition: attachment; filename="<workflow name>.nodetool"` — the
name with everything outside `A-Za-z0-9._-` replaced by `_`. Inside, each graph
is a file under `workflows/`, asset bytes sit under their own entries, and
`manifest.json` indexes both:

```json
{
  "format": "nodetool-workflow-bundle",
  "version": 2,
  "created_at": "2026-08-07T07:03:40.352Z",
  "workflows": [
    { "file": "workflows/c3b15268a02242e682035e5e4be8a22a.json", "name": "Bundle Demo" }
  ],
  "assets": [],
  "thumbnail": null
}
```

`POST /api/workflows/export-bundle` packs several at once. `workflow_ids` must
be a non-empty array of strings — anything else is a `400`. The download is
named after the single workflow when there is one, and `<n>-workflows` otherwise:

```bash
curl -X POST "http://localhost:7777/api/workflows/export-bundle" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"workflow_ids": ["<id_a>", "<id_b>"]}' \
  -o my-pack.nodetool
```

`POST /api/workflows/import-bundle` takes the zip back, as a `file` part in a
multipart form or as the raw request body:

```bash
curl -X POST "http://localhost:7777/api/workflows/import-bundle" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@my-workflow.nodetool"
```

```json
{
  "workflows": [
    {
      "id": "bcec888aff5a429dae4dce4ca29fcc4c",
      "name": "Bundle Demo",
      "access": "private",
      "graph": { "nodes": [], "edges": [] }
    }
  ],
  "imported": 0,
  "missing": [],
  "checksum_mismatches": []
}
```

Every workflow is created fresh under the caller with a new id and
`access: "private"` — importing never overwrites an existing one. `imported`
counts the assets stored, `missing` names refs the bundle did not carry, and
`checksum_mismatches` names asset bytes that did not hash to what the manifest
recorded. Neither list is fatal — the graphs still import, with those refs
unresolved.

A bundle that cannot be unpacked, or a graph the workflow API rejects, is a
`400` (`{"detail": "Invalid bundle: …"}`). The import is not transactional, so a
bundle that fails partway can leave the workflows created before the failure
behind.

### Fetching a Shipped Example's Graph

`GET /api/workflows/examples` lists the shipped templates, but every entry comes
back with `"graph": {"nodes": [], "edges": []}` — the list is metadata, kept
small because it ships hundreds of workflows.
`GET /api/workflows/examples/{package}/{example}` is how you get one example's
actual graph. Both are unauthenticated: the templates ship with the install and
belong to nobody.

The two path segments are the package name and the example name, URL-encoded —
the same `package_name` and `name` the list returned.

```bash
curl "http://localhost:7777/api/workflows/examples/nodetool-base/Sharpen%20Footage"
```

```json
{
  "id": "",
  "access": "private",
  "name": "Sharpen Footage",
  "description": "Add apparent detail back after a denoise or a downscale. …",
  "tags": ["video", "utility", "example"],
  "package_name": "nodetool-base",
  "graph": { "nodes": [ … ], "edges": [ … ] },
  "input_schema": { … },
  "output_schema": { … }
}
```

The `id` is empty because an example is a template, not a row — POST the graph
to `/api/workflows` to make it yours. A name the package does not ship is a
`404`:

```json
{ "detail": "Example 'Nope' not found in package 'nodetool-base'" }
```

### Uploading an Asset

On a cloud storage backend (Supabase or S3) the bytes go straight from the
client to the bucket — the API only mints a target and confirms the result.

1. `assets.createUpload` (tRPC) with the file's name, content type, parent
   folder, and size. It creates the asset row, picks the storage key
   (`<userId>/<assetId>.<ext>` — never the client's choice), and returns a
   short-lived upload target.
2. Send the bytes to `upload.url` with `upload.method` and `upload.headers`.
3. `assets.finalizeUpload` with the returned `asset_id`. The server reads the
   object's real size back off the bucket, records it, and generates a
   thumbnail. A missing, empty, or over-cap upload is rejected and the pending
   row removed.

`upload` comes back `null` on the local file backend, which has no
direct-upload concept; fall back to the multipart `POST /api/assets`. The web
client does this automatically.

### Extracting a Video's Audio Track

`POST /api/assets/{id}/extract-audio` copies a video asset's audio into a new
WAV asset parented to the video. The timeline calls it when a video is imported
so the audio becomes an independently editable clip; call it directly when you
want the same thing outside the editor.

```bash
curl -X POST "http://localhost:7777/api/assets/<video_asset_id>/extract-audio" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

```json
{
  "has_audio": true,
  "asset": {
    "id": "b41f…",
    "name": "clip.mp4 (audio)",
    "content_type": "audio/wav",
    "parent_id": "<video_asset_id>",
    "duration": 12.5,
    "get_url": "/api/storage/1/b41f….wav"
  }
}
```

A video with no audio track returns `{"has_audio": false}` and creates nothing.
Posting a non-video asset is a `400` (`{"detail": "Asset is not a video"}`), an
asset you do not own is a `404`, and a server with no ffmpeg runtime available
answers `503`.

### Package Assets

Shipped node packs carry media alongside their code — the images and audio that
example workflows reference as `package://<package>/<file>`. Those refs resolve
over `GET /api/assets/packages/{package}/{file}`, which needs no token because
the bytes ship with the install.

```bash
curl "http://localhost:7777/api/assets/packages/nodetool-base/A%20Boolean%20Constant.jpg" \
  -o thumb.jpg
```

The file path may be nested (`audio/loop.mp3`); `..` segments and backslashes
are rejected. Responses carry
`cache-control: public, max-age=31536000, immutable` and an ETag, since a
package's assets change only when the package version does.

The two listing routes above that path are stubs. `GET /api/assets/packages`
and `GET /api/assets/packages/{package}` both answer `200` with an empty page,
whatever the package name:

```bash
curl "http://localhost:7777/api/assets/packages/nodetool-base"
```

```json
{ "assets": [], "next": null }
```

The REST surface never grew a real listing, so address a package's files by the
name the workflow's `package://` ref already carries. Agents that need to
enumerate them call the `list_assets` tool with `source: "package"`, which walks
the packages on disk and returns each file's `uri` and `url`.

### Bulk Asset Download

`POST /api/assets/download` is reserved for zipping the requested assets into
one response, keeping the folder structure their `parent_id` relationships
describe. This server does not implement it and answers `501`:

```bash
curl -X POST "http://localhost:7777/api/assets/download" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"asset_ids": ["b41f…", "c02a…"]}'
```

```json
{
  "code": "SERVICE_UNAVAILABLE",
  "detail": "ZIP download not available in standalone mode"
}
```

The status does not depend on the body — an unknown asset id returns the same
`501`. Download assets one at a time through their `get_url` instead.

### Downloading a Workspace File

A workspace is a directory on the server's filesystem that agents and file tools
read and write. Listing and CRUD moved to the tRPC `workspace` router;
`GET /api/workspaces/{id}/download/{path}` stayed on REST because it returns
bytes rather than JSON.

`path` is relative to the workspace root and may be nested. The response is an
attachment, with a content type guessed from the extension:

```bash
curl "http://localhost:7777/api/workspaces/ws_abc123/download/notes/report.md" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o report.md
```

Workspaces browse the local filesystem, so the whole surface is off in
production — every path answers `403` with
`{"detail": "Workspaces are disabled in production"}` when
`NODETOOL_ENV=production`. Otherwise:

| Status | Meaning |
|--------|---------|
| `400`  | `path` is absolute |
| `403`  | `path` resolves outside the workspace root |
| `404`  | No such workspace for this caller, or no such file inside it |

```bash
curl "http://localhost:7777/api/workspaces/nosuchws/download/a.txt"
```

```json
{ "detail": "Workspace not found" }
```

### Provider Credits

`GET /api/fal/credits` and `GET /api/kie/credits` report what the account behind
the server's API key has left. The editor shows the number next to the provider;
call them yourself to watch a budget from outside the UI.

Both read the key the **server** holds — the stored `FAL_API_KEY` / `KIE_API_KEY`
secret, falling back to the same environment variable — not anything the caller
sends. With no key configured the answer is `204 No Content`.

```bash
curl "http://localhost:7777/api/fal/credits" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

```json
{
  "credit_balance": { "amount": 42.5, "currency": "USD" },
  "username": "your-fal-account"
}
```

kie.ai bills in credits rather than dollars, so its `currency` is the literal
string `"credits"`:

```json
{ "credit_balance": { "amount": 1200, "currency": "credits" } }
```

A provider that refuses the key still answers `200`, with the reason spelled out
— the SPA treats a gateway status as a bug in NodeTool, so the failure is carried
in the body instead:

```json
{
  "unavailable": true,
  "detail": "Invalid API key or malformed Authorization header",
  "credit_balance": null
}
```

Reading a fal.ai balance needs an **Admin** key (create one at
<https://fal.ai/dashboard/keys>); an ordinary key gets `403` from fal.ai, which
comes back as an `unavailable` body saying so.

### Provider Pricing

`GET /api/fal/pricing` returns the unit price of one or more fal.ai endpoints.
Repeat `endpoint_id` for each; omitting it entirely is a `400`. Prices are cached
per endpoint for an hour, and the route answers `204` when no `FAL_API_KEY` is
configured.

```bash
curl "http://localhost:7777/api/fal/pricing?endpoint_id=fal-ai/flux/schnell&endpoint_id=fal-ai/flux/dev" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

```json
{
  "byEndpointId": {
    "fal-ai/flux/schnell": {
      "unit_price": 0.003,
      "billing_unit": "megapixel",
      "currency": "USD"
    }
  },
  "fetched_at": "2026-08-05T08:21:49.251Z"
}
```

`GET /api/kie/pricing` is the same shape over kie.ai model ids (`?model_id=`,
repeatable, `400` when absent). It needs no API key — kie.ai publishes its
pricing pages openly — and returns a per-model summary:

```json
{
  "byModelId": {
    "flux-2/pro-text-to-image": {
      "model_id": "flux-2/pro-text-to-image",
      "unit_price": 9,
      "billing_unit": "second",
      "currency": "credits",
      "usd_price": 0.045,
      "tier_count": 4,
      "pricing_url": "https://kie.ai/flux-2"
    }
  },
  "fetched_at": "2026-08-05T08:19:54.783Z"
}
```

Most kie.ai models are priced in tiers. `unit_price` is the cheapest of them,
`tier_count` says how many there were, and `billing_unit` is `"varies"` when the
tiers are not billed by the same unit.

An id with no published price is absent from the map rather than an error, so a
request for five models can come back with three.

### Estimating a fal.ai Call's Cost

`GET /api/fal/pricing` gives the price of one unit; `POST
/api/fal/pricing/estimate` turns that into a total for a quantity you name, so
you can price a batch before running it. `endpoint_id` is required — without it
the route answers `400` — and `estimate_type` picks how the quantity is read:

- `historical_api_price` (the default) counts whole calls, from
  `call_quantity` (default `1`, values below `1` are ignored).
- `unit_price` counts billing units — megapixels, seconds — from
  `unit_quantity` (default `1`, floor `0.000001`).

```bash
curl -X POST "http://localhost:7777/api/fal/pricing/estimate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"endpoint_id": "fal-ai/flux/schnell", "call_quantity": 250}'
```

```json
{
  "endpoint_id": "fal-ai/flux/schnell",
  "estimate_type": "historical_api_price",
  "total_cost": 0.75,
  "currency": "USD",
  "fetched_at": "2026-08-10T09:14:02.118Z",
  "cached": false
}
```

The key comes from the secret store, falling back to the `FAL_API_KEY`
environment variable; with neither the route answers `204` and the SPA shows no
estimate. A fal.ai call that fails or answers with an unusable body is a `502`.

Answers are cached for an hour per endpoint and estimate type — the quantity is
not part of the cache key, so a second request that changes only the quantity
returns the first one's total with `cached: true`. Vary the endpoint or the
estimate type to get a fresh number inside that hour.

### Resolving a KIE Model's Schema

kie.ai adds models faster than a node can be written for each, so `KieAINode`
takes its shape from the model's documentation. `POST
/api/kie/resolve-dynamic-schema` does that parse: give it the docs page as
`model_info`, get back the node's dynamic properties, inputs, and outputs. The
editor calls it when you paste docs into the node; call it directly to check what
a page would produce before wiring anything.

```bash
curl -X POST "http://localhost:7777/api/kie/resolve-dynamic-schema" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"model_info": "| **Format** | `bytedance/seedance-2` |\n\n### input Object Parameters\n\n#### prompt\n- **Type**: `string`\n- **Required**: No\n- **Description**: The text prompt for the video.\n"}'
```

```json
{
  "model_id": "bytedance/seedance-2",
  "dynamic_properties": { "prompt": "" },
  "dynamic_inputs": {
    "prompt": {
      "type": "str",
      "type_args": [],
      "optional": true,
      "description": "The text prompt for the video."
    }
  },
  "dynamic_outputs": {
    "video": { "type": "video", "type_args": [], "optional": false }
  }
}
```

The model id comes from the docs' **Format** row; parameters are read from the
`#### <name>` headings under **input Object Parameters**, so an excerpt missing
that section resolves to a node with no inputs.

Docs with no recognizable model id are a `400`
(`{"code": "INVALID_INPUT", "detail": "Could not find model ID in documentation"}`),
as is a missing or empty `model_info`.

### What a Published App Runs

Publishing a mini app freezes a snapshot: the document as it stood, plus the
graph of every workflow its operations call. `GET
/api/applications/{id}/released-document` returns that snapshot, so a runtime can
serve the published app without reading the draft the author is still editing.

```bash
curl "http://localhost:7777/api/applications/<application_id>/released-document" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

```json
{
  "id": "548770b4c014436ba8549509575e9be6",
  "applicationId": "76a381309a584a13b823b297cbd9b4b1",
  "version": 1,
  "document": {
    "schemaVersion": 3,
    "ui": { "root": { "props": {} }, "content": [], "zones": {} },
    "operations": [],
    "resources": [],
    "variables": []
  },
  "capabilities": { "workflows": [], "resources": [] },
  "released": true,
  "createdAt": "2026-08-05T08:19:40.275Z",
  "workflows": [
    {
      "workflowId": "wf_abc123",
      "version": 4,
      "graphHash": "9f2c…",
      "graph": { "nodes": [], "edges": [] }
    }
  ]
}
```

Each entry in `workflows` is the graph as the release froze it. `version` and
`graph` are `null` on a snapshot published before releases pinned anything — a
runtime that meets one falls back to the live workflow.

An app with nothing published answers `200` with a body of `null`; an app you do
not own is a `404`. Publishing itself is a tRPC call (`applications.publish`),
not a REST route.

### Installing a Shipped Example App

NodeTool ships a set of curated mini apps. They are `ApplicationBundle` files on
disk rather than database rows, so listing and reading one needs no user and no
token; installing one writes into the caller's library.

`GET /api/applications/examples` is the catalog:

```bash
curl "http://localhost:7777/api/applications/examples"
```

```json
[
  {
    "slug": "dataset-builder",
    "name": "Dataset Builder",
    "description": "The smallest app in the set, and the reference for the Table widget: a dataframe reads better as rows than as a Preview node.",
    "workflows": ["Data Generator"],
    "operationCount": 1
  }
]
```

`workflows` names the workflows installing the app would create. To read the
whole thing first — the app document plus the full graph of every workflow it
binds — fetch the bundle:

```bash
curl "http://localhost:7777/api/applications/examples/dataset-builder"
```

That returns `{schemaVersion, name, description, app, workflows}`. A slug
nothing ships is a `404`
(`{"detail": "No example app named \"nope\""}`).

`POST /api/applications/examples/{slug}/install` goes through the normal bundle
import and answers with the created application. An optional `projectId` in the
body files it under a project:

```bash
curl -X POST "http://localhost:7777/api/applications/examples/dataset-builder/install" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{}'
```

```json
{
  "id": "f85f3d79566346df90827c752eab5bcf",
  "projectId": "default",
  "name": "Dataset Builder",
  "description": "…",
  "document": {
    "schemaVersion": 3,
    "ui": { "root": { "props": {} }, "content": [], "zones": {} },
    "operations": [],
    "resources": [],
    "variables": []
  },
  "createdAt": "2026-08-07T07:03:52.836Z",
  "updatedAt": "2026-08-07T07:03:52.836Z"
}
```

Omitting `projectId` files the app under `default`.

Installing also creates the workflows the app binds. Workflows carrying a
`sourceId` are created once per user, so installing two examples that share a
template leaves one workflow row both apps point at.

To install a bundle of your own instead of a shipped one, post it to
`POST /api/applications/import-bundle`.

### Exporting an App as a Bundle

`GET /api/applications/{id}/export-bundle` is the other half of
`import-bundle`: it packs one of the caller's apps and the full graph of every
workflow its operations bind into a single `ApplicationBundle` JSON file. Reach
for it to move an app between servers, or to check into git what
`import-bundle` will recreate.

```bash
curl "http://localhost:7777/api/applications/<application_id>/export-bundle" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -O -J
```

The response is `application/json` with a `content-disposition` built from the
app's name — `attachment; filename="Ask_Your_Documents.app.json"` — so `curl -OJ`
writes it under that name. The body is the bundle:

```json
{
  "schemaVersion": 1,
  "name": "Ask Your Documents",
  "description": "Retrieval-augmented answers with citations, and a fully local fallback…",
  "app": {
    "schemaVersion": 4,
    "ui": { "root": {}, "content": [] },
    "operations": [
      {
        "id": "ask",
        "name": "Ask",
        "workflowId": "chat-with-your-documents",
        "inputs": { "question_input": { "from": "variable", "variableId": "question" } },
        "outputs": {},
        "policy": "replace"
      }
    ],
    "resources": [],
    "variables": []
  },
  "workflows": [
    {
      "key": "chat-with-your-documents",
      "name": "Chat With Your Documents",
      "description": "Retrieval-augmented Q&A over your own documents…",
      "graph": { "nodes": [], "edges": [] },
      "version": null,
      "graphHash": null
    }
  ],
  "scripts": []
}
```

The operation's `workflowId` is that workflow's `key` in this file, not a row
id — which is what lets `import-bundle` create the workflows on the target
server and rewrite the keys to whatever ids they get there. `scripts` carries
any JS script documents the app binds, on the same terms.

By default this exports the **draft** document. `?released=1` (or
`?released=true`) exports the published snapshot instead — the document
`GET /api/applications/{id}/released-document` returns, packed together with the
graphs that release pinned:

```bash
curl "http://localhost:7777/api/applications/<application_id>/export-bundle?released=1" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o my.app.json
```

The two routes disagree about an app that has never been published, so pick by
which answer you want to handle. `released-document` calls it a `200` with a
`null` body; `export-bundle?released=1` calls it a `404` with
`{"detail": "Application has no released version"}`.

An id the caller does not own is also a `404`. The CLI wraps the same call as
`nodetool apps export-bundle <id> [-o file] [--released]`.

### Building an App on the Server

`POST /api/applications/build` runs the same six-stage build the CLI's
`nodetool app build` runs — spec, plan, author, check, run, judge — and answers
with the `BuildReport`. Reach for it when a caller wants a batch build without a
CLI on the machine.

Provider and model come from the body, falling back to
`NODETOOL_APP_BUILD_PROVIDER` and `NODETOOL_APP_BUILD_MODEL`. Neither one set
either way is a `400`:

```bash
curl -X POST "http://localhost:7777/api/applications/build" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "an app that drafts a note from a prompt",
    "provider": "anthropic",
    "model": "claude-sonnet-5"
  }'
```

Body fields, all optional except one of `prompt` or `spec`:

| Field | Meaning |
|---|---|
| `prompt` | What to build, in words. Either this or `spec` |
| `spec` | A pinned `BuildSpec`, skipping the Spec stage. Either this or `prompt` |
| `provider` / `model` | The builder's provider and model |
| `judge_model` | `provider/model` for the Judge stage. Omitted, the server picks a configured model the builder did not use |
| `workflow_ids` | Workflows to pin, in operation declaration order, instead of planning them |
| `max_repairs` | Repair rounds allowed (default 3) |
| `cost_cap_usd` | Ceiling on build spend (default 2) |
| `timeout_ms` | Wall-clock cap on the build |
| `poll` | Return a session id immediately instead of holding the request open |

`max_repairs` must be a non-negative integer and `cost_cap_usd` a positive
number. A present-but-invalid value is a `400` rather than silently becoming the
default — `cost_cap_usd: 0` turning into $2 would spend money the caller said
not to.

A build runs for minutes, so `poll: true` answers as soon as it starts:

```json
{
  "status": "running",
  "session_id": "…",
  "build_id": "…",
  "poll": "GET /api/debug/sessions/…",
  "cancel": "POST /api/debug/sessions/…/cancel"
}
```

Read those two paths until the session settles. A cancelled build settles as
`failed` with `reason: "cancelled"`.

The bundle behind a green verdict is offered, never installed: turning it into
an application is a separate `POST /api/applications/import-bundle`.

### Debugging an App on the Server

`POST /api/applications/debug` simulates a mini app headlessly — it validates
every widget binding, seeds input defaults, replays an interaction script, runs
the workflows on the kernel, and reports what each widget ended up showing.

Name a saved app with `application_id`, or post the live draft as `document`.
Neither is a `400` (`"An app debug run needs either an application_id or a
document."`).

```bash
curl -X POST "http://localhost:7777/api/applications/debug" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"application_id": "<application_id>", "run": false}'
```

| Field | Meaning |
|---|---|
| `application_id` | A saved application, read from the row. Either this or `document` |
| `document` | The live draft, verbatim. Either this or `application_id` |
| `params` | Reactive values applied before the interactions, keyed by input name |
| `interact` | The interaction script. Omitted, the app's natural run trigger fires |
| `run` | Execute workflow runs (default `true`); `false` is a static wiring check |
| `timeout_ms` | Per-run timeout |
| `poll` | Return a session id immediately, as with `build` above |

The response is the compacted report — the verdict plus what each widget shows.
`target.ref` echoes what was named: an application id, or `inline-document` when
the draft was posted as `document`.

```json
{
  "debug_id": "app-debug-186814b9-d387-4e67-8b8f-e7eab397575d",
  "status": "failed",
  "target": { "ref": "inline-document", "source": "application", "workflowId": null },
  "app": { "title": "Ask Your Documents", "widgetCount": 25 },
  "verdict": {
    "ok": false,
    "headline": "App has issues — TextInput \"in-ask-search\": bound to \"op:ask/in:search_input\" but operation \"ask\" runs a workflow with no node \"search_input\".",
    "issues": ["…"]
  }
}
```

`nodetool app debug` runs the same simulation locally and writes a full bundle
to disk; see [CLI](cli.md#nodetool-app-debug-application_id_or_file).

### Exporting a Storyboard as a Zip

The web app reads and writes boards over `/trpc/storyboards.*`. `GET
/api/storyboards/{id}/export-zip` is the one non-tRPC door, because the body is
a binary archive rather than JSON. Reach for it to hand a board to someone
without a NodeTool account — a director, a client, a review thread.

```bash
curl "http://localhost:7777/api/storyboards/<storyboard_id>/export-zip" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -O -J
```

The response is `application/zip` with `cache-control: no-store` and a
`content-disposition` built from the board's name, with each run of characters
outside `A-Za-z0-9._-` replaced by a single `_` — a board named
`First Light — Travel Teaser` becomes `attachment;
filename="First_Light_Travel_Teaser.zip"` — so `curl -OJ` writes it under that
name. Inside:

```
storyboard.md                      the board, shot by shot, linking its media
stills/01-dunes-before-sunrise.png the selected keyframe per shot
clips/01-dunes-before-sunrise.mp4  the selected clip per shot
```

Media file names are `<two-digit shot number><-slug>.<ext>`, where the slug is
the shot's own `slug` (or its action text) lowercased and hyphenated to 40
characters. The extension comes from the stored path; when the path carries
none it falls back to the ref's type, and then to `.bin`.

`storyboard.md` opens with the board title, then a bullet for each of logline,
brief, style, aspect ratio, and music prompt the board has set, always a shot
count, and the narration when there is one. Each shot follows under a level-two
heading — its number, then its slug or the first line of its action — with the
still embedded when one was packed, the action text, and a bullet for each of
camera, motion, dialogue, narration, duration, status, and notes it carries,
plus a link to its clip.

A shot's media is resolved server-side from `asset://`, a `/api/storage/` path,
an `https://` URL, or an inline `data:` URI — and only those. A ref in any other
form is not fatal: the shot keeps its text and the Markdown carries the reason
where the media would have been.

```markdown
- **Missing clip:** `asset://f3c1…` could not be read, so it is not in this archive.
```

That covers a `blob:` handle only the browser ever held, a URL that no longer
answers, and `package://` — which is what the shipped example boards carry, so
exporting one of those before rendering anything of your own yields
`storyboard.md` and no media files.

Unlike a `.nodetool` workflow bundle this is not a re-importable format —
nothing rewrites the refs, and there is no import route that reads it back. A
board the caller does not own is a `404` with
`{"detail": "Storyboard not found"}`, the same answer as an id that does not
exist.

### What This Server Supports

`GET /api/sdk/v1/capabilities` is the handshake an SDK client makes before
anything else: which route families are live, which wire encodings the server
speaks, what an execution request may ask for, and the numeric limits it will
enforce. Read it once at startup instead of hard-coding assumptions about the
server on the other end.

```bash
curl "http://localhost:7777/api/sdk/v1/capabilities" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

```json
{
  "protocol_version": "1",
  "nodetool_version": "0.7.0-rc.36",
  "server_time": "2026-08-21T06:09:57.898Z",
  "supported_encodings": ["messagepack", "json-text"],
  "default_encoding": "messagepack",
  "profiles": {
    "discovery": "available",
    "execution": "available",
    "preflight": "available",
    "model_catalog": "available",
    "model_download": "available",
    "temporary_asset_upload": "available"
  },
  "registry_revision": 2723,
  "python_bridge": "starting",
  "auth_modes": ["trusted_local"],
  "asset_uri_schemes": ["asset"],
  "execution_options": {
    "persistence": ["job", "session"],
    "event_detail": ["full", "outputs", "terminal"],
    "asset_persistence": ["auto", "temporary"],
    "defaults": {
      "persistence": "job",
      "event_detail": "full",
      "asset_persistence": "temporary"
    }
  },
  "limits": {
    "max_rpc_batch": 100,
    "max_inline_bytes": 0,
    "max_upload_bytes": 1073741824,
    "max_queued_jobs": 0,
    "max_job_event_replay": 0,
    "request_timeout_seconds": 30
  }
}
```

Each entry in `profiles` is `available`, `disabled`, or `unavailable`. On this
server the map is a fixed list that always reports `available`, so it names the
route families that exist rather than reporting which are switched on — a
disabled family still shows `available` here and answers `503` when called. Do
not gate on it; handle the `503`.

In `limits`, only `max_upload_bytes` is a ceiling the server enforces — it
tracks `NODETOOL_MAX_UPLOAD_BYTES` (1 GiB by default) and is what
`/api/sdk/v1/assets/temporary` rejects an over-size file against. The rest are
advertised figures this server does not itself enforce, and the zeros are not
limits of zero: `max_inline_bytes` is `0` because the profile carries media by
asset reference rather than promising any inline payload size, and
`max_queued_jobs` and `max_job_event_replay` are `0` because it states no bound
for them.

`auth_modes` is `trusted_local` on a server with no enforcing auth provider and
`bearer` once one is configured, so a client can tell whether it needs a token
before it sends a request without one. `python_bridge` is `ready` once the
Python bridge has connected and `starting` until then — including on a server
with no Python installed, where it stays `starting` indefinitely rather than
reporting `unavailable`. A workflow using Python nodes is not runnable until it
reads `ready`. `registry_revision` is the same counter the
node inventory and workflow summaries report, so a client can tell whether the
node registry moved under it.

Two environment flags can switch parts of this family off, and they cover
different routes. `NODETOOL_DISABLE_SDK_LIFECYCLE_V1=1` disables this route,
`/preflight`, and `/assets/temporary`, which then
answer `503` with `{"code": "SDK_LIFECYCLE_DISABLED", …}`.
`NODETOOL_DISABLE_SDK_WORKFLOW_INTERFACE_V1=1` disables the discovery routes —
`/node-types`, `/workflows`, `/workflow-interfaces`, and
`/api/sdk/v1/workflows/{id}/interface` — which answer `503` with
`SDK_WORKFLOW_INTERFACE_DISABLED`, except `/node-types`, which reports
`SDK_NODE_TYPE_INVENTORY_DISABLED`. The model catalog at `/api/sdk/v1/models`
and the model-download routes are unaffected by either. See
[Configuration](configuration.md#environment-variables-index).

### The Node Type Inventory

`GET /api/sdk/v1/node-types` reports the pin types the loaded registry actually
uses — one entry per type signature, how many nodes read or write it, and
example pins to look at. Where `/api/nodes/metadata` is indexed by node, this
is indexed by type, so it is the route to ask what a given type connects to
without walking every node's metadata.

```bash
curl "http://localhost:7777/api/sdk/v1/node-types?limit=2" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

```json
{
  "version": 1,
  "registry_revision": 2723,
  "registry_ready": true,
  "python_bridge_ready": false,
  "node_count": 2722,
  "type_count": 1158,
  "provenance_counts": { "typescript": 2722 },
  "cursor": 0,
  "next_cursor": 2,
  "types": [
    {
      "signature": "any",
      "type": "any",
      "type_name": null,
      "optional": false,
      "type_args": [],
      "values": [],
      "values_truncated": false,
      "input_uses": 74,
      "output_uses": 54,
      "node_count": 67,
      "sources": { "typescript": 128 },
      "examples": [
        {
          "node_type": "fal.vision.ArbiterImage",
          "pin": "values",
          "direction": "output"
        }
      ]
    }
  ],
  "unavailable_packs": [
    {
      "id": "elevenlabs",
      "name": "ElevenLabs",
      "reason": "disabled by built-in pack configuration"
    }
  ]
}
```

`cursor` (default `0`) and `limit` (`1`–`100`) page through the list; anything
outside that range is a `400` (`{"code": "INVALID_INPUT", …}`). `next_cursor` is
what to pass as the next `cursor`.

`node_count` appears at both levels and means different things: at the top it
is every node in the registry, and inside a type entry it is the nodes using
that type. `type_count` is how many entries exist across all pages, and
`provenance_counts` splits the registry by where the nodes came from —
`typescript` here, with Python nodes appearing once the bridge is up.

`input_uses` and `output_uses` count pins,
not nodes, so one node with two pins of a type counts twice — `node_count` is
the number of distinct node types. `examples` is capped at 5 entries, and for
an enum type `values` is capped at 64 with `values_truncated` set when there
were more. `unavailable_packs` names packs whose nodes are missing from these
counts and why, so a type that looks absent can be traced to a pack that never
loaded rather than to a registry bug. `python_bridge_ready` is `false` until
the Python bridge connects, and Python-only types are absent while it is.

### A Workflow's Input and Output Pins

Two routes answer what a workflow takes and returns, without fetching its graph.
Use them to build a form, validate a parameter bag, or decide which outputs to
subscribe to.

`GET /api/sdk/v1/workflows/{id}/interface?version=1` covers one workflow. The
`version=1` query parameter is required — omitting it is a `400`
(`{"code": "UNSUPPORTED_WORKFLOW_INTERFACE_VERSION", …}`), not a default:

```bash
curl "http://localhost:7777/api/sdk/v1/workflows/<workflow_id>/interface?version=1" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

```json
{
  "version": 1,
  "workflow_id": "23486bda2a46425fa8559f47c7c0adc9",
  "etag": "777f80b8651d2e56d7e1861a11f12667",
  "source": "server",
  "inputs": [
    {
      "node_id": "in1",
      "name": "prompt",
      "description": "Text to echo",
      "type": { "type": "str", "optional": false, "type_args": [], "type_name": null },
      "required": true,
      "default": ""
    }
  ],
  "outputs": [
    {
      "node_id": "out1",
      "name": "result",
      "description": "The echoed text",
      "type": { "type": "str", "optional": false, "type_args": [], "type_name": null },
      "stream": false
    }
  ],
  "diagnostics": []
}
```

An input pin's `name` is the key to use in a run's `params`; an output pin's
`name` is the key its value arrives under. `stream` marks an output that emits
repeatedly rather than once. `etag` changes whenever the interface changes, so
a client can cache a form against it and pass it back as `workflow_etag` on a
preflight. A graph the server can read but not interpret comes back with
entries in `diagnostics` (`severity`, `code`, `message`, and the `node_id` /
`pin_name` at fault) rather than an error.

`POST /api/sdk/v1/workflow-interfaces` does the same for 1–100 workflows in one
call. Both fields are required, and the ids must be unique:

```bash
curl -X POST "http://localhost:7777/api/sdk/v1/workflow-interfaces" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"ids": ["23486bda2a46425fa8559f47c7c0adc9"], "version": 1}'
```

Each entry of `interfaces` is exactly the object the single-workflow route
returns. One bad id does not fail the batch — it lands in `errors` instead, and
the rest still come back:

```json
{
  "interfaces": [
    { "version": 1, "workflow_id": "23486bda2a46425fa8559f47c7c0adc9", "etag": "777f80b8651d2e56d7e1861a11f12667", "source": "server", "inputs": [], "outputs": [], "diagnostics": [] }
  ],
  "errors": [
    { "workflow_id": "deadbeef", "code": "workflow_not_found", "message": "Workflow not found" }
  ]
}
```

`code` is `workflow_not_found` or `invalid_graph`. A malformed body — an empty
list, over 100 ids, duplicate ids, or a missing `version` — is a `400`
(`{"code": "INVALID_INPUT", "message": "Expected 1 to 100 unique workflow ids"}`)
and nothing is returned.

To find the ids in the first place, `GET /api/sdk/v1/workflows` lists the
caller's workflows in the shape this family uses:

```bash
curl "http://localhost:7777/api/sdk/v1/workflows?limit=2" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

```json
{
  "workflows": [
    {
      "id": "23486bda2a46425fa8559f47c7c0adc9",
      "name": "Interface Demo",
      "description": "Echoes a string input to an output",
      "revision": "2026-08-21T06:10:04.279Z",
      "registry_revision": 2723,
      "run_mode": "workflow"
    }
  ],
  "next": null
}
```

`limit` is `1`–`100`, default `50`; outside that range is a `400`. Page by
passing `next` back as `cursor` until it is `null`. `revision` is the
workflow's own last-modified stamp and
`registry_revision` the registry's, so a cached interface can be invalidated by
either moving. This is the discovery-shaped sibling of `/api/workflows` — that
route returns whole workflow records including graphs, this one returns only
what a client needs to pick one.

### Checking a Workflow Before Running It

`POST /api/sdk/v1/preflight` answers whether a workflow can run right now, what
it needs first, and what it will cost — before a job row exists and before any
node is paid for:

```bash
curl -X POST "http://localhost:7777/api/sdk/v1/preflight" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "workflow_id": "23486bda2a46425fa8559f47c7c0adc9",
    "workspace_id": null,
    "workflow_etag": null,
    "interface_version": 1,
    "level": "availability",
    "inputs": {"prompt": "hi"}
  }'
```

```json
{
  "version": 1,
  "level": "availability",
  "workflow_id": "23486bda2a46425fa8559f47c7c0adc9",
  "workflow_etag": "777f80b8651d2e56d7e1861a11f12667",
  "runnable": true,
  "issues": [],
  "requirements": [
    {
      "kind": "node_pack",
      "id": "base",
      "name": "base",
      "status": "available",
      "blocking": true,
      "message": null,
      "details": { "node_ids": ["in1", "out1"] }
    }
  ],
  "cost": {
    "amount": 0,
    "currency": "USD",
    "confidence": "exact",
    "unknown_cost_nodes": [],
    "approval_required": false
  }
}
```

`level` picks how much work the check does, and each level costs more than the
one before:

| Level | What it decides |
|-------|-----------------|
| `static` | The graph and the inputs, against the registry. Requirements are listed but their `status` is `unknown` — nothing is probed |
| `availability` | The same, plus a probe of each requirement: a pack becomes `available` or `missing`, a model `available`, `downloading`, or `unavailable`, a credential present or not. A probe that cannot decide reports `unknown` |
| `execution` | The same, plus whether there is capacity to run it now — adds `worker` requirements for the server itself and for execution capacity |

A requirement's `kind` is one of `provider`, `credential`, `model`,
`node_pack`, `runtime`, `asset`, `worker`, or `approval`; `blocking` says
whether `runnable` turns `false` without it. `issues` carries validation
findings with `severity` `warning` or `error` — at `execution` level a server
that cannot read its own capacity reports the warning
`execution_capacity_unknown` and stays runnable, because an unknown queue depth
is not a broken workflow.

`cost.confidence` separates two different kinds of doubt. `exact` means every
node priced exactly (as it does for a graph with nothing billable in it, where
`amount` is `0`). `estimate` means everything priced but at least one price is
itself an estimate. `partial` means some nodes could not be priced at all, and
those are the ones `unknown_cost_nodes` names. `unknown` means none could — and
that is the one case where `amount` is `null` rather than a number, so read
`confidence` before displaying `amount`. `approval_required` compares the total
against the server's own configured threshold, so gate a spend prompt on it
rather than on a threshold of the client's.

Passing the `etag` from the workflow's interface as `workflow_etag` checks the
graph has not moved since you read it. When it has, the answer is still a `200`
— `runnable` turns `false`, `issues` gains an `error` with code
`workflow_etag_mismatch`, and the response's own `workflow_etag` is the current
value, so a client can re-read the interface and try again. Pass `null` to skip
the check. `execution_target` picks where the run would go —
`{"kind": "local"}`, `{"kind": "worker", "worker_id": …}`, or
`{"kind": "runner", "runner_id": …}` — and defaults to local.

Every other field is required, including `workspace_id` and `inputs`, which
take `null` and `{}` rather than being omitted. A body missing one is a `400`
(`{"code": "INVALID_REQUEST", "message": "Invalid preflight request"}`).

### Uploading an Execution Input

`POST /api/sdk/v1/assets/temporary` puts one file where a workflow run can read
it, without creating an asset row, a thumbnail, or anything the user will later
have to clean out of their library. Use it for a run's inputs; use
`POST /api/assets` when the file belongs in the asset library.

The request is `multipart/form-data` with the file in a field named `file`:

```bash
curl -X POST "http://localhost:7777/api/sdk/v1/assets/temporary" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@sample.txt;type=text/plain"
```

```json
{
  "version": 1,
  "uri": "/api/storage/temp/sdk-inputs/7d0571c6-6d9c-4c3c-9cc2-292f2b0a8574.txt",
  "name": "sample.txt",
  "content_type": "text/plain",
  "size": 15,
  "expires_at": null
}
```

Pass `uri` as the value of the workflow input that takes the file. `expires_at`
is `null` when the configured temporary store sets no expiry — retention is the
store's, not this route's, so nothing here promises the file survives until the
run starts. A body that is not multipart, or multipart without a `file` field,
is a `400` — `{"code": "INVALID_REQUEST", "message": "Expected multipart/form-data"}`
or `"Multipart field 'file' is required"`. A file over the server's upload
limit — `limits.max_upload_bytes` from the capabilities route, 1 GiB by default
— is a `413` (`{"code": "UPLOAD_TOO_LARGE", …}`).

### Running a Saved JS Script

`POST /api/js-scripts/{id}/run` executes a stored
[JS script document](js-script-document-design.md) in the QuickJS sandbox and
returns what it emitted. The web editor reads and writes scripts over
`/trpc/jsScripts.*`; this is the one plain-HTTP door, for a run console, a mini
app, or a client driving a script it did not author.

`inputs` is keyed by the script's declared input ports. For a script declaring
`numbers` whose body is:

```js
const total = inputs.numbers.reduce((a, b) => a + b, 0);
await output("total", total);
```

```bash
curl -X POST "http://localhost:7777/api/js-scripts/<script_id>/run" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"inputs": {"numbers": [1, 2, 3, 4]}}'
```

```json
{
  "ok": true,
  "logs": [],
  "duration_ms": 41,
  "outputs": { "total": 10 },
  "streamed": []
}
```

`outputs` is keyed by the script's declared output ports, and `streamed` holds
its `emit` calls in order — empty here because this body makes none.

A body that pulls its inputs with `stream` rather than reading the `inputs`
object is fed through `input_streams`, which stages a list of items per input
handle. For a script whose body is:

```js
let total = 0;
for await (const n of stream("numbers")) {
  total += n;
  await emit("running", total);
}
await output("total", total);
```

```bash
curl -X POST "http://localhost:7777/api/js-scripts/<script_id>/run" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"inputs": {}, "input_streams": {"numbers": [1, 2, 3, 4]}}'
```

```json
{
  "ok": true,
  "logs": [],
  "duration_ms": 55,
  "outputs": { "total": 10 },
  "streamed": [
    { "name": "running", "value": 1 },
    { "name": "running", "value": 3 },
    { "name": "running", "value": 6 },
    { "name": "running", "value": 10 }
  ]
}
```

The two are not interchangeable: staging items for a body that reads
`inputs.numbers` leaves that name undefined, and the run fails. A handle the
script does not declare as an input is a `400`:

```json
{
  "detail": "input_streams names nope, which this script does not declare as inputs"
}
```

The script runs inside its own envelope — the packs its body imports, its
declared secrets, and its own `timeoutSeconds` — so nothing in the request
widens what it may reach. A body that throws is **not** an HTTP error: the
response is `200` with `ok: false` and the message in `error`, because a script
that failed is a result to show, not a transport failure.

```json
{
  "ok": false,
  "logs": [],
  "duration_ms": 29,
  "error": "TypeError: cannot read property 'reduce' of undefined"
}
```

Scripts are per-user. An id belonging to someone else is a `404`
(`{"detail": "JS script not found"}`), the same answer as an id that does not
exist. The response is plain JSON — there is no streaming surface here, so
`progress()` calls do not arrive as they happen.

### Listing Models an SDK Client Can Use

`GET /api/sdk/v1/models` is the model catalog behind the SDK's discovery
profile: every model the server knows about, what state it is in, and the exact
value to put in a node's model property. Reach for it when a client has to offer
a model picker without hard-coding ids.

```bash
curl "http://localhost:7777/api/sdk/v1/models?availability=downloadable&limit=1" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

```json
{
  "version": "1",
  "catalog_revision": "7db91c5aa30bc13588a9e4437d7ff7cabe88d82fbfc8049c8d507825326a10b6",
  "scope": "local",
  "entries": [
    {
      "key": "llama_cpp_model||ggml-org/gemma-3-12b-it-GGUF|gemma-3-12b-it-Q4_K_M.gguf",
      "display_name": "Gemma 3 12B IT (GGUF)",
      "compatibility": "llama_cpp_model",
      "availability": "downloadable",
      "recommended": true,
      "scope": "local",
      "provider": null,
      "id": "ggml-org/gemma-3-12b-it-GGUF:gemma-3-12b-it-Q4_K_M.gguf",
      "repo_id": "ggml-org/gemma-3-12b-it-GGUF",
      "path": "gemma-3-12b-it-Q4_K_M.gguf",
      "supported_tasks": [],
      "size_on_disk": 7838315315,
      "wire_value": {
        "type": "llama_cpp_model",
        "repo_id": "ggml-org/gemma-3-12b-it-GGUF",
        "path": "gemma-3-12b-it-Q4_K_M.gguf"
      }
    }
  ],
  "next_cursor": "llama_cpp_model||ggml-org/gemma-3-12b-it-GGUF|gemma-3-12b-it-Q4_K_M.gguf"
}
```

`wire_value` is the whole point of an entry: assign it to a node's model
property and the graph runs. `availability` is one of five values, decided in
this order: a download in flight is `downloading`, a model already in the local
cache is `ready_local`, a remote provider's model is `ready_remote` once that
provider is configured, and a recommended repository model (Hugging Face or
GGUF) you have not fetched yet is `downloadable`. Everything else — including a
remote model whose provider has no API key — is `unavailable`.

Query parameters, all optional:

| Parameter | Meaning |
|-----------|---------|
| `compatibility` | Keep only entries of one node-property type, e.g. `llama_cpp_model` |
| `availability` | One of the five availability values |
| `provider` | Keep only one provider's models, e.g. `ollama` |
| `scope` | `local` (default) or `worker` |
| `cursor` | The previous page's `next_cursor` |
| `limit` | 1–500, default `200` |

Page by passing `next_cursor` back as `cursor`; it is `null` on the last page.
`catalog_revision` hashes the entries a query produced, so a client can tell
whether anything moved without diffing the list. A value outside the allowed set
is a `400` (`{"code": "INVALID_INPUT", …}`), not a silently ignored filter.

`scope=worker` reads the models cached on the attached Python worker instead of
the server's own. With no worker attached that is a `501`:

```json
{
  "code": "MODEL_SCOPE_UNAVAILABLE",
  "message": "No worker is attached to this server.",
  "detail": "No worker is attached to this server.",
  "retryable": true
}
```

### Downloading a Model over the SDK Routes

Three routes cover the download lifecycle without a WebSocket: start one, poll
the snapshot, cancel it. They drive the same download manager the `/ws/download`
WebSocket does, so a headless client fetches a model exactly as the editor's
model manager would — it just polls instead of subscribing.

`POST /api/sdk/v1/model-downloads` starts a download and answers `202` with the
operation's first state:

```bash
curl -X POST "http://localhost:7777/api/sdk/v1/model-downloads" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"repo_id": "hf-internal-testing/tiny-random-gpt2", "model_type": "hf.text_generation"}'
```

```json
{
  "version": "1",
  "operation_id": "mdl_nY06SIV5ikFSqVqIvWOHQqIKQjJtkikk0VpLuRZszTc",
  "scope": "local",
  "repo_id": "hf-internal-testing/tiny-random-gpt2",
  "path": null,
  "model_type": "hf.text_generation",
  "status": "start",
  "downloaded_bytes": 0,
  "total_bytes": 0,
  "downloaded_files": 0,
  "current_files": [],
  "total_files": 0,
  "error": null,
  "started_at": "2026-08-06T08:16:40.600Z",
  "updated_at": "2026-08-06T08:16:40.600Z"
}
```

`repo_id` and `model_type` are required. `path` fetches a single file from the
repo — a `.gguf` weight, say — and cannot be combined with `allow_patterns` or
`ignore_patterns`, which otherwise take glob lists to narrow a whole-repo fetch.
`scope` defaults to `local`; `worker` hands the download to the attached Python
worker.

The `operation_id` is derived from the request, so starting the same download
twice returns the state already in flight rather than a second run.

`GET /api/sdk/v1/model-downloads` is the snapshot, newest update first. It takes
an optional `scope` (default `local`) and `operation_id` to narrow to one:

```bash
curl "http://localhost:7777/api/sdk/v1/model-downloads" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

```json
{
  "version": "1",
  "downloads": [
    {
      "version": "1",
      "operation_id": "mdl_nY06SIV5ikFSqVqIvWOHQqIKQjJtkikk0VpLuRZszTc",
      "scope": "local",
      "repo_id": "hf-internal-testing/tiny-random-gpt2",
      "path": null,
      "model_type": "hf.text_generation",
      "status": "cancelled",
      "downloaded_bytes": 0,
      "total_bytes": 488544,
      "downloaded_files": 0,
      "current_files": [],
      "total_files": 8,
      "error": null,
      "started_at": "2026-08-06T08:16:40.600Z",
      "updated_at": "2026-08-06T08:16:48.638Z"
    }
  ]
}
```

`status` walks `start` → `progress` → `completed`, or ends at `error` or
`cancelled`; `error` carries the message when it does. Finished operations stay
in the snapshot so a client that reconnects can see how a download ended — the
oldest terminal ones are dropped past 200 retained operations.

`POST /api/sdk/v1/model-downloads/cancel` stops one and returns its final state:

```bash
curl -X POST "http://localhost:7777/api/sdk/v1/model-downloads/cancel" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"operation_id": "mdl_nY06SIV5ikFSqVqIvWOHQqIKQjJtkikk0VpLuRZszTc"}'
```

Cancelling an operation that already finished returns the state it settled in.
An id this caller never started is a `404`
(`{"code": "MODEL_DOWNLOAD_NOT_FOUND", …}`). Ollama models are pulled by Ollama
itself, so `"model_type": "llama_model"` is a `501`
(`{"code": "MODEL_DOWNLOAD_UNAVAILABLE", …}`).

### Downloading the Chrome Extension

`GET /api/extension/download` zips up the browser extension build the server can
find and hands it over, so you can load it unpacked without cloning the repo.

```bash
curl "http://localhost:7777/api/extension/download" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o nodetool-chrome-extension.zip
```

The response is `application/zip` with
`content-disposition: attachment; filename="nodetool-chrome-extension.zip"`. The
server looks for the build at `NODETOOL_EXTENSION_DIST` (set by the desktop app
to its bundled copy), then walks up from its own directory and the working
directory looking for `chrome-extension/dist/manifest.json`. When none of those
holds a build, the answer is `404` with
`{"detail": "Extension build not found"}` — build it first, per
[Chrome Extension](chrome-extension.md#installing).

### How This Server Is Configured

A client has to decide whether to show a login screen before it has a token, so
`GET /api/config` needs none. It reports the auth mode the server picked and the
values a browser needs to complete a sign-in.

```bash
curl "http://localhost:7777/api/config"
```

```json
{
  "authMode": "local",
  "supabaseUrl": null,
  "supabaseAnonKey": null,
  "authRedirectUrl": null,
  "googleWorkspace": false,
  "googleScopes": [],
  "version": "0.7.0-rc.38"
}
```

`authMode` is `"supabase"` when both `SUPABASE_URL` and `SUPABASE_KEY` are set,
and `"local"` otherwise — the same choice the server's own auth hook makes, so a
client never has to guess it from the other fields. `supabaseUrl`,
`supabaseAnonKey` and `authRedirectUrl` mirror `SUPABASE_URL`,
`SUPABASE_ANON_KEY` and `AUTH_REDIRECT_URL`; each is `null` when unset. Note the
anon key is the public one — the service key (`SUPABASE_KEY`) is never in this
response.

`googleWorkspace` says whether the Google Workspace capability is on (see
`NODETOOL_GOOGLE_WORKSPACE` in [Configuration](configuration.md)). When it is,
`googleScopes` lists the OAuth scopes the connect step must request; when it is
not, that array is empty.

### Health Check

```bash
# Check if server is running (no auth required)
curl "http://localhost:7777/health"
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-06-20T00:00:00.000Z",
  "uptime": 123,
  "services": { "database": "ok", "server": "ok" }
}
```

### CLI Workflow Execution

You can also run workflows from the command line. `nodetool run` executes a
TypeScript/JavaScript DSL workflow file:

```bash
# Run a DSL workflow file
nodetool run ./my_workflow.ts

# Output results as JSON
nodetool run ./my_workflow.ts --json
```

To run a saved workflow by ID (requires a running server), use the `workflows`
subcommands:

```bash
# List workflows
nodetool workflows list

# Run a workflow by ID
nodetool workflows run workflow_abc123 --params '{"prompt": "test"}'
```

### TypeScript / Node.js Client Example

```javascript
const BASE_URL = 'http://localhost:7777';
const TOKEN = 'your_token_here';

// Run a workflow (runs to completion, returns one JSON response)
async function runWorkflow(workflowId, params) {
  const response = await fetch(`${BASE_URL}/api/workflows/${workflowId}/run`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ params })
  });
  const body = await response.json();
  // body: { job_id, workflow_id, status, outputs, error, message_count, background }
  return body.outputs;
}

// For real-time progress, run the workflow over the WebSocket endpoint instead.
// See the WebSocket API page and examples/workflow_runner/js/workflow-runner.js.

// Using OpenAI SDK (works with NodeTool!)
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: TOKEN,
  baseURL: `${BASE_URL}/v1`
});

const completion = await openai.chat.completions.create({
  model: 'gpt-5.6',
  messages: [{ role: 'user', content: 'Hello!' }]
});

console.log(completion.choices[0].message.content);
```

### Python Client Example

```python
import requests

BASE_URL = "http://localhost:7777"
TOKEN = "your_token_here"  # Not needed for local development
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
}

# List workflows
workflows = requests.get(f"{BASE_URL}/api/workflows", headers=HEADERS).json()

# Run a workflow (runs to completion, returns one JSON response)
result = requests.post(
    f"{BASE_URL}/api/workflows/{workflows[0]['id']}/run",
    headers=HEADERS,
    json={"params": {"prompt": "A sunset over mountains"}},
).json()
# result: {"job_id", "workflow_id", "status", "outputs", "error", "message_count", "background"}
print("Outputs:", result["outputs"])

# For real-time progress, run the workflow over the WebSocket endpoint instead.

# Use with OpenAI Python SDK (works with NodeTool!)
from openai import OpenAI

client = OpenAI(api_key=TOKEN, base_url=f"{BASE_URL}/v1")
completion = client.chat.completions.create(
    model="gpt-5.6",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(completion.choices[0].message.content)
```

### Finding Your Workflow ID

To run a workflow via API, you need its ID. Here's how to find it:

1. **From the UI:** Open a workflow in the editor — the ID appears in the browser URL bar
2. **From the API:** Call `GET /api/workflows` to list all workflows with their IDs
3. **From the CLI:** Run `nodetool workflows list`

### Error Handling

API errors return standard HTTP status codes with JSON error bodies:

```json
{
  "error": {
    "message": "Workflow not found: invalid_id",
    "type": "not_found",
    "code": 404
  }
}
```

| Status Code | Meaning | Common Causes |
|-------------|---------|---------------|
| 400 | Bad Request | Invalid parameters, malformed JSON |
| 401 | Unauthorized | Missing or invalid token |
| 403 | Forbidden | Token lacks permission |
| 404 | Not Found | Workflow/resource doesn't exist |
| 422 | Validation Error | Parameter validation failed |
| 500 | Internal Error | Server-side error |
| 503 | Service Unavailable | Server overloaded or starting up |

---

## Related Guides

- [Chat API](chat-api.md) — OpenAI-compatible request/response schema and WebSocket usage.  
- [Workflow API](workflow-api.md) — Workflow REST paths and execution.  
- [API Server Overview](api-server.md) — Server architecture and modules.  
- [Deployment Guide](deployment.md) — How servers are built and exposed.  
- [CLI Reference](cli.md) — Commands including `serve`.
