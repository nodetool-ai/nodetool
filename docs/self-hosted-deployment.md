---
layout: page
title: "Self-Hosted Deployment Guide"
description: "Run the NodeTool server in Docker with Compose or nodetool deploy: ports, volumes, auth modes, API users, and production MCP and Python opt-ins."
---

NodeTool self-hosts as one Docker container, on `localhost` or on a remote host reached over SSH. Docker is the only deployment `type` (`SUPPORTED_TYPES = ["docker"]`).

> **Runs:** on a Docker or Podman host you control. **Needs:** the `ghcr.io/nodetool-ai/nodetool` image, `DB_PATH` or `DATABASE_URL` (the Compose file sets `DB_PATH`), and provider keys for the models you use. **Ports:** container `7777`, published on `17777` by Compose and `8000` by `nodetool deploy`. **Secrets:** `SECRETS_MASTER_KEY` (generated if unset), plus `SUPABASE_*` or `OIDC_*` for login. **Hardware:** not measured.
{: .callout-note}

Two paths: a `docker-compose.yml` you run yourself (fastest for one server), or the `nodetool deploy` CLI, driven by `deployment.yaml`, which also handles remote hosts over SSH, image transfer, and workflow sync. See [Deployment Configuration](#deployment-configuration).

## Docker Compose (reference)

```bash
cp .env.example .env      # fill in the provider keys you use
docker compose up -d
# open http://localhost:17777
```

The server binds `0.0.0.0:7777` in the container and is published on the host loopback as `127.0.0.1:${NODETOOL_PORT:-17777}`, using the reference [`docker-compose.yml`](https://github.com/nodetool-ai/nodetool/blob/main/docker-compose.yml). The SQLite database, assets, vector store, model cache, and generated secret key live under `/workspace`, backed by the named `nodetool-data` volume, so they survive restarts and image upgrades.

Common overrides (set in `.env` or the shell):

| Variable | Default | Purpose |
|----------|---------|---------|
| `NODETOOL_IMAGE` | `ghcr.io/nodetool-ai/nodetool:${NODETOOL_VERSION}` | Full image reference. Set it to run a locally built image (for example `nodetool:dev`) |
| `NODETOOL_VERSION` | `latest` | Image tag to pull (pin a release in production) |
| `NODETOOL_PORT` | `17777` | Host port mapped to the container's `7777` |
| `NODETOOL_BIND` | `127.0.0.1` | Host address the port is published on. Docker forwards every published-port connection from the bridge or Desktop VM gateway, which `NODETOOL_TRUST_LOCAL_NETWORKS` trusts, so `0.0.0.0` gives every device that can reach the port no-login admin access. Set `0.0.0.0` only together with Supabase auth, or with `NODETOOL_TRUST_LOCAL_NETWORKS` cleared and access tokens in use |
| `NODETOOL_ALLOWED_HOSTS` | unset | DNS names you open the app by, beyond `localhost` and IP addresses. See [Authentication → Host check](authentication.md#host-check) |
| `NODETOOL_TRUST_LOCAL_NETWORKS` | `172.16.0.0/12,192.168.65.0/24` | Source CIDRs trusted as user `1` **without a login** (Local mode). Docker's Linux bridge plus Docker Desktop's VM gateway subnet by default — **never `0.0.0.0/0`** on a public IP. Ignored in Supabase mode |
| `SECRETS_MASTER_KEY` | generated on first start | 32-byte base64 key encrypting stored secrets. If unset, the image entrypoint generates one and stores it in `/workspace/.secrets_master_key` (override the path with `SECRETS_MASTER_KEY_FILE`). The line is commented out in the compose file, so uncomment it to pass your own (`openssl rand -base64 32`) |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `FAL_API_KEY`, `HF_TOKEN` | unset | Model provider keys |

The compose file sets `NODETOOL_ENV=production` and `NODETOOL_NODE_PROFILE=full`. Production defaults to the curated cloud node catalog with no local model runtimes, and `full` restores the whole catalog, including the llama.cpp, vLLM, and Ollama providers. The database is SQLite at `/workspace/nodetool.sqlite3` (`DB_PATH`). The entrypoint exits with `ERROR: No database configured. Set DATABASE_URL (PostgreSQL) or DB_PATH (SQLite).` when neither is set.

Commented-out blocks in the compose file enable:

- **Ollama**: set `OLLAMA_API_URL` (`http://host.docker.internal:11434` for Ollama on the host, with the `extra_hosts` entry uncommented).
- **llama.cpp** and **vLLM** services: uncomment the service and set `LLAMA_CPP_URL` or `VLLM_BASE_URL`. vLLM needs an NVIDIA GPU on Linux.
- **PostgreSQL**: uncomment the `postgres` service, remove `DB_PATH`, and set `DATABASE_URL`. With `DATABASE_URL` set, the entrypoint runs `db-migrate.mjs` on every start unless `NODETOOL_MIGRATE_ON_BOOT=0`.

Upgrade in place:

```bash
docker compose pull
docker compose up -d
```

The server applies database migrations at start, and an older image may not read a migrated database. Archive the `nodetool-data` volume before pulling. [Upgrading](upgrading.md#self-hosted-docker) has the backup and rollback steps.

To use a host directory instead of the named volume, replace the `nodetool-data:/workspace` mount with a bind mount (for example `./nodetool-data:/workspace`) that the container's `node` user can write.

### Authentication / login screen

Auth is configured on the backend. The web UI reads its auth mode and public Supabase credentials at runtime from `GET /api/config` (public, no secrets), so one frontend build works with or without login, including when served from another origin. The response holds `authMode`, `supabaseUrl`, `supabaseAnonKey`, `authRedirectUrl`, and `version`, never the service-role key.

- **Login off (default).** With `SUPABASE_URL` and `SUPABASE_KEY` unset the server runs in **Local mode**. It trusts requests by source IP (loopback, plus any `NODETOOL_TRUST_LOCAL_NETWORKS`) as a single user, rejects others, and the UI shows no login screen. The bundled Compose file trusts the Docker bridge (`172.16.0.0/12`) and Docker Desktop's VM gateway (`192.168.65.0/24`) so a local install works out of the box.
- **Supabase login.** Set these three to switch to **Supabase mode**. Every request then needs a valid Supabase JWT and the UI shows the login screen.

  ```bash
  SUPABASE_URL=https://your-project.supabase.co
  SUPABASE_KEY=your-service-role-key   # server-only, never sent to the browser
  SUPABASE_ANON_KEY=your-anon-key      # public key the login screen uses
  ```

  Set `AUTH_REDIRECT_URL` when serving behind a domain or proxy, and add it to the Supabase project's redirect allow list.
- **SSO.** Set `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, and `NODETOOL_PUBLIC_URL` to switch to **SSO mode**, with optional domain and group allowlists. See [Single Sign-On](authentication.md#single-sign-on-oidc). Admins get an **Admin** page, see [The Admin page](authentication.md#the-admin-page).

See also [Authentication](authentication.md) and [Supabase Deployment](supabase-deployment.md).

> **Do not expose Local mode to the internet.** Local mode has no login. `NODETOOL_TRUST_LOCAL_NETWORKS` trusts source IPs as admin user `"1"` with no password, so anyone who can reach the published port from a trusted range gets your data, secrets, and API keys. The default `172.16.0.0/12,192.168.65.0/24` covers only Docker's bridge and Desktop VM gateway. Never change it to `0.0.0.0/0` on a public IP. For a public address or untrusted users, enable Supabase or SSO mode and terminate TLS in front of the server or give it a certificate ([Serving the Web UI and TLS](configuration.md#serving-the-web-ui-and-tls)).
{: .callout-warning}

To serve the web UI from a **different origin** (a CDN, for example), point the frontend at the backend with the build-time `VITE_API_URL` and add that origin to `NODETOOL_ALLOWED_ORIGINS` so cross-origin `GET /api/config` and API calls are allowed.

## Deployment Configuration

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
5. **Health Check**: Polls `http://127.0.0.1:<host port>/health` on the host, 30 attempts 2 seconds apart, and fails the apply if the server never answers.

`container.port` is the host port. The container serves on `7777`, and a `container.port` of `7777` is published as `8000`. The container starts with `--restart unless-stopped` and a Docker health check on `/health`.

## End-to-End: Local Docker Deployment

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

It does not prompt for GPU or paths. It sets `paths.workspace` to `~/.nodetool-workspace` and `paths.hf_cache` to the Hugging Face cache it finds (`HF_HUB_CACHE`, then `$HF_HOME/hub`, then `~/.cache/huggingface/hub`). The workspace mounts at `/workspace` (database, assets, temporary data) and the HF cache at `/hf-cache`, read-only. Edit `container.gpu` and `paths` with `nodetool deploy edit`.

### 2. Review Deployment Config

```bash
nodetool deploy show local
```

This dumps the entry as YAML, including `enabled`, `state`, `server_auth_token`, and `container.environment` (with a generated `SECRETS_MASTER_KEY`):

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

The server is at `http://localhost:8000`. The raw file is `~/.config/nodetool/deployment.yaml`. To change a field `deploy add` did not prompt for, run `nodetool deploy edit`. It takes no deployment name and opens the whole file in `$EDITOR`. With no file on disk it stops and tells you to run `nodetool deploy init` first.

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

Confirm runtime state:

{% raw %}
```bash
nodetool deploy status local
docker ps --filter name=nodetool --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
curl http://127.0.0.1:8000/health
```
{% endraw %}

### 4. Sync Workflows to the Deployment

Find the ID with `nodetool workflows list`, then sync:

```bash
nodetool deploy workflows sync local <workflow_id>
```

Sync pushes the workflow definition (name, description, access, graph, and settings) to `PUT /api/workflows/<id>` on the deployment. It does not upload assets or download models.

All `deploy workflows` subcommands (`sync`, `list`, `delete`, `run`) need an admin bearer token, resolved like the [API users](#api-users) commands below. `delete` prompts first unless you pass `--force`. `nodetool deploy workflows list local` verifies the sync.

### 5. Test Workflow Execution on Deployed Instance

```bash
nodetool deploy workflows run local <workflow_id> -p prompt="hello"   # -p is repeatable
nodetool deploy logs local --tail 200                                  # if the run fails
```

## API Users

Four `nodetool deploy` subcommands manage API users over the running server's admin API, so the deployment must already be applied and reachable. The caller must be an admin: user `1`, an id in `ADMIN_USER_IDS`, an API user created with `--role admin`, or an SSO admin ([Users, sessions, and admins](authentication.md#users-sessions-and-admins)). Records live in the file named by `USERS_FILE`, which the image sets to `/workspace/users.json` so they survive a redeploy.

Each command needs an admin bearer token from `--token`, else `NODETOOL_ADMIN_TOKEN`, else an interactive prompt. With no TTY and neither set, it exits with `Admin token required. Provide --token or set NODETOOL_ADMIN_TOKEN.`

The deployment's `server_auth_token` in `deployment.yaml` is that admin token. `apply` passes it to the container as `SERVER_AUTH_TOKEN`, and a Local-mode server accepts it as `Authorization: Bearer <token>` for user `1`. A Supabase-mode server ignores it.

A Local-mode server accepts each token `users-add` prints as a bearer token for that user's own id, so each API user has separate workflows and assets. API users exist only in Local mode. A Supabase-mode server refuses `users-add` and `users-reset-token`, because the token would never authenticate there. Supabase users sign in or mint an access token in the app.

- `users-add <deployment> <username>` creates a user and prints its token once. `--role <admin|user>` defaults to `user` and any other value is refused.
- `users-list <deployment>` prints username, user id, role, a 16-character preview of the stored token hash, and creation time. `--json` prints the raw records.
- `users-remove <deployment> <username>` deletes a user after a prompt. `--force` skips the prompt.
- `users-reset-token <deployment> <username>` issues a new token, shown once, and invalidates the old one.

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

Two surfaces are off when `NODETOOL_ENV=production`, which the published image, `fly.toml`, and `docker-compose.yml` all set. Each has an opt-in flag.

### `/mcp` — `NODETOOL_ENABLE_MCP=1`

The streamable-HTTP MCP mount carries the full agent toolbelt, so in production it registers only with the flag:

```yaml
environment:
  NODETOOL_ENABLE_MCP: "1"
```

Without it the route is not registered, `/mcp` answers 404, and the boot log names the flag.

The mount sits behind the same `onRequest` auth hook as `/api` and binds the user that hook resolved. A request it cannot authenticate is refused at initialize with 401, never given an anonymous session. The `mcp-session-id` is scoped to its owner, so a second user presenting it gets `404 Session not found`, the same answer as an id that never existed.

How an agent authenticates:

- **A token minted in the app.** **Settings → MCP → Connect an agent remotely** returns a `claude mcp add` command with the URL and a bearer token. The token is revocable individually, stored only as a hash, and works in every auth mode.
- **Supabase mode**: the agent sends a Supabase access token as `Authorization: Bearer <jwt>`. The JWT expires within the hour, so it suits scripts that already sign in, not config files.
- **Local mode behind a VPN**: set `NODETOOL_TRUST_LOCAL_NETWORKS` to the VPN's CIDR. That range is trusted as user `1` with no token, gets the whole toolbelt, and has nothing to revoke. Scope it to the VPN.
- **A bot or bridge**: mint a delegated token through the integration routes (`NODETOOL_INTEGRATION_TOKEN`) and send it as the bearer token. The session binds the linked account.

Setup checks and error answers are in [MCP on a production server](mcp-production.md). The flag does not cover the tRPC `mcpConfig` router, which stays disabled in production because it edits MCP client config files on the server's filesystem.

### Python nodes — `NODETOOL_ALLOW_PYTHON_BRIDGE_IN_PRODUCTION=1`

The Python bridge refuses to connect in production. The flag lifts that:

```yaml
environment:
  NODETOOL_ALLOW_PYTHON_BRIDGE_IN_PRODUCTION: "1"
  NODETOOL_PYTHON: "/opt/venv/bin/python"
```

**The published image ships no Python worker.** `ghcr.io/nodetool-ai/nodetool` carries the TypeScript server only, so the flag alone changes only the error you get. Derive an image that installs `nodetool-core` and set `NODETOOL_PYTHON` to that interpreter:

```dockerfile
FROM ghcr.io/nodetool-ai/nodetool:latest
# The image runs as `node`, and /opt/venv belongs to root.
USER root
RUN /opt/venv/bin/pip install --no-cache-dir nodetool-core
USER node
ENV NODETOOL_PYTHON=/opt/venv/bin/python \
    NODETOOL_ALLOW_PYTHON_BRIDGE_IN_PRODUCTION=1
```

With the flag set and no interpreter found, the boot log says `Python not found — Python nodes will not be available`. With the flag unset it names the flag instead.

## If it fails

- **Container exits at start** with `ERROR: No database configured. Set DATABASE_URL (PostgreSQL) or DB_PATH (SQLite).`: set one of them.
- **`Deployment health check failed: …`** from `deploy apply`: the container was not running or `/health` never answered in 30 probes. Read the logs below and apply again.
- **`401 "Remote access requires authentication"`** from every API call in Local mode: the request did not arrive from loopback or a `NODETOOL_TRUST_LOCAL_NETWORKS` range. See [Authentication → Local mode in Docker](authentication.md#local-mode-in-docker).
- **`/mcp` answers 404** in production: set `NODETOOL_ENABLE_MCP=1`.
- **`Admin token required. Provide --token or set NODETOOL_ADMIN_TOKEN.`**: pass a token to `deploy users-*` and `deploy workflows`.

## Manual Troubleshooting

```bash
nodetool deploy logs local --tail 200
ssh user@host "docker logs nodetool-<container.name>"   # remote host, directly
```
