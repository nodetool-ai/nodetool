---
layout: page
title: "API Reference"
---



## API Families and Why They Exist

NodeTool exposes three closely related API surfaces:

- **Editor API (NodeTool application / desktop)**  
  - Served by `nodetool serve` (`src/nodetool/api/server.py`).  
  - Used by the NodeTool desktop app and local web UI to manage workflows, assets, jobs, and settings.  
  - Acts as the **control plane** for authoring and debugging; includes dev-only endpoints such as the terminal WebSocket and debug tooling.  
  - Intended to run on a trusted local machine, not as a public internet API.

- **Worker API (deployable instance)**  
  - Served by `nodetool worker` (`src/nodetool/deploy/worker.py`).  
  - Provides a **stable, hardened runtime surface** for external clients: OpenAI-compatible chat, workflow execution, admin and storage routes, and health checks.  
  - Designed for self-hosted, RunPod, Cloud Run, and other remote deployments; all non-health endpoints sit behind Bearer auth and TLS.

- **Chat Server API (chat-only runtime)**  
  - Served by `nodetool chat-server` (`src/nodetool/chat/server.py`).  
  - Minimal OpenAI-compatible `/v1/chat/completions` and `/v1/models` plus `/health` for environments where you only need chat, not workflows or admin routes.

This split exists because:

- The desktop/editor needs full control over local resources and rich debug features, while deployed workers must *not* expose those capabilities.
- The worker API is a small, stable contract you can safely integrate against and deploy widely; the editor API can evolve with the UI and internal architecture.
- Separating **control plane** (Editor API) from **data plane** (Worker/Chat server) makes scaling, security hardening, and multi-environment deployments simpler.

## Unified Endpoint Matrix

The table below summarizes key endpoints across the three surfaces. For detailed schemas, see [Chat API](chat-api.md) and [Workflow API](workflow-api.md).

| Surface                 | Area       | Path / Prefix                     | Method / Protocol | Auth                                         | Streaming                        | Notes |
|-------------------------|-----------|-----------------------------------|-------------------|----------------------------------------------|----------------------------------|-------|
| Editor, Worker, Chat    | Models    | `/v1/models`                      | `GET`             | Bearer when `AUTH_PROVIDER` enforces         | no                               | OpenAI-compatible model listing |
| Editor, Worker, Chat    | Chat      | `/v1/chat/completions`           | `POST`            | Bearer when `AUTH_PROVIDER` enforces         | SSE when `\"stream\": true`      | OpenAI-compatible chat; SSE or single JSON |
| Editor                  | Workflows | `/api/workflows`                 | `GET`             | Depends on `AUTH_PROVIDER`                   | no                               | List workflows for the local app |
| Worker                  | Workflows | `/workflows`                     | `GET`             | Depends on `AUTH_PROVIDER`                   | no                               | List workflows on a worker instance |
| Worker                  | Workflows | `/workflows/{id}/run`            | `POST`            | Depends on `AUTH_PROVIDER`                   | no                               | Run a workflow once, return final outputs |
| Worker                  | Workflows | `/workflows/{id}/run/stream`     | `POST` (SSE)      | Depends on `AUTH_PROVIDER`                   | yes (SSE, server → client)       | Stream workflow progress and results |
| Editor                  | Chat WS   | `/chat`                          | WebSocket         | Bearer header or `api_key` query when enforced | yes                            | Bidirectional chat, tools, and workflow triggering |
| Editor                  | Jobs WS   | `/predict`                       | WebSocket         | Bearer header or `api_key` query when enforced | yes                            | Workflow/job execution and reconnection |
| Editor                  | Updates   | `/updates`                       | WebSocket         | Follows global auth settings                 | yes                             | System and job updates stream |
| Editor (dev-only)       | Terminal  | `/terminal`                      | WebSocket         | Same as `/chat`/`/predict` (when enabled)    | yes                             | Host terminal access; gated by `NODETOOL_ENABLE_TERMINAL_WS` |
| Worker                  | Health    | `/health`                        | `GET`             | none                                         | no                               | JSON worker health (public) |
| Worker                  | Ping      | `/ping`                          | `GET`             | none                                         | no                               | JSON ping with timestamp (public) |
| Editor, Chat            | Health    | `/health`                        | `GET`             | none                                         | no                               | Basic liveness; string or JSON |
| Worker                  | Storage   | `/admin/storage/*`               | `HEAD/GET/PUT/DELETE` | Bearer when enforced                      | streaming for `GET`              | Admin asset/temp storage (full CRUD) |
| Worker                  | Storage   | `/storage/*`                     | `HEAD/GET`        | none or proxy-protected                      | streaming for `GET`              | Public read-only asset/temp access |

> When `AUTH_PROVIDER` is `local` or `none`, editor and worker endpoints accept requests without a token for convenience. When it is `static` or `supabase`, include `Authorization: Bearer <token>` on every request except `/health` and `/ping`.

## Authentication and Headers

- HTTP: `Authorization: Bearer <token>` on all non-public routes.
- WebSocket (Editor API): `Authorization: Bearer <token>` header (preferred) or `api_key`/`token` query parameter for legacy clients.
- SSE: `Authorization: Bearer <token>` and `Accept: text/event-stream`.

See [Authentication](authentication.md) for full token handling rules and the different `AUTH_PROVIDER` modes across editor and worker deployments.

## Streaming Behavior

- `/v1/chat/completions` uses OpenAI-style SSE when `stream` is true; otherwise it returns a single JSON response.
- Editor WebSockets:
  - `/predict` streams workflow/job events until completion or cancellation.
  - `/chat` streams chat tokens, tool calls, and agent/workflow events.
- Worker SSE:
  - `/workflows/{id}/run/stream` sends job update and output events, then a final `[DONE]`.
- Worker storage routes stream file contents for large assets.

## Related Guides

- [Chat API](chat-api.md) — OpenAI-compatible request/response schema and WebSocket usage.  
- [Workflow API](workflow-api.md) — Editor vs Worker workflow paths and streaming.  
- [API Server Overview](api-server.md) — Editor API architecture and modules.  
- [Deployment Guide](deployment.md) — How workers are built and exposed.  
- [Chat Server](chat-server.md) — Minimal chat-only deployments.  
- [CLI Reference](cli.md) — Commands for `serve`, `worker`, and `chat-server`.
