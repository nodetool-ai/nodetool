---
layout: page
title: "Modal Deployment Guide"
---



This guide explains how to deploy NodeTool to [Modal](https://modal.com/), a serverless platform for running Python code with GPU support. Modal provides instant cold starts, automatic scaling, and pay-per-use pricing, making it ideal for AI workloads.

## Overview

Modal deployment allows you to:

- **Run GPU workloads** on A100, H100, or other GPU types without managing infrastructure
- **Scale automatically** from zero to thousands of containers
- **Pay per second** of compute time with no idle costs
- **Deploy instantly** with no Docker builds required

## Prerequisites

1. **Modal account**: Sign up at [modal.com](https://modal.com/)
2. **Modal CLI**: Install with `pip install modal`
3. **Modal token**: Run `modal token new` to authenticate
4. **NodeTool backend**: Clone the [nodetool-core](https://github.com/nodetool-ai/nodetool-core) repository

## Quick Start

### 1. Install Modal

```bash
pip install modal
modal token new
```

### 2. Deploy NodeTool to Modal

```bash
cd nodetool-core
nodetool deploy add my-modal --type modal
nodetool deploy apply my-modal
```

### 3. Verify Deployment

```bash
nodetool deploy status my-modal
```

### 4. Run a Workflow

```bash
curl -H "Authorization: Bearer $MODAL_AUTH_TOKEN" \
  -X POST "https://your-app--nodetool.modal.run/api/workflows/<workflow_id>/run" \
  -d '{"params":{}}'
```

## Configuration

### Deployment Configuration (`deployment.yaml`)

Create or edit `~/.config/nodetool/deployment.yaml`:

```yaml
deployments:
  my-modal:
    type: modal
    
    # App configuration
    app_name: nodetool
    
    # GPU configuration
    gpu: a100  # Options: t4, a10g, a100, h100, any
    gpu_count: 1
    
    # Resource limits
    memory: 32768  # MB
    cpu: 4
    timeout: 600  # seconds
    
    # Scaling
    min_containers: 0  # Scale to zero when idle
    max_containers: 10
    container_idle_timeout: 300  # seconds
    
    # Environment variables
    env:
      AUTH_PROVIDER: static
      WORKER_AUTH_TOKEN: ${MODAL_AUTH_TOKEN}
      LOG_LEVEL: INFO
    
    # Secrets (stored in Modal)
    secrets:
      - openai-secret
      - anthropic-secret
      - huggingface-secret
    
    # Volumes for persistent storage
    volumes:
      models: /models
      workspace: /workspace
```

### Configuration Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `app_name` | str | `nodetool` | Modal application name |
| `gpu` | str | `any` | GPU type (`t4`, `a10g`, `a100`, `h100`, `any`) |
| `gpu_count` | int | 1 | Number of GPUs per container |
| `memory` | int | 16384 | Memory in MB |
| `cpu` | float | 2.0 | Number of CPU cores |
| `timeout` | int | 600 | Maximum function execution time in seconds |
| `min_containers` | int | 0 | Minimum warm containers (0 = scale to zero) |
| `max_containers` | int | 10 | Maximum concurrent containers |
| `container_idle_timeout` | int | 300 | Seconds before idle container is terminated |
| `env` | dict | `{}` | Environment variables |
| `secrets` | list | `[]` | Modal secret names to mount |
| `volumes` | dict | `{}` | Modal volume mounts (`name: mount_path`) |

## Setting Up Secrets

Modal secrets store sensitive credentials securely. Create secrets via the Modal dashboard or CLI:

### Via CLI

```bash
# OpenAI
modal secret create openai-secret OPENAI_API_KEY=sk-...

# Anthropic
modal secret create anthropic-secret ANTHROPIC_API_KEY=sk-ant-...

# Hugging Face
modal secret create huggingface-secret HF_TOKEN=hf_...
```

### Via Dashboard

1. Go to [modal.com/secrets](https://modal.com/secrets)
2. Click "Create new secret"
3. Add key-value pairs for your API keys

Reference secrets in your deployment:

```yaml
secrets:
  - openai-secret
  - anthropic-secret
  - huggingface-secret
```

## Persistent Storage with Volumes

Modal volumes persist data across container restarts. Create volumes for models and workspace data:

### Create Volumes

```bash
# Create a volume for model weights
modal volume create nodetool-models

# Create a volume for workspace data
modal volume create nodetool-workspace
```

### Mount in Deployment

```yaml
volumes:
  nodetool-models: /models
  nodetool-workspace: /workspace
```

### Pre-populate Models

Upload model files to your volume:

```bash
# Upload model files
modal volume put nodetool-models ./local-models /

# List contents
modal volume ls nodetool-models
```

## GPU Selection Guide

Choose the right GPU for your workload:

| GPU | VRAM | Best For |
|-----|------|----------|
| T4 | 16 GB | Inference, small models |
| A10G | 24 GB | Medium models, fine-tuning |
| A100 (40GB) | 40 GB | Large models, training |
| A100 (80GB) | 80 GB | Very large models |
| H100 | 80 GB | Fastest inference, largest models |

```yaml
# For inference workloads
gpu: t4

# For Stable Diffusion XL
gpu: a10g

# For LLaMA 70B or training
gpu: a100

# For maximum performance
gpu: h100
```

## Deployment Commands

### Deploy

```bash
# Deploy to Modal
nodetool deploy apply my-modal

# Deploy with verbose output
nodetool deploy apply my-modal --verbose
```

### Status

```bash
# Check deployment status
nodetool deploy status my-modal

# Get deployment URL
nodetool deploy show my-modal
```

### Logs

```bash
# Stream logs
nodetool deploy logs my-modal --follow

# Get recent logs
nodetool deploy logs my-modal --tail 100
```

### Destroy

```bash
# Remove deployment
nodetool deploy destroy my-modal
```

## Running Workflows

### Via API

```bash
# Run a workflow
curl -H "Authorization: Bearer $MODAL_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST "https://your-app--nodetool.modal.run/api/workflows/<workflow_id>/run" \
  -d '{"params": {"prompt": "A beautiful sunset"}}'
```

### Via CLI

```bash
nodetool deploy workflows run my-modal <workflow_id> --params '{"prompt": "Hello"}'
```

### Streaming Responses

```bash
curl -H "Authorization: Bearer $MODAL_AUTH_TOKEN" \
  -X POST "https://your-app--nodetool.modal.run/api/workflows/<workflow_id>/run?stream=true" \
  -d '{"params":{}}'
```

## Health Checks

### Check Health

```bash
curl https://your-app--nodetool.modal.run/health
```

### List Models

```bash
curl -H "Authorization: Bearer $MODAL_AUTH_TOKEN" \
  https://your-app--nodetool.modal.run/v1/models
```

## Cost Optimization

### Scale to Zero

Set `min_containers: 0` to avoid costs when idle:

```yaml
min_containers: 0
container_idle_timeout: 60  # Quick scale-down
```

### Right-size GPUs

Use smaller GPUs when possible:

```yaml
# Don't use H100 for small inference
gpu: t4  # 80% cheaper than A100
```

### Set Timeouts

Prevent runaway costs with timeouts:

```yaml
timeout: 300  # 5 minute max
```

### Monitor Usage

Check usage in the Modal dashboard:
- [modal.com/usage](https://modal.com/usage)

## Comparison with Other Platforms

| Feature | Modal | RunPod | GCP Cloud Run |
|---------|-------|--------|---------------|
| Cold start | ~1s | ~30s | ~5s |
| GPU types | T4-H100 | T4-H100 | T4-A100 |
| Scale to zero | Yes | Yes | Yes |
| Docker required | No | Yes | Yes |
| Pricing | Per-second | Per-minute | Per-second |
| Min billing | 1 second | 1 minute | 100ms |

## Troubleshooting

### Container Doesn't Start

**Symptom**: Deployment shows `starting` but never becomes `running`.

**Fix**: Check logs for errors:
```bash
nodetool deploy logs my-modal
```

Common issues:
- Missing secrets: Ensure all secrets referenced in `secrets:` exist
- Volume not found: Create volumes before deploying
- Memory too low: Increase `memory` setting

### GPU Not Available

**Symptom**: Error about GPU unavailable.

**Fix**: Modal may not have capacity for your requested GPU. Try:
```yaml
gpu: any  # Accept any available GPU
```

Or specify multiple acceptable types in the Modal app directly.

### Timeout Errors

**Symptom**: Requests fail with timeout.

**Fix**: Increase timeout:
```yaml
timeout: 900  # 15 minutes
```

### Authentication Failures

**Symptom**: `401 Unauthorized` errors.

**Fix**: 
1. Verify `WORKER_AUTH_TOKEN` is set correctly
2. Check the token matches your request header
3. Ensure `AUTH_PROVIDER: static` is set

### Cold Start Latency

**Symptom**: First request is slow.

**Fix**: Keep containers warm:
```yaml
min_containers: 1  # Always keep 1 container warm
```

Note: This increases costs as you pay for idle time.

## Advanced Configuration

### Custom Image

Use a custom Docker image:

```yaml
image:
  name: your-registry/nodetool
  tag: custom
```

### Web Endpoints

Expose additional endpoints:

```yaml
endpoints:
  - path: /api
    function: api_handler
  - path: /ws
    function: websocket_handler
```

### Cron Jobs

Schedule periodic tasks:

```yaml
schedules:
  - name: cleanup
    cron: "0 0 * * *"  # Daily at midnight
    function: cleanup_handler
```

## Related Documentation

- [Deployment Guide](deployment.md) — Overview of all deployment options
- [Deployment Journeys](deployment-journeys.md) — Step-by-step deployment walkthroughs
- [Configuration Guide](configuration.md) — Environment variables and settings
- [CLI Reference](cli.md) — Command-line interface
- [Modal Documentation](https://modal.com/docs) — Official Modal docs
