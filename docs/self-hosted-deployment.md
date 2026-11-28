---
layout: page
title: "Self-Hosted Deployment Guide"
description: "Run the NodeTool server with Docker Compose, docker or podman run, nodetool deploy, or the CLI: ports, volumes, auth modes, API users, health checks, and production MCP and Python opt-ins."
---

NodeTool self-hosts as one container, on `localhost` or on a remote host reached over SSH. This page is the single guide for running the server: with Docker Compose, with a plain `docker run` or `podman run`, with `nodetool deploy`, or straight from the CLI.

> **Runs:** on a Docker or Podman host you control, or any host with Node.js 22 or newer. **Needs:** the `ghcr.io/nodetool-ai/nodetool` image, `DB_PATH` or `DATABASE_URL` (the Compose file sets `DB_PATH`), and provider keys for the models you use. **Ports:** container `7777`, published on `17777` by Compose and `8000` by `nodetool deploy`. **Secrets:** `SECRETS_MASTER_KEY` (generated if unset), plus `SUPABASE_*` or `OIDC_*` for login.
{: .callout-note}

| Path | Use it when |
|---|---|
| [Docker Compose](#docker-compose-reference) | one server on a host you are logged in to. The fastest start |
| [Docker or Podman without Compose](#docker-or-podman-without-compose) | you want a single `run` command, or use Podman |
| [`nodetool deploy`](#deploy-with-nodetool-deploy) | you deploy from your machine to a remote host over SSH, and want workflow sync and API users |
| [Without a container](#without-a-container) | the host runs Node.js and you do not want a container |

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
- **PostgreSQL**: uncomment the `postgres` service, remove `DB_PATH`, and set `DATABASE_URL`. With `DATABASE_URL` set, the container applies database migrations on every start unless `NODETOOL_MIGRATE_ON_BOOT=0`.

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

> **Do not expose Local mode to the internet.** Local mode has no login. `NODETOOL_TRUST_LOCAL_NETWORKS` trusts source IPs as admin user `"1"` with no password, so anyone who can reach the published port from a trusted range gets your data, secrets, and API keys. The default `172.16.0.0/12,192.168.65.0/24` covers only Docker's bridge and Desktop VM gateway. Never change it to `0.0.0.0/0` on a public IP. For a public address or untrusted users, enable Supabase or SSO mode and terminate TLS in front of the server or give it a certificate ([Serving the Web UI and TLS](server-configuration.md#serving-the-web-ui-and-tls)).
{: .callout-warning}

To serve the web UI from a **different origin** (a CDN, for example), point the frontend at the backend with the build-time `VITE_API_URL` and add that origin to `NODETOOL_ALLOWED_ORIGINS` so cross-origin `GET /api/config` and API calls are allowed.

## Docker or Podman without Compose

To run the image with a single command, for example on a host without Compose:

```bash
docker run -d --name nodetool -p 127.0.0.1:17777:7777 \
  -e DB_PATH=/workspace/nodetool.sqlite3 \
  -v nodetool-data:/workspace \
  ghcr.io/nodetool-ai/nodetool:latest
```

The image sets `NODETOOL_ENV=production` and generates a master key into `/workspace` on first start, so keep the volume. Podman takes the same command with `podman run`. Docker and Podman keep separate image stores, so pull or build the image with the runtime you run it with. To build your own image from a repository checkout, run `docker build -t nodetool:local .` (or `podman build`) at the repository root.

`docker run` does not set `NODETOOL_TRUST_LOCAL_NETWORKS`, so in Local mode the server answers `401 "Remote access requires authentication"` to the browser on your host, whose requests arrive from the Docker bridge. Add `-e NODETOOL_TRUST_LOCAL_NETWORKS=172.16.0.0/12,192.168.65.0/24` for a local install, or turn on login with `-e SUPABASE_URL=… -e SUPABASE_KEY=… -e SUPABASE_ANON_KEY=…`. See [Authentication → Local mode in Docker](authentication.md#local-mode-in-docker).

## Without a container

The server also runs straight from the CLI. Install the `cli-server` command feature, which holds the full application server, and start it:

```bash
npm install -g @nodetool-ai/cli
nodetool packs add cli-server --yes

export NODETOOL_ENV=production
export DB_PATH=/srv/nodetool/nodetool.sqlite3
export SECRETS_MASTER_KEY="$(openssl rand -base64 32)"   # keep this value
nodetool server serve --host 0.0.0.0 --port 7777
```

`nodetool server serve` takes only `--host` (default `127.0.0.1`) and `--port` (default `7777`). Everything else comes from environment variables, the same ones the container reads. The plain `nodetool serve` is a different server, the lean execution server described in the [CLI Reference](cli.md#nodetool-serve).

The master key comes from `SECRETS_MASTER_KEY`, then the system keychain. When neither holds one, the server generates a key into the keychain. A headless Linux host has no keychain, so set `SECRETS_MASTER_KEY` there and keep the value: stored secrets cannot be decrypted without it.

Set `SUPABASE_URL`, `SUPABASE_KEY`, and `SUPABASE_ANON_KEY` to require login, as in [Authentication / login screen](#authentication--login-screen). Without them the server runs in Local mode and trusts only loopback, so bind to `0.0.0.0` only with login on or behind a proxy that adds its own.

## Deploy with `nodetool deploy`

`nodetool deploy` manages a Docker container on `localhost` or on a remote host over SSH, from a `deployment.yaml` file. It also copies your image to a remote host, syncs workflows, and manages API users. The commands come with the `cli-admin` feature:

```bash
nodetool packs add cli-admin --yes
```

### 1. Pull the image

```bash
docker pull ghcr.io/nodetool-ai/nodetool:latest
```

`deploy apply` never pulls. A local host needs the image already present. For a remote host, apply copies the image from your local Docker daemon when the remote has none.

### 2. Add a deployment

```bash
nodetool deploy init                       # creates deployment.yaml
nodetool deploy add local --type docker
```

`deploy init` creates `deployment.yaml` in the NodeTool config directory: `~/.config/nodetool/` on Linux, `~/Library/Application Support/nodetool/` on macOS, `%APPDATA%\nodetool` on Windows. `--type docker` is required. `deploy add` then prompts for the rest:

- Docker host (IP or hostname): `localhost`
- SSH user and SSH key path: asked only for a remote host (defaults `root` and `~/.ssh/id_rsa`)
- Docker image name: `ghcr.io/nodetool-ai/nodetool`
- Image tag: `latest`
- Container name: `nodetool-<deployment name>`
- Container port: `8000`

It does not prompt for GPU or paths. It sets `paths.workspace` to `~/.nodetool-workspace` and `paths.hf_cache` to the Hugging Face cache it finds (`HF_HUB_CACHE`, then `$HF_HOME/hub`, then `~/.cache/huggingface/hub`). The workspace mounts at `/workspace` (database, assets, temporary data) and the HF cache at `/hf-cache`, read-only. Change `container.gpu`, `container.environment`, and `paths` with `nodetool deploy edit`, which opens the whole file in `$EDITOR`.

### 3. Review the plan

```bash
nodetool deploy list
nodetool deploy show local                # the entry as YAML
nodetool deploy plan local                # the plan as JSON
nodetool deploy apply local --dry-run
```

None of these change the host. `deploy show` includes `enabled`, `state`, `server_auth_token`, and `container.environment` with a generated `SECRETS_MASTER_KEY`:

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

### 4. Apply

```bash
nodetool deploy apply local
```

Apply prints each step, then the result as JSON. A successful run shows:

- directories created
- `Image already present.`
- app container started
- `Health endpoint OK: http://127.0.0.1:8000/health`
- `"status": "success"` in the final JSON

The server is then at `http://localhost:8000`. Confirm its state:

{% raw %}
```bash
nodetool deploy status local
nodetool deploy logs local --follow
docker ps --filter name=nodetool --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```
{% endraw %}

`nodetool deploy destroy local` removes the container. The workspace directory stays on the host.

### Configuration reference

A remote deployment with a GPU looks like this:

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

- `type`: always `docker`
- `enabled`: whether the deployment is active
- `host`: Docker host (IP, hostname, or `localhost`)
- `ssh`: connection details for a remote host. The host key must already be in `~/.ssh/known_hosts`, so run `ssh <user>@<host>` once and check the fingerprint before the first deploy
- `paths`: host directories for the workspace (mounted at `/workspace`) and the HF cache (mounted at `/hf-cache`, read-only unless `persistent_paths` is set)
- `persistent_paths`: optional container paths for the users file, database, vector store (`vectorstore_db_path`), HF home, assets, and logs. Setting it changes the injected environment, see below
- `image`: container image name, tag, and registry
- `container`: `name`, `port`, `gpu` (device ids such as `0` or `0,1`, passed as `--gpus "device=…"`), and `environment` (variables injected into the container)
- `server_auth_token`: generated bearer token for admin and sync calls. A Local-mode server accepts it, see [API users](#api-users)
- `server_url`: optional URL the CLI uses instead of `http://<host>:<port>`. The CLI sends `server_auth_token` only over `https://` or to `localhost`, so set it to your TLS proxy (`https://nodetool.example.com`) or to an SSH tunnel (`http://localhost:8000` after `ssh -L 8000:localhost:8000 <host>`). `NODETOOL_ALLOW_INSECURE_HTTP=1` lifts the check
- `state`: deployment state the deployer tracks

When a deployment loads, `deploy` generates `SECRETS_MASTER_KEY` in `container.environment` and a `server_auth_token` if missing, and saves them to `deployment.yaml`. Keep that file private.

On top of `container.environment`, the deployer sets `PORT`, `NODETOOL_API_URL`, `DB_PATH` (`/workspace/nodetool.db`), `VECTORSTORE_DB_PATH` (`/workspace/vectorstore.db`), `ASSET_FOLDER` (`/workspace/assets`), `HF_HUB_CACHE` (`/hf-cache`), and `SERVER_AUTH_TOKEN`. With `persistent_paths` set, the first three and `HF_HOME` come from it instead.

### What apply does

1. **Directories**: creates `workspace` (with `data`, `assets`, `temp`, `proxy`, and `acme` subdirectories) and `hf_cache` on the host.
2. **Image check**: verifies the configured image exists on the host. A local host without the image fails with an error, so pull or build it first.
3. **Image transfer**: for a remote host that lacks the image, pipes `docker save` from your local daemon into `docker load` over SSH. An image the remote already holds is never replaced.
4. **Container**: stops and removes the existing container, and any other `nodetool-*` container publishing the same host port, then runs a new one named `nodetool-<container.name>` with `--restart unless-stopped` and a Docker health check on `/health`. Docker is used when installed, otherwise Podman. Set `NODETOOL_CONTAINER_RUNTIME=docker` or `podman` to choose.
5. **Health check**: polls `http://127.0.0.1:<host port>/health` on the host, 30 attempts 2 seconds apart, and fails the apply if the server never answers.

`container.port` is the host port. The container serves on `7777`, and a `container.port` of `7777` is published as `8000`.

### Upgrade a `nodetool deploy` server

```bash
docker pull ghcr.io/nodetool-ai/nodetool:latest   # on the Docker host
nodetool deploy apply <name>
nodetool deploy status <name>
```

`apply` replaces the container with one started from the image the host holds. For a remote host, pull on that host or change `image.tag`, because an image already on the remote is not replaced. Workflows, assets, and settings stay, because `/workspace` is a host directory. Archive it first, as described in [Upgrading](upgrading.md#self-hosted-docker).

### Sync and run workflows

Find the ID with `nodetool workflows list`, then sync:

```bash
nodetool deploy workflows sync local <workflow_id>
nodetool deploy workflows list local
```

Sync pushes the workflow definition (name, description, access, graph, and settings) to `PUT /api/workflows/<id>` on the deployment. It does not upload assets or download models.

All `deploy workflows` subcommands (`sync`, `list`, `delete`, `run`) need an admin bearer token, resolved like the [API users](#api-users) commands below. `delete` prompts first unless you pass `--force`.

Run a synced workflow from the CLI or over REST:

```bash
nodetool deploy workflows run local <workflow_id> -p prompt="hello"   # -p is repeatable

curl -s -X POST http://<host>:8000/api/workflows/<workflow_id>/run \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{}'
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

## Check the server

These endpoints need no login. Use the published host port: `17777` for the bundled Compose file, `container.port` (default `8000`) for `nodetool deploy`, `7777` without a container.

```bash
curl http://your-server:17777/health   # 200 {"status": "ok", ...}, or 503
curl http://your-server:17777/ready    # liveness only, always 200
curl http://your-server:17777/api/health   # version and uptime
```

`/health` answers 503 with status `degraded` when the database check fails, and `draining` while the server shuts down. Model caches and assets grow over time, so watch disk on the `/workspace` and `/hf-cache` volumes.

Before you hand the URL to anyone, check that:

- `SECRETS_MASTER_KEY` is set, or `/workspace` is a persistent volume so the image keeps its generated key
- login is on (Supabase or SSO), or the port is reachable only from trusted networks
- `/health` and `/ready` return `200`
- an API call without a token, such as `curl -i http://your-server:17777/api/workflows`, returns `401`
- a synced workflow runs

## Hosted Credits

Hosted credits meter the `nodetool` provider, which runs a curated model catalog on keys that the platform owns. Only a cloud deployment registers that provider. Desktop and plain self-hosted installs do not, and calls on a user's own provider keys never reduce a credit balance. For what users see, read [Costs and credits](costs-and-credits.md#hosted-credits).

Credits are accounted in a ledger. One credit is one US cent of provider spend at the delegate's price. The balance is every grant ever recorded, minus the spend recorded for the `nodetool` provider. Grants arrive the first time a balance is read: a one-time signup grant, then a monthly plan grant keyed to the calendar month in UTC. Plans are defined in code (Free 300 credits a month, Creator 3,000 for a displayed $12, Pro 10,000 for a displayed $40). The price is for display only and no payment processor is connected.

The server checks the balance before a run that uses a managed model starts. It refuses the run when the model is not on the allowlist, or when the balance does not cover the run's estimate. Spend already admitted to runs still in flight counts against the balance. If the credit check itself fails, the run is allowed. The data is available through the `credits` tRPC router (`status`, `setPlan`, `topup`).

| Variable | Effect |
|---|---|
| `NODETOOL_CREDIT_MODELS` | The managed models credits may be spent on, separated by commas, spaces, or newlines. Unset means the whole catalog. Any other model is refused before a key is used |
| `NODETOOL_SIGNUP_CREDITS` | The one-time signup grant. The default is 500. `0`, a negative value, or an unparseable value means no signup grant |
| `NODETOOL_PLATFORM_FAL_KEY` | The platform-owned fal key that funds managed image and video models |
| `NODETOOL_PLATFORM_ANTHROPIC_KEY` | The platform-owned Anthropic key that funds managed language models |
| `NODETOOL_PLATFORM_OPENROUTER_KEY` | The platform-owned OpenRouter key that serves `nodetool/free`, the default text model for accounts without a key |
| `NODETOOL_ENABLE_TEST_TOPUP` | Set to `1` or `true` to allow the test top-up on a development server |

A managed model is offered only when its delegate provider has a platform key and the model is on the allowlist. The test top-up adds credits with no payment behind it, and the server refuses it unless `NODETOOL_ENABLE_TEST_TOPUP` is set, because minted credits unlock spend on platform-owned keys. When it is set, the Plan & credits page shows an **Add 1000 credits (test)** button. Leave it unset on anything reachable by other people. See also [Environment Variables](environment-variables.md).

## If it fails

- **Container exits at start** with `ERROR: No database configured. Set DATABASE_URL (PostgreSQL) or DB_PATH (SQLite).`: set one of them.
- **Server outside a container exits at start**: a host with no keychain needs `SECRETS_MASTER_KEY`. Generate one with `openssl rand -base64 32`.
- **`Image '<image>' not found locally.`** from `deploy apply`: run `docker pull ghcr.io/nodetool-ai/nodetool:latest` or build the image. With `docker run` or `podman run`, check the runtime you run with (`docker image ls`, `podman image ls`), because the two keep separate image stores.
- **`Deployment health check failed: …`** from `deploy apply`: the container was not running or `/health` never answered in 30 probes. Read the logs below and apply again.
- **Port already in use**: another service holds the host port. Change `NODETOOL_PORT` for Compose or `container.port` in `deployment.yaml`.
- **Permission denied on volumes**: the image runs as the `node` user, so make the host directory writable by it.
- **`401 "Remote access requires authentication"`** from every API call in Local mode: the request did not arrive from loopback or a `NODETOOL_TRUST_LOCAL_NETWORKS` range. See [Authentication → Local mode in Docker](authentication.md#local-mode-in-docker).
- **`/mcp` answers 404** in production: set `NODETOOL_ENABLE_MCP=1`.
- **`Admin token required. Provide --token or set NODETOOL_ADMIN_TOKEN.`**: pass a token to `deploy users-*` and `deploy workflows`.

Read the logs:

```bash
docker compose logs -f                                   # Compose
nodetool deploy logs local --tail 200                    # nodetool deploy
ssh user@host "docker logs nodetool-<container.name>"   # remote host, directly
```

More causes are in [Troubleshooting](troubleshooting.md#a-deployment-fails-or-the-service-wont-start).
