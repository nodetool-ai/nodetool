---
layout: page
title: "Docker Resource Management"
description: "Practical resource limits for NodeTool server containers."
---

Use these guidelines to keep multi-tenant or long-running NodeTool deployments stable. The examples use Docker's standard `--memory` / `--cpus` flags and volume mounts.

`nodetool deploy apply` does not set memory or CPU limits. Its `deployment.yaml` has no field for them, and it passes only `--gpus "device=<container.gpu>"` when `container.gpu` is set. To cap a deployer-managed container, update it after `apply` with `docker update --memory 8g --cpus 4 nodetool-<container.name>` (this does not survive the next `apply`), or run the container yourself with `docker run` or Compose.

## Baseline Settings

- Set memory and CPU caps for every container to avoid noisy-neighbor issues. Start with `--memory 8g` and `--cpus 4` for GPU hosts, then tune from `docker stats`.
- Mount a Hugging Face cache read-only only when models are already downloaded. The server cannot add models to a read-only cache. `nodetool deploy` mounts `paths.hf_cache` at `/hf-cache` read-only unless `persistent_paths` is set.
- Mount the workspace read/write. The image runs as the `node` user, so the host directory must be writable by it.
- Keep `/tmp` and workspace volumes on fast disks. Avoid sharing `/tmp` across unrelated services.

## Local Docker Runs

For standalone containers or quick tests:

```bash
docker run --gpus all \
  --memory 8g --cpus 4 \
  -v /data/nodetool/workspace:/workspace \
  -v /data/hf-cache:/hf-cache:ro \
  -e DB_PATH=/workspace/nodetool.db \
  -e HF_HOME=/hf-cache \
  -p 7777:7777 \
  ghcr.io/nodetool-ai/nodetool:latest
```

The image exits at start unless `DB_PATH` or `DATABASE_URL` is set. In Compose, use `mem_limit` and `cpus` on the service, or `deploy.resources.limits`. The reference `docker-compose.yml` sets none.

- Use `--memory-reservation` to set soft limits when co-locating multiple servers.
- Without a keychain the server needs `SECRETS_MASTER_KEY`. The image generates one under `/workspace/.secrets_master_key`, so keep `/workspace` on a persistent volume.
- Keep per-run tmp data on the workspace volume (e.g., `TMPDIR=/workspace/tmp`) so it persists through restarts.
- Mount shared caches read-only (`:ro`) to prevent accidental mutation.

## Monitoring and Tuning

- Watch `docker stats` to catch containers hitting limits or restarting.
- If runs are OOM-killed, lower batch sizes in your workflows or increase `--memory` incrementally.
- For storage-heavy jobs, pair limits with the guidance in [Storage](storage.md) to ensure caches and outputs have enough space.
