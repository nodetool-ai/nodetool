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
| **Authentication** | User sign-up, login, and JWT-based session management. The server checks each token against your project's `/auth/v1/user` endpoint |
| **Object Storage** | Asset storage in Supabase Storage buckets, with public or signed URLs |

NodeTool talks to Supabase with the service role key, which bypasses Row Level
Security. RLS policies do not restrict what the NodeTool server can read or write.

---

## Prerequisites

- A **Supabase project** at [supabase.com](https://supabase.com)
- Your project's **URL**, **service role key**, and **anon key** from the Supabase dashboard
- A NodeTool deployment target (self-hosted Docker server)

---

## Setup

### 1. Create Storage Buckets

In your Supabase dashboard, go to **Storage** and create the following buckets:

| Bucket | Purpose | Visibility |
|--------|---------|------------|
| `assets` | Permanent workflow assets (images, documents, audio) | Private or Public |
| `assets-temp` | Temporary files during workflow execution | Private |

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
    SUPABASE_KEY: your-service-role-key   # server-only

    # Public key the web login screen uses. Served by GET /api/config.
    SUPABASE_ANON_KEY: your-anon-key

    # Select Supabase as the STORAGE backend (default is "file").
    # Setting only SUPABASE_URL/KEY enables Supabase AUTH but NOT storage.
    NODETOOL_STORAGE_BACKEND: supabase

    # Storage buckets
    ASSET_BUCKET: assets
    TEMP_BUCKET: assets-temp
```

Without `SUPABASE_ANON_KEY` the server logs a warning, the web app has no public
key to use, and every login fails with 401. Add `AUTH_REDIRECT_URL` when you serve NodeTool behind a
domain, and allow-list it in the Supabase project.

Or set them as environment variables directly:

```bash
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_KEY=your-service-role-key
export SUPABASE_ANON_KEY=your-anon-key
export NODETOOL_STORAGE_BACKEND=supabase
export ASSET_BUCKET=assets
export TEMP_BUCKET=assets-temp
```

### 3. Deploy

Apply the configuration to your deployment target:

```bash
nodetool deploy apply <target-name>
```

`apply` recreates the container with the new `container.environment`. For
Docker Compose, put the variables in `.env`, which the bundled
`docker-compose.yml` forwards through `env_file`, and run `docker compose up -d`. See
[Self-Hosted Deployment](self-hosted-deployment.md#authentication--login-screen).

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
(`file` | `s3` | `supabase`, default `file`). Any other value fails at startup:

- **`file`** (default) -- local filesystem under `ASSET_FOLDER`, then `STORAGE_PATH`, then the `assets` folder in the NodeTool data directory.
- **`s3`** -- requires `ASSET_BUCKET` and `TEMP_BUCKET`. Optional `S3_REGION` and `S3_ENDPOINT` (or `S3_ENDPOINT_URL`).
- **`supabase`** -- requires `SUPABASE_URL`, `SUPABASE_KEY`, `ASSET_BUCKET`, and `TEMP_BUCKET`. A missing variable throws an error that names it.

Storage is **not** auto-selected from the presence of `SUPABASE_URL`/`SUPABASE_KEY`:
those enable Supabase **auth**, but you must set `NODETOOL_STORAGE_BACKEND=supabase`
to route **storage** through Supabase. The asset bucket is `ASSET_BUCKET` and the
temp bucket is `TEMP_BUCKET`.

### Asset URLs

- **Public buckets** generate direct Supabase Storage URLs
- **Private buckets** generate signed URLs that expire after 7 days (`SIGNED_URL_TTL`, the Supabase maximum)
- For a controlled proxy layer, configure your reverse proxy to mediate access

---

## Verification

After deploying with Supabase, verify the integration:

1. **Check logs** -- Confirm the server started without a storage or auth error:
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
