# Worker & Deployment Redesign

**Date:** 2026-06-08
**Status:** Design — approved through brainstorming, pending spec review
**Supersedes scope of:** the ad-hoc RunPod pod script (`packages/deploy/scripts/runpod-worker.ts`) and the multi-target server-deployment matrix.

## 1. Motivation

NodeTool grew two deployment concerns that got tangled into one config union:

- A **server-publishing** system (`packages/deploy`) with six targets (docker, gcp, fly,
  railway, huggingface, runpod-serverless) that all deploy the *same* generic NodeTool
  Fastify server.
- The beginnings of a **GPU-worker provisioning** system (`runpod-rest.ts` +
  `scripts/runpod-worker.ts`) that deploys the lean Python worker and was never wired into
  the deployment manager.

An audit of the current system surfaced three problems that this redesign fixes:

1. **The `workflows` config field is dead.** `NODETOOL_WORKFLOWS` is written
   (`docker-run.ts:234`, `compose.ts:155`) but read nowhere. "Deploy a workflow" was always
   a misnomer — every target ships the same generic server that reads workflows from its DB.
2. **RunPod-serverless-as-server is broken.** It pushes a persistent WS server to a
   job-queue endpoint with no handler (`runpod-api.ts` sets no `dockerStartCmd`; prints dead
   `/runsync` + `/run` URLs at `runpod.ts:218`). The endpoint can never receive a job.
3. **Three targets are aspirational.** fly/railway/huggingface have real apply/destroy code
   but **zero tests, zero docs**, and are absent from the README. Only docker/gcp/runpod have
   real doc + test investment.

The product decision: **make GPU workers the headline, and collapse server deployment to a
single Docker self-host path.** NodeTool stops pretending to be a universal PaaS-deployer and
becomes excellent at the one thing users actually need — renting a GPU for their graphs.

## 2. Core model: role × target

Deployment has two orthogonal axes that the old `type` union conflated:

```
                  TARGET →   docker     runpod        vast
   ROLE ↓
   server (publish)          ✅ keep     —             —
   worker (attach)           (manual)*   ✅ pod         ✅
```

\* Local/LAN workers remain supported by pointing `NODETOOL_WORKER_URL` at a manually-run
worker container — they just don't get a managed provisioning provider.

The two roles are **separate subsystems** that differ fundamentally:

| | **Server (publish)** | **Worker (attach)** |
|---|---|---|
| Direction | north-side — humans/UI connect *in* | south-side — a NodeTool instance connects *out* |
| Lifetime | long-lived, always-on | ephemeral — spin up for work, tear down |
| Identity | a URL handed to people | a `{wsUrl, token}` an instance adopts |
| Cost model | flat | **GPU bills by the minute — teardown is critical** |
| Net change | **shrink to Docker only** | **build the new subsystem** |

## 3. Server deployment: collapse to Docker self-host

### Keep
- **Docker self-host** (`packages/deploy/src/self-hosted.ts`, `docker-run.ts`, `compose.ts`,
  `docker.ts`) — complete, tested (65 cases), the canonical "run your own NodeTool server"
  path. Left functionally as-is.

### Delete
- Deployers: `runpod.ts`, `deploy-to-runpod.ts`, `runpod-api.ts`, `gcp.ts`,
  `deploy-to-gcp.ts`, `fly.ts`, `railway.ts`, `huggingface.ts`.
- Script: `scripts/runpod-worker.ts` (folded into the worker subsystem + CLI).
- Their tests (`deploy-to-runpod.test.ts`, `deploy-to-gcp.test.ts`, `runpod-api.test.ts`,
  `google-cloud-run-api.test.ts`, `fly`/`railway`/`huggingface` tests if any).
- Their schemas in `deployment-config.ts` (RunPod/GCP/Fly/Railway/HuggingFace variants),
  leaving only the Docker variant.
- Their factory entries in `manager.ts` / `cli/src/commands/deploy-helpers.ts`, and the
  `--type` options in the CLI `deploy add` command.
- The dead `workflows` field + `NODETOOL_WORKFLOWS` plumbing in `docker-run.ts` and
  `compose.ts`.

### Move
- `runpod-rest.ts` → `packages/compute/src/providers/runpod.ts` (it is worker-specific).

### Docs
- Drop `docs/runpod-deployment.md`, `docs/gcp-deployment.md`. Keep
  `docs/self-hosted-deployment.md`. Add a worker-deployment guide (see §7).

## 4. Worker subsystem (the focus)

### 4.1 Identity: profiles → instances

A **WorkerProfile** is a declarative, reusable preset. A **WorkerInstance** is an ephemeral,
billing-sensitive live handle. Instances are **never** in declarative config — nothing must
ever resurrect a torn-down GPU pod.

