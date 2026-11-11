---
layout: page
title: "Supabase Deployment Integration"
description: "Set up Supabase auth and Storage buckets for a deployed NodeTool server: environment variables, bucket names, and failure messages."
---

A deployed server uses Supabase for login (JWTs checked against your project's `/auth/v1/user` endpoint) and, separately, for asset storage in Storage buckets.

```yaml
container:
  environment:
    SUPABASE_URL: https://your-project.supabase.co
    SUPABASE_KEY: your-service-role-key   # server-only
    SUPABASE_ANON_KEY: your-anon-key      # served to the login screen by GET /api/config
    NODETOOL_STORAGE_BACKEND: supabase
    ASSET_BUCKET: assets
    TEMP_BUCKET: assets-temp
```

> **Runs:** on a self-hosted Docker server (see [Self-Hosted Deployment](self-hosted-deployment.md)) with a Supabase project you control. **Needs:** the project's URL, service role key, and anon key. **Ports:** none beyond the server's own.
{: .callout-note}

The service role key bypasses Row Level Security, so RLS policies do not restrict what the NodeTool server reads or writes.

---

## Setup

1. **Create buckets.** In the Supabase dashboard open **Storage** and create `assets` (permanent assets, private or public) and `assets-temp` (temporary files, private). A public bucket gives direct URLs anyone can open. A private bucket gives signed URLs.
2. **Set the variables** above in `container.environment`, or export them in the shell. Add `AUTH_REDIRECT_URL` when serving NodeTool behind a domain, and add it to the Supabase project's redirect allow list.
3. **Deploy.** Run `nodetool deploy apply <target-name>`, which recreates the container with the new environment. With Docker Compose, put the variables in `.env` (the bundled `docker-compose.yml` forwards it through `env_file`) and run `docker compose up -d`. See [Self-Hosted Deployment](self-hosted-deployment.md#authentication--login-screen).

---

## Authentication

Supabase auth turns on when **both** `SUPABASE_URL` and `SUPABASE_KEY` are set. The server reads no `AUTH_PROVIDER` variable. Without the pair it falls back to the local auth provider. With it, every API request needs `Authorization: Bearer <supabase_jwt>`, and users sign in through Supabase (email and password, OAuth, magic link).

---

## Storage Behavior

`NODETOOL_STORAGE_BACKEND` (`file`, `s3`, `supabase`, default `file`) selects storage. `SUPABASE_URL` and `SUPABASE_KEY` enable **auth** only, and storage uses Supabase only with `NODETOOL_STORAGE_BACKEND=supabase`.

- `file`: local filesystem under `ASSET_FOLDER`, then `STORAGE_PATH`, then the NodeTool data directory's `assets` folder.
- `s3`: requires `ASSET_BUCKET` and `TEMP_BUCKET`, with optional `S3_REGION` and `S3_ENDPOINT` (or `S3_ENDPOINT_URL`).
- `supabase`: requires `SUPABASE_URL`, `SUPABASE_KEY`, `ASSET_BUCKET`, and `TEMP_BUCKET`.

Public buckets yield direct Supabase Storage URLs. Private buckets yield signed URLs that expire after 7 days (`SIGNED_URL_TTL`, the Supabase maximum).

---

## Verification

1. `nodetool deploy logs <target-name>` shows no storage or auth error at startup.
2. Run a workflow that writes assets. The resulting URLs point at your Supabase Storage, and the files appear in the buckets.
3. Call the API with a JWT:
   ```bash
   curl -H "Authorization: Bearer <supabase_jwt>" https://your-deployment.example.com/api/workflows
   ```

---

## If it fails

- **Every login returns `401`**: `SUPABASE_ANON_KEY` is unset. The server logs a warning at boot, `/api/config` returns `supabaseAnonKey: null`, and the web app has no public key to use.
- **`Missing required env var <name> for NODETOOL_STORAGE_BACKEND=supabase`**: set the named variable (`SUPABASE_URL`, `SUPABASE_KEY`, or the bucket variable) and redeploy.
- **`Unknown NODETOOL_STORAGE_BACKEND: "<value>". Expected file|s3|supabase.`**: fix the value.
- **Assets land on local disk**: `NODETOOL_STORAGE_BACKEND` is unset, so the backend is `file`.

---

## Security

Keep the service role key out of client code, because it has full admin access. Use separate Supabase projects for staging and production, and rotate the key by updating the deployment config. See [Security Hardening](security-hardening.md).

---

## Related

- [Deployment Guide](deployment.md)
- [Authentication](authentication.md)
- [Storage](storage.md)
- [Configuration](configuration.md)
- [Security Hardening](security-hardening.md)
