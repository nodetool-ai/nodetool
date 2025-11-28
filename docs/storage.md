---
layout: page
title: "Storage Guide"
---



NodeTool stores user assets, workflow artifacts, and temporary files through pluggable backends defined in `src/nodetool/storage`. The active backend is selected per execution by `ResourceScope.get_asset_storage()` / `get_temp_storage()` (`src/nodetool/runtime/resources.py`), accessed via `require_scope()`.

## Asset Storage Backends

| Backend | Module | When it is used | Notes |
|---------|--------|-----------------|-------|
| In-memory | `src/nodetool/storage/memory_storage.py` | Tests (`Environment.is_test()`) | Keeps data in process-local dictionaries. |
| Local filesystem | `src/nodetool/storage/file_storage.py` | Default for development when no cloud storage is configured | Stores assets under `Environment.get_asset_folder()` (defaults to `~/.config/nodetool/assets`). URLs are served via the API (`/storage/*`). |
| Supabase Storage | `src/nodetool/storage/supabase_storage.py` | When `SUPABASE_URL` and `SUPABASE_KEY` are set | Uses a Supabase bucket for asset storage. Public buckets are recommended for direct URLs. |
| Amazon S3 / S3-compatible | `src/nodetool/storage/s3_storage.py` | Production, or when `S3_ACCESS_KEY_ID` or `S3_SECRET_ACCESS_KEY` are provided | Requires `S3_*` environment variables and optional custom endpoint for MinIO/Wasabi. |

`require_scope().get_asset_storage(use_s3=True)` forces S3 even in development (useful for smoke tests).

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `ASSET_BUCKET` | Bucket name (S3) or Supabase Storage bucket name, or folder name (local). |
| `ASSET_DOMAIN` | Public domain serving assets (S3 only). Not used for Supabase. |
| `ASSET_TEMP_BUCKET` / `ASSET_TEMP_DOMAIN` | Optional separate bucket for temporary assets. |
| `FONT_PATH`, `COMFY_FOLDER`, `CHROMA_PATH` | Additional paths for specific nodes (registered in `src/nodetool/config/settings.py:17`). |

For S3-compatible services, set:

- `S3_ENDPOINT_URL`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_REGION` (defaults to `us-east-1`)

## Temporary Storage

`require_scope().get_temp_storage()` returns a location for scratch files, mirroring asset storage:

- Memory storage in tests.
- Local filesystem under `~/.config/nodetool/temp`.
- Supabase bucket when `SUPABASE_URL`/`SUPABASE_KEY` and `ASSET_TEMP_BUCKET` are set.
- S3 bucket when configured.

## Supabase Storage

When `SUPABASE_URL` and `SUPABASE_KEY` are set, NodeTool prefers Supabase for asset and temp storage.

- Adapter: `SupabaseStorage` (`src/nodetool/storage/supabase_storage.py`)
- Selection: handled by `ResourceScope.get_asset_storage()` / `get_temp_storage()`
- Public URLs: `get_url(key)` returns a public URL. Use a public bucket or add a CDN edge.
- Private buckets: you can extend the adapter to use signed URLs (Supabase’s `create_signed_url`).

Minimum configuration:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
ASSET_BUCKET=assets
# Optional temp bucket used by get_temp_storage
ASSET_TEMP_BUCKET=assets-temp
```

Recommendations:

- Create the buckets (`assets`, `assets-temp`) in the Supabase dashboard.
- Make them public to allow direct links via `get_url`. For private buckets, add a signing step.
- Scope the service role key to server-side environments only. Do not expose it to browsers.

Use the temporary storage for intermediate files that do not need long-term retention.

## Node and Workflow Caches

NodeTool caches expensive node outputs and metadata to accelerate repeated executions:

- `src/nodetool/storage/memory_node_cache.py` – in-process dictionary, default for development.
- `src/nodetool/storage/memcache_node_cache.py` – connects to Memcached when `MEMCACHE_HOST` / `MEMCACHE_PORT` are set.
- `src/nodetool/storage/memory_uri_cache.py` – caches resolved asset URIs for quick lookup.

Memoisation is controlled by `Environment.get_node_cache()` inside `ProcessingContext` (`src/nodetool/workflows/processing_context.py:1433`).

## Accessing Storage in Workflows

Workflows interact with storage through the `ProcessingContext` helper:

- `ProcessingContext.asset_url(key)` (`src/nodetool/workflows/processing_context.py:455`) – returns a public URL for an asset.
- `ProcessingContext.download_asset(asset, stream)` (`src/nodetool/workflows/processing_context.py:815`) – streams asset contents.
- NodeTool automatically mounts the asset folder into Docker and subprocess execution strategies so nodes can access assets on disk.

## Deployment Considerations

- For self-hosted deployments, mount persistent volumes for `/workspace` (workspace files) and the asset storage directory.  
- In Docker-based execution (`src/nodetool/workflows/docker_job_execution.py:125`), the workspace path is mounted into containers, so ensure the host directory exists and has the correct permissions.  
- When using S3, grant read/write access to the specified bucket and set `NODETOOL_STORAGE_PUBLIC_URL` (if exposing through a CDN).

## Troubleshooting

- **Missing asset URLs** – confirm `ASSET_DOMAIN` or `NODETOOL_API_URL` is set; the API uses these to build absolute URLs.
- **S3 authentication errors** – verify credentials and endpoint configuration in settings/secrets; run `nodetool settings show --secrets`.
- **Local file permissions** – ensure the configured asset folder is writable by the user running the service (especially in Docker).
- **Docker jobs cannot access assets** – mount the asset directory into the worker container and ensure `Environment.get_asset_folder()` points to the mounted path.

## Related Documentation

- [Configuration Guide](configuration.md) – environment variable hierarchy and secret management.  
- [Deployment Guide](deployment.md) – configuring storage via `deployment.yaml`.  
- [Docker Resource Management](docker-resource-management.md) – limiting resource usage for storage-heavy jobs.
