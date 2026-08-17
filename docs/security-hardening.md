---
layout: page
title: "Security Hardening"
description: "Deployment checklists for locking down NodeTool in dev, staging, and production."
---

Use this page as a checklist before exposing NodeTool beyond your laptop. It covers security practices for each deployment stage and links to canonical guides for configuration, authentication, and proxy settings.

---

## Universal Checklist

These apply to **every** deployment, regardless of environment:

### Network Security

- **Require TLS** at the proxy or ingress layer. Use real certificates (e.g., Let's Encrypt) and redirect HTTP to HTTPS.
- **Restrict Docker access**: Run the proxy with a dedicated network (`docker_network`) and avoid exposing the Docker socket beyond the host.
- **Firewall rules**: Only expose the ports you need (typically 443 for HTTPS). Block direct access to internal service ports.

### Authentication

> **⚠️ `NODETOOL_TRUST_LOCAL_NETWORKS` bypasses login entirely.** Every source
> IP in that list is trusted as admin user `"1"` with no password — full access
> to data, secrets, and API keys. The Docker Compose file trusts the Docker
> bridge (`172.16.0.0/12`) so a single-user local install works out of the box.
> **Never set it to `0.0.0.0/0` on a public IP, and never widen it as a
> substitute for real auth** — enable Supabase mode instead. See
> [Authentication → Local mode in Docker](authentication.md#local-mode-in-docker).

- **Enforce auth on any network-accessible deployment.** The server enforces authentication only when it is in Supabase mode — that is, when **both** `SUPABASE_URL` and `SUPABASE_KEY` are set. Without them it runs in Local mode and trusts loopback connections (and any `NODETOOL_TRUST_LOCAL_NETWORKS` you configure). See [Authentication](authentication.md#authentication-modes).
- **Lock down localhost trust.** Behind a reverse proxy or in a container, set `NODETOOL_TRUST_LOCALHOST=false` (it already defaults off when auth is enforced) and list only your real proxies in `NODETOOL_TRUSTED_PROXIES`, so a proxy connecting from loopback cannot silently bypass auth.
- **Keep `NODETOOL_TRUST_LOCAL_NETWORKS` tight.** Trust the smallest range that works (the Docker bridge, not `0.0.0.0/0`), and firewall the published port. It is ignored in Supabase mode.
- **Rotate keys regularly** -- set calendar reminders to rotate Supabase service-role keys.

### Secrets Management

- **Keep secrets out of Git**: Load provider API keys and tokens from environment variables or a secrets manager.
- **Never commit `.env` files** with secrets. Add `.env` to `.gitignore`.
- Provide the encryption master key (`SECRETS_MASTER_KEY`) on every server so they share one key, and store all other deployment secrets in your platform's secrets manager.

### Asset Storage

Asset objects live at `<userId>/<assetId>.<ext>`. The owner is the leading
path segment, so the tenant boundary is enforceable by the storage backend
itself, not just by the API:

- **Run `nodetool storage migrate-keys`** when upgrading a deployment that
  predates this layout. The local file backend falls back to the old flat key
  on a miss, but Supabase and S3 resolve through signed URLs and need the
  objects actually moved. `--dry-run` reports what would move.
- **Keep the bucket private.** Reads go through short-lived signed URLs minted
  per request; a public bucket bypasses that entirely.
- **Add a storage policy keyed on the prefix** on Supabase (an RLS policy on
  `storage.objects` matching `(storage.foldername(name))[1] = auth.uid()::text`)
  or S3 (a bucket policy on the key prefix). The API already enforces this, but
  a policy makes it hold even if a signed URL leaks or a handler regresses.
- **Never ship `SUPABASE_KEY` to a client.** The service-role key stays
  server-side; browsers upload through the one-shot, key-scoped targets that
  `assets.createUpload` mints, which authorise a write to exactly one object.

### Local File Access

The file browser (tRPC `files.list`) and the preview stream
(`GET /api/files/local`) read the server's own filesystem. Both are off when
`NODETOOL_ENV=production`, and outside production both resolve paths against an
allowlist of roots — the user's home directory unless
`NODETOOL_LOCAL_FILE_ROOTS` overrides it (platform-delimited, like `PATH`).
Sensitive entries under home (`.ssh`, `.aws`, `.gnupg`, `.kube`, `.docker`,
`.config/gcloud`, `.netrc`, `.pgpass`, `.npmrc`) are refused inside a root, and
symlinks that leave the roots are refused too.

- **Keep the roots narrow.** Widen `NODETOOL_LOCAL_FILE_ROOTS` only to the
  directories that actually hold media you preview — an external volume, a
  scratch dir — never to `/`. The single entry `*` lifts the containment check
  (the denylist still applies); it belongs to the desktop app, which runs the
  server as one user's own process on loopback and lets them drag a file onto
  the canvas from anywhere. Electron sets it, and a launching environment that
  configured its own roots keeps them.
- **Set `NODETOOL_ENV=production`** on any deployment more than one person can
  reach, which disables both surfaces outright.

### Resource Limits

- **Set container resource limits**: Use `mem_limit` and `cpus` to prevent runaway workloads.
- **Use read-only mounts** where possible to limit filesystem write access.
- See [Docker Resource Management](docker-resource-management.md) for configuration details.

---

## Development (Local)

Local development has the lowest risk but still deserves basic hygiene:

| Action | Details |
|--------|---------|
| Bind to localhost only | Use `127.0.0.1` for all services; avoid publishing container ports to the LAN |
| Use temporary tokens | Generate throwaway tokens for demos; clear `~/.config/nodetool/deployment.yaml` when finished |
| Don't expose to the internet | Never use `ngrok` or similar tunneling without authentication in place |

---

## Staging

Staging environments should mirror production security with some allowances for debugging:

| Action | Details |
|--------|---------|
| Gate access | Use VPN or IP allowlists; do not rely on obscurity |
| Separate credentials | Use distinct Supabase projects and tokens from production |
| Rotate on personnel changes | Rotate service-role keys when team members leave |
| Enable end-to-end TLS | Including internal hops if traversing untrusted networks |
| Regular backups | Back up workspace volumes and databases on a schedule; restrict who can read backups |
| Audit logging | Enable request logging at the proxy layer to track access patterns |

---

## Production

Production deployments require the strictest security posture:

### Authentication & Authorization

- **Enable Supabase mode** (set both `SUPABASE_URL` and `SUPABASE_KEY`) for any multi-user or network-accessible deployment so every request is authenticated
- Keep `NODETOOL_TRUST_LOCALHOST` off and restrict `NODETOOL_TRUSTED_PROXIES` to your real proxy addresses
- **Unset `NODETOOL_TRUST_LOCAL_NETWORKS`** (or leave it ignored under Supabase mode) — never carry a `0.0.0.0/0` trust rule into production
- Use **dedicated service accounts** for each deployment; avoid shared credentials
- Keep `proxy.yaml` free of embedded secrets -- distribute bearer tokens via your secrets manager

### Infrastructure

- Set **`idle_timeout`** and per-service resource caps to prevent runaway workloads on multi-tenant hosts
- Use **separate networks** for the proxy, API server, and worker containers
- Pin container image versions (avoid `latest` tags in production)

### Monitoring & Alerting

- **Centralize logging** -- Forward container logs to your logging platform (ELK, CloudWatch, etc.)
- **Monitor for anomalies**: Auth failures, 429 rate limits, container restarts, unusual traffic spikes
- Set up **alerts** for failed authentication attempts and service health degradation
- Track **resource usage** to detect potential abuse or misconfiguration

### Image Management

- **Rebuild regularly** to pick up base image security patches
- **Track CVEs** in your base images using tools like `trivy` or `grype`
- **Prune unused images** from registries and hosts to reduce attack surface
- **Sign images** if your workflow supports it, to ensure integrity

### Data Protection

- **Encrypt data at rest** -- Use encrypted volumes for workspace and database storage
- **Encrypt data in transit** -- TLS everywhere, including internal service communication
- **Minimize data retention** -- Clear temporary assets (`assets-temp` bucket) on a schedule
- **Backup strategy** -- Regular automated backups with tested restore procedures

---

## Quick Security Audit

Run through this checklist before any deployment goes live:

- [ ] TLS enabled with valid certificates
- [ ] Supabase mode enabled (`SUPABASE_URL` + `SUPABASE_KEY` set) for any network-accessible deployment
- [ ] `NODETOOL_TRUST_LOCAL_NETWORKS` unset or tightly scoped — **no `0.0.0.0/0`** on a network-accessible deployment
- [ ] `NODETOOL_TRUST_LOCALHOST` off and `NODETOOL_TRUSTED_PROXIES` scoped to real proxies
- [ ] All API keys loaded from env vars or secrets manager (not hardcoded)
- [ ] Container resource limits configured
- [ ] Docker socket not exposed to containers
- [ ] Firewall rules restrict access to necessary ports only
- [ ] Logging enabled and forwarded to monitoring platform
- [ ] Backup schedule configured and tested
- [ ] Service tokens rotated within the last 90 days
- [ ] Base images updated within the last 30 days

---

## Related

- [Authentication](authentication.md) -- Auth provider configuration
- [Configuration Guide](configuration.md) -- Environment variables and settings
- [Deployment Guide](deployment.md) -- Deployment overview and workflows
- [Self-Hosted Deployment](self-hosted-deployment.md) -- Self-hosted setup details
- [Docker Resource Management](docker-resource-management.md) -- Container resource limits
- [Storage](storage.md) -- Storage backend configuration
