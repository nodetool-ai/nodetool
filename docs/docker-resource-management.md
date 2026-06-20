---
layout: page
title: "Docker Resource Management"
description: "Practical resource limits for NodeTool server containers."
---

Use these guidelines to keep multi-tenant or long-running NodeTool deployments stable. The examples use Docker's standard `--memory` / `--cpus` flags and volume mounts.

## Baseline Settings

- Set memory and CPU caps for every container to avoid noisy-neighbor issues. Start with `--memory 8g` and `--cpus 4` for GPU hosts, then tune from `docker stats`.
- Keep Hugging Face caches mounted read-only; mount workspaces read/write only where necessary.
- Keep `/tmp` and workspace volumes on fast disks; avoid sharing `/tmp` across unrelated services.

## Local Docker Runs

For standalone containers or quick tests:

```bash
docker run --gpus all \
  --memory 8g --cpus 4 \
  -v /data/nodetool/workspace:/workspace \
  -v /data/hf-cache:/hf-cache:ro \
  -e HF_HOME=/hf-cache \
  -p 7777:7777 \
  nodetool:latest
```

- Use `--memory-reservation` to set soft limits when co-locating multiple servers.
- Keep per-run tmp data on the workspace volume (e.g., `TMPDIR=/workspace/tmp`) so it persists through restarts.
- Mount shared caches read-only (`:ro`) to prevent accidental mutation.

## Monitoring and Tuning

- Watch `docker stats` to catch containers hitting limits or restarting.
- If runs are OOM-killed, lower batch sizes in your workflows or increase `--memory` incrementally.
- For storage-heavy jobs, pair limits with the guidance in [Storage](storage.md) to ensure caches and outputs have enough space.
