---
layout: page
title: "Deployment Guide"
description: "Self-host the NodeTool server with Docker, and rent GPU workers (RunPod, Vast) for graphs that need a GPU."
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
| Cost | flat | **bills by the minute — teardown matters** |
| How | `nodetool deploy …` (Docker) | `nodetool worker …` (RunPod, Vast) |

For a walkthrough across desktop, public, private, and Docker/Podman self-hosting,
see the [End-to-End Deployment Guide](deployment-e2e-guide.md).

---

## Quick Reference: What do you want to do?

| I want to... | Go to |
|--------------|-------|
| **Run the NodeTool server on my own machine/host** | [Self-Hosted Deployment](self-hosted-deployment.md) |
| **Rent a GPU to run Python nodes (RunPod / Vast)** | [Worker Deployment](worker-deployment.md) |
| **Tune GPU/memory/volumes for the server container** | [Docker Resource Management](docker-resource-management.md) |
| **Use Supabase for auth/storage** | [Supabase Deployment Integration](supabase-deployment.md) |
| **Set up TLS/HTTPS** | [Self-Hosted Deployment](self-hosted-deployment.md) |

---

## Server: self-host with Docker

The quickest path is the reference [`docker-compose.yml`](../docker-compose.yml)
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
   This scaffolds `deployment.yaml` using the schema in `@nodetool-ai/deploy`
   (`deployment-config.ts`). The single target `type` is `docker`; the entry
   specifies the container image, persistent paths, and environment variables
   (under `container.environment`).
3. **Review & plan** (no remote mutation):
   ```bash
   nodetool deploy list
   nodetool deploy show my-server
   nodetool deploy plan my-server
   ```
4. **Apply & monitor**:
   ```bash
   nodetool deploy apply my-server
   nodetool deploy status my-server
   nodetool deploy logs my-server --follow
   nodetool deploy destroy my-server
   ```

See [Self-Hosted Deployment](self-hosted-deployment.md) for the full server
walkthrough, and [Supabase Deployment Integration](supabase-deployment.md) to add
hosted auth and storage.

> **Heads up:** NodeTool used to ship server-deploy targets for RunPod
> serverless, Google Cloud Run, Fly, Railway, and HuggingFace Spaces. Those are
> gone. Server self-hosting is **Docker only**; GPU access is now a *worker*
> concern, not a server target. To run on a GPU, rent a worker (below).

---

## Worker: rent a GPU (RunPod, Vast)

When a graph needs a GPU you don't have, provision a remote worker, attach to it,
run your Python nodes there, and tear it down:

```bash
nodetool secrets store RUNPOD_API_KEY
nodetool worker profile add hf-a40 --target runpod \
  --image ghcr.io/nodetool-ai/nodetool-worker:latest \
  --gpu "NVIDIA A40" --idle-timeout 15
nodetool worker create --profile hf-a40 --attach
nodetool worker list          # what's live, and what it's costing
nodetool worker stop --all    # tear everything down
```

GPU workers bill by the minute, so the worker subsystem ships a **cost guard**:
real teardown on every stop, idle auto-stop, a hard TTL, and orphan reconcile.
See [Worker Deployment](worker-deployment.md) for profiles, attaching from the UI
or CLI, supported targets, and the cost guard in full.

---

## Server configuration

`deployment.yaml` accepts these top-level keys per deployment (see
`DockerDeployment` in `@nodetool-ai/deploy` `deployment-config.ts`):

- `type` – always `docker`
- `enabled` – whether the deployment is active
- `host` – Docker host (IP/hostname, or `localhost`)
- `ssh` – SSH connection details for remote hosts (omit for local)
- `paths` – workspace and HF cache paths
- `persistent_paths` – persistent storage paths inside the container
- `image` – container image name/tag/registry
- `container` – name, port, GPU, and `environment` (env vars injected into the container)
- `server_auth_token` – auto-generated bearer token for admin/sync calls
- `state` – deployment state tracked by the deployer

Environment variables live under `container.environment`. Secrets such as
`SECRETS_MASTER_KEY` are auto-generated into `container.environment` when missing.

---

## Monitoring & health checks

```bash
# Health endpoint (no auth required)
curl http://your-server:7777/health
# Expected: {"status": "ok", ...} (or "degraded" when a service is unhealthy)

nodetool deploy status <name>
nodetool deploy logs <name> --follow
```

| Indicator | What to watch | Action |
|-----------|---------------|--------|
| **Health endpoint** | Should return 200 | Restart service if unhealthy |
| **Memory usage** | Models consume significant RAM/VRAM | Scale up or use smaller models |
| **Disk space** | Model cache and assets grow over time | Periodic cleanup or larger volumes |
| **Response time** | First request after cold start is slow (model loading) | Warm up via health check |

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---------|--------------|-----|
| Container exits immediately | Missing env vars or invalid config | Check `nodetool deploy logs <name>` |
| Health check fails | Service still starting (model loading) | Increase timeout; large models need 60–120s |
| 503 Service Unavailable | Overloaded or out of memory | Scale up resources or reduce concurrency |
| Port already in use | Another service on the same port | Change `container.port` in deployment.yaml |
| "Image not found" | Docker image not present | `docker pull ghcr.io/nodetool-ai/nodetool:latest` |
| Permission denied on volumes | Container user lacks access | Fix host directory permissions |

For more, see the [Troubleshooting Guide](troubleshooting.md#issue-deployment-fails-or-service-wont-start).

---

## Upgrading

```bash
docker pull ghcr.io/nodetool-ai/nodetool:latest
nodetool deploy apply <name>
nodetool deploy status <name>
```

Workflows, assets, and settings are preserved across upgrades when using
persistent volumes.

---

## Related

- [Self-Hosted Deployment](self-hosted-deployment.md)
- [Worker Deployment](worker-deployment.md)
- [Docker Resource Management](docker-resource-management.md)
- [Supabase Deployment Integration](supabase-deployment.md)
- [End-to-End Deployment Guide](deployment-e2e-guide.md)
</content>
