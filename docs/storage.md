---
layout: page
title: "Storage Guide"
description: "How NodeTool stores assets, workflow artifacts, and temporary files through pluggable backends (in-memory, local disk, S3)."
---



NodeTool stores user assets, workflow artifacts, and temporary files through pluggable backends defined in `@nodetool-ai/storage` (`packages/storage/src/`). The active backend is selected per execution by the runtime context.

## Asset Storage Backends

| Backend | Module | When it is used | Notes |
|---------|--------|-----------------|-------|
| In-memory | `@nodetool-ai/storage` / `src/memory-storage.ts` | Tests | Keeps data in process-local dictionaries. Not selectable through configuration. |
| Local filesystem | `@nodetool-ai/storage` / `src/file-storage.ts` | Default (`NODETOOL_STORAGE_BACKEND` unset or `file`) | Stores assets under `getDefaultAssetsPath()` (`@nodetool-ai/config` / `src/paths.ts`), which defaults to `~/.local/share/nodetool/assets` (XDG; `%APPDATA%\nodetool\assets` on Windows). Override with `ASSET_FOLDER` or `STORAGE_PATH`. URLs are served via the API (`/api/storage/*`). |
| Supabase Storage | `@nodetool-ai/storage` / `src/supabase-storage.ts` | `NODETOOL_STORAGE_BACKEND=supabase` | Uses a Supabase bucket for asset storage. |
| Amazon S3 / S3-compatible | `@nodetool-ai/storage` / `src/s3-storage.ts` | `NODETOOL_STORAGE_BACKEND=s3` | Optional custom endpoint for MinIO/Wasabi. |

The backend is chosen once by `NODETOOL_STORAGE_BACKEND` (`loadAssetStorageConfig()` / `loadTempStorageConfig()` in `@nodetool-ai/config` / `src/storage-config.ts`); assets and temp files always use the same backend, with different buckets.

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `NODETOOL_STORAGE_BACKEND` | `file`, `s3`, or `supabase`. Defaults to `file`. |
| `ASSET_BUCKET` | Bucket name for permanent assets (S3 and Supabase). Required for both. |
| `TEMP_BUCKET` | Bucket name for ephemeral workflow outputs (S3 and Supabase). Required for both. |
| `FONT_PATH`, `VECTORSTORE_DB_PATH` | Additional paths for specific nodes (registered in `@nodetool-ai/websocket` / `src/settings-registry.ts`). |

For S3-compatible services, set:

- `S3_ENDPOINT` (or `S3_ENDPOINT_URL`) — custom endpoint, optional
- `S3_REGION` (defaults to `us-east-1`)

Credentials come from the standard AWS chain (`@nodetool-ai/storage` / `src/s3/credentials.ts`): `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN`, or a profile in `~/.aws/credentials` selected with `AWS_PROFILE`. Metadata-service chains (ECS, EC2 IMDS, EKS web identity) are not built in — pass a custom `credentialProvider` to `S3Client` for those.

## Temporary Storage

Temp storage returns a location for scratch files, mirroring asset storage. It uses the same backend as assets (`getTempAdapter()` in `@nodetool-ai/websocket` / `src/lib/storage.ts`), with `TEMP_BUCKET` in place of `ASSET_BUCKET` so temp files can carry different retention and access policies. On the `file` backend both share the local assets directory.

## Supabase Storage

With `NODETOOL_STORAGE_BACKEND=supabase`, NodeTool uses Supabase for asset and temp storage.

- Adapter: `SupabaseStorageAdapter` (`@nodetool-ai/storage` / `src/supabase-storage-adapter.ts`)
- Selection: `createStorageAdapter()` (`@nodetool-ai/storage` / `src/factory.ts`) from the config the backend env var picks
- URLs: `createAssetUrlBuilder()` (`@nodetool-ai/storage` / `src/url-builder.ts`) returns a Supabase signed URL valid for `SIGNED_URL_TTL` (7 days), so private buckets work as-is.

Minimum configuration:

```
NODETOOL_STORAGE_BACKEND=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
ASSET_BUCKET=assets
TEMP_BUCKET=assets-temp
```

Recommendations:

- Create the buckets (`assets`, `assets-temp`) in the Supabase dashboard.
- Scope the service role key to server-side environments only. Do not expose it to browsers.

Use the temporary storage for intermediate files that do not need long-term retention.

## Node and Workflow Caches

NodeTool caches expensive node outputs and metadata to accelerate repeated executions:

- `@nodetool-ai/storage` / `src/memory-node-cache.ts` -- in-process dictionary, default for development.
- `@nodetool-ai/storage` / `src/memory-uri-cache.ts` -- caches resolved asset URIs for quick lookup.

Memoisation is wired up inside `ProcessingContext` (`@nodetool-ai/runtime` / `src/context.ts`).

## Accessing Storage in Workflows

Workflows interact with storage through `ProcessingContext` (`@nodetool-ai/runtime` / `src/context.ts`):

- `resolveAssetBytes(assetId)` -- loads the raw bytes for an asset.
- `assetsToStorageUrl(value)` -- rewrites asset references in a value to storage URLs.
- `downloadFile(url)` -- fetches file contents from a URL.

## Deployment Considerations

- For self-hosted deployments, mount persistent volumes for `/workspace` (workspace files) and the asset storage directory.  
- In Docker-based execution (`@nodetool-ai/deploy` / `src/docker-run.ts`), the workspace path is mounted into containers, so ensure the host directory exists and has the correct permissions.  
- When using S3, grant read/write access to the buckets named by `ASSET_BUCKET` and `TEMP_BUCKET`.

## Troubleshooting

- **Missing asset URLs** – confirm `NODETOOL_API_URL` is set; the API uses it to build absolute URLs.
- **S3 authentication errors** – verify credentials and endpoint configuration; run `nodetool settings show` for the resolved environment and `nodetool secrets list` for the stored keys.
- **Local file permissions** – ensure the configured asset folder is writable by the user running the service (especially in Docker).
- **Docker jobs cannot access assets** – mount the asset directory into the server container and ensure the assets path (`getDefaultAssetsPath()`, overridable via `ASSET_FOLDER`/`STORAGE_PATH`) points to the mounted path.

## Related Documentation

- [Configuration Guide](configuration.md) – environment variable hierarchy and secret management.  
- [Deployment Guide](deployment.md) – configuring storage via `deployment.yaml`.  
- [Docker Resource Management](docker-resource-management.md) – limiting resource usage for storage-heavy jobs.
