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

- **Require TLS** at the proxy or ingress layer. Use real certificates (e.g., Let's Encrypt) and redirect HTTP to HTTPS. See [Proxy Reference](proxy.md).
- **Restrict Docker access**: Run the proxy with a dedicated network (`docker_network`) and avoid exposing the Docker socket beyond the host.
- **Firewall rules**: Only expose the ports you need (typically 443 for HTTPS). Block direct access to internal service ports.

### Authentication

- **Never run `AUTH_PROVIDER=none` or `local`** outside isolated dev environments.
- Use `static` (with `SERVER_AUTH_TOKEN`) or `supabase` for any network-accessible deployment. See [Authentication](authentication.md).
- **Rotate tokens regularly** -- set calendar reminders to rotate `SERVER_AUTH_TOKEN` and Supabase service role keys.

### Secrets Management

- **Keep secrets out of Git**: Load provider API keys and tokens from environment variables or a secrets manager.
- **Never commit `.env` files** with secrets. Add `.env` to `.gitignore`.
- Store deployment secrets in `secrets.yaml` (not checked into version control) or use your platform's secrets manager (AWS Secrets Manager, GCP Secret Manager, etc.).

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
| Disable unused services | Set `NODETOOL_ENABLE_TERMINAL_WS=` to disable the Terminal WebSocket if not needed |
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

- **Enforce `AUTH_PROVIDER=supabase`** for multi-user deployments, or `static` with long, rotated tokens for service-to-service traffic only
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
- [ ] `AUTH_PROVIDER` is not `none` or `local`
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
- [Proxy Reference](proxy.md) -- Reverse proxy and TLS configuration
- [Docker Resource Management](docker-resource-management.md) -- Container resource limits
- [Storage](storage.md) -- Storage backend configuration
