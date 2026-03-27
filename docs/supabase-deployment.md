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
- A NodeTool deployment target (self-hosted, RunPod, or GCP)

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

Add these variables to your deployment target's `env` section:

```yaml
env:
  # Supabase connection
  SUPABASE_URL: https://your-project.supabase.co
  SUPABASE_KEY: your-service-role-key

  # Storage buckets
  ASSET_BUCKET: assets
  ASSET_TEMP_BUCKET: assets-temp  # Optional

  # Authentication provider
  AUTH_PROVIDER: supabase
```

Or set them as environment variables directly:

```bash
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_KEY=your-service-role-key
export ASSET_BUCKET=assets
export ASSET_TEMP_BUCKET=assets-temp
export AUTH_PROVIDER=supabase
```

### 3. Deploy

Apply the configuration to your deployment target:

```bash
nodetool deploy apply <target-name>
```

---

## Authentication

When `AUTH_PROVIDER=supabase` is set, NodeTool uses Supabase JWTs for all API authentication:

- Users authenticate through Supabase (email/password, OAuth, magic link, etc.)
- API requests require a valid JWT in the `Authorization` header:
  ```
  Authorization: Bearer <supabase_jwt>
  ```
- NodeTool validates tokens against your Supabase project automatically

### Auth Provider Options

| Provider | Use Case |
|----------|----------|
| `none` | Development only -- no authentication |
| `local` | Local development with basic auth |
| `static` | Service-to-service with a shared token (`SERVER_AUTH_TOKEN`) |
| `supabase` | Production multi-user deployments |

---

## Storage Behavior

### Provider Priority

NodeTool selects the storage backend based on available configuration:

1. **Supabase** -- Used when both `SUPABASE_URL` and `SUPABASE_KEY` are set
2. **S3** -- Used when S3 credentials are configured (and Supabase is not)
3. **Local filesystem** -- Default fallback when no cloud storage is configured

If both S3 and Supabase variables are present, NodeTool prefers Supabase.

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
