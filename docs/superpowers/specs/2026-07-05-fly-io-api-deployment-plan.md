# Fly.io deployment plan — API on Fly, UI stays on Cloudflare Pages

**Date:** 2026-07-05
**Status:** Plan for review
**Scope:** Move the production NodeTool API (the GHCR server image currently run
via `deploy.sh` on a single Docker host behind Cloudflare) to Fly.io, and decide
whether the web UI should move there too. This is about nodetool.ai's own
production infrastructure — it does not resurrect the removed `nodetool deploy`
Fly target for self-hosters.

---

## 1. Current production topology

- **API**: `.github/workflows/docker.yml` builds `ghcr.io/nodetool-ai/nodetool`
  (linux/amd64) on every push to main. `deploy.sh` pulls it onto a single Docker
  host and runs it with `--memory=4g --cpus=2`, TLS at the origin, Cloudflare in
  front (`api.nodetool.ai`). `web/dist` is bind-mounted from the host.
- **UI**: `web/` is a static Vite SPA deployed to Cloudflare Pages by
  `.github/workflows/web-deploy.yml`, with `VITE_API_URL=https://api.nodetool.ai`
  baked at build time. Auth is Supabase; the Pages build bakes the anon key.
- **State**, all under `/workspace` in the container:
  - main DB: SQLite (`DB_PATH`) *or* Postgres (`DATABASE_URL` — the entrypoint
    runs `scripts/db-migrate.mjs` automatically on boot)
  - vector store: sqlite-vec file (`VECTORSTORE_DB_PATH`)
  - assets: local folder (`ASSET_FOLDER`) *or* S3-compatible bucket
    (`ASSET_BACKEND=s3`, `ASSET_BUCKET`, `S3_ENDPOINT`, `S3_REGION`)
  - generated `SECRETS_MASTER_KEY` fallback file, HF cache
- **Protocols**: HTTP + WebSocket (`/ws`, msgpack) on port 7777. `/health`
  endpoint exists and is what `deploy.sh` and the image HEALTHCHECK poll.

Everything Fly needs is already in the image: it boots from env vars alone,
refuses to start without a DB config, optionally serves the UI from
`STATIC_FOLDER`, and runs plain HTTP when `TLS_CERT`/`TLS_KEY` are unset (Fly's
edge terminates TLS, like Cloudflare does today).

## 2. Target architecture on Fly

### Phase 1 — lift and shift (single machine + volume)

One Fly app (`nodetool-api`), one Machine, one volume mounted at `/workspace`.
Keeps SQLite and local asset storage exactly as the docker-compose reference
runs them. This is the smallest change from today's single-host deploy and is
the recommended starting point.

Proposed `fly.toml`:

```toml
app = "nodetool-api"
primary_region = "fra"          # pick the region closest to current users

[build]
  image = "ghcr.io/nodetool-ai/nodetool:latest"   # CI overrides with --image <tag>

[env]
  HOST = "0.0.0.0"
  PORT = "7777"
  NODETOOL_ENV = "production"
  STATIC_FOLDER = "/app/web/dist"
  DB_PATH = "/workspace/nodetool.sqlite3"
  VECTORSTORE_DB_PATH = "/workspace/vectorstore.db"
  ASSET_FOLDER = "/workspace/assets"
  HF_HOME = "/workspace/hf-cache"

[mounts]
  source = "nodetool_data"
  destination = "/workspace"

[http_service]
  internal_port = 7777
  force_https = true
  auto_stop_machines = "off"    # WebSocket sessions + long-running jobs
  auto_start_machines = true
  min_machines_running = 1

  [[http_service.checks]]
    interval = "15s"
    timeout = "5s"
    grace_period = "30s"
    method = "GET"
    path = "/health"

[[vm]]
  size = "shared-cpu-4x"
  memory = "4gb"                # matches today's --memory=4g --cpus=2
```

Secrets via `fly secrets set` (never in `[env]`):

```bash
fly secrets set \
  SECRETS_MASTER_KEY="$(openssl rand -base64 32)" \
  SUPABASE_URL=... SUPABASE_KEY=... SUPABASE_ANON_KEY=... \
  OPENAI_API_KEY=... ANTHROPIC_API_KEY=... GEMINI_API_KEY=... FAL_API_KEY=... HF_TOKEN=...
```