```
WorkerProfile (declarative preset)            WorkerInstance (ephemeral handle)
──────────────────────────────────            ─────────────────────────────────
name            "hf-a40"                        id
target          runpod | vast                   profileName
image           ghcr.io/.../worker:0.7.3        target
gpu / vcpu spec                                 providerRef   (podId / vast instanceId)
env                                             wsUrl         ← the attach handoff
tokenPolicy     (generate | fixed)              token
idleTimeoutMin                                  status        (provisioning|running|attached|stopping|stopped|error)
maxLifetimeMin                                  createdAt, lastActivityAt
                                                attachedTo    (which NodeTool instance claimed it)
                                                estimatedCostUsd
```

### 4.2 Persistence: DB-native

Both profiles and instances are **Drizzle models in `packages/models`** (new tables
`worker_profiles`, `worker_instances`), not the `deployment.yaml` config. Rationale:
desktop-first means the UI drives the flow and needs live, queryable state; the DB is already
how the UI reads secrets/settings, and CLI + UI already share the DB + master key. This avoids
a yaml-vs-DB split-brain. Server deploys keep their yaml; workers go DB-native.

### 4.3 Module: `packages/compute`

New package (sits parallel to `runtime`/`kernel`; depends on `models`, `security`, `config`;
consumed by `websocket` and `cli`). Boundary: `deploy` = servers, `compute` = workers.

```
packages/compute/
  manager.ts          WorkerManager: createProfile/list/update/delete,
                      provision(profileName) → instance, attach(id)/detach,
                      stop(id)/stopAll, list(), status(id), reconcile()
  profiles.ts         profile CRUD (DB)
  instances.ts        instance registry + lifecycle (DB)
  reaper.ts           idle auto-stop + hard TTL + orphan reconcile
  providers/
    types.ts          WorkerProvider interface
    runpod.ts         RunpodPodProvider   (from runpod-rest.ts)
    vast.ts           VastProvider        (new)
```

```ts
interface WorkerProvider {
  provision(spec: WorkerSpec): Promise<{
    providerRef: string; wsUrl: string; token?: string; status: WorkerStatus;
  }>;
  status(ref: string): Promise<WorkerStatus>;
  stop(ref: string): Promise<void>;          // REAL teardown — non-negotiable for GPU
  list(): Promise<ProviderInstance[]>;       // for orphan reconcile
}
```

- **RunpodPodProvider** — the proven e2e path. RunPod REST `rest.runpod.io/v1/pods`:
  create pod → poll until running → derive `wss://<podid>-7777.proxy.runpod.net` (or direct
  tcp). `stop` = `deletePod` (real). API key from the `nodetool_secrets` store
  (`RUNPOD_API_KEY`, user "1"), env fallback when the keychain is unreachable.
- **VastProvider** — Vast.ai HTTP API. Launch the worker image on a GPU offer → get public
  IP:port → `ws://<ip>:<port>`. `stop` = destroy instance. API key from `nodetool_secrets`
  (`VAST_API_KEY`).
- Both run the **same worker image** (`python -m nodetool.worker`, port 7777, msgpack RPC,
  bearer-token auth) — no per-provider image work.

### 4.4 Attach seam (the genuinely new piece)

Today `createPythonBridge()` reads `NODETOOL_WORKER_URL` / `NODETOOL_WORKER_TOKEN` **once at
process start** — static. Desktop attach needs **runtime re-pointing without restart**.

- **`packages/runtime`** — add `setTarget(url, token)` to the WebSocket bridge (it already
  auto-reconnects; we force a reconnect to the new target). Env stays the bootstrap default; a
  DB "active worker" pointer overrides it.
- **Attach flow:** `WorkerManager.attach(instanceId)` → read the instance's `{wsUrl, token}` →
  `bridge.setTarget(...)` → persist the active-worker pointer + mark instance `attached`.
  `detach()` reverts to the local stdio worker.
- Because the pointer is a **runtime setting any NodeTool instance reads**, a deployed Docker
  server can adopt a worker by the same mechanism — this is the "both, desktop-first"
  generalization, for free.

### 4.5 Cost guard (first-class)

GPU pods/vast bill continuously (no scale-to-zero in pod mode), the laptop sleeps, the app
crashes. So:

- **Real teardown** on every provider `stop`.
- **Idle auto-stop:** `reaper` stops an instance after `idleTimeoutMinutes` of bridge
  inactivity (the bridge tracks `lastActivityAt`).
- **Hard TTL:** optional `maxLifetimeMinutes` absolute kill switch.
- **Orphan reconcile:** on startup / refresh, diff DB `running` instances against
  `provider.list()`. Surface "N workers live, ~$X/hr" and offer one-click stop-all. This is
  what prevents a forgotten pod from quietly billing for days.

