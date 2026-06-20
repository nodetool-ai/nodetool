---
layout: page
title: "Supabase Deployment Integration"
description: "Use Supabase for authentication and asset storage in deployed NodeTool instances."
---

Supabase provides both authentication and object storage for deployed NodeTool instances. This guide covers how to configure Supabase as your auth and storage backend.

---

## What Supabase Provides

| Feature | What It Does |
|---------|--------------|
| **Authentication** | User sign-up, login, and JWT-based session management |
| **Object Storage** | S3-compatible asset storage with public or signed URLs |
| **Row Level Security** | Fine-grained access control for multi-user deployments |

---

## Prerequisites

- A **Supabase project** at [supabase.com](https://supabase.com)
- Your project's **URL** and **service role key** from the Supabase dashboard
- A NodeTool deployment target (self-hosted Docker server)

---

## Setup

### 1. Create Storage Buckets

In your Supabase dashboard, go to **Storage** and create the following buckets:

| Bucket | Purpose | Visibility |
|--------|---------|------------|
| `assets` | Permanent workflow assets (images, documents, audio) | Private or Public |
| `assets-temp` | Temporary files during workflow execution (optional) | Private |

**Public vs. Private buckets:**
- **Public** buckets generate direct URLs that anyone can access -- suitable for assets shared externally
- **Private** buckets require signed URLs or authenticated access -- better for sensitive content

### 2. Configure Environment Variables

Add these variables to your deployment target's `container.environment` section:

```yaml
container:
  environment:
    # Supabase connection (presence of both enables Supabase auth)
    SUPABASE_URL: https://your-project.supabase.co
    SUPABASE_KEY: your-service-role-key

    # Select Supabase as the STORAGE backend (default is "file").
    # Setting only SUPABASE_URL/KEY enables Supabase AUTH but NOT storage.
    NODETOOL_STORAGE_BACKEND: supabase

    # Storage buckets
    ASSET_BUCKET: assets
    TEMP_BUCKET: assets-temp  # Optional
```

Or set them as environment variables directly:

```bash
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_KEY=your-service-role-key
export NODETOOL_STORAGE_BACKEND=supabase
export ASSET_BUCKET=assets
export TEMP_BUCKET=assets-temp
```

### 3. Deploy

Apply the configuration to your deployment target:

```bash
nodetool deploy apply <target-name>
```

---

## Authentication

The server enables Supabase auth automatically when **both** `SUPABASE_URL` and
`SUPABASE_KEY` are present. There is no `AUTH_PROVIDER` switch read by the server
entrypoint — Supabase-vs-local auth is selected purely by the presence of those
two variables. When set, NodeTool uses Supabase JWTs for all API authentication:

- Users authenticate through Supabase (email/password, OAuth, magic link, etc.)
- API requests require a valid JWT in the `Authorization` header:
  ```
  Authorization: Bearer <supabase_jwt>
  ```
- NodeTool validates tokens against your Supabase project automatically

When `SUPABASE_URL`/`SUPABASE_KEY` are not set, the server falls back to a local
auth provider.

---

## Storage Behavior

### Backend Selection

NodeTool selects the storage backend from `NODETOOL_STORAGE_BACKEND`
(`file` | `s3` | `supabase`, default `file`):

- **`file`** (default) -- local filesystem under the assets path.
- **`s3`** -- requires `ASSET_BUCKET`/`TEMP_BUCKET` (plus `S3_REGION` / optional `S3_ENDPOINT`).
- **`supabase`** -- requires `SUPABASE_URL`, `SUPABASE_KEY`, and `ASSET_BUCKET`/`TEMP_BUCKET`.

Storage is **not** auto-selected from the presence of `SUPABASE_URL`/`SUPABASE_KEY`:
those enable Supabase **auth**, but you must set `NODETOOL_STORAGE_BACKEND=supabase`
to route **storage** through Supabase. The asset bucket is `ASSET_BUCKET` and the
temp bucket is `TEMP_BUCKET`.

### Asset URLs

- **Public buckets** generate direct Supabase Storage URLs
- **Private buckets** generate time-limited signed URLs for secure access
- For a controlled proxy layer, configure your reverse proxy to mediate access

---

## Verification

After deploying with Supabase, verify the integration:

1. **Check logs** -- Look for messages confirming Supabase storage is active:
   ```bash
   nodetool deploy logs <target-name>
   ```

2. **Test asset storage** -- Run a workflow that writes assets and verify the resulting URLs point to your Supabase storage

3. **Test authentication** -- Call an API endpoint with a Supabase JWT:
   ```bash
   curl -H "Authorization: Bearer <supabase_jwt>" \
     https://your-deployment.example.com/api/workflows
   ```

4. **Check Supabase dashboard** -- Verify assets appear in your storage buckets

---

## Security Considerations

- **Never expose your service role key** in client-side code -- it has full admin access
- Use **Row Level Security (RLS)** policies if multiple users share the same Supabase project
- Rotate your service role key periodically and update deployment configs
- Consider using separate Supabase projects for staging and production
- See [Security Hardening](security-hardening.md) for the full production checklist

---

## Related

- [Deployment Guide](deployment.md) -- Overview of all deployment options
- [Authentication](authentication.md) -- Detailed authentication configuration
- [Storage](storage.md) -- Storage backend options and configuration
- [Configuration](configuration.md) -- All environment variables and settings
- [Security Hardening](security-hardening.md) -- Production security checklist
