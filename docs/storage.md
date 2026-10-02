---
layout: page
title: "Storage Guide"
description: "How NodeTool stores assets, workflow artifacts, and temporary files through pluggable backends (in-memory, local disk, S3)."
---



NodeTool stores user assets, workflow artifacts, and temporary files through pluggable backends defined in `@nodetool-ai/storage` (`packages/storage/src/`). The active backend is selected per execution by the runtime context.

## Asset Storage Backends

| Backend | Module | When it is used | Notes |
|---------|--------|-----------------|-------|
| In-memory | `@nodetool-ai/storage` / `src/memory-storage-adapter.ts` | Tests | Keeps data in process-local dictionaries. Not selectable through configuration. |
| Local filesystem | `@nodetool-ai/storage` / `src/file-storage-adapter.ts` | Default (`NODETOOL_STORAGE_BACKEND` unset or `file`) | Stores assets under `getDefaultAssetsPath()` (`@nodetool-ai/config` / `src/paths.ts`), which defaults to `$XDG_DATA_HOME/nodetool/assets`, falling back to `~/.local/share/nodetool/assets` (`%APPDATA%\nodetool\assets` on Windows). Override with `ASSET_FOLDER` or `STORAGE_PATH`. URLs are served via the API (`/api/storage/*`). |
| Supabase Storage | `@nodetool-ai/storage` / `src/supabase-storage-adapter.ts` | `NODETOOL_STORAGE_BACKEND=supabase` | Uses a Supabase bucket for asset storage. |
| Amazon S3 / S3-compatible | `@nodetool-ai/storage` / `src/s3-storage-adapter.ts` | `NODETOOL_STORAGE_BACKEND=s3` | Optional custom endpoint for MinIO/Wasabi. |

