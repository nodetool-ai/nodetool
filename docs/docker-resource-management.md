---
layout: page
title: "Docker Resource Management"
description: "Practical limits for NodeTool proxy + worker containers."
---

Use these guidelines to keep multi-tenant or long-running NodeTool deployments stable. All examples reuse the `mem_limit` and `cpus` fields supported by the proxy and self-hosted deployment schemas.

## Baseline Settings

- Set memory and CPU caps for every service to avoid noisy-neighbor issues. Start with `mem_limit: 8g` and `cpus: 4` for GPU hosts, then tune from `docker stats`.
- Keep Hugging Face caches mounted read-only; mount workspaces read/write only where necessary.
- Prefer `idle_timeout` on the proxy to stop idle services instead of leaving them running indefinitely.
- Keep `/tmp` and workspace volumes on fast disks; avoid sharing `/tmp` across unrelated services.

## Proxy-Managed Services

Example excerpt in `proxy.yaml` (rendered by `nodetool deploy apply`):

```yaml
services:
  - name: nodetool-worker
    path: /
    image: nodetool:latest
    mem_limit: 8g
    cpus: 4
    environment:
      PORT: "7777"
      HF_HOME: /hf-cache
    volumes:
      /data/nodetool/workspace:
        bind: /workspace
        mode: rw
      /data/hf-cache:
        bind: /hf-cache
        mode: ro
```

- Increase `mem_limit` for heavy diffusion workloads; lower it for CPU-only chat nodes.
- Use read-only mounts (`mode: ro`) for shared caches to prevent accidental mutation.
- When using `connect_mode: host_port`, ensure published ports do not conflict with other services on the host.

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

- Use `--memory-reservation` to set soft limits when co-locating multiple workers.
- Keep per-run tmp data on the workspace volume (e.g., `TMPDIR=/workspace/tmp`) so it persists through restarts.

## Monitoring and Tuning

- Watch `docker stats` or `nodetool proxy-status --follow` to catch containers hitting limits or restarting.
- If runs are OOM-killed, lower batch sizes in your workflows or increase `mem_limit` incrementally.
- For storage-heavy jobs, pair limits with the guidance in [Storage](storage.md) to ensure caches and outputs have enough space.
