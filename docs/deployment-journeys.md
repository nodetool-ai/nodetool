---
layout: page
title: "Deployment Journeys"
---



This page provides step-by-step walkthroughs for common deployment goals. For reference material, see the [Deployment Guide](deployment.md), [Self-Hosted Deployment](self_hosted.md), and [Proxy Reference](proxy.md).

---

## What Do You Want to Do?

| Goal | Jump to |
|------|---------|
| Host NodeTool on my own server with a proxy | [I want to self-host NodeTool](#i-want-to-self-host-nodetool-with-a-proxy) |
| Run workflows on RunPod GPUs | [I want to run on RunPod](#i-want-to-run-workflows-on-runpod-gpus) |
| Run workflows on Modal serverless GPUs | [I want to run on Modal](#i-want-to-run-workflows-on-modal-serverless-gpus) |
| Deploy to Google Cloud Run | [I want to deploy to Cloud Run](#i-want-to-deploy-to-google-cloud-run) |
| Secure my deployment with TLS | See self-hosted section, step 4 |
| Run a workflow via API | See any section, final step |

---

## I want to self-host NodeTool with a proxy

**Goal:** Run NodeTool on your own server with authentication and TLS.

**Requirements:**
- A server with SSH access
- Docker installed on the server
- A domain name (optional but recommended for TLS)

**Steps:**

### 1. Clone and install

```bash
git clone https://github.com/nodetool-ai/nodetool-core.git
cd nodetool-core
pip install -e .
pip install -r requirements-dev.txt
```

### 2. Configure environment

```bash
cp .env.example .env.development.local
echo "AUTH_PROVIDER=static" >> .env.development.local
echo "WORKER_AUTH_TOKEN=$(openssl rand -base64 32)" >> .env.development.local
```

### 3. Start services

```bash
nodetool serve --reload
```

### 4. Add proxy (TLS + auth)

- Terminate TLS at your proxy (nginx/traefik); forward to `127.0.0.1:8000`.
- Expose `/health` and `/ping` without auth; require Bearer tokens elsewhere.

### 5. Verify health

```bash
curl https://your-domain/health
curl -H "Authorization: Bearer $WORKER_AUTH_TOKEN" https://your-domain/v1/models
```

### 6. Run a workflow remotely

```bash
curl -H "Authorization: Bearer $WORKER_AUTH_TOKEN" \
  -X POST https://your-domain/api/workflows/<workflow_id>/run?stream=true \
  -d '{"params":{}}'
```

**Next steps:** See [Self-Hosted Deployment](self_hosted.md) for proxy configuration details and [Security Hardening](security-hardening.md) for production best practices.

---

## I want to run workflows on RunPod GPUs

**Goal:** Deploy NodeTool to RunPod for serverless GPU-accelerated workflow execution.

**Requirements:**
- A RunPod account with API key
- Docker (with Buildx for multi-arch builds)
- Container registry access (Docker Hub, etc.)

**Steps:**

### 1. Package and upload

Create an image or use the provided RunPod template (see `docker/`).

### 2. Set secrets

In the RunPod console, set:
- `WORKER_AUTH_TOKEN` — your authentication token
- `AUTH_PROVIDER=static`
- Any provider API keys you need (OpenAI, Anthropic, etc.)

### 3. Deploy endpoint

Create the endpoint in RunPod. Note the endpoint ID and base URL.

### 4. Verify health

```bash
curl https://api.runpod.ai/v2/<endpoint>/health
```

### 5. List models and chat

```bash
curl -H "Authorization: Bearer $RUNPOD_API_KEY" https://api.runpod.ai/v2/<endpoint>/v1/models

curl -H "Authorization: Bearer $RUNPOD_API_KEY" \
  -H "Content-Type: application/json" \
  -X POST https://api.runpod.ai/v2/<endpoint>/v1/chat/completions \
  -d '{"model":"gpt-oss:20b","messages":[{"role":"user","content":"hi"}],"stream":true}'
```

### 6. Run a workflow

```bash
curl -H "Authorization: Bearer $RUNPOD_API_KEY" \
  -X POST "https://api.runpod.ai/v2/<endpoint>/api/workflows/<workflow_id>/run?stream=true" \
  -d '{"params":{}}'
```

**Next steps:** See [RunPod Testing Guide](runpod_testing_guide.md) for testing workflows and the [Deployment Guide](deployment.md#runpod-deployments) for configuration options.

---

## I want to run workflows on Modal serverless GPUs

**Goal:** Deploy NodeTool to Modal for serverless GPU-accelerated workflow execution with fast cold starts and automatic scaling.

**Requirements:**
- A Modal account at [modal.com](https://modal.com)
- Modal CLI installed (`pip install modal`)
- Python 3.10+ environment

**Steps:**

### 1. Install and authenticate Modal CLI

```bash
pip install modal
modal token new
```

This opens a browser window to authenticate with your Modal account.

### 2. Create deployment configuration

```bash
nodetool deploy init
nodetool deploy add my-modal --type modal
```

### 3. Configure GPU and scaling

Edit `~/.config/nodetool/deployment.yaml`:

```yaml
my-modal:
  type: modal
  app_name: nodetool-workflows
  gpu: a10g
  gpu_count: 1
  cpu: 4.0
  memory: 16384
  min_containers: 0
  max_containers: 5
  timeout: 600
  env:
    AUTH_PROVIDER: static
```

### 4. Set up secrets

Store sensitive values using Modal's secrets:

```bash
modal secret create nodetool-secrets \
  WORKER_AUTH_TOKEN=$(openssl rand -base64 32) \
  OPENAI_API_KEY=your-key \
  ANTHROPIC_API_KEY=your-key
```

### 5. Deploy

```bash
nodetool deploy apply my-modal
```

### 6. Verify health

```bash
# Get the deployment URL
nodetool deploy status my-modal

# Check health endpoint
curl https://<your-modal-app>.modal.run/health
```

### 7. Run a workflow

```bash
curl -H "Authorization: Bearer $WORKER_AUTH_TOKEN" \
  -X POST "https://<your-modal-app>.modal.run/api/workflows/<workflow_id>/run?stream=true" \
  -d '{"params":{}}'
```

**Next steps:** See [Modal Testing Guide](modal_testing_guide.md) for testing workflows and the [Deployment Guide](deployment.md#modal-deployments) for configuration options.

---

## I want to deploy to Google Cloud Run

**Goal:** Deploy NodeTool to Google Cloud Run for serverless execution with autoscaling.

**Requirements:**
- Google Cloud account with billing enabled
- `gcloud` CLI installed and authenticated
- Enabled APIs: Cloud Run, Artifact Registry or Container Registry

**Steps:**

### 1. Build image

```bash
gcloud builds submit --tag gcr.io/<project>/nodetool:latest .
```

### 2. Deploy

```bash
gcloud run deploy nodetool \
  --image gcr.io/<project>/nodetool:latest \
  --allow-unauthenticated=false \
  --port 8000 \
  --set-env-vars AUTH_PROVIDER=static,WORKER_AUTH_TOKEN=$(openssl rand -base64 32)
```

### 3. Set secrets

- Store provider keys (OpenAI, Anthropic, etc.) in Secret Manager and mount as env vars.
- Disable terminal WebSocket: `NODETOOL_ENABLE_TERMINAL_WS=` (set to empty string).

### 4. Verify

```bash
curl https://<service-url>/health
curl -H "Authorization: Bearer $WORKER_AUTH_TOKEN" https://<service-url>/v1/models
```

### 5. Run a workflow

```bash
curl -H "Authorization: Bearer $WORKER_AUTH_TOKEN" \
  -X POST "https://<service-url>/api/workflows/<workflow_id>/run?stream=true" \
  -d '{"params":{}}'
```

**Next steps:** See the [Deployment Guide](deployment.md#google-cloud-run-deployments) for detailed GCP configuration options.

---

## Related Guides

- [Deployment Guide](deployment.md) — CLI commands and `deployment.yaml` reference
- [Self-Hosted Deployment](self_hosted.md) — proxy architecture and Docker configuration
- [Security Hardening](security-hardening.md) — production security checklist
- [Proxy Reference](proxy.md) — proxy configuration fields and TLS setup
- [RunPod Testing Guide](runpod_testing_guide.md) — testing RunPod deployments
- [Modal Testing Guide](modal_testing_guide.md) — testing Modal deployments
- [CLI Reference](cli.md) — all CLI commands
