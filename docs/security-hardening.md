---
layout: page
title: "Security Hardening"
description: "Deployment checklists for locking down NodeTool in dev, staging, and production."
---

Checklist for exposing NodeTool beyond your laptop. Jump to the [Quick Security Audit](#quick-security-audit) for the pre-launch list.

---

## Universal Checklist

These apply to every deployment.

### Network Security

- Terminate TLS at the proxy or ingress with real certificates and redirect HTTP to HTTPS. To terminate in NodeTool itself, see [Serving the Web UI and TLS](configuration.md#serving-the-web-ui-and-tls).
- Run the proxy on a dedicated Docker network and do not expose the Docker socket beyond the host.
- Expose only the ports you need (typically 443) and block direct access to internal service ports.

### Authentication

> **`NODETOOL_TRUST_LOCAL_NETWORKS` bypasses login entirely.** Every source IP in that list is trusted as admin user `"1"` with no password, with full access to data, secrets, and API keys. The Docker Compose file trusts the Docker bridge (`172.16.0.0/12`) and Docker Desktop's VM gateway subnet (`192.168.65.0/24`) for single-user local installs. Never set it to `0.0.0.0/0` on a public IP, and never widen it in place of real auth. Enable SSO or Supabase mode instead. See [Authentication → Local mode in Docker](authentication.md#local-mode-in-docker).
{: .callout-warning}

- **Enforce auth on any network-accessible deployment.** The server enforces authentication only in Supabase mode (**both** `SUPABASE_URL` and `SUPABASE_KEY` set) or SSO mode (**both** `OIDC_ISSUER` and `OIDC_CLIENT_ID` set). Without them it runs in Local mode and trusts loopback connections (and any `NODETOOL_TRUST_LOCAL_NETWORKS` you configure). See [Authentication](authentication.md#authentication-modes).
- **Lock down localhost trust.** Behind a reverse proxy or in a container, set `NODETOOL_TRUST_LOCALHOST=false` (it already defaults off when auth is enforced) and list only your real proxies in `NODETOOL_TRUSTED_PROXIES`, so a proxy connecting from loopback cannot silently bypass auth.
- **Keep `NODETOOL_TRUST_LOCAL_NETWORKS` tight.** Trust the smallest range that works (the Docker bridge, not `0.0.0.0/0`), and firewall the published port. It is ignored in Supabase mode.
- **Know what the server ignores.** `SERVER_AUTH_TOKEN` and `~/.config/nodetool/deployment.yaml` are read only by the `@nodetool-ai/deploy` helpers. The running server does not check them, so they do not protect the API. See [Authentication](authentication.md#deploy-token-helpers).
- **Use access tokens for agents.** A signed-in person can mint a revocable `ntk_` token for an MCP client or script. It works in every auth mode, so there is no need to widen `NODETOOL_TRUST_LOCAL_NETWORKS` to reach `/mcp`.
- **Keep `/mcp` off unless needed.** With `NODETOOL_ENV=production` the `/mcp` mount is not registered unless `NODETOOL_ENABLE_MCP=1`. It carries the full agent toolbelt, so enable it only when clients authenticate. See [MCP production](mcp-production.md).
- **Keep rate limits on.** The per-IP HTTP limiter defaults to 1000 requests per 60 seconds and exempts loopback. Behind a proxy set `NODETOOL_TRUSTED_PROXIES` and `NODETOOL_RATE_LIMIT_TRUST_PROXY` so clients are keyed by their real address. See [Authentication](authentication.md#rate-limiting).

### Secrets Management

- Load provider API keys and tokens from environment variables or a secrets manager. Do not commit `.env` files.
- Provide the encryption master key (`SECRETS_MASTER_KEY`) on every server so they share one key, and store all other deployment secrets in your platform's secrets manager. Rotating the master key also invalidates every delegated (messaging bridge) token and deployed-app session token, which are signed with keys derived from it.
- **Set `NODETOOL_INTEGRATION_TOKEN`** to a random value of 16 or more characters only if you use messaging integrations. Shorter values are ignored and the `/api/integrations` routes are not registered.

### Asset Storage

Asset objects live at `<userId>/<assetId>.<ext>`. The owner is the leading path segment, so the storage backend can enforce the tenant boundary itself:

- Run `nodetool storage migrate-keys` when upgrading a deployment that predates this layout. The local file backend falls back to the old flat key on a miss. Supabase and S3 resolve through signed URLs and need the objects moved. `--dry-run` reports what would move.
- Keep the bucket private. Reads use short-lived signed URLs minted per request, and a public bucket bypasses that.
- Add a storage policy keyed on the prefix: on Supabase an RLS policy on `storage.objects` matching `(storage.foldername(name))[1] = auth.uid()::text`, on S3 a bucket policy on the key prefix. The API already enforces this, and a policy holds even if a signed URL leaks or a handler regresses.
- Never ship `SUPABASE_KEY` to a client. Browsers upload through the key-scoped, single-object targets that `assets.createUpload` mints.

### Local File Access

The file browser (tRPC `files.list`) and the preview stream
(`GET /api/files/local`) read the server's own filesystem. Both are off when
`NODETOOL_ENV=production`, and outside production both resolve paths against an
allowlist of roots — the user's home directory unless
`NODETOOL_LOCAL_FILE_ROOTS` overrides it (platform-delimited, like `PATH`).
Sensitive entries under home (`.ssh`, `.aws`, `.gnupg`, `.kube`, `.docker`,
`.config/gcloud`, `.netrc`, `.pgpass`, `.npmrc`) are refused inside a root, and
symlinks that leave the roots are refused too.

- Widen `NODETOOL_LOCAL_FILE_ROOTS` only to directories that hold media you preview, never to `/`. The single entry `*` lifts the containment check (the denylist still applies). It belongs to the desktop app, which runs the server as one user's process on loopback so they can drag a file onto the canvas from anywhere. Electron sets it, and a launching environment that configured its own roots keeps them.
- Set `NODETOOL_ENV=production` on any deployment more than one person can reach. It disables both surfaces.

### Resource Limits

Set `mem_limit` and `cpus` on containers and use read-only mounts where possible. See [Docker Resource Management](docker-resource-management.md).

---

## Development (Local)

| Action | Details |
|--------|---------|
| Bind to localhost only | Use `127.0.0.1` for all services and do not publish container ports to the LAN |
| Use temporary tokens | Mint throwaway `ntk_` access tokens for demos and revoke them when finished |
| Don't expose to the internet | Never use `ngrok` or similar tunneling without authentication in place |

---

## Staging

| Action | Details |
|--------|---------|
| Gate access | Use a VPN or IP allowlists |
| Separate credentials | Use distinct Supabase projects and tokens from production |
| Rotate on personnel changes | Rotate Supabase service-role keys when team members leave |
| Enable end-to-end TLS | Including internal hops if traversing untrusted networks |
| Regular backups | Back up workspace volumes and databases on a schedule and restrict who can read backups |
| Audit logging | Enable request logging at the proxy layer to track access patterns |

---

## Production

### Authentication & Authorization

- Enable SSO or Supabase mode for any multi-user or network-accessible deployment so every request is authenticated.
- Keep `NODETOOL_TRUST_LOCALHOST` off and restrict `NODETOOL_TRUSTED_PROXIES` to your real proxy addresses.
- Unset `NODETOOL_TRUST_LOCAL_NETWORKS`. Never carry a `0.0.0.0/0` trust rule into production.
- Use a dedicated service account per deployment and distribute tokens through your secrets manager, not files in the image or repository.
- Public app links exist only with `NODETOOL_ENV=production`. An owner can deploy a published mini app to `/a/<token>`, where anyone with the link runs it without logging in, on the owner's provider keys, against the app's spend budget. Set a budget on every deployed app (**Governance › Spend budget**). The link is the credential. Withdrawing it is the only way to invalidate it, and outstanding run sessions expire after one hour rather than immediately.

### Infrastructure and data

- Cap per-container resources on multi-tenant hosts, use separate networks for proxy, API server, and workers, and pin image versions (no `latest`).
- Rebuild images regularly and scan base images for CVEs.
- Use encrypted volumes for workspace and database storage, and TLS on internal hops that cross untrusted networks.
- Clear temporary assets on a schedule. `TEMP_BUCKET` is separate from `ASSET_BUCKET`, so it can have its own retention policy.
- Forward container logs to your logging platform and alert on auth failures, `429` responses, and container restarts.
- Run scheduled backups with tested restores, and restrict who can read them.

---

## Quick Security Audit

- [ ] TLS enabled with valid certificates
- [ ] SSO or Supabase mode enabled for any network-accessible deployment
- [ ] `NODETOOL_TRUST_LOCAL_NETWORKS` unset or tightly scoped — **no `0.0.0.0/0`** on a network-accessible deployment
- [ ] `NODETOOL_TRUST_LOCALHOST` off and `NODETOOL_TRUSTED_PROXIES` scoped to real proxies
- [ ] All API keys loaded from env vars or secrets manager (not hardcoded)
- [ ] Container resource limits configured
- [ ] Docker socket not exposed to containers
- [ ] Firewall rules restrict access to necessary ports only
- [ ] Logging enabled and forwarded to monitoring platform
- [ ] Backup schedule configured and tested

---

## Related

- [Authentication](authentication.md)
- [Configuration Guide](configuration.md)
- [Deployment Guide](deployment.md)
- [Self-Hosted Deployment](self-hosted-deployment.md)
- [Docker Resource Management](docker-resource-management.md)
- [Storage](storage.md)
