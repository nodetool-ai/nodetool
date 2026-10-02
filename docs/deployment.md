---
layout: page
title: "Deployment Guide"
description: "Self-host the NodeTool server with Docker, and rent GPU workers (RunPod, Vast, Verda) for graphs that need a GPU."
---

NodeTool has two orthogonal deployment concerns. Don't conflate them:

- **Server (publish)** — long-lived NodeTool infrastructure that humans and the
  UI connect *into*. NodeTool self-hosts as a single **Docker** server. See
  [Self-Hosted Deployment](self-hosted-deployment.md).
- **Worker (attach)** — an ephemeral, billing-sensitive **GPU box** that one
  NodeTool instance connects *out* to, runs Python nodes on, and tears down. See
  [Worker Deployment](worker-deployment.md).

|  | **Server** | **Worker** |
|---|---|---|
| Direction | humans/UI connect in | a NodeTool instance connects out |
| Lifetime | long-lived, always-on | ephemeral — spin up, attach, tear down |
| Identity | a URL handed to people | a `{wsUrl, token}` an instance adopts |
| Cost | flat | **bills while it exists, so teardown matters** |
| How | `nodetool deploy …` (Docker) | `nodetool worker …` (RunPod, Vast, Verda) |

For a walkthrough across desktop, public, private, and Docker/Podman self-hosting,
see the [End-to-End Deployment Guide](deployment-e2e-guide.md).

---

## Quick Reference: What do you want to do?

| I want to... | Go to |
|--------------|-------|
| **Run the NodeTool server on my own machine/host** | [Self-Hosted Deployment](self-hosted-deployment.md) |
| **Understand how api.nodetool.ai itself is deployed** | [Production Deploy (Docker)](docker-production-deploy.md) |
| **Rent a GPU to run Python nodes (RunPod / Vast / Verda)** | [Worker Deployment](worker-deployment.md) |
| **Tune GPU/memory/volumes for the server container** | [Docker Resource Management](docker-resource-management.md) |
| **Use Supabase for auth/storage** | [Supabase Deployment Integration](supabase-deployment.md) |
| **Set up TLS/HTTPS** | [Self-Hosted Deployment](self-hosted-deployment.md) |
| **Connect Claude Code or another MCP client to a deployed server** | [MCP on a Production Server](mcp-production.md) |

---

## Server: self-host with Docker