The backend is chosen once by `NODETOOL_STORAGE_BACKEND` (`loadAssetStorageConfig()` / `loadTempStorageConfig()` in `@nodetool-ai/config` / `src/storage-config.ts`); assets and temp files always use the same backend, with different buckets.

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `NODETOOL_STORAGE_BACKEND` | `file`, `s3`, or `supabase`. Defaults to `file`. |
| `ASSET_BUCKET` | Bucket name for permanent assets (S3 and Supabase). Required for both. |
| `TEMP_BUCKET` | Bucket name for ephemeral workflow outputs (S3 and Supabase). Required for both. |
| `SUPABASE_URL`, `SUPABASE_KEY` | Project URL and API key. Required when the backend is `supabase`. |
| `NODETOOL_MAX_UPLOAD_BYTES` | Largest single upload any backend accepts, in bytes. Defaults to 1 GiB (2 GiB for local file reads and uploads). See `src/storage-limits.ts`. |
| `NODETOOL_EXTERNAL_ASSET_THRESHOLD_BYTES` | Local file backend only. See [External assets](#external-assets). |
| `FONT_PATH`, `VECTORSTORE_DB_PATH` | Additional paths for specific nodes (defined in `@nodetool-ai/config` / `src/setting-catalog.ts`). |

For S3-compatible services, set:

- `S3_ENDPOINT` (or `S3_ENDPOINT_URL`): custom endpoint, optional. When set, requests use path-style addressing.
- `S3_REGION`: defaults to `us-east-1` when building signed URLs.

Credentials come from the standard AWS chain (`@nodetool-ai/storage` / `src/s3/credentials.ts`): `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN`, or a profile in `~/.aws/credentials` selected with `AWS_PROFILE`. Metadata-service chains (ECS, EC2 IMDS, EKS web identity) are not built in — pass a custom `credentialProvider` to `S3Client` for those.

## Temporary Storage

Temp storage returns a location for scratch files, mirroring asset storage. It uses the same backend as assets (`getTempAdapter()` in `@nodetool-ai/websocket` / `src/lib/storage.ts`), with `TEMP_BUCKET` in place of `ASSET_BUCKET` so temp files can carry different retention and access policies. On the `file` backend both share the local assets directory.

## Supabase Storage

With `NODETOOL_STORAGE_BACKEND=supabase`, NodeTool uses Supabase for asset and temp storage.

- Adapter: `SupabaseStorageAdapter` (`@nodetool-ai/storage` / `src/supabase-storage-adapter.ts`)
- Selection: `createStorageAdapter()` (`@nodetool-ai/storage` / `src/factory.ts`) from the config the backend env var picks
- URLs: `createAssetUrlBuilder()` (`@nodetool-ai/storage` / `src/url-builder.ts`) returns a Supabase signed URL valid for `SIGNED_URL_TTL` (7 days, from `@nodetool-ai/config`), so private buckets work as-is. S3 gets a pre-signed GET URL with the same lifetime.

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

## External assets

On a local desktop or dev server with the `file` backend, an import at or above `NODETOOL_EXTERNAL_ASSET_THRESHOLD_BYTES` (default 1 GiB) is not copied. The asset row stores `external_path` and the file stays where it is (`externalAssetsAvailable()` in `@nodetool-ai/websocket` / `src/lib/external-assets.ts`). The server records the file's size and modification time. If the file is missing or either value changed, the asset reads as offline until you relink it. `NODETOOL_ENV=production` and the S3 and Supabase backends never create external assets.

## Database History Retention

Run history, workflow versions, and prediction payloads live in the database, not in asset storage. A per-user retention policy trims them (`@nodetool-ai/websocket` / `src/storage-retention.ts`, defaults in `@nodetool-ai/models` / `src/storage-maintenance.ts`). The policy is edited under **Settings** in the storage history section (`StorageHistorySettings`).

| Setting | Default |
|---------|---------|
| Autosaves kept per workflow | 10 |
| Autosave retention | 7 days |
| Manual version retention | 90 days |
| Finished job retention | 30 days |
| Run event retention | 30 days |
| Prediction request payload retention | 400 days |
| Automatic cleanup | Off locally. On when `NODETOOL_STORAGE_AUTO_CLEANUP=1`. |

With automatic cleanup on, the sweep runs at most once every 24 hours.

## Node and Workflow Caches

NodeTool caches node outputs and resolved asset URIs for repeated executions:

- `@nodetool-ai/storage` / `src/memory-node-cache.ts` -- in-process dictionary (`MemoryNodeCache`).
- `@nodetool-ai/storage` / `src/memory-uri-cache.ts` -- caches resolved asset URIs for quick lookup.

`ProcessingContext` builds node cache keys with `generateNodeCacheKey()` (`@nodetool-ai/runtime` / `src/context.ts`).

## Accessing Storage in Workflows

Workflows interact with storage through `ProcessingContext` (`@nodetool-ai/runtime` / `src/context.ts`):

- `resolveAssetBytes(assetId)` -- loads the raw bytes for an asset.
- `assetsToStorageUrl(value)` -- rewrites asset references in a value to storage URLs.
- `downloadFile(url)` -- fetches file contents from a URL.
- `assetsToWorkspaceFiles(value)` -- writes asset values to the `assets/` folder of the run workspace.
- `uploadAssetsToTemp(value)` -- uploads asset values to temporary storage and returns temp URLs.

## Deployment Considerations

- For self-hosted deployments, mount persistent volumes for `/workspace` (workspace files) and the asset storage directory.  
- In Docker-based execution (`@nodetool-ai/deploy` / `src/docker-run.ts`), the workspace path is mounted into containers, so ensure the host directory exists and has the correct permissions.  
- When using S3, grant read/write access to the buckets named by `ASSET_BUCKET` and `TEMP_BUCKET`.

## Troubleshooting

- **Asset bytes fail to load in a run** – the context falls back to `GET <NODETOOL_API_URL>/api/storage/<id>.<ext>` when it cannot read an asset directly. `NODETOOL_API_URL` defaults to `http://localhost:7777`, so set it when the API runs elsewhere.
- **Upload rejected as too large** – raise `NODETOOL_MAX_UPLOAD_BYTES`.
- **S3 authentication errors** – verify credentials and endpoint configuration; run `nodetool settings show` for the resolved environment and `nodetool secrets list` for the stored keys.
- **Local file permissions** – ensure the configured asset folder is writable by the user running the service (especially in Docker).
- **Docker jobs cannot access assets** – mount the asset directory into the server container and ensure the assets path (`getDefaultAssetsPath()`, overridable via `ASSET_FOLDER`/`STORAGE_PATH`) points to the mounted path.

## Related Documentation

- [Configuration Guide](configuration.md) – environment variable hierarchy and secret management.  
- [Deployment Guide](deployment.md) – configuring storage via `deployment.yaml`.  
- [Docker Resource Management](docker-resource-management.md) – limiting resource usage for storage-heavy jobs.
