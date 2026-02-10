---
layout: page
title: "Self-Hosted Deployment Guide"
---



This guide explains how to deploy NodeTool in self-hosted environments using the
built-in FastAPI proxy. It covers the proxy architecture, configuration,
container images, deployment model (`deployment.yaml`), persistent storage, TLS,
and common operational tasks.

## Overview

Self-hosted deployments now manage two key containers:

1. **Proxy container (`nodetool-proxy`)** – the only public-facing component.
   - Terminates HTTP/HTTPS traffic.
   - Authenticates every request (Bearer token).
   - Talks to the Docker socket to start/stop service containers on demand.
2. **Service container(s)** – e.g. the NodeTool server image (`nodetool`), which
   run only when traffic arrives.

`nodetool deploy apply <deployment>` orchestrates everything: it renders the
proxy config, ensures the Docker network, starts/restarts the proxy container,
and performs health checks before reporting success.

## Repository Layout

```
src/nodetool/proxy/
├── __init__.py              # exported helpers for python users
├── __main__.py              # `python -m nodetool.proxy` entrypoint
├── config.py                # Pydantic schema for proxy.yaml
├── docker_manager.py        # async Docker lifecycle helpers
├── filters.py               # hop-by-hop header filtering
└── server.py                # FastAPI app + uvicorn runners

src/nodetool/proxy/requirements.txt   # proxy-only runtime dependencies
docker/proxy/Dockerfile               # slim runtime image
examples/proxy-config.yaml            # reference configuration
```

## Proxy Runtime & Dependencies

The proxy installs only a small dependency set (see
`src/nodetool/proxy/requirements.txt`):

```
fastapi
uvicorn
httpx
PyYAML
pydantic
docker
```

`docker/proxy/Dockerfile` builds a small image from `python:3.11-slim`, installs
those requirements, copies the proxy package into `/app/nodetool/proxy`, creates
an unprivileged `proxy` user, and sets the entrypoint to `python -m
nodetool.proxy`.

### Building the Image

```bash
docker build -f docker/proxy/Dockerfile -t nodetool-proxy:latest .
```

The built image exposes ports 80 and 443; however, the deployer publishes the
actual host ports defined in `proxy.listen_http` and `proxy.listen_https`.

## Proxy Configuration (`proxy.yaml`)

The config rendered by the deployer lives at `<workspace>/proxy/proxy.yaml`. It
follows the schema defined in `src/nodetool/proxy/config.py`.

### Global Settings

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `domain` | str | required | Public hostname used for redirects/status URLs |
| `email` | str | required | Let's Encrypt contact email |
| `bearer_token` | str | required | Token required for all non-ACME endpoints |
| `idle_timeout` | int | 300 | Seconds of inactivity before stopping a service |
| `listen_http` | int | 80 | Proxy HTTP listener (ACME + optional HTTP mode) |
| `listen_https` | int | 443 | Proxy HTTPS listener (enabled when TLS files present) |
| `acme_webroot` | str | `/var/www/acme` | Directory shared with certbot for HTTP-01 |
| `tls_certfile` | str\|None | — | Fullchain cert path on the host (mounted into the container) |
| `tls_keyfile` | str\|None | — | Private key path on the host |
| `local_tls_certfile` | str\|None | — | Optional local file copied to the host before deployment |
| `local_tls_keyfile` | str\|None | — | Optional local file copied to the host before deployment |
| `auto_certbot` | bool | `False` | When true, run certbot on the host to obtain/renew certificates |
| `log_level` | str | `INFO` | Proxy logging level |
| `docker_network` | str | `nodetool-net` | Docker network shared by proxy + services |
| `connect_mode` | `docker_dns`\|`host_port` | `docker_dns` | How the proxy reaches services |
| `http_redirect_to_https` | bool | `True` | Redirect HTTP (non-ACME) to HTTPS |

### Services

