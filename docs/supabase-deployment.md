---
layout: page
title: "Supabase Deployment Integration"
---

Supabase can provide both authentication and object storage for deployed NodeTool instances.

## Configure Environment

Set these in your deployment target:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
ASSET_BUCKET=assets
# Optional for temporary assets
ASSET_TEMP_BUCKET=assets-temp

# Auth provider: none|local|static|supabase
AUTH_PROVIDER=supabase
```

## Storage Setup

Create buckets in Supabase Storage, usually:

- `assets`
- `assets-temp` (optional)

For public direct URLs, set buckets to public. For private buckets, use signed URLs or a controlled proxy layer.

## Verify After Deploy

- Logs should indicate Supabase storage is active
- Run a workflow that writes assets and verify resulting URLs
- For Supabase auth, call APIs with `Authorization: Bearer <supabase_jwt>`

## Notes

- If both S3 and Supabase variables are present, NodeTool prefers Supabase when `SUPABASE_URL` and `SUPABASE_KEY` are set.
- Without Supabase/S3, local filesystem storage is used.

## Related

- [Deployment Guide](deployment.md)
- [Configuration](configuration.md)
- [Storage](storage.md)
