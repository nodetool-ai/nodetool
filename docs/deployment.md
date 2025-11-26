---
layout: page
title: "Deployment Guide"
---



NodeTool supports multiple deployment targets driven by a single `deployment.yaml` configuration. The `nodetool deploy` command family builds container images, applies configuration, and manages the lifecycle of remote services across self-hosted hosts, RunPod serverless, and Google Cloud Run.

## Deployment Workflow

1. **Initialize configuration**  

   ```bash
   nodetool deploy init
   nodetool deploy add <name>
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
