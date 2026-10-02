---
layout: page
title: "End-to-End Deployment Guide"
description: "A practical runbook for deploying NodeTool end-to-end with `nodetool serve`: a local server, a Supabase-backed server, and Docker or Podman."
---

This guide is a practical runbook for deploying NodeTool end-to-end with the unified server entrypoint (`nodetool serve`).

It covers two production scenarios:

1. Local / desktop runtime (no remote auth)
2. Supabase-backed server (multi-user auth)

## What Runs in Production

The server entrypoint is:

```bash
nodetool serve --host 0.0.0.0 --port 7777
```

`nodetool serve` accepts only `--host` (default `127.0.0.1`) and `--port` (default `7777`). It sets `HOST` and `PORT` and starts the server from the built `@nodetool-ai/websocket` package. Use environment variables to control auth and runtime behavior. Run `node backend/server.mjs` in the Docker image, where `HOST` defaults to `0.0.0.0` in production mode.

Important runtime behavior:

- Auth is enabled automatically when **both** `SUPABASE_URL` and `SUPABASE_KEY` are set; otherwise the server uses a local auth provider. There is no `AUTH_PROVIDER` switch read by `serve`.
- Production mode is selected by `NODETOOL_ENV=production` (the container also sets `NODE_ENV=production`). Production mode also turns off the `/mcp` mount and the Python bridge until you opt in, see [Self-Hosted Deployment](self-hosted-deployment.md#mcp-over-http-and-python-nodes).
- The server needs a secrets master key. It reads `SECRETS_MASTER_KEY` first, then the system keychain, and generates a key into the keychain when neither exists. A host with no keychain (a headless Linux server) must set `SECRETS_MASTER_KEY`. The Docker image generates one into `/workspace/.secrets_master_key` when you leave it unset.
- `/health` (503 when the database check fails or the server is draining), `/ready` (liveness), and `/api/health` (version and uptime) require no authentication.

## Prerequisites

- NodeTool CLI installed (`@nodetool-ai/cli`).
- Container runtime:
  - Docker or
  - Podman
- Image for local deployment tests. The image refuses to start unless `DB_PATH` or `DATABASE_URL` is set. Build it from the repository root:

```bash
docker build -t nodetool:local .
```

If you use Podman:

```bash
podman build -t nodetool:local .
```

## 1) Local / Desktop Runtime (no remote auth)

Use this for local runtime where the app talks to a local API server. With no
`SUPABASE_*` vars set, the server uses the local auth provider.

```bash
export DB_PATH=/path/to/workspace/nodetool.db
export HF_HOME=/path/to/hf-cache
nodetool serve --host 127.0.0.1 --port 7777
```

Verify:

```bash
curl -s http://127.0.0.1:7777/health
curl -s http://127.0.0.1:7777/ready
```

## 2) Supabase-Backed Server

Use this for internet-facing deployments where user auth is Supabase-backed.
Setting both `SUPABASE_URL` and `SUPABASE_KEY` enables and enforces Supabase auth.

```bash
export NODETOOL_ENV=production
export SUPABASE_URL=https://<project>.supabase.co
export SUPABASE_KEY=<service-role-or-server-key>
export SECRETS_MASTER_KEY=<strong-random-secret>
export DB_PATH=/workspace/nodetool.db
export HF_HOME=/hf-cache
nodetool serve --host 0.0.0.0 --port 7777
```

Verify:

```bash
curl -i http://<host>:7777/health
curl -i http://<host>:7777/api/workflows
```

Expected:

- `/health` returns `200` (no auth required).
- `/api/workflows` without auth returns `401/403`.

## Containerized End-to-End Run

### Docker

```bash
docker run --rm -p 7777:7777 \
  -e NODETOOL_ENV=production \
  -e SECRETS_MASTER_KEY=<secret> \
  -e DB_PATH=/workspace/nodetool.db \
  -e HF_HOME=/hf-cache \
  -v $(pwd)/workspace:/workspace \
  -v $(pwd)/hf-cache:/hf-cache \
  nodetool:local
```

To enable Supabase auth, add `-e SUPABASE_URL=… -e SUPABASE_KEY=…` and `-e SUPABASE_ANON_KEY=…` for the login screen. Without Supabase, the server runs in Local mode and rejects requests that do not come from loopback or a network in `NODETOOL_TRUST_LOCAL_NETWORKS`, which `docker run` does not set. See [Authentication](authentication.md).

### Podman

```bash
podman run --rm -p 7777:7777 \
  -e NODETOOL_ENV=production \
  -e SECRETS_MASTER_KEY=<secret> \
  -e DB_PATH=/workspace/nodetool.db \
  -e HF_HOME=/hf-cache \
  -v $(pwd)/workspace:/workspace \
  -v $(pwd)/hf-cache:/hf-cache \
  nodetool:local
```

## Workflow Sync to a Deployed Server

Create the deployment config with `nodetool deploy init` and `nodetool deploy add <name> --type docker` (the file is `deployment.yaml` in the NodeTool config directory, `~/.config/nodetool/` on Linux). The deployment's `host` and `container.port` give the server URL. Pass an admin bearer token with `--token` or `NODETOOL_ADMIN_TOKEN`, then sync:

```bash
export NODETOOL_ADMIN_TOKEN=<admin token>
nodetool deploy workflows sync <deployment-name> <workflow-id>
```

Sync pushes the workflow definition only. Assets and models are not copied.

List remote workflows:

```bash
nodetool deploy workflows list <deployment-name>
```

Run synced workflow via REST:

```bash
curl -s -X POST http://<host>:7777/api/workflows/<workflow-id>/run \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Production Checklist

- `NODETOOL_ENV=production`
- `SECRETS_MASTER_KEY` set, or a persistent `/workspace` volume so the image can keep its generated key
- Supabase auth (`SUPABASE_URL` + `SUPABASE_KEY`) configured if you need remote auth
- `/health` and `/ready` are green
- Unauthorized access to protected endpoints returns `401/403`
- Workflow sync and workflow run both succeed

## Troubleshooting

### Server exits on startup

The Docker image exits at once when neither `DB_PATH` nor `DATABASE_URL` is set. Outside the image, a host with no keychain exits when `SECRETS_MASTER_KEY` is missing. Generate a key:

```bash
openssl rand -base64 32
```

### `docker run` or `podman run` reports “image not found”

Docker and Podman keep separate image stores. Check the one you run with:

```bash
docker image ls | grep nodetool
podman image ls | grep nodetool
```

Then rebuild/tag in that same runtime context.
