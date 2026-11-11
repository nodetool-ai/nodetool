---
layout: page
title: "Deployment Guide"
description: "Self-host the NodeTool server with Docker, and rent GPU workers (RunPod, Vast, Verda) for graphs that need a GPU."
---

A **server** is long-lived infrastructure that people and the UI connect into, deployed as one Docker container with `nodetool deploy`. A **worker** is an ephemeral GPU box that one NodeTool instance connects out to, runs Python nodes on, and tears down, managed with `nodetool worker`.

|  | **Server** | **Worker** |
|---|---|---|
| Direction | humans/UI connect in | a NodeTool instance connects out |
| Lifetime | long-lived, always-on | ephemeral: spin up, attach, tear down |
| Identity | a URL handed to people | a `{wsUrl, token}` an instance adopts |
| Cost | flat | **bills while it exists, so teardown matters** |
| How | `nodetool deploy …` (Docker) | `nodetool worker …` (RunPod, Vast, Verda) |
| Guide | [Self-Hosted Deployment](self-hosted-deployment.md) | [Worker Deployment](worker-deployment.md) |

For a walkthrough across desktop, public, private, and Docker/Podman self-hosting, see the [End-to-End Deployment Guide](deployment-e2e-guide.md).

---

## Quick Reference: What do you want to do?

