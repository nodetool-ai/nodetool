---
layout: page
title: "Deployment Guide"
---



NodeTool supports multiple deployment targets driven by a single `deployment.yaml` configuration. The `nodetool deploy` command family builds container images, applies configuration, and manages the lifecycle of remote services across self-hosted hosts, RunPod serverless, Modal, and Google Cloud Run.

---

## Quick Reference: What Do You Want to Do?

| I want to... | What you need |
|--------------|---------------|
| **Run NodeTool on my own server** | → [Self-Hosted Deployment](#self-hosted-deployments) with proxy |
| **Deploy to RunPod for GPU access** | → [RunPod Deployment](#runpod-deployments) with Docker + RunPod API key |
| **Deploy to Modal for serverless GPU** | → [Modal Deployment](#modal-deployments) with Modal account + CLI |
| **Deploy to Google Cloud Run** | → [GCP Deployment](#google-cloud-run-deployments) with gcloud CLI |
| **Use Supabase for auth/storage** | → [Supabase Integration](#using-supabase) |
| **Set up TLS/HTTPS** | → See [Self-Hosted](#self-hosted-deployments) or [Proxy Reference](proxy.md) |
| **Configure environment variables** | → [Deployment Configuration](#deployment-configuration) |

---

## Common Deployment Goals

### I want to deploy NodeTool to my own server

1. **Set up your configuration** — create a `deployment.yaml`:
   ```bash
   nodetool deploy init
   nodetool deploy add my-server --type self-hosted
   ```
2. **Configure host details** — edit `~/.config/nodetool/deployment.yaml` with your host, SSH user, and image settings
3. **Build and deploy**:
   ```bash
   nodetool deploy apply my-server
   ```
4. **Verify**: `nodetool deploy status my-server`

See [Self-Hosted Deployments](#self-hosted-deployments) for full details.

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

See [RunPod Deployments](#runpod-deployments) for full details.

### I want to deploy to Modal for serverless GPU

1. **Install Modal CLI** and authenticate:
   ```bash
   pip install modal
   modal token new
   ```
2. **Set up deployment**:
   ```bash
   nodetool deploy add my-modal --type modal
   ```
3. **Configure GPU and scaling** in `deployment.yaml` (`gpu`, `min_containers`, `max_containers`)
4. **Deploy**:
   ```bash
   nodetool deploy apply my-modal
   ```

See [Modal Deployments](#modal-deployments) for full details.

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

See [GCP Deployments](#google-cloud-run-deployments) for full details.

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

See [Using Supabase](#using-supabase) for full details.

---

## Deployment Workflow

1. **Initialize configuration**  

   ```bash
   nodetool deploy init
   nodetool deploy add <name>
   ```  

   These commands scaffold `deployment.yaml` using the schema defined in `src/nodetool/config/deployment.py`. Each entry specifies a `type` (`self-hosted`, `runpod`, `modal`, or `gcp`), container image details, environment variables, and target-specific options.

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

`deployment.yaml` accepts the following top-level keys (see `SelfHostedDeployment`, `RunPodDeployment`, `ModalDeployment`, and `GCPDeployment` in `src/nodetool/config/deployment.py`):

- `type` – target platform (`self-hosted`, `runpod`, `modal`, `gcp`)
- `image` – container image name/tag/registry
- `paths` – persistent storage paths (self-hosted)
- `container` – port, workflows, GPU configuration (self-hosted)
- `proxy` – proxy services (`self-hosted`; see the [Proxy Reference](proxy.md))
- `runpod` / `modal` / `gcp` – provider specific compute, region, scaling and credential options
- `env` – environment variables injected into the deployed containers

Store secrets (API keys, tokens) in `secrets.yaml` or environment variables; the deployer merges them at runtime without writing them to disk.

## RunPod Deployments

The RunPod deployer (`src/nodetool/deploy/deploy_to_runpod.py`) builds an AMD64 Docker image, pushes it to your registry, and optionally creates RunPod templates/endpoints through GraphQL.

**Requirements**

- Docker (with Buildx for multi-arch builds) and registry credentials  
- `RUNPOD_API_KEY` in the environment  
- Optional: tuned GPU constraints (`gpu_types`, `gpu_count`, `idle_timeout`, etc.)

**Key configuration fields**

- `template_id` / `endpoint_id` – existing resources to update (or leave empty to create)  
- `compute_type`, `gpu_types`, `gpu_count` – choose CPU/GPU fleets  
- `workers_min` / `workers_max` – autoscaling bounds  
- `env` – runtime settings exposed to the container

**CLI shortcuts**

- `nodetool deploy apply <name>` – orchestrates build → push → template/endpoint updates  
- `nodetool deploy logs <name>` – streams RunPod logs (requires endpoint ID in deployment state)  
- `nodetool deploy destroy <name>` – tears down templates/endpoints (leaves images untouched)

## Modal Deployments

The Modal deployer (`src/nodetool/deploy/deploy_to_modal.py`) uses Modal's Python SDK to deploy NodeTool as a serverless function with GPU support. Modal provides instant cold starts, automatic scaling, and built-in secrets management.

**Requirements**

- Modal CLI installed and authenticated (`pip install modal && modal token new`)
- Modal account at [modal.com](https://modal.com)
- Optional: Modal workspace for team deployments

**Key configuration fields**

- `app_name` – Modal application name (defaults to deployment name)
- `gpu` – GPU type (`t4`, `l4`, `a10g`, `a100-40gb`, `a100-80gb`, `h100`, or `any`)
- `gpu_count` – number of GPUs per container (1-8 depending on GPU type)
- `cpu` – CPU cores per container (default: 2.0)
- `memory` – memory in MB per container (default: 4096)
- `min_containers` – minimum warm containers (default: 0 for scale-to-zero)
- `max_containers` – maximum concurrent containers (default: 10)
- `timeout` – function timeout in seconds (default: 300)
- `container_idle_timeout` – seconds before idle container shutdown (default: 60)
- `env` – environment variables (use Modal secrets for sensitive values)

**Example configuration**

```yaml
my-modal:
  type: modal
  app_name: nodetool-gpu
  gpu: a10g
  gpu_count: 1
  cpu: 4.0
  memory: 16384
  min_containers: 0
  max_containers: 5
  timeout: 600
  container_idle_timeout: 120
  env:
    AUTH_PROVIDER: static
    WORKER_AUTH_TOKEN: "{{MODAL_SECRET:worker-token}}"
```

**CLI commands**

- `nodetool deploy apply <name>` – deploys or updates the Modal application
- `nodetool deploy status <name>` – shows the Modal app URL and container status
- `nodetool deploy logs <name> [--follow]` – streams Modal function logs
- `nodetool deploy destroy <name>` – stops and removes the Modal application

**Modal secrets**

Store sensitive values using Modal's built-in secrets management:

```bash
modal secret create worker-token WORKER_AUTH_TOKEN=your-token-here
```

Reference secrets in your configuration using `{{MODAL_SECRET:secret-name}}` syntax.

**GPU selection guide**

| GPU Type | VRAM | Best For |
|----------|------|----------|
| `t4` | 16GB | Development, inference |
| `l4` | 24GB | Balanced performance |
| `a10g` | 24GB | Production inference |
| `a100-40gb` | 40GB | Large models, training |
| `a100-80gb` | 80GB | Very large models |
| `h100` | 80GB | Maximum performance |

See [Modal Testing Guide](modal_testing_guide.md) for testing your Modal deployments.

## Google Cloud Run Deployments

`src/nodetool/deploy/deploy_to_gcp.py` and `google_cloud_run_api.py` manage the Cloud Run flow:

1. Validate gcloud authentication, project, and enabled APIs  
2. Build/push the container to Artifact Registry or GCR  
3. Deploy or update the Cloud Run service

**Requirements**

- Docker and Google Cloud SDK (`gcloud`) authenticated  
- `GOOGLE_CLOUD_PROJECT` (and optionally `GOOGLE_APPLICATION_CREDENTIALS`)  
- Enabled services: Cloud Run, Artifact Registry or Container Registry, Cloud Build (if used)

**Key configuration fields**

- `service_name`, `region`, `registry` – Cloud Run identifiers  
- `cpu`, `memory`, `gpu_type`, `gpu_count` – resource allocation  
- `min_instances`, `max_instances`, `concurrency`, `timeout` – scaling behavior  
- `service_account` – runtime identity (required for private resources)  
- `gcs_bucket` / `gcs_mount_path` – attach Cloud Storage volumes if needed  
- `allow_unauthenticated` – set to true for public endpoints (omit to require IAM auth)

**Operational commands**

- `nodetool deploy status <name>` – shows the current Cloud Run URL and revision  
- `nodetool deploy logs <name>` – tails Cloud Run logs via `gcloud`  
- `nodetool deploy destroy <name>` – deletes the Cloud Run service

## Self-Hosted Deployments

Self-hosted targets pair a NodeTool worker container with the Docker-aware proxy described in [Self-Hosted Deployment](self_hosted.md) and [Proxy Reference](proxy.md). Deployment state tracks the running container ID, generated bearer tokens, and hashed proxy configuration to avoid redundant restarts.

**Quick checklist**

- Populate `host`, `ssh.user`, and image fields in `deployment.yaml`  
- Configure proxy services (port 80/443 by default) with TLS certificates or ACME settings  
- Mount persistent volumes (workspace, caches) through the `services[].volumes` map  
- Provide `worker_auth_token` or let the proxy generate one on first deploy

Apply with `nodetool deploy apply <name>`; the deployer copies proxy files, restarts containers when configuration changes, and runs health checks before reporting success.

## Using Supabase

Supabase can provide both authentication and object storage in your deployment.

1) Configure environment variables in your deployment target:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
ASSET_BUCKET=assets
# Optional for temporary assets
ASSET_TEMP_BUCKET=assets-temp

# Select authentication provider (none|local|static|supabase)
AUTH_PROVIDER=supabase
```

2) Create the buckets in Supabase Storage (e.g. `assets`, `assets-temp`).

- For direct public URLs, set the buckets to public in the Supabase dashboard.
- For private buckets, extend the adapter to sign URLs or front with a proxy that performs signing.

3) Deploy and verify:

- Logs should show “Using Supabase storage for asset storage”.
- Run a workflow that saves an image/dataframe and confirm links resolve under `…/storage/v1/object/public/<bucket>/…`.
- If using Supabase auth (`AUTH_PROVIDER=supabase`), send `Authorization: Bearer <supabase_jwt>`.

Notes:

- If S3 variables are set alongside Supabase, NodeTool prefers Supabase when `SUPABASE_URL`/`SUPABASE_KEY` are present.
- For local development without Supabase/S3, NodeTool uses the filesystem backend.

## Related Documentation

- [Self-Hosted Deployment](self_hosted.md) – proxy architecture and container layout  
- [Proxy Reference](proxy.md) – on-demand routing, TLS, and command usage  
- [CLI Reference](cli.md) – command summaries  
- [Configuration Guide](configuration.md) – environment, settings, and secret management  
- [Storage Guide](storage.md) – persistent storage options for deployments
- [RunPod Testing Guide](runpod_testing_guide.md) – testing RunPod deployments
- [Modal Testing Guide](modal_testing_guide.md) – testing Modal deployments
