---
layout: page
title: "RunPod Deployment"
---

The RunPod deployer (`src/nodetool/deploy/deploy_to_runpod.py`) builds an AMD64 Docker image, pushes it to your registry, and can create/update RunPod templates and endpoints via GraphQL.

## Requirements

- Docker (with Buildx for multi-arch builds) and registry credentials
- `RUNPOD_API_KEY` in your environment
- Optional GPU tuning (`gpu_types`, `gpu_count`, `idle_timeout`, etc.)

## Quick Start

```bash
export RUNPOD_API_KEY="your-key"
nodetool deploy add my-runpod --type runpod
nodetool deploy apply my-runpod
```

## Key Configuration Fields

- `template_id` / `endpoint_id` for existing resources (or empty to create new)
- `compute_type`, `gpu_types`, `gpu_count` for hardware selection
- `workers_min`, `workers_max` for autoscaling bounds
- `env` for runtime environment variables

## Operational Commands

```bash
nodetool deploy status my-runpod
nodetool deploy logs my-runpod
nodetool deploy destroy my-runpod
```

## Related

- [Deployment Guide](deployment.md)
- [CLI Reference](cli.md)
