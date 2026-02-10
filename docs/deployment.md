---
layout: page
title: "Deployment Guide"
---



NodeTool supports multiple deployment targets driven by a single `deployment.yaml` configuration. The `nodetool deploy` command family builds container images, applies configuration, and manages the lifecycle of remote services across self-hosted hosts, RunPod serverless, and Google Cloud Run.

For a practical full runbook (desktop, public, private, Docker/Podman, and workflow sync verification), see [End-to-End Deployment Guide](deployment-e2e-guide.md).

---

## Quick Reference: What Do You Want to Do?

| I want to... | What you need |
|--------------|---------------|
| **Run NodeTool on my own server** | → [Self-Hosted Deployment](self-hosted-deployment.md) |
| **Deploy to RunPod for GPU access** | → [RunPod Deployment](runpod-deployment.md) |
| **Deploy to Google Cloud Run** | → [Google Cloud Run Deployment](gcp-deployment.md) |
| **Use Supabase for auth/storage** | → [Supabase Deployment Integration](supabase-deployment.md) |
| **Set up TLS/HTTPS** | → See [Self-Hosted Deployment](self-hosted-deployment.md) |
| **Configure environment variables** | → [Deployment Configuration](#deployment-configuration) |

---

## Common Deployment Goals

### I want to deploy NodeTool to my own server

1. **Pull the base image first**:
   ```bash
   docker pull ghcr.io/nodetool-ai/nodetool:latest
   ```
2. **Set up your configuration**:
   ```bash
   nodetool deploy init
   nodetool deploy add my-server 
   ```
3. **Configure** 
   - image name: `ghcr.io/nodetool-ai/nodetool`
   - image tag: `latest`
4. **Build and deploy**:
   ```bash
   nodetool deploy apply my-server
   ```
5. **Verify**: `nodetool deploy status my-server`

See [Self-Hosted Deployment](self-hosted-deployment.md) for full details.

### I want to run workflows on GPU via RunPod

1. **Get your RunPod API key** from [runpod.io](https://runpod.io)
2. **Set up deployment**:
   ```bash
   export RUNPOD_API_KEY="your-key"
   nodetool deploy add my-runpod --type runpod
   ```
3. **Configure GPU settings** in `deployment.yaml` (`gpu_types`, `gpu_count`)
4. **Deploy**:
   ```bash
   nodetool deploy apply my-runpod
   ```

See [RunPod Deployment](runpod-deployment.md) for full details.

### I want to deploy to Google Cloud

1. **Authenticate with gcloud**: `gcloud auth login`
2. **Set up deployment**:
   ```bash
   nodetool deploy add my-gcp --type gcp
   ```
3. **Configure region, CPU/memory** in `deployment.yaml`
4. **Deploy**:
   ```bash
   nodetool deploy apply my-gcp
   ```

See [Google Cloud Run Deployment](gcp-deployment.md) for full details.

### I want to use Supabase for authentication and storage

1. **Create a Supabase project** at [supabase.com](https://supabase.com)
2. **Create storage buckets** (`assets`, `assets-temp`)
3. **Add to your deployment config**:
   ```yaml
   env:
     SUPABASE_URL: https://your-project.supabase.co
     SUPABASE_KEY: your-service-role-key
     AUTH_PROVIDER: supabase
     ASSET_BUCKET: assets
   ```
4. **Deploy**: `nodetool deploy apply <name>`

See [Supabase Deployment Integration](supabase-deployment.md) for full details.

---

## Deployment Workflow

1. **Initialize configuration**  

   ```bash
   # For Docker targets, ensure the image is present locally first
   docker pull ghcr.io/nodetool-ai/nodetool:latest

   nodetool deploy init
   nodetool deploy add <name> --type docker
   ```  

   These commands scaffold `deployment.yaml` using the schema defined in `src/nodetool/config/deployment.py`. Each entry specifies a `type` (`self-hosted`, `runpod`, or `gcp`), container image details, environment variables, and target-specific options.

2. **Review & plan**  

   ```bash
   nodetool deploy list
   nodetool deploy show <name>
   nodetool deploy plan <name>
   ```  

   Planning validates the configuration, renders the effective proxy files (for self-hosted targets), and shows pending actions without mutating remote resources.

3. **Apply & monitor**  

   ```bash
   nodetool deploy apply <name>
   nodetool deploy status <name>
   nodetool deploy logs <name> [--follow]
   nodetool deploy destroy <name>
   ```  

   `apply` builds/pushes container images, provisions infrastructure, updates proxy configuration, and records deployment state in the local cache (`src/nodetool/deploy/state.py`). Status and logs surface the remote service health.

### Deployment Configuration

`deployment.yaml` accepts the following top-level keys (see `SelfHostedDeployment`, `RunPodDeployment`, and `GCPDeployment` in `src/nodetool/config/deployment.py`):

- `type` – target platform (`self-hosted`, `runpod`, `gcp`)
- `image` – container image name/tag/registry
- `paths` – persistent storage paths (self-hosted)
- `container` – port, workflows, GPU configuration (self-hosted)
- `proxy` – proxy services (`self-hosted`; see the [Proxy Reference](proxy.md))
- `runpod` / `gcp` – provider specific compute, region, scaling and credential options
- `env` – environment variables injected into the deployed containers

Store secrets (API keys, tokens) in `secrets.yaml` or environment variables; the deployer merges them at runtime without writing them to disk.

## Deployment Types

Deployment-type details live on dedicated pages:

- [Self-Hosted Deployment](self-hosted-deployment)
- [RunPod Deployment](runpod-deployment)
- [Google Cloud Run Deployment](gcp-deployment)
- [Supabase Deployment Integration](supabase-deployment)