Notes:

- **Do not set `NODETOOL_TRUST_LOCAL_NETWORKS`.** Requests arrive from the Fly
  proxy, never loopback, so local mode's IP trust is both broken and dangerous
  here. Supabase auth must stay on, as in production today.
- **TLS**: leave `TLS_CERT`/`TLS_KEY` unset — the origin speaks plain HTTP to
  the Fly proxy, which terminates TLS (equivalent of today's `--no-tls` +
  Cloudflare Flexible, but without the unencrypted hop since Fly's proxy and
  Machine are on the same private network).
- **Set `SECRETS_MASTER_KEY` explicitly.** The entrypoint's generated-key
  fallback persists to the volume, but an explicit secret survives volume
  loss/recreation and volume forks for staging.
- **CORS**: `packages/websocket/src/cors.ts` already allows
  `https://*.nodetool.ai`, so the Pages-hosted UI keeps working. The
  `nodetool-api.fly.dev` hostname is only for smoke tests; the real hostname is
  `api.nodetool.ai` via `fly certs add api.nodetool.ai` + DNS CNAME.
- **Deploys**: a single Machine with a volume means `fly deploy` does a
  stop-and-replace — a few seconds of downtime per deploy, comparable to the
  swap window in today's rolling script. Acceptable for now; Phase 2 removes it.
- **Backups**: Fly volume snapshots (daily, configurable retention) replace
  today's host-level backups. Add `fly volumes snapshots create` to a scheduled
  workflow if point-in-time matters.

### Phase 2 — externalize state (only if/when needed)

When single-machine SQLite becomes the constraint (HA, zero-downtime deploys,
multi-region), the image already supports the pieces:

1. **DB → Postgres**: set `DATABASE_URL` to a Fly Managed Postgres (or
   Supabase Postgres, already in the stack) — the entrypoint runs migrations on
   boot. Unset `DB_PATH` (the entrypoint rejects both being set).
2. **Assets → Tigris**: Fly's built-in S3-compatible storage. The storage
   backend already takes a custom endpoint: `ASSET_BACKEND=s3`,
   `ASSET_BUCKET=...`, `S3_ENDPOINT=https://fly.storage.tigris.dev`,
   `S3_REGION=auto`, plus AWS-style credentials. (Supabase storage is the
   alternative — the adapter exists too.)
3. **Remaining blocker**: the vector store is a per-machine sqlite-vec file
   with no server-backed alternative, so RAG collections would not be shared
   across machines. Until that is addressed, run **one** machine even in
   Phase 2 — you still gain managed Postgres, durable assets, and
   near-zero-downtime deploys (no volume pinning the machine).

Do not start with Phase 2. It adds two managed dependencies before there is
evidence the single-machine setup falls short.

## 3. CI/CD

Reuse the existing image pipeline; add a deploy job instead of a new build:

- New workflow `fly-deploy.yml` triggered by `workflow_run` on the Docker
  workflow's success for `main` (or a final job appended to `docker.yml`):

  ```yaml
  - uses: superfly/flyctl-actions/setup-flyctl@master
  - run: flyctl deploy --image ghcr.io/nodetool-ai/nodetool:main-${SHORT_SHA} --remote-only
    env:
      FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
  ```

- `FLY_API_TOKEN` is a deploy-scoped token (`fly tokens create deploy`), stored
  as a repo secret. The GHCR package is public, so Fly needs no registry auth.
- Deploying by immutable `main-<shortsha>` tag (not `:latest`) keeps the same
  commit-pinning property `deploy.sh` has, and `fly releases` gives rollback
  (`fly deploy --image <previous tag>`), replacing the `:rollback` local tag.