The quickest path is the reference
[`docker-compose.yml`](https://github.com/nodetool-ai/nodetool/blob/main/docker-compose.yml)
at the repo root — `cp .env.example .env && docker compose up -d`. See
[Self-Hosted Deployment › Docker Compose](self-hosted-deployment.md#docker-compose-reference).

For a managed flow (remote hosts over SSH, image transfer, workflow sync), the
`nodetool deploy` commands manage a single Docker server target driven by a
`deployment.yaml` file.

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
   SSH user and key (remote hosts only), image name and tag, container name, and
   port. The single target `type` is `docker`. Add `container.environment`,
   `container.gpu`, or `paths` afterwards with `nodetool deploy edit`, which
   opens the file in `$EDITOR`.
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

`deploy apply` does not pull images. A local host needs the image already
present. For a remote host, apply pushes the image from your local Docker daemon
only when the remote has no copy. See
[Self-Hosted Deployment](self-hosted-deployment.md) for the full server
walkthrough, `deploy workflows` and `deploy users-*` commands, and [Supabase Deployment Integration](supabase-deployment.md) to add
hosted auth and storage.

> **Heads up:** NodeTool used to ship server-deploy targets for RunPod
> serverless, Google Cloud Run, Fly, Railway, and HuggingFace Spaces. Those are
> gone. Server self-hosting is **Docker only**; GPU access is now a *worker*
> concern, not a server target. To run on a GPU, rent a worker (below).

---

## Worker: rent a GPU (RunPod, Vast, Verda)

When a graph needs a GPU you don't have, provision a remote worker, attach to it,
run your Python nodes there, and tear it down:

```bash
nodetool secrets store RUNPOD_API_KEY
nodetool worker profile add hf-a40 --target runpod \
  --image ghcr.io/nodetool-ai/nodetool-worker:latest \
  --gpu "NVIDIA A40" --idle-timeout 15
nodetool worker create --profile hf-a40 --attach
nodetool worker list          # what's live, and what it's costing
nodetool worker stop --all    # pause every live worker
```

GPU workers bill while they exist, so the worker subsystem ships a **cost
guard**: idle auto-pause, a hard TTL that destroys the worker, and orphan
reconcile. `worker stop` pauses a worker and keeps its volume, which still bills
a little. To destroy a worker and its volume, use **Terminate** in the Workers
panel. See [Worker Deployment](worker-deployment.md) for profiles, attaching
from the UI or CLI, supported targets, and the cost guard in full.

---

## Server configuration

`deployment.yaml` accepts these top-level keys per deployment (see
`DockerDeployment` in `@nodetool-ai/deploy` `deployment-config.ts`):

- `type` – always `docker`
- `enabled` – whether the deployment is active
- `host` – Docker host (IP/hostname, or `localhost`)
- `ssh` – SSH connection details for remote hosts (omit for local)
- `paths` – host directories for the workspace (default `~/nodetool_data/workspace`, mounted at `/workspace`) and the HF cache (default `~/nodetool_data/hf-cache`, mounted at `/hf-cache`, read-only unless `persistent_paths` is set)
- `persistent_paths` – optional container paths for the users file, database, Chroma store, HF cache, assets, and logs. Setting it changes the injected environment, see below
- `image` – container image name/tag/registry
- `container` – `name`, `port`, `gpu` (device ids such as `0` or `0,1`, passed as `--gpus "device=…"`), and `environment` (env vars injected into the container)
- `server_auth_token` – auto-generated bearer token for admin/sync calls
- `state` – deployment state tracked by the deployer

The container is named `nodetool-<container.name>` and runs with
`--restart unless-stopped`. The server listens on `7777` inside the container
and the deployer publishes it on host port `container.port`. A `container.port`
of `7777` is published as `8000`. The deployer also sets `PORT`,
`NODETOOL_API_URL`, `NODETOOL_SERVER_MODE`, `DB_PATH` (`/workspace/nodetool.db`),
`HF_HOME`, and `SERVER_AUTH_TOKEN` in the container, on top of
`container.environment`.

Environment variables live under `container.environment`. When a deployment is
loaded, `deploy` generates `SECRETS_MASTER_KEY` in `container.environment` and a
`server_auth_token` if they are missing, and saves them to `deployment.yaml`.
Keep that file private.

---

## Monitoring & health checks

```bash
# Health endpoint (no auth required)
curl http://your-server:7777/health
# 200: {"status": "ok", "services": {...}, ...}
# 503: status "degraded" (database check failed) or "draining" (shutting down)
curl http://your-server:7777/ready     # liveness only, always 200

nodetool deploy status <name>
nodetool deploy logs <name> --follow
```

| Indicator | What to watch | Action |
|-----------|---------------|--------|
| **Health endpoint** | Should return 200. `/api/health` returns the version and uptime | Restart service if unhealthy |
| **Memory usage** | Models consume significant RAM/VRAM | Scale up or use smaller models |
| **Disk space** | Model cache and assets grow over time | Periodic cleanup or larger volumes |
| **Response time** | First request after cold start is slow (model loading) | Warm up via health check |

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---------|--------------|-----|
| Container exits immediately | Missing env vars or invalid config | Check `nodetool deploy logs <name>` |
| `deploy apply` fails its health check | The server did not answer `/health` after 10 probes, 2 seconds apart | Read `nodetool deploy logs <name>`, fix the cause, and run `apply` again |
| 503 Service Unavailable | Overloaded or out of memory | Scale up resources or reduce concurrency |
| Port already in use | Another service on the same port | Change `container.port` in deployment.yaml |
| "Image not found" | Docker image not present | `docker pull ghcr.io/nodetool-ai/nodetool:latest` |
| Permission denied on volumes | Container user lacks access | Fix host directory permissions |

For more, see the [Troubleshooting Guide](troubleshooting.md#issue-deployment-fails-or-service-wont-start).

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
