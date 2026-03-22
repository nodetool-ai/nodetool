---
layout: page
title: "Google Cloud Run Deployment"
---

`src/nodetool/deploy/deploy_to_gcp.py` and `src/nodetool/deploy/google_cloud_run_api.py` manage Cloud Run deployment:

1. Validate gcloud authentication, project, and APIs
2. Build and push the image to Artifact Registry or GCR
3. Deploy/update the Cloud Run service

## Requirements

- Docker and Google Cloud SDK (`gcloud`) authenticated
- `GOOGLE_CLOUD_PROJECT` (optional `GOOGLE_APPLICATION_CREDENTIALS`)
- Enabled APIs: Cloud Run, Artifact Registry or GCR, Cloud Build (if used)

## Quick Start

```bash
gcloud auth login
nodetool deploy add my-gcp --type gcp
nodetool deploy apply my-gcp
```

## Key Configuration Fields

- `service_name`, `region`, `registry`
- `cpu`, `memory`, `gpu_type`, `gpu_count`
- `min_instances`, `max_instances`, `concurrency`, `timeout`
- `service_account`
- `gcs_bucket`, `gcs_mount_path`
- `allow_unauthenticated`

## Operational Commands

```bash
nodetool deploy status my-gcp
nodetool deploy logs my-gcp
nodetool deploy destroy my-gcp
```

## Related

- [Deployment Guide](deployment.md)
- [CLI Reference](cli.md)