### 4.6 Surfaces

- **UI panel** ("Workers", in Settings or a dedicated section): profile editor (target, GPU,
  image, idle timeout, token policy); "Start" → live provisioning progress → "attached"; a
  live-instances table (status, uptime, **estimated cost**, attach/detach, stop); a status-bar
  indicator + quick-stop when a worker is attached. Built on a `worker` tRPC router +
  `useWorkers` TanStack Query + `ui_primitives`.
- **CLI** (`nodetool worker …`): `profile add|list|rm`, `create --profile <name> [--attach]`
  (or inline `--target runpod|vast --gpu … --image …`), `list`, `status <id>`,
  `stop <id> | --all`. Same `WorkerManager` underneath.
- **tRPC** — a `worker` router in `packages/websocket` exposing the `WorkerManager` surface to
  the UI; the attach handler wires `compute` (instance lookup) to `runtime`
  (`bridge.setTarget`).

## 5. Data model (new tables)

```
worker_profiles
  id            text pk
  name          text unique
  target        text            -- 'runpod' | 'vast'
  image         text
  spec          json            -- gpu/vcpu/env/region, provider-shaped
  token_policy  text            -- 'generate' | 'fixed'
  idle_timeout_minutes  integer null
  max_lifetime_minutes  integer null
  created_at, updated_at

worker_instances
  id            text pk
  profile_name  text
  target        text
  provider_ref  text            -- podId / vast instance id
  ws_url        text
  token         text null
  status        text
  attached_to   text null
  created_at, last_activity_at
  estimated_cost_usd  real null
```

The "active worker" pointer lives in the existing `settings` table (a single key, e.g.
`active_worker_instance_id`).

## 6. Phasing

- **P1 (MVP, desktop-first):** `packages/compute` skeleton + `WorkerProvider` + DB models +
  re-pointable bridge + `RunpodPodProvider` + profiles→instances + attach + tRPC + minimal UI
  (start/stop/attach/cost) + CLI verbs + idle-stop + orphan reconcile. Server prune (delete the
  five deployers + dead `workflows` field). Delete `scripts/runpod-worker.ts`.
- **P2:** `VastProvider`, UI panel polish, fuller cost/usage reporting.
- **P3 (later, optional):** a deployed Docker server claims a worker via the same active-worker
  pointer; worker pools.

## 7. Non-goals / parked

- **HuggingFace Spaces as a worker.** Free GPU = ZeroGPU, which is **Gradio-SDK only**,
  **function-scoped** (GPU only inside `@spaces.GPU`, default 60s/call), and **quota-bound**
  (5 min/day free, 40 min/day PRO). Incompatible with the persistent WS worker. HF *paid*
  Docker GPU (T4 $0.40/hr, with idle-sleep) does run the worker image but is just another
  metered provider overlapping RunPod/Vast — added later only if the idle-sleep economics are
  wanted. A ZeroGPU "$9/mo light tier" (mapping `@spaces.GPU` to per-node execution) is an
  interesting future spike, not a committed provider.
- **RunPod load-balancing serverless** (scale-to-zero GPU for server *or* worker) — viable and
  attractive, deferred. Needs a `/ping` health route on the worker (cleanly addable to the
  `process_request` hook in `worker_auth.py`) and resolution of how RunPod's edge auth composes
  with our worker token. Out of scope for this round.
- **Workflow-as-job** (headless serverless workflow runner) — a legitimate future product, a
  distinct effort, not this redesign.
- **Managed local-Docker worker provider** — local/LAN workers stay supported via manual
  `NODETOOL_WORKER_URL`; no provider unless requested.

## 8. Testing

- `compute`: unit tests per provider (mock the RunPod/Vast HTTP APIs, like the existing
  `runpod-api.test.ts` style), `WorkerManager` lifecycle, reaper (idle/TTL/orphan) with a fake
  clock + fake provider.
- `runtime`: `bridge.setTarget` reconnect behavior.
- `websocket`: `worker` tRPC router happy-path + attach wiring.
- CLI: `nodetool worker` command tests.
- Manual e2e: provision a small-model worker on RunPod (already validated), attach from the
  desktop, run a graph with a Python node, confirm teardown + orphan reconcile.

## 9. Open questions (for implementation, not blocking)

- Vast.ai API surface details (offer search → launch → ready signal → destroy) — confirm
  against the current Vast HTTP API during P2.
- Exact estimated-cost source (provider-reported $/hr vs a static table per GPU).
- Whether the "active worker" pointer should be per-user (multi-user server) or singleton
  (desktop). Desktop MVP: singleton; revisit for server.
