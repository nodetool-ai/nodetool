---
layout: page
title: "API Reference"
description: "REST, WebSocket, and OpenAI-compatible API endpoints for NodeTool workflows, chat, and model access."
---



## Server Architecture

NodeTool runs a single Fastify HTTP + WebSocket server (`@nodetool-ai/websocket` — `packages/websocket/src/server.ts`). The same process serves:

- REST routes under `/api/*` (workflows, jobs, assets, models, settings, storage).
- OpenAI-compatible `/v1/chat/completions` and `/v1/models`.
- WebSocket endpoints for workflow execution, chat, the browser extension, downloads, and the agent runtime.
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
| Workflows | `/api/workflows/public`           | `GET`             | none                                           | no                          | Workflows the owner marked `access: "public"` |
| Workflows | `/api/workflows/public/{id}`      | `GET`             | none                                           | no                          | One public workflow; `404` when it is not public |
| Examples  | `/api/workflows/examples`         | `GET`             | none                                           | no                          | Shipped example templates — metadata only, `graph` is empty |
| Examples  | `/api/workflows/examples/search`  | `GET`             | none                                           | no                          | Same list filtered by `?query=` over name, description, tags |
| Examples  | `/api/workflows/examples/thumbnails/{filename}` | `GET` | none                                     | no                          | Example thumbnail; `.jpg` and `.png` only |
| Assets    | `/api/assets/{id}/extract-audio`  | `POST`            | Depends on `AUTH_PROVIDER`                     | no                          | Extract a video asset's audio track into a new WAV asset |
| Assets    | `/api/assets/packages/{package}/{file}` | `GET`       | none                                           | streaming                   | Bytes behind a `package://` ref, from a node pack's assets directory |
| Apps      | `/api/applications/{id}/released-document` | `GET`    | Depends on `AUTH_PROVIDER`                     | no                          | The snapshot a published app should run, with each operation's pinned graph; `null` when nothing is published |
| Providers | `/api/fal/credits`                | `GET`             | Depends on `AUTH_PROVIDER`                     | no                          | The server's fal.ai account balance; `204` when no `FAL_API_KEY` is configured |
| Providers | `/api/fal/pricing`                | `GET`             | Depends on `AUTH_PROVIDER`                     | no                          | Unit price per fal.ai endpoint, one or more `?endpoint_id=`; cached an hour |
| Providers | `/api/kie/credits`                | `GET`             | Depends on `AUTH_PROVIDER`                     | no                          | The server's kie.ai credit balance; `204` when no `KIE_API_KEY` is configured |
| Providers | `/api/kie/pricing`                | `GET`             | Depends on `AUTH_PROVIDER`                     | no                          | Credit price per kie.ai model, one or more `?model_id=`; cached an hour |
| Providers | `/api/kie/resolve-dynamic-schema` | `POST`            | Depends on `AUTH_PROVIDER`                     | no                          | Pasted kie.ai model docs to a node's dynamic properties, inputs, and outputs |
| SDK       | `/api/sdk/v1/models`              | `GET`             | Depends on `AUTH_PROVIDER`                     | no                          | Paged model catalog with per-model availability and the wire value a node property takes |
| SDK       | `/api/sdk/v1/model-downloads`     | `GET`             | Depends on `AUTH_PROVIDER`                     | no                          | Snapshot of this caller's model downloads, running and finished |
| SDK       | `/api/sdk/v1/model-downloads`     | `POST`            | Depends on `AUTH_PROVIDER`                     | no                          | Start a model download; `202` with the operation's first state |
| SDK       | `/api/sdk/v1/model-downloads/cancel` | `POST`         | Depends on `AUTH_PROVIDER`                     | no                          | Cancel one download by `operation_id` |
| Extension | `/api/extension/download`         | `GET`             | Depends on `AUTH_PROVIDER`                     | no                          | The built Chrome extension as a zip; `404` when the server has no build |
| Workflow WS | `/ws`                           | WebSocket         | Bearer header or `api_key` query when enforced | yes                         | Workflow execution, chat, job control, live updates (MessagePack or JSON) |
| Agent WS  | `/ws/agent`                       | WebSocket         | Bearer header or `api_key` query when enforced | yes                         | Agent runtime |
| Extension WS | `/ws/extension`                | WebSocket         | Follows global auth settings                   | yes                         | Browser extension channel |
| Download WS | `/ws/download`                  | WebSocket         | Follows global auth settings                   | yes                         | Model/file downloads |
| Storage   | `/api/storage/*`                  | `HEAD/GET`        | Depends on `AUTH_PROVIDER`                     | streaming for `GET`         | Asset bytes at `<userId>/<assetId>.<ext>`, scoped to the caller. Read-only: writes go through the asset API, deletes through tRPC `storage.delete` |
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

### List Workflows

```bash
# List all workflows
curl "http://localhost:7777/api/workflows" \
  -H "Authorization: Bearer YOUR_TOKEN"
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
