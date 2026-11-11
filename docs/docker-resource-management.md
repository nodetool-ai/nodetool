---
layout: page
title: "Docker Resource Management"
description: "Memory, CPU, GPU, and volume settings for NodeTool server containers, and why nodetool deploy apply sets none of the limits."
---

```bash
docker update --memory 8g --cpus 4 nodetool-<container.name>
```

`nodetool deploy apply` sets no memory or CPU limits. `deployment.yaml` has no field for them, and the deployer passes only `--gpus "device=<container.gpu>"` when `container.gpu` is set. `docker update` caps a deployer-managed container but does not survive the next `apply`. For persistent caps, run the container yourself with `docker run` or Compose.

> **Runs:** any Docker host. **Needs:** `DB_PATH` or `DATABASE_URL`, and `--gpus all` for GPU access. **Hardware:** the 8 GB and 4 CPU figures below are starting points, not measured requirements.
{: .callout-note}

## Baseline Settings

- Cap memory and CPU on every container. Start with `--memory 8g` and `--cpus 4` on GPU hosts and tune from `docker stats`.
- Mount a Hugging Face cache read-only only when models are already downloaded. The server cannot add models to a read-only cache. `nodetool deploy` mounts `paths.hf_cache` at `/hf-cache` read-only unless `persistent_paths` is set.
- Mount the workspace read/write. The image runs as the `node` user, so the host directory must be writable by it.

## Local Docker Runs

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

In Compose, use `mem_limit` and `cpus` on the service, or `deploy.resources.limits`. The reference `docker-compose.yml` sets none.

- `--memory-reservation` sets soft limits when co-locating servers.
- The image generates a master key under `/workspace/.secrets_master_key` when `SECRETS_MASTER_KEY` is unset, so keep `/workspace` on a persistent volume.
- `TMPDIR=/workspace/tmp` keeps per-run temp data on the workspace volume through restarts.

## If it fails

- **Container exits at start with `ERROR: No database configured. Set DATABASE_URL (PostgreSQL) or DB_PATH (SQLite).`**: set one of them.
- **Runs are OOM-killed** (`docker stats` shows the container at its limit, or restarting): lower batch sizes in the workflow or raise `--memory` in steps.
- **Cache write errors**: the HF cache mounted `:ro` cannot take new models. Mount it read/write or download models elsewhere. For storage-heavy jobs see [Storage](storage.md).
