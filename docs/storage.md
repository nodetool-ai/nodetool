---
layout: page
title: "Storage Guide"
---



NodeTool stores user assets, workflow artifacts, and temporary files through pluggable backends defined in `@nodetool-ai/storage` (`packages/storage/src/`). The active backend is selected per execution by the runtime context.

## Asset Storage Backends

| Backend | Module | When it is used | Notes |
|---------|--------|-----------------|-------|
| In-memory | `@nodetool-ai/storage` / `src/memory-storage.ts` | Tests | Keeps data in process-local dictionaries. |
| Local filesystem | `@nodetool-ai/storage` / `src/file-storage.ts` | Default for development when no cloud storage is configured | Stores assets under `Environment.get_asset_folder()` (defaults to `~/.config/nodetool/assets`). URLs are served via the API (`/storage/*`). |
| Supabase Storage | `@nodetool-ai/storage` / `src/supabase-storage.ts` | When `SUPABASE_URL` and `SUPABASE_KEY` are set | Uses a Supabase bucket for asset storage. Public buckets are recommended for direct URLs. |
| Amazon S3 / S3-compatible | `@nodetool-ai/storage` / `src/s3-storage.ts` | Production, or when `S3_ACCESS_KEY_ID` or `S3_SECRET_ACCESS_KEY` are provided | Requires `S3_*` environment variables and optional custom endpoint for MinIO/Wasabi. |

Passing `use_s3: true` when obtaining asset storage forces S3 even in development (useful for smoke tests).

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `ASSET_BUCKET` | Bucket name (S3) or Supabase Storage bucket name, or folder name (local). |
| `ASSET_DOMAIN` | Public domain serving assets (S3 only). Not used for Supabase. |
| `ASSET_TEMP_BUCKET` / `ASSET_TEMP_DOMAIN` | Optional separate bucket for temporary assets. |
| `FONT_PATH`, `COMFY_FOLDER`, `CHROMA_PATH` | Additional paths for specific nodes (registered in `@nodetool-ai/websocket` / `src/settings-api.ts`). |

For S3-compatible services, set:

- `S3_ENDPOINT_URL`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_REGION` (defaults to `us-east-1`)

## Temporary Storage

Temp storage returns a location for scratch files, mirroring asset storage:

- Memory storage in tests.
- Local filesystem under `~/.config/nodetool/temp`.
- Supabase bucket when `SUPABASE_URL`/`SUPABASE_KEY` and `ASSET_TEMP_BUCKET` are set.
- S3 bucket when configured.

## Supabase Storage

When `SUPABASE_URL` and `SUPABASE_KEY` are set, NodeTool prefers Supabase for asset and temp storage.

- Adapter: `SupabaseStorage` (`@nodetool-ai/storage` / `src/supabase-storage.ts`)
- Selection: handled by the runtime context when constructing storage backends
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

- `@nodetool-ai/storage` / `src/memory-node-cache.ts` -- in-process dictionary, default for development.
- `@nodetool-ai/storage` / `src/memory-uri-cache.ts` -- caches resolved asset URIs for quick lookup.

Memoisation is wired up inside `ProcessingContext` (`@nodetool-ai/runtime` / `src/context.ts`).

## Accessing Storage in Workflows

Workflows interact with storage through the `ProcessingContext` helper:

- `ProcessingContext.asset_url(key)` (`@nodetool-ai/runtime` / `src/context.ts`) -- returns a public URL for an asset.
- `ProcessingContext.download_asset(asset, stream)` (`@nodetool-ai/runtime` / `src/context.ts`) -- streams asset contents.
- NodeTool automatically mounts the asset folder into Docker and subprocess execution strategies so nodes can access assets on disk.

## Deployment Considerations

- For self-hosted deployments, mount persistent volumes for `/workspace` (workspace files) and the asset storage directory.  
- In Docker-based execution (`@nodetool-ai/deploy` / `src/docker-run.ts`), the workspace path is mounted into containers, so ensure the host directory exists and has the correct permissions.  
- When using S3, grant read/write access to the specified bucket and set `NODETOOL_STORAGE_PUBLIC_URL` (if exposing through a CDN).

## Troubleshooting

- **Missing asset URLs** – confirm `ASSET_DOMAIN` or `NODETOOL_API_URL` is set; the API uses these to build absolute URLs.
- **S3 authentication errors** – verify credentials and endpoint configuration in settings/secrets; run `nodetool settings show --secrets`.
- **Local file permissions** – ensure the configured asset folder is writable by the user running the service (especially in Docker).
- **Docker jobs cannot access assets** – mount the asset directory into the server container and ensure `Environment.get_asset_folder()` points to the mounted path.

## Related Documentation

- [Configuration Guide](configuration.md) – environment variable hierarchy and secret management.  
- [Deployment Guide](deployment.md) – configuring storage via `deployment.yaml`.  
- [Docker Resource Management](docker-resource-management.md) – limiting resource usage for storage-heavy jobs.
