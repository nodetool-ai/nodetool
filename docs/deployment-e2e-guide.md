---
layout: page
title: "End-to-End Deployment Guide"
description: "A practical runbook for deploying NodeTool end-to-end with `nodetool serve` — desktop, public, and private server modes."
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

`nodetool serve` accepts only `--host` and `--port`. Use environment variables to control auth and runtime behavior.

Important runtime behavior:

- Auth is enabled automatically when **both** `SUPABASE_URL` and `SUPABASE_KEY` are set; otherwise the server uses a local auth provider. There is no `AUTH_PROVIDER` switch read by `serve`.
- Production mode is selected by `NODETOOL_ENV=production` (the container also sets `NODE_ENV=production`). In production, `SECRETS_MASTER_KEY` is required.
- `/health` and `/ready` require no authentication.

## Prerequisites

- NodeTool CLI installed (`@nodetool-ai/cli`).
- Container runtime:
  - Docker or
  - Podman
- Image build for local deployment tests:

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

To enable Supabase auth, add `-e SUPABASE_URL=… -e SUPABASE_KEY=…`.

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

Create deployment config (`~/.config/nodetool/deployment.yaml`) with the target host and auth token, then sync:

```bash
nodetool deploy workflows sync <deployment-name> <workflow-id>
```

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
- `SECRETS_MASTER_KEY` set
- Supabase auth (`SUPABASE_URL` + `SUPABASE_KEY`) configured if you need remote auth
- `/health` and `/ready` are green
- Unauthorized access to protected endpoints returns `401/403`
- Workflow sync and workflow run both succeed

## Troubleshooting

### Server exits on startup in production

Check `SECRETS_MASTER_KEY`:

```bash
openssl rand -base64 32
```

### E2E tests skip with “image not found”

Validate image in active runtime context:

```bash
docker image ls | grep nodetool
podman image ls | grep nodetool
```

Then rebuild/tag in that same runtime context.
