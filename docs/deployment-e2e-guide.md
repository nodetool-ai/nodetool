---
layout: page
title: "End-to-End Deployment Guide"
---

This guide is a practical runbook for deploying NodeTool end-to-end with the unified server entrypoint (`python -m nodetool.api.run_server`).

It covers three production scenarios:

1. Desktop app mode
2. Public server mode (Supabase auth required)
3. Private server mode (token-based auth, with optional user file/multi-user auth)

## What Runs in Production

The server entrypoint is:

```bash
python -m nodetool.api.run_server --host 0.0.0.0 --port 7777
```

`run_server` CLI itself only accepts `--host`, `--port`, and `--reload`. Use environment variables (or `nodetool serve` flags) to control mode/auth/features.

Important runtime behavior:

- Server mode is selected by `NODETOOL_SERVER_MODE` (`desktop`, `public`, `private`).
- Auth provider is selected by `AUTH_PROVIDER`.
- In `ENV=production`, `SECRETS_MASTER_KEY` is required.
- Admin endpoints (`/admin/*`) are additionally protected by `X-Admin-Token` when `ADMIN_TOKEN` is set.

## Prerequisites

- Python environment with `nodetool-core` installed.
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

## Scenario Matrix

| Scenario | `NODETOOL_SERVER_MODE` | `AUTH_PROVIDER` | Notes |
| --- | --- | --- | --- |
| Desktop app | `desktop` | `local` or `none` | Broad feature set, local-first workflows |
| Public server | `public` | `supabase` | Required by server validation |
| Private server | `private` | `static`, `multi_user`, or `supabase` | Recommended for internal/self-hosted APIs |

## 1) Desktop App Deployment

Use this for local desktop runtime where the app talks to a local API server.

```bash
export NODETOOL_SERVER_MODE=desktop
export AUTH_PROVIDER=local
export ENV=development
export DB_PATH=/path/to/workspace/nodetool.db
export HF_HOME=/path/to/hf-cache
python -m nodetool.api.run_server --host 127.0.0.1 --port 7777
```

Verify:

```bash
curl -s http://127.0.0.1:7777/health
curl -s http://127.0.0.1:7777/ping
```

## 2) Public Server Deployment (Supabase)

Use this for internet-facing deployments where user auth is Supabase-backed.

```bash
export ENV=production
export NODETOOL_SERVER_MODE=public
export AUTH_PROVIDER=supabase
export SUPABASE_URL=https://<project>.supabase.co
export SUPABASE_KEY=<service-role-or-server-key>
export SECRETS_MASTER_KEY=<strong-random-secret>
export ADMIN_TOKEN=<admin-token>
export DB_PATH=/workspace/nodetool.db
export HF_HOME=/hf-cache
python -m nodetool.api.run_server --host 0.0.0.0 --port 7777
```

Verify:

```bash
curl -i http://<host>:7777/health
curl -i http://<host>:7777/workflows
```

Expected:

- `/health` returns `200`.
- `/workflows` without auth returns `401/403`.

Admin verification:

```bash
curl -i http://<host>:7777/admin/cache/size \
  -H "Authorization: Bearer <user-or-server-token>" \
  -H "X-Admin-Token: <admin-token>"
```

## 3) Private Server Deployment

Use this for private endpoints, internal APIs, and controlled deployments.

### Static token auth (common)

```bash
export ENV=production
export NODETOOL_SERVER_MODE=private
export AUTH_PROVIDER=static
export SERVER_AUTH_TOKEN=<strong-token>
export SECRETS_MASTER_KEY=<strong-random-secret>
export ADMIN_TOKEN=<admin-token>
export DB_PATH=/workspace/nodetool.db
export HF_HOME=/hf-cache
python -m nodetool.api.run_server --host 0.0.0.0 --port 7777
```

Call APIs:

```bash
curl -i http://<host>:7777/workflows \
  -H "Authorization: Bearer <strong-token>"
```

### Multi-user/private user-file style

If your deployment uses multi-user auth configuration, set:

```bash
export NODETOOL_SERVER_MODE=private
export AUTH_PROVIDER=multi_user
```

and provide the corresponding user/auth backend configuration for your environment (see [Authentication](authentication.md#authentication-providers)).

## Containerized End-to-End Run

### Docker

```bash
docker run --rm -p 7777:7777 \
  -e ENV=production \
  -e NODETOOL_SERVER_MODE=private \
  -e AUTH_PROVIDER=static \
  -e SERVER_AUTH_TOKEN=<token> \
  -e SECRETS_MASTER_KEY=<secret> \
  -e ADMIN_TOKEN=<admin-token> \
  -e DB_PATH=/workspace/nodetool.db \
  -e HF_HOME=/hf-cache \
  -v $(pwd)/workspace:/workspace \
  -v $(pwd)/hf-cache:/hf-cache \
  nodetool:local
```

### Podman

```bash
podman run --rm -p 7777:7777 \
  -e ENV=production \
  -e NODETOOL_SERVER_MODE=private \
  -e AUTH_PROVIDER=static \
  -e SERVER_AUTH_TOKEN=<token> \
  -e SECRETS_MASTER_KEY=<secret> \
  -e ADMIN_TOKEN=<admin-token> \
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
curl -s -X POST http://<host>:7777/workflows/<workflow-id>/run \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Production Checklist

- `ENV=production`
- `SECRETS_MASTER_KEY` set
- `AUTH_PROVIDER` matches mode constraints
- `ADMIN_TOKEN` set (recommended)
- `/health` and `/ping` are green
- Unauthorized access to protected endpoints returns `401/403`
- Workflow sync and workflow run both succeed

## Troubleshooting

### Server exits on startup in production

Check `SECRETS_MASTER_KEY`:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### `/admin/*` returns 403 in production

Send the `X-Admin-Token` header with the configured `ADMIN_TOKEN`.

### E2E tests skip with “image not found”

Validate image in active runtime context:

```bash
docker image ls | grep nodetool
podman image ls | grep nodetool
```

Then rebuild/tag in that same runtime context.
