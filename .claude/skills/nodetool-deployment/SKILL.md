---
name: nodetool-deployment
description: Deploy NodeTool servers using Docker, SSH, RunPod, GCP, or Supabase. Use when user asks to deploy, host, set up a server, configure Docker, use RunPod/GCP/Supabase, manage deployment.yaml, or configure environment variables for production.
---

You help users deploy NodeTool to various environments. Choose the right deployment type based on requirements.

# Decision Tree

```
Need GPU? ──yes──→ Own hardware? ──yes──→ Self-Hosted (Docker/SSH)
    │                    │
    no                   no──→ RunPod (serverless GPU)
    │
    ├── Need auth/storage? ──yes──→ Supabase + any deployment
    │
    └── Just API server? ──→ GCP Cloud Run or Self-Hosted
```

# Deployment Modes

| Mode | Auth | Use Case |
|------|------|----------|
| `desktop` | `local` | Local development, Electron app |
| `private` | `static` | Team/personal server, single token |
| `public` | `supabase` | Multi-user, full auth/storage |

# Quick Start

```bash
nodetool deploy init              # Create deployment.yaml
nodetool deploy add <name>        # Add a deployment
nodetool deploy list              # List deployments
nodetool deploy show <name>       # Show config
nodetool deploy plan <name>       # Preview changes
nodetool deploy apply <name>      # Deploy
nodetool deploy status <name>     # Check status
nodetool deploy logs <name>       # View logs
nodetool deploy destroy <name>    # Tear down
```

# Environment Variables (All Deployments)

```bash
# Required
ENV=production
NODETOOL_SERVER_MODE=private      # desktop | private | public

# Auth (pick one)
AUTH_PROVIDER=static              # none | local | static | supabase
SERVER_AUTH_TOKEN=<token>         # for static auth

# Security
SECRETS_MASTER_KEY=<strong-random-key>
ADMIN_TOKEN=<admin-token>

# Database
DB_PATH=/workspace/nodetool.sqlite3

# API Keys (as needed)
OPENAI_API_KEY=<key>
ANTHROPIC_API_KEY=<key>
GEMINI_API_KEY=<key>
HF_TOKEN=<token>
FAL_API_KEY=<key>
OLLAMA_API_URL=http://localhost:11434
```

# Self-Hosted: Docker

## deployment.yaml
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
      gpu: "0"                    # GPU device ID, or omit
    paths:
      workspace: /data/nodetool
      hf_cache: /data/hf-cache
    image:
      name: ghcr.io/nodetool-ai/nodetool
      tag: latest
```

## Docker Run (manual)
```bash
docker run --gpus all --memory 8g --cpus 4 \
  -p 7777:7777 \
  -e ENV=production \
  -e NODETOOL_SERVER_MODE=private \
  -e AUTH_PROVIDER=static \
  -e SERVER_AUTH_TOKEN=<token> \
  -e SECRETS_MASTER_KEY=<secret> \
  -v $(pwd)/workspace:/workspace \
  -v $(pwd)/hf-cache:/hf-cache:ro \
  -e HF_HOME=/hf-cache \
  nodetool:latest
```

## Resource Limits
```yaml
# Docker Compose
services:
  nodetool:
    mem_limit: 8g
    cpus: 4
    deploy:
      resources:
        reservations:
          devices:
            - capabilities: [gpu]
```

# Self-Hosted: SSH

```yaml
deployments:
  my-ssh:
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

# Self-Hosted: Local

```yaml
deployments:
  my-local:
    type: local
    host: localhost
    port: 8000
    paths:
      workspace: /home/me/.nodetool-workspace
      hf_cache: /home/me/.cache/huggingface/hub
```

# RunPod (Serverless GPU)

```bash
export RUNPOD_API_KEY="your-key"
nodetool deploy add my-runpod --type runpod
nodetool deploy apply my-runpod
```

Config fields: `template_id`, `endpoint_id`, `compute_type`, `gpu_types`, `gpu_count`, `workers_min`, `workers_max`, `env`

# GCP Cloud Run

```bash
gcloud auth login
nodetool deploy add my-gcp --type gcp
nodetool deploy apply my-gcp
```

Config fields: `service_name`, `region`, `registry`, `cpu`, `memory`, `gpu_type`, `gpu_count`, `min_instances`, `max_instances`, `concurrency`, `timeout`

# Supabase Integration

```bash
# Environment variables
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
ASSET_BUCKET=assets
ASSET_TEMP_BUCKET=assets-temp
AUTH_PROVIDER=supabase
```

**Setup steps:**
1. Create Supabase project
2. Create storage buckets: `assets`, `assets-temp`
3. Set bucket policies (public or signed URLs)
4. Copy service-role key (not anon key)
5. Set environment variables

# Server Startup

```bash
# Development
nodetool serve --host 127.0.0.1 --port 7777

# Production
nodetool serve --host 0.0.0.0 --port 7777

# Custom port
nodetool serve --port 8080

# With TypeScript build
npm run build:packages && npm run dev:server
# Or directly:
PORT=7777 HOST=0.0.0.0 node packages/websocket/dist/server.js
```

# Workflow Sync

```bash
nodetool deploy workflows sync <deployment> <workflow-id>
nodetool deploy workflows list <deployment>
nodetool deploy workflows run <deployment> <workflow-id>
```

# Production Checklist

- [ ] Set `ENV=production`
- [ ] Set strong `SECRETS_MASTER_KEY`
- [ ] Set `ADMIN_TOKEN`
- [ ] Configure `AUTH_PROVIDER` (never `none` in prod)
- [ ] Set appropriate `SERVER_AUTH_TOKEN` if using static auth
- [ ] Configure API keys for needed providers
- [ ] Set resource limits (memory, CPU, GPU)
- [ ] Mount persistent volumes for workspace and model cache
- [ ] Set up health monitoring (`GET /health`)
- [ ] Configure logging (`LOG_LEVEL=INFO`)
- [ ] Set up backups for `DB_PATH`

# Common Pitfalls

- **Using anon key for Supabase**: Use service-role key, not anon key
- **No persistent volume**: Data lost on container restart without `-v` mount
- **Port conflicts**: Check nothing else runs on 7777
- **Missing SECRETS_MASTER_KEY**: Required for encrypted secret storage in prod
- **AUTH_PROVIDER=none in production**: Security risk, always use static or supabase
- **HF cache not mounted**: Models re-download on every container start
