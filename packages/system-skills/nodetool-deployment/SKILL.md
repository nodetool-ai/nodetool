---
name: nodetool-deployment
description: "Self-host a NodeTool server with Docker Compose or nodetool deploy, rent a Runpod or Vast GPU worker with nodetool worker, or configure server auth. Everything here runs in the user's shell: the in-product agent explains the steps and does not run them."
---

You help users run NodeTool somewhere other than their desktop. Every command
below runs in the user's shell. The in-product agent has no shell and no
deployment tools, so it explains the steps and leaves running them to the user.

# Which one

| Need | Use |
|------|-----|
| A long-lived server that people connect in to | Docker: `docker-compose.yml` from the repository, or `nodetool deploy` for a remote host over SSH |
| A rented GPU that the user's NodeTool connects out to, billed by the minute | `nodetool worker` on Runpod or Vast |

`nodetool deploy` supports one target type, `docker`. There is no SSH-service,
Runpod-endpoint or Cloud Run deploy type. Runpod and Vast are `nodetool worker`.

# Server authentication

The server picks its auth mode from `SUPABASE_URL` and `SUPABASE_KEY` alone. It
reads neither `AUTH_PROVIDER` nor `NODETOOL_SERVER_MODE`.

| Mode | Enabled by | Accepted credentials |
|------|------------|----------------------|
| Local | Default, with the Supabase variables unset | Loopback connections run as user `"1"` with no token. `NODETOOL_TRUST_LOCALHOST=false` turns that off. Sources in `NODETOOL_TRUST_LOCAL_NETWORKS` (comma-separated CIDRs) also run as user `"1"` with no token. A bearer equal to `SERVER_AUTH_TOKEN` runs as user `"1"`. A token minted by `nodetool deploy users-add` runs as that API user. Anything else gets `401`. |
| Supabase | `SUPABASE_URL` and `SUPABASE_KEY` both set | Every non-public request needs a valid Supabase JWT. `SERVER_AUTH_TOKEN`, `NODETOOL_TRUST_LOCAL_NETWORKS` and API-user tokens are ignored. Loopback is trusted only with `NODETOOL_TRUST_LOCALHOST=true`. |

In both modes, an access token (`ntk_…`) created in **Settings → MCP → Connect
an agent remotely** authenticates as the person who created it. Send any token
as `Authorization: Bearer <token>`. A WebSocket client that cannot set headers
passes `?api_key=<token>` on the `/ws` URL.

Docker NATs a published-port connection, so it arrives from the bridge gateway,
not loopback. In Local mode that means `401` until the source range is in
`NODETOOL_TRUST_LOCAL_NETWORKS` or the client sends a token. Every listed range
runs as user `"1"` with no password, so list only networks you control. A
server that other people reach over the internet needs Supabase mode, with
`SUPABASE_ANON_KEY` set too so the web login screen works.

# Docker Compose (single host)

The repository's `docker-compose.yml` is the reference self-host setup.

```bash
cp .env.example .env          # fill in the provider keys you use
docker compose up -d          # serves http://localhost:17777
```

- It runs in Local mode and trusts Docker's bridge ranges
  (`172.16.0.0/12,192.168.65.0/24`) by default. Safe on a laptop, LAN or VPN.
  Before exposing the port publicly, set `SUPABASE_URL`, `SUPABASE_KEY` and
  `SUPABASE_ANON_KEY` in `.env`.
- All state (database, assets, vector store, model cache, generated secret
  key) lives on the `nodetool-data` volume at `/workspace`.
- `NODETOOL_PORT` changes the host port. `NODETOOL_VERSION` pins an image tag.

# `nodetool deploy` (remote Docker host)

`deployment.yaml` lives in the user config directory, not the working directory.
Open it with `nodetool deploy edit` rather than guessing the path.

```bash
nodetool deploy init                         # create deployment.yaml
nodetool deploy add my-server --type docker  # describe one target
nodetool deploy plan my-server               # review before touching the host
nodetool deploy apply my-server              # --dry-run to print the steps only
nodetool deploy status my-server
nodetool deploy logs my-server --follow --tail 200
nodetool deploy list                         # live state of every target
nodetool deploy show my-server               # config only, no remote call
nodetool deploy destroy my-server            # --force skips the confirmation
```

```yaml
deployments:
  my-server:
    type: docker
    host: 192.168.1.10        # localhost skips SSH and uses the local Docker
    ssh:
      user: ubuntu
      key_path: ~/.ssh/id_ed25519
    image:
      name: ghcr.io/nodetool-ai/nodetool
      tag: latest
    container:
      name: nodetool-server
      port: 8000              # host port
      gpu: "0"                # GPU device ids, or omit
      environment:            # extra env, e.g. SUPABASE_URL, provider keys
        OPENAI_API_KEY: "..."
    paths:
      workspace: ~/nodetool_data/workspace
      hf_cache: ~/nodetool_data/hf-cache
```

