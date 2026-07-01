---
layout: page
title: "Self-Hosted Deployment Guide"
description: "Deploy the NodeTool server on your own infrastructure with Docker."
---

This guide covers deploying NodeTool on your own infrastructure.

## Overview

Self-hosted deployment runs NodeTool in a **Docker** container — on `localhost`
or on a remote host reached over SSH. Docker is the only supported deployment
`type` (`SUPPORTED_TYPES = ["docker"]`).

Two paths:

- **Docker Compose** — a single `docker-compose.yml` you run yourself. The
  fastest way to stand up one server. See below.
- **`nodetool deploy` CLI** — a managed flow driven by `deployment.yaml` that
  also handles remote hosts over SSH, image transfer, and workflow sync. See
  [Deployment Configuration](#deployment-configuration).

## Docker Compose (reference)

The repository ships a reference [`docker-compose.yml`](../docker-compose.yml)
for running one server on a host you control.

```bash
cp .env.example .env      # fill in the provider keys you use
docker compose up -d
# open http://localhost:17777
```

The server binds to `0.0.0.0:7777` inside the container and is published on the
host as `${NODETOOL_PORT:-17777}`. All persistent state — SQLite database,
assets, vector store, model cache, and the generated secret key — lives under
`/workspace`, backed by the named `nodetool-data` volume, so it survives
restarts and image upgrades.

Common overrides (set in `.env` or the shell):

| Variable | Default | Purpose |
|----------|---------|---------|
| `NODETOOL_VERSION` | `latest` | Image tag to pull (pin a release in production) |
| `NODETOOL_PORT` | `17777` | Host port mapped to the container's `7777` |
| `SECRETS_MASTER_KEY` | auto-generated | 32-byte base64 key encrypting stored secrets — set explicitly in production (`openssl rand -base64 32`) |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `FAL_API_KEY`, `HF_TOKEN` | unset | Model provider keys |

Upgrade in place:

```bash
docker compose pull
docker compose up -d
```

To store data in a host directory instead of the named volume, replace the
`nodetool-data:/workspace` mount with a bind mount (e.g. `./nodetool-data:/workspace`)
and make sure the host directory is writable by the container's `node` user.

### Authentication / login screen

Auth is configured **entirely on the backend**. The web UI fetches its auth mode
and public Supabase credentials at runtime from `GET /api/config` (a public,
non-secret endpoint), so the same frontend build works with or without login —
no rebuild, and it works even when the frontend is served from a different
origin.

- **Login off (default).** With `SUPABASE_URL`/`SUPABASE_KEY` unset the server
  runs in **Local mode**: localhost requests are trusted as a single user,
  remote requests are rejected, and the UI shows no login screen.
- **Login on.** Set these three on the server to switch to **Supabase mode** —
  the server requires a valid Supabase JWT on every request and the UI shows the
  login screen:

  ```bash
  SUPABASE_URL=https://your-project.supabase.co
  SUPABASE_KEY=your-service-role-key   # server-only, never sent to the browser
  SUPABASE_ANON_KEY=your-anon-key      # public key the login screen uses
  ```

  Optionally set `AUTH_REDIRECT_URL` when serving behind a domain/proxy (it must
  be in the Supabase project's redirect allow list).

`GET /api/config` returns `authMode`, `supabaseUrl`, `supabaseAnonKey`,
`authRedirectUrl`, and `version` — never the service-role key. See
[Authentication](authentication.md) and [Supabase Deployment](supabase-deployment.md).

> Serving the web UI from a **different origin** (e.g. a CDN)? Point the frontend
> at the backend with the build-time `VITE_API_URL`, and add that origin to the
> server's `NODETOOL_ALLOWED_ORIGINS` so the cross-origin `GET /api/config` and
> API calls are permitted. Everything else still comes from `/api/config`.

## Deployment Configuration

Deployments are configured via `deployment.yaml`.

### Docker Deployment

```yaml
deployments:
  my-server:
    type: docker
    enabled: true
    host: 192.168.1.10
    ssh:
      user: ubuntu
      key_path: ~/.ssh/id_rsa
    container:
      name: nodetool-server
      port: 8000
      gpu: "0"
    paths:
      workspace: /data/nodetool
      hf_cache: /data/hf-cache
    image:
      name: ghcr.io/nodetool-ai/nodetool
      tag: latest
```

For a local host, set `host: localhost` and omit the `ssh` block.

## Apply Flow

1. **Directory Creation**: Ensures `workspace` and `hf_cache` directories exist.
2. **Image Check**: Verifies the configured image exists locally/remote. `deploy apply` does not auto-pull.
3. **Image Transfer**: For remote hosts, copies image to remote runtime if needed.
4. **Container Management**: Restarts container with new configuration.
5. **Health Check**: Verifies HTTP endpoint.

## End-to-End: Local Docker Deployment

This walkthrough matches a common local setup flow:

1. Pull the Docker image.
2. Add a docker deployment interactively.
3. Review the generated deployment.
4. Apply deployment and validate health.
5. Sync workflows.
6. Run a synced workflow on the deployed instance.

### 0. Pull the Image First

```bash
docker pull ghcr.io/nodetool-ai/nodetool:latest
```

### 1. Add Local Docker Deployment

```bash
nodetool deploy add local --type docker
```

`--type docker` is required. The command then prompts for the rest:

- Host address: `localhost`
- Docker image name: `ghcr.io/nodetool-ai/nodetool`
- Docker image tag: `latest`
- Container name: `nodetool`
- Port: `8000`
- GPU/workflows assignment: optional
- Workspace folder: `$HOME/.nodetool-workspace`
- HF cache folder: canonical local HF cache (auto-detected, usually `$HOME/.cache/huggingface/hub`)

Path meanings:

- Workspace: stores assets and temporary runtime data.
- HF cache: stores downloaded Hugging Face artifacts/models.

### 2. Review Deployment Config

```bash
nodetool deploy show local
```

This dumps the deployment entry as YAML. You should see something like:

```yaml
local:
  type: docker
  host: localhost
  image:
    name: ghcr.io/nodetool-ai/nodetool
    tag: latest
  container:
    name: nodetool
    port: 8000
  paths:
    workspace: <your workspace path>
    hf_cache: <your HF cache path>
```

The server endpoint is at `http://localhost:8000`. The container EXPOSEs 7777;
when `container.port` is `7777` the deployer maps it to host port `8000` (any
other `container.port` is used as-is).

You can also inspect the raw config:

```bash
cat ~/.config/nodetool/deployment.yaml
```

### 3. Apply Deployment

```bash
nodetool deploy apply local
```

Expected successful output includes:

- directories created
- image check passed
- app container started
- health checks passing for `http://127.0.0.1:8000/health`
- `Deployment successful`
- secrets synced

If the first apply fails (for example due to container/port conflicts), run apply again:

```bash
nodetool deploy apply local
```

Then confirm runtime state:

{% raw %}
```bash
nodetool deploy status local
docker ps --filter name=nodetool --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
curl http://127.0.0.1:8000/health
```
{% endraw %}

### 4. Sync Workflows to the Deployment

List local workflows first:

```bash
nodetool workflows list
```

Sync one workflow by ID to the deployed instance:

```bash
nodetool deploy workflows sync local <workflow_id>
```

This sync command also:

- uploads referenced assets
- downloads referenced models (HuggingFace/Ollama) on the target

Verify remote workflows:

```bash
nodetool deploy workflows list local
```

### 5. Test Workflow Execution on Deployed Instance

Run a synced workflow remotely:

```bash
nodetool deploy workflows run local <workflow_id>
```

Optional params example:

```bash
nodetool deploy workflows run local <workflow_id> -p prompt="hello"
```

If a run fails, inspect logs:

```bash
nodetool deploy logs local --tail 200
```

## Manual Troubleshooting

### Container Logs

```bash
nodetool deploy logs local --tail 200
```

For a remote host you can also read the container logs directly:

```bash
ssh user@host "docker logs nodetool-server"
```
