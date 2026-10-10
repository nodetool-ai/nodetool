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

The repository ships a reference
[`docker-compose.yml`](https://github.com/nodetool-ai/nodetool/blob/main/docker-compose.yml)
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
| `NODETOOL_IMAGE` | `ghcr.io/nodetool-ai/nodetool:${NODETOOL_VERSION}` | Full image reference. Set it to run a locally built image (for example `nodetool:dev`) |
| `NODETOOL_VERSION` | `latest` | Image tag to pull (pin a release in production) |
| `NODETOOL_PORT` | `17777` | Host port mapped to the container's `7777` |
| `NODETOOL_TRUST_LOCAL_NETWORKS` | `172.16.0.0/12,192.168.65.0/24` | ⚠️ Source CIDRs trusted as user `1` **without a login** (Local mode). Docker's Linux bridge plus Docker Desktop's VM gateway subnet by default — **never `0.0.0.0/0`** on a public IP. Ignored in Supabase mode |
| `SECRETS_MASTER_KEY` | generated on first start | 32-byte base64 key encrypting stored secrets. If unset, the image entrypoint generates one and stores it in `/workspace/.secrets_master_key` (override the path with `SECRETS_MASTER_KEY_FILE`). The line is commented out in the compose file, so uncomment it to pass your own (`openssl rand -base64 32`) |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `FAL_API_KEY`, `HF_TOKEN` | unset | Model provider keys |

The compose file also sets `NODETOOL_ENV=production` and
`NODETOOL_NODE_PROFILE=full`. Production defaults to the curated cloud node
catalog with no local model runtimes, and `full` restores the whole catalog,
including the llama.cpp, vLLM, and Ollama providers. The database is SQLite at
`/workspace/nodetool.sqlite3` (`DB_PATH`). The entrypoint refuses to start when
neither `DB_PATH` nor `DATABASE_URL` is set.

The compose file has commented-out blocks you can enable:

- **Ollama**: set `OLLAMA_API_URL` (`http://host.docker.internal:11434` for
  Ollama on the host, with the `extra_hosts` entry uncommented).
- **llama.cpp** and **vLLM** services: uncomment the service and set
  `LLAMA_CPP_URL` or `VLLM_BASE_URL`. vLLM needs an NVIDIA GPU on Linux.
- **PostgreSQL**: uncomment the `postgres` service, remove `DB_PATH`, and set
  `DATABASE_URL`. With `DATABASE_URL` set, the entrypoint runs
  `db-migrate.mjs` on every start unless `NODETOOL_MIGRATE_ON_BOOT=0`.

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
  runs in **Local mode**: it trusts requests by *source IP* (loopback, plus any
  `NODETOOL_TRUST_LOCAL_NETWORKS` you set) and runs them as a single user; other
  requests are rejected, and the UI shows no login screen. In Docker the bundled
  Compose file trusts the Docker bridge (`172.16.0.0/12`) and Docker Desktop's
  VM gateway subnet (`192.168.65.0/24`) so a local install works out of the box
  — see the warning below.
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

> ### 🔒 Do not expose Local mode to the internet
>
> Local mode has **no login**. `NODETOOL_TRUST_LOCAL_NETWORKS` trusts a set of
> source IPs as admin user `"1"` with no password — full access to your data,
> secrets, and API keys. Anyone who can reach the published port from a trusted
> range gets in.
>
> - Safe on a laptop or a private LAN/VPN behind a firewall.
> - The default `172.16.0.0/12,192.168.65.0/24` trusts only Docker's bridge and
>   Docker Desktop's VM gateway, not the wider internet. **Never change it to
>   `0.0.0.0/0` on a public IP.**
> - Putting NodeTool on a public address or sharing it with untrusted users?
>   **Enable Supabase mode** (above) so every request needs a real login, and
>   terminate TLS in front of the server or give it a certificate
  ([Serving the Web UI and TLS](configuration.md#serving-the-web-ui-and-tls)).

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

1. **Directory Creation**: Creates `workspace` (with `data`, `assets`, `temp`, `proxy`, and `acme` subdirectories) and `hf_cache` on the host.
2. **Image Check**: Verifies the configured image exists on the host. `deploy apply` does not pull. A local host without the image fails with an error, so pull or build it first.
3. **Image Transfer**: For a remote host that lacks the image, pipes `docker save` from your local daemon into `docker load` over SSH. An image the remote already holds is never replaced.
4. **Container Management**: Stops and removes the existing container, and any other `nodetool-*` container publishing the same host port, then runs a new one named `nodetool-<container.name>`. Docker is used when installed, otherwise Podman. Set `NODETOOL_CONTAINER_RUNTIME=docker` or `podman` to choose.
5. **Health Check**: Polls `http://127.0.0.1:<host port>/health` on the host, 10 attempts 2 seconds apart, and fails the apply if the server never answers.

`container.port` is the host port. The container serves on `7777`, and a
`container.port` of `7777` is published as `8000`. The container is started with
`--restart unless-stopped` and a Docker health check on `/health`.

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

- Docker host (IP or hostname): `localhost`
- SSH user and SSH key path: asked only for a remote host (defaults `root` and `~/.ssh/id_rsa`)
- Docker image name: `ghcr.io/nodetool-ai/nodetool`
- Image tag: `latest`
- Container name: `nodetool-<deployment name>`
- Container port: `8000`

The command does not prompt for GPU or paths. It sets `paths.workspace` to
`~/.nodetool-workspace` and `paths.hf_cache` to the Hugging Face cache it finds
(`HF_HUB_CACHE`, then `$HF_HOME/hub`, then `~/.cache/huggingface/hub`). Edit
`container.gpu` and `paths` with `nodetool deploy edit`.

Path meanings:

- Workspace: mounted at `/workspace`. Holds the database, assets, and temporary runtime data.
- HF cache: mounted at `/hf-cache`, read-only. Holds downloaded Hugging Face models.

### 2. Review Deployment Config

```bash
nodetool deploy show local
```

This dumps the deployment entry as YAML. It also lists `enabled`, `state`, `server_auth_token`, and `container.environment` (with a generated `SECRETS_MASTER_KEY`). You should see something like:

```yaml
local:
  type: docker
  host: localhost
  image:
    name: ghcr.io/nodetool-ai/nodetool
    tag: latest
  container:
    name: nodetool-local
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

To change a field `deploy add` did not prompt for, open the file in `$EDITOR`:

```bash
nodetool deploy edit
```

`deploy edit` takes no deployment name — it opens the whole `deployment.yaml`.
Without one on disk it stops and tells you to run `nodetool deploy init` first.

### 3. Apply Deployment

```bash
nodetool deploy apply local
```

Apply prints each step, then the result as JSON. A successful run shows:

- directories created
- `Image already present.`
- app container started
- `Health endpoint OK: http://127.0.0.1:8000/health`
- `"status": "success"` in the final JSON

If apply fails (for example because the image is missing or the health check times out), fix the cause and run it again:

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

Sync pushes the workflow definition (name, description, access, graph, and
settings) to `PUT /api/workflows/<id>` on the deployment. It does not upload
assets or download models. Add assets and models on the target yourself.

All `deploy workflows` subcommands (`sync`, `list`, `delete`, `run`) need an
admin bearer token, resolved like the [API users](#api-users) commands below.
`delete` prompts first unless you pass `--force`.

Verify remote workflows:

```bash
nodetool deploy workflows list local
```

### 5. Test Workflow Execution on Deployed Instance

Run a synced workflow remotely:

```bash
nodetool deploy workflows run local <workflow_id>
```

Pass parameters with a repeatable `-p key=value`:

```bash
nodetool deploy workflows run local <workflow_id> -p prompt="hello"
```

If a run fails, inspect logs:

```bash
nodetool deploy logs local --tail 200
```

## API Users

A deployment that serves more than one person needs API users. Four
`nodetool deploy` subcommands manage them over the running server's admin API,
so the deployment must already be applied and reachable. The caller must be an
admin: user `1`, an id listed in `ADMIN_USER_IDS`, or an API user created with
`--role admin`. Records live in the file named by `USERS_FILE`, which the image
sets to `/workspace/users.json` so they survive a redeploy.

Every one of them needs an admin bearer token. It comes from `--token`, else
from `NODETOOL_ADMIN_TOKEN`, else from an interactive prompt — with no TTY and
neither set, the command exits with
`Admin token required. Provide --token or set NODETOOL_ADMIN_TOKEN.`

The deployment's `server_auth_token` (in `deployment.yaml`) is that admin
token. `apply` passes it to the container as `SERVER_AUTH_TOKEN`, and a
Local-mode server accepts it as `Authorization: Bearer <token>` for user `1`.
A Supabase-mode server ignores it.

A Local-mode server accepts each token `users-add` prints as
`Authorization: Bearer <token>` for that user's own id, so each API user has
separate workflows and assets. API users exist only in Local mode: a
Supabase-mode server refuses `users-add` and `users-reset-token`, because the
token would never authenticate there. Supabase users sign in, or mint an
access token in the app.

- `users-add <deployment> <username>` — create a user and print its token.
  `--role <admin|user>` defaults to `user`; any other value is refused. The
  token is printed once and never again.
- `users-list <deployment>` — username, user id, role, a 16-character preview of
  the stored token hash, and creation time. `--json` prints the raw records.
- `users-remove <deployment> <username>` — delete a user. Prompts first;
  `--force` skips the prompt.
- `users-reset-token <deployment> <username>` — issue a new token and invalidate
  the old one. Like `users-add`, the new token is shown once.

**Examples:**

```bash
export NODETOOL_ADMIN_TOKEN=<admin token>

nodetool deploy users-add local alice --role admin
nodetool deploy users-list local
nodetool deploy users-list local --json

nodetool deploy users-reset-token local alice
nodetool deploy users-remove local alice --force
```

## MCP over HTTP and Python nodes

Two surfaces are off when `NODETOOL_ENV=production` — which the published image,
`fly.toml`, and `docker-compose.yml` all set. Each has an opt-in flag.

### `/mcp` — `NODETOOL_ENABLE_MCP=1`

The streamable-HTTP MCP mount carries the full agent toolbelt, so it registers
in production only with the flag:

```yaml
environment:
  NODETOOL_ENABLE_MCP: "1"
```

Without it the route is not registered, `/mcp` answers 404, and the boot log
names the flag.

The mount is not a second door. It sits behind the same `onRequest` auth hook as
`/api`, and binds the user that hook resolved: a request it cannot authenticate
is refused at initialize with 401, never given an anonymous session. The session
id in the `mcp-session-id` header is scoped to its owner — a second user
presenting the same id gets `404 Session not found`, the same answer as an id
that never existed.

How an agent authenticates:

- **A token minted in the app** — the short path, and the one to reach for
  first. **Settings → MCP → Connect an agent remotely** hands back a
  ready-to-paste `claude mcp add` command carrying the URL and a bearer token.
  The token is revocable one at a time, stored only as a hash, and works in
  every auth mode.
- **Supabase mode** (`SUPABASE_URL` + `SUPABASE_KEY`): the agent sends a
  Supabase access token as `Authorization: Bearer <jwt>`, like any web client.
  Fine for a script that already signs in; the JWT expires within the hour, so
  it is a poor fit for a config file.
- **Local mode behind a VPN**: set `NODETOOL_TRUST_LOCAL_NETWORKS` to the VPN's
  CIDR. Requests from that range are trusted as user `1` with no token. Scope it
  to the VPN — anything reaching the server from a trusted range gets the whole
  toolbelt, and there is nothing to revoke afterwards.
- **A bot or bridge**: mint a delegated token through the integration routes
  (`NODETOOL_INTEGRATION_TOKEN`) and send it as the bearer token. The session
  binds the linked account rather than a shared identity.

Full walkthrough, including how to check a setup and what each error answer
means: [MCP on a production server](mcp-production.md).

Not covered by the flag: the tRPC `mcpConfig` router stays disabled in
production. It edits MCP *client* config files on the server's filesystem, which
has no meaning on a shared host.

### Python nodes — `NODETOOL_ALLOW_PYTHON_BRIDGE_IN_PRODUCTION=1`

The Python bridge refuses to connect in production. The flag lifts that:

```yaml
environment:
  NODETOOL_ALLOW_PYTHON_BRIDGE_IN_PRODUCTION: "1"
  NODETOOL_PYTHON: "/opt/venv/bin/python"
```

**The published image ships no Python worker.** `ghcr.io/nodetool-ai/nodetool`
carries the TypeScript server only, so the flag by itself changes nothing except
the error you get. To run Python nodes, derive an image that installs
`nodetool-core` and set `NODETOOL_PYTHON` to that interpreter:

```dockerfile
FROM ghcr.io/nodetool-ai/nodetool:latest
# The image runs as `node`, and /opt/venv belongs to root.
USER root
RUN /opt/venv/bin/pip install --no-cache-dir nodetool-core
USER node
ENV NODETOOL_PYTHON=/opt/venv/bin/python \
    NODETOOL_ALLOW_PYTHON_BRIDGE_IN_PRODUCTION=1
```

With the flag set and no interpreter found, the boot log says
`Python not found — Python nodes will not be available`. With the flag unset it
names the flag instead, so the log tells you which of the two you are missing.

## Manual Troubleshooting

### Container Logs

```bash
nodetool deploy logs local --tail 200
```

For a remote host you can also read the container logs directly:

```bash
ssh user@host "docker logs nodetool-<container.name>"
```
