---
layout: page
title: "Storage Guide"
description: "Asset and temp storage backends (local disk, S3, Supabase), their environment variables, retention defaults, and failure behavior."
---

Assets, workflow artifacts, and temp files go through the adapters in `@nodetool-ai/storage` (`packages/storage/src/`). `NODETOOL_STORAGE_BACKEND` picks the backend once, and assets and temp files share it with different buckets.

```
NODETOOL_STORAGE_BACKEND=s3
ASSET_BUCKET=nodetool-assets
TEMP_BUCKET=nodetool-temp
S3_REGION=eu-central-1
```

## Asset Storage Backends

| Backend | Module (`src/`) | Selected by | Notes |
|---------|--------|-----------------|-------|
| Local filesystem | `file-storage-adapter.ts` | `file` or unset | Default root `$XDG_DATA_HOME/nodetool/assets`, else `~/.local/share/nodetool/assets` (`%APPDATA%\nodetool\assets` on Windows). Override with `ASSET_FOLDER` or `STORAGE_PATH`. Served through `/api/storage/*` |
| Supabase Storage | `supabase-storage-adapter.ts` | `supabase` | Supabase bucket |
| Amazon S3 or compatible | `s3-storage-adapter.ts` | `s3` | Optional custom endpoint for MinIO or Wasabi |
| In-memory | `memory-storage-adapter.ts` | Tests only | Process-local, not selectable by configuration |

`loadAssetStorageConfig()` and `loadTempStorageConfig()` in `@nodetool-ai/config` (`src/storage-config.ts`) read the variables below and `createStorageAdapter()` (`src/factory.ts`) builds the adapter.

| Variable | Notes |
|----------|-------------|
| `NODETOOL_STORAGE_BACKEND` | `file`, `s3`, or `supabase`. Default `file` |
| `ASSET_BUCKET` | Required for S3 and Supabase |
| `TEMP_BUCKET` | Required for S3 and Supabase |
| `SUPABASE_URL`, `SUPABASE_KEY` | Required for `supabase` |
| `NODETOOL_MAX_UPLOAD_BYTES` | Default 1 GiB, 2 GiB for local file reads and uploads (`src/storage-limits.ts`) |
| `NODETOOL_EXTERNAL_ASSET_THRESHOLD_BYTES` | Local file backend only. See [External assets](#external-assets) |
| `FONT_PATH`, `VECTORSTORE_DB_PATH` | Paths for specific nodes (`setting-catalog.ts`) |

S3-compatible services also use:

- `S3_ENDPOINT` (or `S3_ENDPOINT_URL`): optional custom endpoint. When set, requests use path-style addressing.
- `S3_REGION`: defaults to `us-east-1` when signing URLs.

Credentials come from the standard AWS chain (`src/s3/credentials.ts`): `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, or a profile in `~/.aws/credentials` selected with `AWS_PROFILE`. ECS, EC2 IMDS, and EKS web identity chains are not built in. Pass a custom `credentialProvider` to `S3Client` for those.

`createAssetUrlBuilder()` (`src/url-builder.ts`) returns a pre-signed URL (S3) or a Supabase signed URL, both valid for `SIGNED_URL_TTL` (7 days, from `@nodetool-ai/config`), so private buckets work as is.

## Temporary Storage

Temp storage holds scratch files. It uses the asset backend with `TEMP_BUCKET` in place of `ASSET_BUCKET`, so temp files can carry their own retention and access policy (`getTempAdapter()` in `@nodetool-ai/websocket`, `src/lib/storage.ts`). On the `file` backend both share the local assets directory.

## Supabase Storage

```
NODETOOL_STORAGE_BACKEND=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
ASSET_BUCKET=assets
TEMP_BUCKET=assets-temp
```

Create the two buckets in the Supabase dashboard first. The key is a service role key, so keep it server-side.

## External assets

On a local desktop or dev server with the `file` backend, an import at or above `NODETOOL_EXTERNAL_ASSET_THRESHOLD_BYTES` (default 1 GiB) is not copied. The asset row stores `external_path`, the file stays where it is, and the server records its size and modification time (`externalAssetsAvailable()` in `src/lib/external-assets.ts`). If the file is missing or either value changed, the asset reads as offline until you relink it. `NODETOOL_ENV=production` and the S3 and Supabase backends never create external assets.

## Database History Retention

Run history, workflow versions, and prediction payloads live in the database. A per-user retention policy trims them (`src/storage-retention.ts` in `@nodetool-ai/websocket`, defaults in `src/storage-maintenance.ts` in `@nodetool-ai/models`). Edit it under **Settings** in the storage history section.

| Setting | Default |
|---------|---------|
| Autosaves kept per workflow | 10 |
| Autosave retention | 7 days |
| Manual version retention | 90 days |
| Finished job retention | 30 days |
| Run event retention | 30 days |
| Prediction request payload retention | 400 days |
| Automatic cleanup | Off locally, on with `NODETOOL_STORAGE_AUTO_CLEANUP=1` |

With automatic cleanup on, the sweep runs at most once every 24 hours.

## Caches

- `MemoryNodeCache` (`src/memory-node-cache.ts`) is an in-process cache of node outputs. `ProcessingContext` builds its keys with `generateNodeCacheKey()` (`@nodetool-ai/runtime`, `src/context.ts`).
- `src/memory-uri-cache.ts` caches resolved asset URIs.

## Accessing Storage in Workflows

`ProcessingContext` (`@nodetool-ai/runtime`, `src/context.ts`) provides:

- `resolveAssetBytes(assetId)` loads an asset's raw bytes.
- `assetsToStorageUrl(value)` rewrites asset references to storage URLs.
- `downloadFile(url)` fetches file contents from a URL.
- `assetsToWorkspaceFiles(value)` writes asset values to the `assets/` folder of the run workspace.
- `uploadAssetsToTemp(value)` uploads asset values to temp storage and returns temp URLs.

## Deployment Considerations

- Mount persistent volumes for `/workspace` and the asset storage directory on self-hosted deployments.
- Docker execution (`@nodetool-ai/deploy`, `src/docker-run.ts`) mounts the workspace path into containers, so the host directory must exist with correct permissions.
- With S3, grant read and write on the buckets named by `ASSET_BUCKET` and `TEMP_BUCKET`.

## If it fails

- **`Missing required env var <name> for NODETOOL_STORAGE_BACKEND=<backend>`**: set the named variable. An unknown backend throws `Unknown NODETOOL_STORAGE_BACKEND: "<value>". Expected file|s3|supabase.`
- **`Upload for key "<key>" exceeds maximum size: <n> > <max> bytes`**: raise `NODETOOL_MAX_UPLOAD_BYTES`.
- **Asset bytes fail to load in a run**: the context falls back to `GET <NODETOOL_API_URL>/api/storage/<id>.<ext>` when it cannot read an asset directly. `NODETOOL_API_URL` defaults to `http://localhost:7777`, so set it when the API runs elsewhere.
- **S3 authentication errors**: check the credential chain and endpoint. `nodetool settings show` prints the resolved environment and `nodetool secrets list` the stored keys.
- **Docker jobs cannot reach assets**: mount the asset directory into the server container and point `ASSET_FOLDER` or `STORAGE_PATH` at the mounted path.
- **Local file permissions**: the asset folder must be writable by the user running the service, especially in Docker.

## Related Documentation

- [Configuration Guide](configuration.md)
- [Deployment Guide](deployment.md)
- [Docker Resource Management](docker-resource-management.md)
