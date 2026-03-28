---
layout: page
title: "RunPod Deployment"
description: "Deploy NodeTool workflows to RunPod for GPU-accelerated serverless execution."
---

Deploy NodeTool to RunPod for on-demand GPU-accelerated workflow execution. RunPod's serverless infrastructure automatically scales workers based on incoming requests, making it ideal for AI workloads that need GPUs without maintaining always-on servers.

---

## Prerequisites

- **Docker** installed (with Buildx for multi-architecture builds)
- A **Docker registry** account (Docker Hub, GHCR, or private registry)
- A **RunPod account** with API access
- Your **RunPod API key** from [runpod.io/console/user/settings](https://runpod.io/console/user/settings)

---

## Quick Start

```bash
# 1. Set your RunPod API key
export RUNPOD_API_KEY="your-api-key"

# 2. Create a RunPod deployment target
nodetool deploy add my-runpod --type runpod

# 3. Edit deployment.yaml to configure your settings (see below)

# 4. Deploy (builds image, pushes to registry, creates RunPod endpoint)
nodetool deploy apply my-runpod
```

---

## How It Works

The RunPod deployer:

1. **Builds** an AMD64 Docker image from your NodeTool configuration
2. **Pushes** the image to your configured Docker registry
3. **Creates a RunPod template** with the image and environment settings
4. **Creates a RunPod endpoint** (or updates an existing one) with your compute and scaling preferences
5. **Records state** locally for future updates and management

---

## Configuration

Configure your RunPod deployment in `deployment.yaml`:

### Compute Settings

| Field | Description | Default |
|-------|-------------|---------|
| `compute_type` | Compute type (`GPU` or `CPU`) | `GPU` |
| `gpu_types` | Allowed GPU types (e.g., `["NVIDIA RTX A6000", "NVIDIA A100 80GB"]`) | -- |
| `gpu_count` | Number of GPUs per worker | `1` |

### Scaling

| Field | Description | Default |
|-------|-------------|---------|
| `workers_min` | Minimum active workers (0 = scale to zero) | `0` |
| `workers_max` | Maximum workers for autoscaling | `3` |
| `idle_timeout` | Seconds before idle workers scale down | `60` |

### Existing Resources

| Field | Description |
|-------|-------------|
| `template_id` | Existing RunPod template ID (leave empty to create new) |
| `endpoint_id` | Existing RunPod endpoint ID (leave empty to create new) |

### Environment Variables

```yaml
type: runpod
compute_type: GPU
gpu_types:
  - "NVIDIA RTX A6000"
gpu_count: 1
workers_min: 0
workers_max: 3
idle_timeout: 60
env:
  AUTH_PROVIDER: static
  SERVER_AUTH_TOKEN: your-secret-token
  OPENAI_API_KEY: sk-...
  HUGGING_FACE_TOKEN: hf_...
```

---

## Docker Registry Setup

RunPod pulls images from your Docker registry. Configure registry credentials:

### Docker Hub

```bash
docker login
```

The deployer automatically detects your Docker Hub username from your Docker config or the `DOCKER_USERNAME` environment variable.

### GitHub Container Registry (GHCR)

```bash
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
```

### Private Registry

Set the full registry URL in your image configuration:

```yaml
image:
  registry: your-registry.example.com
  name: nodetool
  tag: latest
```

---

## Operational Commands

```bash
# View deployment status and endpoint health
nodetool deploy status my-runpod

# Stream logs from workers
nodetool deploy logs my-runpod

# Preview changes without deploying
nodetool deploy plan my-runpod

# View current configuration
nodetool deploy show my-runpod

# Tear down template and endpoint
nodetool deploy destroy my-runpod
```

---

## GPU Selection Guide

Choose GPU types based on your workflow needs:

| GPU | VRAM | Best For |
|-----|------|----------|
| **RTX A4000** | 16 GB | Text generation, small image models |
| **RTX A5000** | 24 GB | Image generation (Flux, SDXL), medium LLMs |
| **RTX A6000** | 48 GB | Large models, video generation, batch processing |
| **A100 40GB** | 40 GB | High-throughput inference, large LLMs |
| **A100 80GB** | 80 GB | Very large models (70B+ LLMs), multi-model serving |

Specifying multiple GPU types in `gpu_types` gives RunPod flexibility to schedule on available hardware, reducing queue times.

---

## Troubleshooting

### Common Issues

**"Image pull failed" on RunPod**
- Verify your Docker image was pushed successfully: `docker manifest inspect <image>`
- Check that the registry is publicly accessible or RunPod has credentials
- Ensure the image is built for `linux/amd64` architecture

**Workers stuck in "Initializing"**
- Check logs: `nodetool deploy logs my-runpod`
- Verify environment variables (especially API keys) are set correctly
- Ensure the image starts successfully locally: `docker run <image>`

**Slow cold starts**
- Set `workers_min: 1` to keep a warm worker available
- Use smaller base images to reduce pull time
- Pre-download models into the Docker image during build

**API key errors**
- Verify `RUNPOD_API_KEY` is set in your environment
- Check the key has the correct permissions in RunPod settings

---

## Related

- [Deployment Guide](deployment.md) -- Overview of all deployment options
- [RunPod Testing Guide](runpod_testing_guide.md) -- Detailed testing procedures
- [Self-Hosted Deployment](self-hosted-deployment.md) -- Deploy on your own servers
- [Security Hardening](security-hardening.md) -- Production security checklist
- [CLI Reference](cli.md) -- Full CLI command documentation
