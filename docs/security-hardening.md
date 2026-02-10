---
layout: page
title: "Security Hardening"
description: "Deployment checklists for locking down NodeTool in dev, staging, and production."
---

Use this page as a quick checklist before exposing NodeTool beyond your laptop. It links to the canonical guides for config, auth, and proxy settings.

## Applies Everywhere

- Require TLS termination at the proxy or ingress; use real certificates and redirect HTTP to HTTPS. See [Proxy Reference](proxy.md).
- Do not run with `AUTH_PROVIDER=none` or `local` outside isolated dev; use `static` or `supabase` and rotate `SERVER_AUTH_TOKEN` regularly. See [Authentication](authentication.md).
- Keep secrets out of Git: load provider keys and tokens from env vars or a secrets manager; never commit `.env` files with secrets.
- Restrict Docker access: run the proxy with a dedicated network (`docker_network`) and avoid exposing the Docker socket beyond the host.
- Limit blast radius: run servers with `mem_limit`/`cpus` and read-only mounts where possible. See [Docker Resource Management](docker-resource-management.md).

## Development (Local)

- Bind services to `127.0.0.1` and avoid publishing container ports to the LAN.
- Use temporary tokens for demos; clear `~/.config/nodetool/deployment.yaml` when finished.
- Disable Terminal WebSocket if unused (`NODETOOL_ENABLE_TERMINAL_WS=`) to reduce exposed surfaces.

## Staging

- Gate access behind VPN or IP allowlists; do not rely on obscurity.
- Use distinct Supabase projects and tokens from production; rotate service-role keys when people leave.
- Enable TLS end-to-end, including internal hops if traversing untrusted networks.
- Back up the workspace volume and databases on a schedule; restrict who can read the backups.

## Production

- Enforce `AUTH_PROVIDER=supabase` (or `static` with long, rotated tokens for service-to-service traffic only).
- Use dedicated proxy and server identities; keep `proxy.yaml` free of embedded secrets and distribute bearer tokens via your secrets manager.
- Set `idle_timeout` and per-service resource caps to prevent runaway workloads on multi-tenant hosts.
- Centralize logging and monitor for auth failures, 429s, and container restarts; alert on unusual spikes.
- Keep images patched: rebuild regularly, track base image CVEs, and prune unused images.

## Related References

- [Authentication](authentication.md)
- [Configuration Guide](configuration.md)
- [Deployment Journeys](deployment-journeys.md)
- [Self-Hosted Deployment](self_hosted.md)
- [Proxy Reference](proxy.md)
- [Docker Resource Management](docker-resource-management.md)
- [Storage](storage.md)
