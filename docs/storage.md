---
layout: page
title: "Storage"
description: "Where a NodeTool server keeps asset bytes and temp files (local disk, S3, Supabase), the variables for each backend, linked files, retention, and failure behavior."
---

A server keeps asset bytes and temp files on local disk by default, or in an S3-compatible or Supabase bucket. `NODETOOL_STORAGE_BACKEND` picks one backend for both, each with its own bucket.

```bash
NODETOOL_STORAGE_BACKEND=s3
ASSET_BUCKET=nodetool-assets
TEMP_BUCKET=nodetool-temp
S3_REGION=eu-central-1
```

New assets are files in their [project folder](workspaces.md), so on a server the project folders live in the same storage. Collections are stored separately, see [Vector Storage](vector-storage.md).

## Asset Storage Backends

| `NODETOOL_STORAGE_BACKEND` | Stores files in | Notes |
|---------|--------|-------|
| `file` (default) | A local directory | `~/.local/share/nodetool/assets` on macOS and Linux (under `$XDG_DATA_HOME` when set), `%APPDATA%\nodetool\assets` on Windows. Override with `ASSET_FOLDER` or `STORAGE_PATH` |
| `s3` | Amazon S3 or a compatible service (MinIO, Cloudflare R2, Wasabi) | Needs `ASSET_BUCKET` and `TEMP_BUCKET` |
| `supabase` | Supabase Storage buckets | Needs `SUPABASE_URL`, `SUPABASE_KEY`, `ASSET_BUCKET` and `TEMP_BUCKET` |

Credentials never select the backend. A server with S3 keys and no `NODETOOL_STORAGE_BACKEND` still uses local disk.

| Variable | Notes |
|----------|-------------|
| `NODETOOL_STORAGE_BACKEND` | `file`, `s3`, or `supabase`. Default `file` |
| `ASSET_BUCKET` | Required for S3 and Supabase |
| `TEMP_BUCKET` | Required for S3 and Supabase. Holds scratch files, so it can have its own retention and access policy. On `file` both share the assets directory |
| `SUPABASE_URL`, `SUPABASE_KEY` | Required for `supabase` |
| `NODETOOL_MAX_UPLOAD_BYTES` | Largest single upload. Default 1 GiB |
| `NODETOOL_EXTERNAL_ASSET_THRESHOLD_BYTES` | Local `file` backend only. See [Linked files](#external-assets) |

### S3 and compatible services

- `S3_ENDPOINT` (or `S3_ENDPOINT_URL`) sets a custom endpoint for MinIO, R2 or Wasabi. With an endpoint set, requests use path-style addressing.
- `S3_REGION` defaults to `us-east-1`.
- Credentials come from `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN`, or from a profile in `~/.aws/credentials` named by `AWS_PROFILE`. Instance and container roles (EC2, ECS, EKS) are not picked up, so give the server keys or a profile.
- Grant read and write on both buckets.
- The endpoint must honor conditional writes (`If-None-Match: *`). AWS S3, Cloudflare R2 and current MinIO do. Older MinIO releases do not, and the server refuses to write project files there. See [Object storage must honor conditional writes](developer/project-folders.md#object-storage-must-honor-conditional-writes).

Download links are signed URLs that last 7 days, so the buckets can stay private.

## Supabase Storage

```bash
NODETOOL_STORAGE_BACKEND=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
ASSET_BUCKET=assets
TEMP_BUCKET=assets-temp
```

Create the two buckets in the Supabase dashboard first. The key is a service role key, so keep it on the server. Bucket policies are in [Security Hardening](security-hardening.md#asset-storage).

## Assets in project folders

A new asset, whether a workflow output, an agent's output or an upload, is a file in its project's folder. With S3 or Supabase, a project folder is a key prefix in the asset bucket. Thumbnails and video previews stay outside the folder in asset storage.

An asset created before project folders keeps its object under `<user>/<asset id>.<ext>` until the server moves it into its project's folder. The move copies the object, compares the copy byte for byte, and only then deletes the original. See [Upgrading from before project folders](workspaces.md#upgrading-from-before-project-folders).

## External assets

On the desktop app or a local server with the `file` backend, a file the creator links is used where it is instead of being copied. A file of 1 GiB or more (`NODETOOL_EXTERNAL_ASSET_THRESHOLD_BYTES`) starts out linked. If the linked file is moved or changed, the asset shows as missing until you relink it. **Collect files** on a project copies its linked files into the folder's `Imported/` directory. A server with `NODETOOL_ENV=production`, or with the S3 or Supabase backend, never links files.

## Database History Retention

Run history, workflow versions and generation records live in the database. Each user trims them under **Settings → General → Autosave & version history**. See [Version history and cleanup](configuration.md#version-history-and-cleanup) for the defaults.

**Automatic cleanup** starts off. `NODETOOL_STORAGE_AUTO_CLEANUP=1` makes it start on. With it on, the sweep runs at most once every 24 hours.

## Deployment Considerations

- Mount persistent volumes for the data directory (`/workspace` in the Docker image) and the asset directory.
- The Docker image runs with `NODETOOL_ENV=production`, so each project folder is a key prefix in asset storage. A server that sets `NODETOOL_WORKSPACE_STORAGE=local` keeps project folders under `PROJECTS_DIR` (default `~/NodeTool`) instead, so point that at a persistent volume such as `/workspace/projects`.
- `nodetool deploy` mounts the deployment's data path into the container at `/workspace`, so the host directory must exist with permissions the container user can write.

## If it fails

- **`Missing required env var <name> for NODETOOL_STORAGE_BACKEND=<backend>`**: set the named variable. An unknown backend fails with `Unknown NODETOOL_STORAGE_BACKEND: "<value>". Expected file|s3|supabase.`
- **`Upload for key "<key>" exceeds maximum size: <n> > <max> bytes`**: raise `NODETOOL_MAX_UPLOAD_BYTES`.
- **Asset bytes fail to load in a run**: when a run cannot read an asset directly, it asks the API at `NODETOOL_API_URL` (default `http://localhost:7777`). Set it when the API runs elsewhere.
- **`The storage endpoint <endpoint> ignores the If-None-Match header on writes`**: the S3-compatible service does not support conditional writes. Use AWS S3, Cloudflare R2 or current MinIO.
- **S3 authentication errors**: check the keys or profile and the endpoint. `nodetool settings show` prints the resolved environment.
- **Local file permissions**: the asset folder must be writable by the user running the server, which in Docker is the container user.

## Related

- [Server Configuration](server-configuration.md)
- [Vector Storage](vector-storage.md)
- [Docker Resource Management](docker-resource-management.md)
- [Storage and Vector Store APIs](developer/storage.md)
