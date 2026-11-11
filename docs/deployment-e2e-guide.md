---
layout: page
title: "End-to-End Deployment Guide"
description: "A practical runbook for deploying NodeTool end-to-end with `nodetool serve`: a local server, a Supabase-backed server, and Docker or Podman."
---

Runbook for deploying NodeTool with `nodetool serve`: a local server, a Supabase-backed server, and Docker or Podman containers.

> **Runs:** on any host with Node.js, or in a Docker or Podman container. **Needs:** `DB_PATH` or `DATABASE_URL`, a master key (`SECRETS_MASTER_KEY`, or a keychain), and for remote auth `SUPABASE_URL` and `SUPABASE_KEY`. **Ports:** `7777` by default. **Hardware:** not measured.
{: .callout-note}

## What Runs in Production

The server entrypoint is:

```bash
nodetool serve --host 0.0.0.0 --port 7777
```

`nodetool serve` accepts only `--host` (default `127.0.0.1`) and `--port` (default `7777`). It sets `HOST` and `PORT` and starts the server from the built `@nodetool-ai/websocket` package. Auth and runtime behavior come from environment variables. The Docker image runs `node backend/server.mjs`, where `HOST` defaults to `0.0.0.0` in production mode.

- Auth is enforced when **both** `SUPABASE_URL` and `SUPABASE_KEY` are set. Otherwise the server uses the local auth provider. `serve` reads no `AUTH_PROVIDER` switch.
- `NODETOOL_ENV=production` selects production mode (the container also sets `NODE_ENV=production`). It turns off the `/mcp` mount and the Python bridge until you opt in. See [Self-Hosted Deployment](self-hosted-deployment.md#mcp-over-http-and-python-nodes).
- The master key comes from `SECRETS_MASTER_KEY`, then the system keychain, and is generated into the keychain when neither exists. A headless Linux host must set `SECRETS_MASTER_KEY`. The Docker image generates one into `/workspace/.secrets_master_key` when unset.
- `/health` (503 when the database check fails or the server is draining), `/ready` (liveness), and `/api/health` (version and uptime) need no authentication.

## Prerequisites

- The NodeTool CLI (`@nodetool-ai/cli`), see [Installation](installation.md).
- Docker or Podman, and an image. Build one from the repository root:

```bash
docker build -t nodetool:local .    # or: podman build -t nodetool:local .
```

## 1) Local / Desktop Runtime (no remote auth)

With no `SUPABASE_*` variables set, the server uses the local auth provider.

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

Setting both `SUPABASE_URL` and `SUPABASE_KEY` enforces Supabase auth.

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

`/health` returns `200` without auth. `/api/workflows` without a token returns `401`.

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

Use the same command with `podman run`. Docker and Podman keep separate image stores, so build the image with the runtime you run it with.

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
- `SECRETS_MASTER_KEY` set, or a persistent `/workspace` volume so the image keeps its generated key
- `SUPABASE_URL` and `SUPABASE_KEY` set if you need remote auth
- `/health` and `/ready` return `200`
- Protected endpoints without a token return `401`
- Workflow sync and workflow run both succeed

## If it fails

- **`ERROR: No database configured. Set DATABASE_URL (PostgreSQL) or DB_PATH (SQLite).`**: the Docker image exits at once without one of them.
- **Exit on startup outside the image**: a host with no keychain exits when `SECRETS_MASTER_KEY` is missing. Generate one with `openssl rand -base64 32`.
- **`docker run` or `podman run` reports "image not found"**: check the runtime you run with (`docker image ls | grep nodetool`, `podman image ls | grep nodetool`), then rebuild and tag there.
- **`401 "Remote access requires authentication"` in the container without Supabase**: Local mode trusts only loopback and `NODETOOL_TRUST_LOCAL_NETWORKS`. See [Authentication](authentication.md#local-mode-in-docker).
