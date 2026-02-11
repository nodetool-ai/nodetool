---
layout: page
title: "Proxy Reference"
---



The NodeTool proxy (`src/nodetool/proxy/server.py`) is an asynchronous reverse proxy that starts Docker services on demand, terminates TLS/ACME, and forwards HTTP traffic using longest-prefix routing. It is deployed as a standalone container (`docker/proxy/Dockerfile`) or run locally via the CLI.

## Architecture

- **FastAPI application** (`nodetool.proxy.server.AsyncReverseProxy`) – handles incoming requests, matches URL prefixes, and proxies them to running containers.
- **Docker manager** (`nodetool.proxy.docker_manager.DockerManager`) – keeps track of registered services, starts/stops containers, and enforces idle timeouts.
- **Configuration schema** (`nodetool.proxy.config.ProxyConfig`) – deserialises YAML into strongly typed settings for global behaviour and individual services.
- **Header filters** (`nodetool.proxy.filters`) – remove hop-by-hop headers and sensitive metadata when proxying.

Key behaviours:

- Longest-prefix routing (`/app`, `/chat`, `/`) with deterministic ordering.
- On-demand cold starts with serialized startup per service to avoid duplicate container boots.
- Automatic idle shutdown after `idle_timeout` seconds, freeing resources when routes are unused.
- Optional TLS termination via ACME/Let’s Encrypt; HTTP fallback for ACME challenges when certificates are absent.
- Bearer-token protection on all non-ACME endpoints (`Authorization: Bearer …`).

## Configuration (`proxy.yaml`)

Rendered by the deployer into `<workspace>/proxy/proxy.yaml`; schema defined in `src/nodetool/proxy/config.py`.

```yaml
global:
  domain: example.com
  email: admin@example.com
  bearer_token: ${PROXY_BEARER_TOKEN}
  idle_timeout: 300
  listen_http: 80
  listen_https: 443
  docker_network: nodetool-net
  connect_mode: docker_dns        # or host_port
  http_redirect_to_https: true
  acme_webroot: /var/www/acme
  tls_certfile: /etc/letsencrypt/live/example.com/fullchain.pem
  tls_keyfile: /etc/letsencrypt/live/example.com/privkey.pem
  auto_certbot: false

services:
  - name: nodetool-server
    path: /
    image: nodetool:latest
    internal_port: 7777
    host_port: null              # auto-select unless using host_port mode
    mem_limit: 8g
    cpus: 4.0
    environment:
      NODETOOL_API_URL: http://localhost:7777
    volumes:
      /data/workspace:
        bind: /workspace
        mode: rw
```

### Global settings

- **domain/email** – used for redirects and ACME registration.  
- **bearer_token** – required header for `/proxy/status` and proxied routes; generate with `openssl rand -hex 32`.  
- **listen_http/listen_https** – external ports exposed by the proxy container.  
- **docker_network** – shared Docker network between proxy and services.  
- **connect_mode** – `docker_dns` resolves container names inside the network; `host_port` forwards to published ports.  
- **idle_timeout** – seconds before an idle service is stopped.  
- **auto_certbot** – run certbot on the host to fetch/renew certificates before proxy startup.

### Services

Each service maps a URL prefix to a Docker image:

- `path` – match prefix (root `/` catches everything else).  
- `image` – container image and tag.  
- `internal_port` – port exposed inside the container.  
- `host_port` – optional static port on the host (only used with `host_port` mode).  
- `environment` / `volumes` – additional runtime configuration.  
- `mem_limit`, `cpus` – resource constraints passed to Docker.

## CLI Commands

All proxy commands are exposed by `nodetool cli`:

- `nodetool proxy --config proxy.yaml` – run the proxy in the foreground with optional `--no-tls` and `--verbose`.  
- `nodetool proxy-daemon --config proxy.yaml` – manage the proxy process via the deployer (start/stop).  
- `nodetool proxy-status --server-url https://example.com/proxy/status --bearer-token TOKEN` – query service state (running/stopped, host ports, last access).  
- `nodetool proxy-validate-config --config proxy.yaml` – parse and validate configuration without launching the server.

## Operational Tips

- Ensure the proxy container and service containers share a Docker network (`docker network create nodetool-net`).  
- Persist certificates and ACME data on the host (`/etc/letsencrypt`, `/var/www/acme`) via bind mounts when auto-certbot is enabled.  
- For private deployments, distribute the generated bearer token through your secrets manager and keep `proxy.yaml` free of hard-coded secrets.  
- Monitor the proxy logs: `docker logs nodetool-proxy -f` or `nodetool proxy-status --follow`.  
- Adjust `idle_timeout` for workloads with bursty traffic—higher values reduce cold starts at the cost of longer-lived containers.

## Related Documentation

- [Self-Hosted Deployment](self-hosted-deployment.md) – end-to-end instructions for pairing the proxy with server containers.  
- [Deployment Guide](deployment.md) – CLI workflow for applying proxy-enabled deployments.  
- [Configuration Guide](configuration.md) – how environment variables and secrets are supplied to services.  
- [Docker Resource Management](docker-resource-management.md) – tuning container limits for multi-tenant setups.
