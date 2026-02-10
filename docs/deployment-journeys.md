---
layout: page
title: "Deployment Journeys"
---

# Deployment Journeys

Use this page to choose a deployment path quickly. Detailed, type-specific instructions now live in dedicated pages.

## Choose a Journey

| Goal | Start Here |
|------|------------|
| Run NodeTool on your own machine/server | [Self-Hosted Deployment](self-hosted-deployment.md) |
| Run GPU/serverless workloads on RunPod | [RunPod Deployment](runpod-deployment.md) |
| Deploy to Google Cloud Run | [Google Cloud Run Deployment](gcp-deployment.md) |
| Use Supabase for auth/storage | [Supabase Deployment Integration](supabase-deployment.md) |

## Shared Baseline Flow

Use this flow for any deployment target:

```bash
nodetool deploy init
nodetool deploy add <name> --type <docker|runpod|gcp|ssh|local>
nodetool deploy show <name>
nodetool deploy plan <name>
nodetool deploy apply <name>
nodetool deploy status <name>
```

For Docker-based self-hosted targets, ensure the image is available before `apply`:

```bash
docker pull ghcr.io/nodetool-ai/nodetool:latest
```

## Workflow Sync and Verification

After deployment succeeds:

```bash
nodetool workflows list
nodetool deploy workflows sync <deployment_name> <workflow_id>
nodetool deploy workflows list <deployment_name>
nodetool deploy workflows run <deployment_name> <workflow_id>
```

If needed, inspect logs:

```bash
nodetool deploy logs <deployment_name> --tail 200
```

## Related Guides

- [Deployment Guide](deployment.md)
- [Self-Hosted Deployment](self-hosted-deployment.md)
- [RunPod Deployment](runpod-deployment.md)
- [Google Cloud Run Deployment](gcp-deployment.md)
- [Supabase Deployment Integration](supabase-deployment.md)
- [CLI Reference](cli.md)
