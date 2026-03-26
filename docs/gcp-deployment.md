---
layout: page
title: "Google Cloud Run Deployment"
description: "Deploy NodeTool workflows to Google Cloud Run for scalable, serverless execution."
---

Deploy NodeTool to Google Cloud Run for scalable, serverless workflow execution. Cloud Run automatically scales instances based on demand and you only pay for actual compute time.

---

## Prerequisites

Before deploying, ensure you have:

- **Google Cloud SDK** (`gcloud`) installed and authenticated
- **Docker** installed for building container images
- A **Google Cloud project** with billing enabled
- The following APIs enabled in your project:
  - Cloud Run API
  - Artifact Registry API (or Container Registry)
  - Cloud Build API (if using remote builds)

### Enable Required APIs

```bash
gcloud services enable run.googleapis.com
gcloud services enable artifactregistry.googleapis.com
gcloud services enable cloudbuild.googleapis.com
```

### Authenticate

```bash
gcloud auth login
gcloud auth configure-docker
```

Set your project:
```bash
gcloud config set project YOUR_PROJECT_ID
```

Or use the environment variable:
```bash
export GOOGLE_CLOUD_PROJECT=your-project-id
```

---

## Quick Start

```bash
# 1. Authenticate with Google Cloud
gcloud auth login

# 2. Create a GCP deployment target
nodetool deploy add my-gcp --type gcp

# 3. Edit deployment.yaml to configure your settings (see below)

# 4. Deploy
nodetool deploy apply my-gcp
```

---

## Configuration

The GCP deployment target supports these configuration fields in `deployment.yaml`:

### Service Settings

| Field | Description | Default |
|-------|-------------|---------|
| `service_name` | Cloud Run service name (max 63 chars, alphanumeric + hyphens) | `nodetool` |
| `region` | GCP region (e.g., `us-central1`, `europe-west1`) | `us-central1` |
| `registry` | Artifact Registry URL (auto-inferred from region if omitted) | -- |

### Compute Resources

| Field | Description | Default |
|-------|-------------|---------|
| `cpu` | CPU allocation (e.g., `2`, `4`, `8`) | `2` |
| `memory` | Memory allocation (e.g., `4Gi`, `8Gi`, `16Gi`) | `4Gi` |
| `gpu_type` | GPU type (e.g., `nvidia-l4`) | -- |
| `gpu_count` | Number of GPUs | `0` |

### Scaling

| Field | Description | Default |
|-------|-------------|---------|
| `min_instances` | Minimum running instances (0 = scale to zero) | `0` |
| `max_instances` | Maximum instances for autoscaling | `10` |
| `concurrency` | Max concurrent requests per instance | `80` |
| `timeout` | Request timeout in seconds | `300` |

### Security

| Field | Description | Default |
|-------|-------------|---------|
| `service_account` | GCP service account email | -- |
| `allow_unauthenticated` | Allow public access without auth | `false` |

### Storage

| Field | Description | Default |
|-------|-------------|---------|
| `gcs_bucket` | Google Cloud Storage bucket for assets | -- |
| `gcs_mount_path` | Mount path for GCS bucket in the container | -- |

### Environment Variables

Add provider API keys and configuration via the `env` section:

```yaml
type: gcp
service_name: nodetool-prod
region: us-central1
cpu: 4
memory: 8Gi
min_instances: 1
max_instances: 5
env:
  AUTH_PROVIDER: supabase
  SUPABASE_URL: https://your-project.supabase.co
  SUPABASE_KEY: your-service-role-key
  OPENAI_API_KEY: sk-...
```

---

## Operational Commands

```bash
# View deployment status
nodetool deploy status my-gcp

# Stream logs from running service
nodetool deploy logs my-gcp

# Preview changes without deploying
nodetool deploy plan my-gcp

# View current configuration
nodetool deploy show my-gcp

# Tear down the deployment
nodetool deploy destroy my-gcp
```

---

## GPU Workflows on Cloud Run

Cloud Run supports GPU workloads for AI-intensive workflows:

1. Request GPU access for your GCP project (may require quota increase)
2. Configure GPU in your deployment:
   ```yaml
   gpu_type: nvidia-l4
   gpu_count: 1
   memory: 16Gi
   ```
3. Deploy: `nodetool deploy apply my-gcp`

GPU instances have higher costs and may have limited region availability. Check [Cloud Run GPU pricing](https://cloud.google.com/run/pricing) for current rates.

---

## Troubleshooting

### Common Issues

**"Permission denied" errors**
- Ensure your account has the `Cloud Run Admin` and `Artifact Registry Writer` roles
- Check that all required APIs are enabled

**Image push failures**
- Run `gcloud auth configure-docker` to set up Docker authentication
- Verify Artifact Registry is enabled in your project

**Service won't start**
- Check logs: `nodetool deploy logs my-gcp`
- Verify environment variables are set correctly
- Ensure the container image builds successfully locally first

**Cold start latency**
- Set `min_instances: 1` to keep at least one instance warm
- Use smaller container images when possible

---

## Related

- [Deployment Guide](deployment.md) -- Overview of all deployment options
- [Self-Hosted Deployment](self-hosted-deployment.md) -- Deploy on your own servers
- [Supabase Integration](supabase-deployment.md) -- Add authentication and storage
- [Security Hardening](security-hardening.md) -- Production security checklist
- [CLI Reference](cli.md) -- Full CLI command documentation