All service containers must listen on **port 7777 internally**. The proxy starts
them on demand.

| Field | Type | Description |
| --- | --- | --- |
| `name` | str | Docker container name (unique per deployment) |
| `path` | str | URL prefix used for longest-prefix routing |
| `image` | str | Docker image (with tag) |
| `environment` | dict[str,str] | Environment variables for the container |
| `volumes` | dict[str, str \| dict] | Volume mounts. Values can be `"/host:/container[:mode]"` or `{bind: "/container", mode: "rw"}` |
| `mem_limit` | str | Optional memory limit (e.g. `"1g"`) |
| `cpus` | float | Optional CPU limit (converted to `nano_cpus`) |
| `host_port` | int | Only used if `connect_mode` is `host_port` |

### Environment Overrides

Override globals with env vars at runtime:

```bash
export PROXY_GLOBAL_DOMAIN=example.internal
export PROXY_GLOBAL_BEARER_TOKEN=$(openssl rand -hex 32)
python -m nodetool.proxy --config /etc/nodetool/proxy.yaml
```

Service-specific overrides use `PROXY_SERVICE_<SERVICE_NAME>_<KEY>`.

## Deployment Model (`deployment.yaml`)

Self-hosted deployments declare both the server container and the proxy. Example:

```yaml
deployments:
  localhost:
    type: self-hosted
    host: localhost
    paths:
      workspace: /tmp/nodetool-workspace
      hf_cache: /Users/you/.cache/huggingface
    image:
      name: nodetool
      tag: latest
    container:
      name: nodetool-localhost
      port: 9001
    server_auth_token: <optional>
    proxy:
      image: nodetool-proxy:latest
      listen_http: 80
      listen_https: 443
      domain: localhost
      email: admin@localhost
      tls_certfile: /etc/letsencrypt/live/localhost/fullchain.pem
      tls_keyfile: /etc/letsencrypt/live/localhost/privkey.pem
      local_tls_certfile: ./certs/localhost/fullchain.pem
      local_tls_keyfile: ./certs/localhost/privkey.pem
      auto_certbot: true
      docker_network: nodetool-net-localhost
      connect_mode: docker_dns
      http_redirect_to_https: true
      services:
        - name: nodetool-localhost
          path: /
          image: nodetool:latest
          environment:
            PORT: "7777"
            NODETOOL_API_URL: "http://localhost:9001"
            DB_PATH: "/workspace/nodetool.db"
            HF_HOME: "/hf-cache"
            NODETOOL_WORKFLOWS: "586143fea92c11f0964b000065b1ad28"
          volumes:
            /tmp/nodetool-workspace:
              bind: /workspace
              mode: rw
            /Users/you/.cache/huggingface:
              bind: /hf-cache
              mode: ro
```

Key points:

- `server_auth_token` is reused as the proxy bearer token if `proxy.bearer_token`
  is omitted. Otherwise the deployer generates a `proxy_bearer_token` and stores
  it in the deployment state.
- Volume mappings support either string or dict syntax. Dicts allow explicit
  access modes (`rw`/`ro`).
- The proxy network is created if missing (`docker network inspect/create`).
- The deployer writes `<workspace>/proxy/proxy.yaml` for visibility/debugging.

## Persistent Storage

- **Workspace** (`paths.workspace`) – mounted read/write into the server as
  `/workspace`. Place your SQLite database here (e.g. `DB_PATH=/workspace/nodetool.db`).
- **Hugging Face cache** (`paths.hf_cache`) – mounted read-only into the server
  as `/hf-cache`. Update `HF_HOME` accordingly.
- Add additional storage by extending `volumes` per service.

## Deployment Steps

1. Build images (proxy + server):

   ```bash
    docker build -f docker/proxy/Dockerfile -t nodetool-proxy:latest .
    docker build -t nodetool:latest .
   ```

2. Apply the deployment:

 ```bash
  nodetool deploy apply localhost
  ```

  This will:

- Create workspace, cache, proxy, and acme directories.
- Ensure the Docker network exists.
- Stop/remove any existing proxy container.
- Start the new proxy container with the rendered config.
- Health-check `/healthz` and `/status`.

3. Verify status (using the rendered token):

   ```bash
   TOKEN=$(yq '.deployments.localhost.proxy.bearer_token' ~/.config/nodetool/deployment.yaml)
   curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/status
   ```

4. Run workflows through the proxy:

   ```bash

  nodetool deploy workflows run localhost <workflow-id>

  ```

  The proxy logs show cold-start/start/stop messages; `/status` reports service
  state (`running`, `exited`, etc.).

5. (Optional) Verify HTTPS if enabled:

   ```bash
   curl -vk -H "Authorization: Bearer $TOKEN" https://localhost:443/status
   ```

   You should see a `200 OK` response and the proxy will list the managed
   services.

## TLS & ACME

- If you populate `local_tls_certfile`/`local_tls_keyfile`, the deployer copies
  those files to `tls_certfile`/`tls_keyfile` on the host before starting the
  proxy (permissions are set to `600`).
- When `auto_certbot` is enabled, the deployer runs `certbot certonly --webroot`
  on the host to obtain/renew certificates automatically (Certbot must already
  be installed on the host). Certificates are written to the paths specified by
  `tls_certfile` and `tls_keyfile`.
- Ensure port 80 (or the value of `listen_http` if different) is reachable from
  the public internet so Let's Encrypt can complete the HTTP-01 validation.
- Install certbot on the target host ahead of time (for example,
  `sudo apt install certbot`). The deployer reuses the existing certbot timers
  for renewal; you can check status with `systemctl status certbot.timer`.
- Without TLS the proxy serves plain HTTP on `listen_http`.
- ACME HTTP-01 uses `acme_webroot`; ensure the directory is writable on both host
  and proxy container (for certbot + proxy to share challenges).
- Renewed certificates require restarting the proxy (`nodetool deploy apply ...`).

## Troubleshooting

| Symptom | Likely Cause | Fix |
| --- | --- | --- |
| Proxy container exits immediately | Config parse failure or missing `/var/run/docker.sock` | Inspect container logs and `<workspace>/proxy/proxy.yaml`; ensure the socket is mounted |
| `/status` always `not_created` | Service container failed to start (bad image/env) | Check proxy logs for Docker errors, and `docker logs <service>` |
| `401 Unauthorized` when running workflows | Bearer token mismatch | Ensure `proxy.bearer_token` matches `server_auth_token`; re-apply deployment to sync |
| Curl reset or 500 during long responses | Upstream closed stream mid-response | Inspect server logs; proxy now buffers entire response but upstream must complete the body |
| ACME challenge fails | ACME webroot not shared/mounted | Mount the same host directory into the proxy container and certbot |
| Need different cache/DB location | Adjust `paths.workspace` / `paths.hf_cache` and update volume bindings + env vars (e.g. `DB_PATH`, `HF_HOME`) |

## Useful Commands

- `python -m nodetool.proxy --config <proxy.yaml>` – run the proxy manually (HTTP-only or HTTPS + ACME).
- `nodetool deploy plan <name>` – preview directories, networks, and containers the deployer will touch.
- `nodetool deploy logs <name>` – tail proxy container logs.
- `nodetool deploy workflows list <name>` – enumerate available workflows before running them.

With these steps your self-hosted environment deploys a slim proxy container as
the public entrypoint, keeps the server private, and persists all important data
on host volumes.

## Related Documentation

- [Deployment Guide](deployment.md) – end-to-end deploy CLI workflow.
- [Proxy Reference](proxy.md) – proxy configuration schema, TLS, and status endpoints.
- [Storage Guide](storage.md) – configuring asset and cache volumes.
- [Configuration Guide](configuration.md) – environment variables and secrets.