The CLI writes a generated `server_auth_token` and a
`container.environment.SECRETS_MASTER_KEY` into `deployment.yaml` for any
target that lacks them. `apply` starts the container with the token as
`SERVER_AUTH_TOKEN`, so in Local mode a client authenticates with
`Authorization: Bearer <server_auth_token>`. The container keeps its database,
assets, vector store and API users under `/workspace`.

## Remote workflows and API users

These verbs send an admin bearer token: `--token <token>`, else
`NODETOOL_ADMIN_TOKEN`, else an interactive prompt.

```bash
nodetool deploy workflows sync my-server <workflow_id>   # assets and models must already be there
nodetool deploy workflows list my-server
nodetool deploy workflows run my-server <workflow_id> -p prompt="a red fox"
nodetool deploy workflows delete my-server <workflow_id>

nodetool deploy users-add my-server alice --role admin   # prints alice's token
nodetool deploy users-list my-server
nodetool deploy users-reset-token my-server alice
nodetool deploy users-remove my-server alice
```

API-user tokens work in Local mode only (§ Server authentication).

# `nodetool worker` (rented GPU)

A worker is a Runpod or Vast instance that the user's NodeTool attaches to for
GPU nodes. It bills by the minute until stopped. Confirm the GPU type and the
expected hours with the user before creating one, and always set an auto-stop
guard.

Store the provider key first: `nodetool secrets store RUNPOD_API_KEY` (or
`VAST_API_KEY`).

```bash
nodetool worker profile add hf-a40 --target runpod \
  --image ghcr.io/nodetool-ai/nodetool-worker:latest \
  --gpu "NVIDIA A40" --idle-timeout 15 --max-lifetime 240
nodetool worker create --profile hf-a40 --attach

nodetool worker list
nodetool worker status <instance-id>
nodetool worker stop <instance-id>     # or --all
```

- `--idle-timeout <minutes>` stops an idle worker. `--max-lifetime <minutes>` is
  a hard limit. Set both, since a forgotten worker keeps billing.
- `--disk <gb>` sizes the persistent volume that holds the model cache
  (default 100). `--ssh-key <path.pub>` opens SSH for debugging.
- `--attach` prints `NODETOOL_WORKER_URL`. For another shell, export
  `NODETOOL_WORKER_TOKEN=$(nodetool worker token <instance-id>)`.
- `nodetool worker models download --repo-id <owner/name>` pulls weights onto
  the attached worker before a run, so the first run does not pay for the
  download on GPU time. `models list` and `models delete` manage the cache.

# Environment

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL`, `SUPABASE_KEY` | Turn on Supabase mode. `SUPABASE_KEY` is the service-role key |
| `SUPABASE_ANON_KEY` | Public key the login screen uses. Without it no user can sign in |
| `SECRETS_MASTER_KEY` | Encrypts stored secrets. Set it explicitly (`openssl rand -base64 32`). A lost key makes every stored secret unreadable |
| `NODETOOL_TRUST_LOCAL_NETWORKS` | Local mode only: CIDRs that run as user `"1"` with no token |
| `NODETOOL_TRUST_LOCALHOST` | Overrides whether loopback bypasses auth |
| `NODETOOL_ENABLE_MCP=1` | Serves `/mcp` on a production server |
| `NODETOOL_STORAGE_BACKEND` | `file` (default), `s3` or `supabase`, with `ASSET_BUCKET` and `TEMP_BUCKET` |
| `DB_PATH`, `ASSET_FOLDER`, `VECTORSTORE_DB_PATH`, `HF_HOME` | Keep these on a persistent volume |
| `HOST`, `PORT` | Bind address. The image binds `0.0.0.0` |
| `NODETOOL_LOG_LEVEL` | Log level, default `info` |
| Provider keys | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `HF_TOKEN`, `FAL_API_KEY` as needed |

The image already sets `NODETOOL_ENV=production`. Production mode turns off the
Python bridge, the file browser and `/mcp` (unless enabled), and loads only node
packs on the allowlist. Do not set it on a desktop or development install.

# Running the server directly

```bash
nodetool serve                          # 127.0.0.1:7777
nodetool serve --host 0.0.0.0 --port 8080
```

Health checks: `GET /health` (liveness, no auth) and `GET /ready`.

# Common pitfalls

- **UI loads but every API call returns `401` in Docker**: the published port
  arrives from the bridge gateway. Add the bridge range to
  `NODETOOL_TRUST_LOCAL_NETWORKS` or send a token.
- **`SERVER_AUTH_TOKEN` or `NODETOOL_TRUST_LOCAL_NETWORKS` stops working after
  adding Supabase**: Supabase mode ignores both. Clients must sign in or use an
  access token.
- **Anon key in `SUPABASE_KEY`**: the server needs the service-role key there.
- **No persistent volume**: the database, assets and secrets key vanish when the
  container is recreated.
- **Worker left running**: `nodetool worker list`, then `nodetool worker stop --all`.
