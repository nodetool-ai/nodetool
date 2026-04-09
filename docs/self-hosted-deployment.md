---
layout: page
title: "Self-Hosted Deployment Guide"
---

This guide covers deploying NodeTool on your own infrastructure.

## Overview

Self-hosted deployment supports:

1. **Docker**: Runs NodeTool in a container.
2. **SSH**: Installs and runs NodeTool as a `systemd` user service on a remote host.
3. **Local**: Same as SSH mode but on the local machine.

## Deployment Configuration

Deployments are configured via `deployment.yaml`.

### Docker Deployment

```yaml
deployments:
  my-server:
    type: docker
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

### SSH Deployment

```yaml
deployments:
  my-ssh-server:
    type: ssh
    host: 192.168.1.11
    ssh:
      user: ubuntu
      key_path: ~/.ssh/id_rsa
    port: 8000
    service_name: nodetool-8000
    paths:
      workspace: /home/ubuntu/nodetool
      hf_cache: /home/ubuntu/.cache/huggingface
```

### Local Deployment

```yaml
deployments:
  my-local-server:
    type: local
    host: localhost
    port: 8000
    service_name: nodetool-8000
    paths:
      workspace: /home/me/.nodetool-workspace
      hf_cache: /home/me/.cache/huggingface/hub
```

## Apply Flow

### Docker Process

1. **Directory Creation**: Ensures `workspace` and `hf_cache` directories exist.
2. **Image Check**: Verifies the configured image exists locally/remote. `deploy apply` does not auto-pull.
3. **Image Transfer**: For remote hosts, copies image to remote runtime if needed.
4. **Container Management**: Restarts container with new configuration.
5. **Health Check**: Verifies HTTP endpoint.

### SSH/Local Process

1. **Directory Creation**: Creates workspace and environment directories.
2. **Micromamba Setup**: Downloads and installs `micromamba` locally in the workspace if missing.
3. **Environment Creation**: Creates a Conda environment with system dependencies (ffmpeg, etc.).
4. **Package Installation**: Installs `nodetool-core` and `nodetool-base` using `uv`.
5. **Service Management**: Creates and enables a user-level `systemd` service (`nodetool-<name>.service`).
6. **Health Check**: Verifies HTTP endpoint.

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
nodetool deploy add local
```

Use these values (or your own):

- Deployment type: `docker`
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

You should see:

- `Type: DeploymentType.DOCKER`
- `Image: ghcr.io/nodetool-ai/nodetool:latest`
- `Workspace: $HOME/.nodetool-workspace`
- `HF Cache: $HOME/.cache/huggingface/hub`
- endpoint URL at `http://localhost:8000`

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

```bash
nodetool deploy status local
docker ps --filter name=nodetool --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
curl http://127.0.0.1:8000/health
```

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

### Docker Logs

```bash
ssh user@host "docker logs nodetool-server"
```

### Shell Logs

```bash
ssh user@host "journalctl --user -u nodetool-server-01 -f"
```