- Preview instances (today's `deploy.sh --slug`) map to separate Fly apps
  deployed from `preview/**` images with forked volumes — worth doing only if
  previews are actually used.

## 4. Known functional limits on Fly (same as any container deploy)

- **Docker code-runner nodes**: no Docker daemon in a Fly Machine; only the
  subprocess runner works. Unchanged from the current container deploy.
- **Python nodes**: the runtime image has no Python; Python nodes need a remote
  worker (`NODETOOL_WORKER_URL`) on RunPod/Vast. Unchanged.
- **WebSockets**: supported by Fly's proxy; the client's existing
  reconnect/keepalive handles idle drops. Long-running jobs keep the machine
  busy, hence `auto_stop_machines = "off"`.

## 5. Should the UI move to Fly too? Recommendation: no — keep Cloudflare Pages

The image already bakes `web/dist` and `STATIC_FOLDER` serves it, so the Fly
app can serve the UI at zero extra engineering cost. That is worth keeping
enabled as a fallback (hitting `api.nodetool.ai` directly always yields a
working, version-matched UI). But as the primary UI origin, Fly is worse than
Pages on every axis that matters for a static SPA:

| | Cloudflare Pages (today) | Served from the Fly app |
|---|---|---|
| Latency | global edge CDN | one region, no CDN |
| Cost | free (static) | Fly egress per GB + machine bandwidth |
| Deploy cadence | UI ships independently in ~5 min | UI change = new image + API redeploy |
| Rollback | per-deployment, instant | coupled to API releases |
| Availability | independent of API health | down when the API is down |
| CORS / config | needs allow-list (already in place) and `VITE_API_URL` | same origin, none needed |
| Version skew | UI and API can drift between deploys | impossible — always matched |

Single-origin serving wins only on version skew and CORS, and both are already
solved (the CORS allow-list covers `*.nodetool.ai`; the runtime `/api/config`
endpoint means auth config isn't baked). The moment the API machine is
restarting or a deploy is in flight, a Fly-served UI is unreachable too —
Pages keeps the app shell loading regardless.

Also note Cloudflare isn't being "left": the marketing site
(`marketing/`, Workers via OpenNext) and Pages stay. The only thing Fly
replaces is the Docker host behind `api.nodetool.ai`.

**Decision**: API → Fly. UI stays on Cloudflare Pages, unchanged
(`VITE_API_URL` still points at `api.nodetool.ai`, which now resolves to Fly).
Revisit only if operating two platforms proves more costly than the CDN and
independent-deploy benefits.

## 6. Cutover plan

1. `fly launch --no-deploy` with the `fly.toml` above; create the volume
   (`fly volumes create nodetool_data --size 50`); set secrets.
2. First deploy from the current main image tag; smoke-test on
   `nodetool-api.fly.dev` (health, login, run a workflow, WebSocket chat,
   asset upload/download).
3. Migrate state: `fly ssh sftp` (or a one-shot machine) to copy
   `nodetool.sqlite3`, `vectorstore.db`, and `assets/` from the current host's
   `/workspace` volume. Copy the existing `SECRETS_MASTER_KEY` (or
   `.secrets_master_key` file contents) — stored secrets are encrypted with it
   and unreadable under a new key.
4. `fly certs add api.nodetool.ai`; lower DNS TTL in advance; flip the
   `api.nodetool.ai` record from the VPS to the Fly app. If the record stays
   Cloudflare-proxied, use DNS-only (grey cloud) or Cloudflare Full (Strict) —
   Fly serves a valid cert either way.
5. Watch `fly logs` + Pages UI against the new origin for a day; keep the VPS
   container stopped-but-intact for a week as rollback; then decommission and
   retire `deploy.sh`/`redeploy.sh` (or keep them documented for self-hosters
   only).

## 7. Rough cost

- Machine `shared-cpu-4x` / 4 GB, always-on: ≈ $30–40/mo (a `performance-2x`
  is ≈ $60–70/mo if shared CPUs prove too slow for graph execution).
- Volume: $0.15/GB/mo (50 GB ≈ $7.50).
- Egress: ~$0.02/GB (EU/NA) — small while the UI (the bandwidth-heavy part)
  stays on Pages; assets are the main variable.

Comparable to or cheaper than a mid-size VPS, minus the host maintenance.

## 8. Open questions

- Which region — where are current users / where is the VPS today?
- Asset volume size on the current host (sizes the Fly volume and decides how
  soon Tigris matters)?
- Are `--slug` preview instances used enough to justify Fly preview apps?
- Is there any dependency on Cloudflare features on `api.nodetool.ai` (WAF
  rules, rate limiting, tunnel)? If yes, keep the record proxied through
  Cloudflare in front of Fly.