| I want to... | Go to |
|--------------|-------|
| **Run the NodeTool server on my own machine/host** | [Self-Hosted Deployment](self-hosted-deployment.md) |
| **Understand how api.nodetool.ai itself is deployed** | [Production Deploy (Docker)](docker-production-deploy.md) |
| **Rent a GPU to run Python nodes (RunPod / Vast / Verda)** | [Worker Deployment](worker-deployment.md) |
| **Tune GPU/memory/volumes for the server container** | [Docker Resource Management](docker-resource-management.md) |
| **Use Supabase for auth/storage** | [Supabase Deployment Integration](supabase-deployment.md) |
| **Set up TLS/HTTPS** | [Serving the Web UI and TLS](configuration.md#serving-the-web-ui-and-tls) |
| **Connect Claude Code or another MCP client to a deployed server** | [MCP on a Production Server](mcp-production.md) |

---

## Server: self-host with Docker

> **Runs:** on a Docker or Podman host, local or remote over SSH. **Needs:** the `ghcr.io/nodetool-ai/nodetool:latest` image on that host and a free host port (`container.port`, default `8000`, mapped to `7777` in the container). `SECRETS_MASTER_KEY` and `server_auth_token` are generated into `deployment.yaml` when missing. **Hardware:** not measured.
{: .callout-note}

The shortest path is the reference [`docker-compose.yml`](https://github.com/nodetool-ai/nodetool/blob/main/docker-compose.yml) at the repo root: `cp .env.example .env && docker compose up -d`. See [Self-Hosted Deployment › Docker Compose](self-hosted-deployment.md#docker-compose-reference).

For remote hosts over SSH, image transfer, and workflow sync, `nodetool deploy` manages a single Docker target from a `deployment.yaml` file.

1. **Pull the base image**:
   ```bash
   docker pull ghcr.io/nodetool-ai/nodetool:latest
   ```
2. **Initialize and add a target**:
   ```bash
   nodetool deploy init
   nodetool deploy add my-server --type docker
   ```
   `deploy init` creates `deployment.yaml` in the NodeTool config directory
   (`~/.config/nodetool/` on Linux, `~/Library/Application Support/nodetool/` on
   macOS, `%APPDATA%\nodetool` on Windows). `deploy add` prompts for the host,
   SSH user and key (remote only), image name and tag, container name, and port.
   Add `container.environment`, `container.gpu`, or `paths` afterwards with
   `nodetool deploy edit`, which opens the file in `$EDITOR`.
3. **Review & plan** (no remote mutation):
   ```bash
   nodetool deploy list
   nodetool deploy show my-server
   nodetool deploy plan my-server        # prints the plan as JSON
   nodetool deploy apply my-server --dry-run
   ```
4. **Apply & monitor**:
   ```bash
   nodetool deploy apply my-server
   nodetool deploy status my-server
   nodetool deploy logs my-server --follow
   nodetool deploy destroy my-server
   ```

`deploy apply` does not pull images. A local host needs the image already present. For a remote host, apply pushes the image from your local Docker daemon only when the remote has no copy. See [Self-Hosted Deployment](self-hosted-deployment.md) for `deploy workflows` and `deploy users-*`, and [Supabase Deployment Integration](supabase-deployment.md) for hosted auth and storage.

The RunPod serverless, Google Cloud Run, Fly, Railway, and HuggingFace Spaces server targets are gone. Server deployment is Docker only, and GPU access is a worker concern.

---

## Worker: rent a GPU (RunPod, Vast, Verda)

> **Runs:** on a rented GPU box (RunPod, Vast, Verda). **Needs:** the provider's API key stored as a secret (`RUNPOD_API_KEY` below). **Bills** while the worker exists.
{: .callout-note}

```bash
nodetool secrets store RUNPOD_API_KEY
nodetool worker profile add hf-a40 --target runpod \
  --image ghcr.io/nodetool-ai/nodetool-worker:latest \
  --gpu "NVIDIA A40" --idle-timeout 15
nodetool worker create --profile hf-a40 --attach
nodetool worker list          # what's live, and what it's costing
nodetool worker stop --all    # pause every live worker
```

The cost guard provides idle auto-pause, a hard TTL that destroys the worker, and orphan reconcile. `worker stop` pauses a worker and keeps its volume, which still bills a little. **Terminate** in the Workers panel destroys the worker and its volume. See [Worker Deployment](worker-deployment.md).

---

## Server configuration

Top-level keys per deployment in `deployment.yaml` (see `DockerDeployment` in `@nodetool-ai/deploy` `deployment-config.ts`):

- `type`: always `docker`
- `enabled`: whether the deployment is active
- `host`: Docker host (IP, hostname, or `localhost`)
- `ssh`: connection details for remote hosts, omitted for local. The host key must already be in `~/.ssh/known_hosts`. Run `ssh <user>@<host>` once and check the fingerprint before the first deploy
- `paths`: host directories for the workspace (default `~/nodetool_data/workspace`, mounted at `/workspace`) and the HF cache (default `~/nodetool_data/hf-cache`, mounted at `/hf-cache`, read-only unless `persistent_paths` is set)
- `persistent_paths`: optional container paths for the users file, database, vector store (`vectorstore_db_path`), HF home, assets, and logs. Setting it changes the injected environment, see below
- `image`: container image name/tag/registry
- `container`: `name`, `port`, `gpu` (device ids such as `0` or `0,1`, passed as `--gpus "device=…"`), and `environment` (env vars injected into the container)
- `server_auth_token`: auto-generated bearer token for admin/sync calls. The server accepts it in Local mode (see [Authentication](authentication.md#authentication-modes))
- `server_url`: optional URL the CLI uses instead of `http://<host>:<port>`. The CLI sends `server_auth_token` only over `https://` or to `localhost`, so set it to your TLS proxy (`https://nodetool.example.com`) or to an SSH tunnel (`http://localhost:8000` after `ssh -L 8000:localhost:8000 <host>`). `NODETOOL_ALLOW_INSECURE_HTTP=1` lifts the check
- `state`: deployment state tracked by the deployer

The container is named `nodetool-<container.name>` and runs with `--restart unless-stopped`. The server listens on `7777` in the container and is published on host port `container.port`, except that `7777` is published as `8000`. On top of `container.environment`, the deployer sets `PORT`, `NODETOOL_API_URL`, `DB_PATH` (`/workspace/nodetool.db`), `VECTORSTORE_DB_PATH` (`/workspace/vectorstore.db`), `ASSET_FOLDER` (`/workspace/assets`), `HF_HUB_CACHE` (`/hf-cache`), and `SERVER_AUTH_TOKEN`. With `persistent_paths` set, the first three and `HF_HOME` come from it instead.

When a deployment loads, `deploy` generates `SECRETS_MASTER_KEY` in `container.environment` and a `server_auth_token` if missing, and saves them to `deployment.yaml`. Keep that file private.

---

## Monitoring & health checks

```bash
# Health endpoint (no auth required). Use the published host port: 17777 for
# the bundled Compose file, container.port (default 8000) for `deploy apply`.
curl http://your-server:17777/health
# 200: {"status": "ok", "services": {...}, ...}
# 503: status "degraded" (database check failed) or "draining" (shutting down)
curl http://your-server:17777/ready    # liveness only, always 200

nodetool deploy status <name>
nodetool deploy logs <name> --follow
```

`/api/health` returns the version and uptime. Model caches and assets grow over time, so watch disk on the `/workspace` and `/hf-cache` volumes.

---

## If it fails

| Problem | Likely cause | Fix |
|---------|--------------|-----|
| Container exits immediately | Missing env vars or invalid config | Check `nodetool deploy logs <name>` |
| `Deployment health check failed: …` | The server did not answer `/health` after 30 probes, 2 seconds apart, or the container was not running | Read `nodetool deploy logs <name>`, fix the cause, and run `apply` again |
| `/health` returns 503 | Status `degraded` (database check failed) or `draining` (shutting down) | Check the database path and logs |
| Port already in use | Another service on the same port | Change `container.port` in deployment.yaml |
| "Image not found" | Docker image not present | `docker pull ghcr.io/nodetool-ai/nodetool:latest` |
| Permission denied on volumes | Container user lacks access | Fix host directory permissions |

See also the [Troubleshooting Guide](troubleshooting.md#a-deployment-fails-or-the-service-wont-start).

---

## Upgrading

```bash
docker pull ghcr.io/nodetool-ai/nodetool:latest   # on the Docker host
nodetool deploy apply <name>
nodetool deploy status <name>
```

`apply` stops and removes the existing container, then starts a new one from the
image the host holds. It never pulls. For a remote host, pull on that host or
change `image.tag`, because an image already on the remote is not replaced.
Workflows, assets, and settings are preserved because `/workspace` is a host
directory.

---

## Related

- [Self-Hosted Deployment](self-hosted-deployment.md)
- [Worker Deployment](worker-deployment.md)
- [Docker Resource Management](docker-resource-management.md)
- [Supabase Deployment Integration](supabase-deployment.md)
- [End-to-End Deployment Guide](deployment-e2e-guide.md)
</content>
