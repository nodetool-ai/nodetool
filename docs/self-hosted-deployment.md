---
layout: page
title: "Self-Hosted Deployment Guide"
description: "Deploy the NodeTool server on your own infrastructure with Docker."
---

This guide covers deploying NodeTool on your own infrastructure.

## Overview

Self-hosted deployment runs NodeTool in a **Docker** container — on `localhost`
or on a remote host reached over SSH. Docker is the only supported deployment
`type` (`SUPPORTED_TYPES = ["docker"]`).

## Deployment Configuration

Deployments are configured via `deployment.yaml`.

### Docker Deployment

```yaml
deployments:
  my-server:
    type: docker
    enabled: true
    host: 192.168.1.10
    ssh:
      user: ubuntu
      key_path: ~/.ssh/id_rsa
    container:
      name: nodetool-server
      port: 8000
      gpu: "0"
    paths:
      workspace: /data/nodetool
      hf_cache: /data/hf-cache
    image:
      name: ghcr.io/nodetool-ai/nodetool
      tag: latest
```

For a local host, set `host: localhost` and omit the `ssh` block.

## Apply Flow

1. **Directory Creation**: Ensures `workspace` and `hf_cache` directories exist.
2. **Image Check**: Verifies the configured image exists locally/remote. `deploy apply` does not auto-pull.
3. **Image Transfer**: For remote hosts, copies image to remote runtime if needed.
4. **Container Management**: Restarts container with new configuration.
5. **Health Check**: Verifies HTTP endpoint.

## End-to-End: Local Docker Deployment

This walkthrough matches a common local setup flow:

1. Pull the Docker image.
2. Add a docker deployment interactively.
3. Review the generated deployment.
4. Apply deployment and validate health.
5. Sync workflows.
6. Run a synced workflow on the deployed instance.

### 0. Pull the Image First

```bash
docker pull ghcr.io/nodetool-ai/nodetool:latest
```

### 1. Add Local Docker Deployment

```bash
nodetool deploy add local --type docker
```

`--type docker` is required. The command then prompts for the rest:

- Host address: `localhost`
- Docker image name: `ghcr.io/nodetool-ai/nodetool`
- Docker image tag: `latest`
- Container name: `nodetool`
- Port: `8000`
- GPU/workflows assignment: optional
- Workspace folder: `$HOME/.nodetool-workspace`
- HF cache folder: canonical local HF cache (auto-detected, usually `$HOME/.cache/huggingface/hub`)

Path meanings:

- Workspace: stores assets and temporary runtime data.
- HF cache: stores downloaded Hugging Face artifacts/models.

### 2. Review Deployment Config

```bash
nodetool deploy show local
```

This dumps the deployment entry as YAML. You should see something like:

```yaml
local:
  type: docker
  host: localhost
  image:
    name: ghcr.io/nodetool-ai/nodetool
    tag: latest
  container:
    name: nodetool
    port: 8000
  paths:
    workspace: <your workspace path>
    hf_cache: <your HF cache path>
```

The server endpoint is at `http://localhost:8000`. The container EXPOSEs 7777;
when `container.port` is `7777` the deployer maps it to host port `8000` (any
other `container.port` is used as-is).

You can also inspect the raw config:

```bash
cat ~/.config/nodetool/deployment.yaml
```

### 3. Apply Deployment

```bash
nodetool deploy apply local
```

Expected successful output includes:

- directories created
- image check passed
- app container started
- health checks passing for `http://127.0.0.1:8000/health`
- `Deployment successful`
- secrets synced

If the first apply fails (for example due to container/port conflicts), run apply again:

```bash
nodetool deploy apply local
```

Then confirm runtime state:

{% raw %}
```bash
nodetool deploy status local
docker ps --filter name=nodetool --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
curl http://127.0.0.1:8000/health
```
{% endraw %}

### 4. Sync Workflows to the Deployment

List local workflows first:

```bash
nodetool workflows list
```

Sync one workflow by ID to the deployed instance:

```bash
nodetool deploy workflows sync local <workflow_id>
```

This sync command also:

- uploads referenced assets
- downloads referenced models (HuggingFace/Ollama) on the target

Verify remote workflows:

```bash
nodetool deploy workflows list local
```

### 5. Test Workflow Execution on Deployed Instance

Run a synced workflow remotely:

```bash
nodetool deploy workflows run local <workflow_id>
```

Optional params example:

```bash
nodetool deploy workflows run local <workflow_id> -p prompt="hello"
```

If a run fails, inspect logs:

```bash
nodetool deploy logs local --tail 200
```

## Manual Troubleshooting

### Container Logs

```bash
nodetool deploy logs local --tail 200
```

For a remote host you can also read the container logs directly:

```bash
ssh user@host "docker logs nodetool-server"
```
