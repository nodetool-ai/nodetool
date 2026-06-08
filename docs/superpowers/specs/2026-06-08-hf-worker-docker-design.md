# HuggingFace Python Worker — Docker image, local run, and remote-worker wiring

**Date:** 2026-06-08
**Status:** Approved design, ready for implementation plan
**Scope of this iteration:** Author a HuggingFace worker Docker image (layered on the
existing `nodetool-core` image), provide local build/run ergonomics, add a minimal
authentication handshake to the worker, and validate the full UI → TS server → remote
worker path locally (CPU-only). Cloud/GPU deployment is **out of scope** here and is
captured as recorded constraints for a follow-up iteration.

---

## 1. Background and problem

NodeTool runs Python nodes through a worker process. Today the TypeScript server most
commonly spawns a **local** worker over a stdio bridge (`PythonStdioBridge`,
length-prefixed msgpack over stdin/stdout).

There is a second, already-built topology: the worker can run as a **long-lived
WebSocket server**, and the TS server attaches to it remotely. The pieces that already
exist:

- **`nodetool-core/Dockerfile`** builds a Python worker image (micromamba / Ubuntu
  22.04 / Python 3.11) that installs `nodetool-core` from PyPI and runs
  `python -m nodetool.worker --host 0.0.0.0 --port 7777` — a WebSocket server, with a
  ws-handshake healthcheck. `EXPOSE 7777`, `CMD` (not `ENTRYPOINT`).
- **`nodetool2` runtime**: `createPythonBridge()` returns a `WebsocketPythonBridge`
  (reconnect + exponential backoff) whenever `NODETOOL_WORKER_URL=ws://host:port` is
  set, instead of spawning a local worker. The TS server (`server.ts`, `http-api.ts`,
  `mcp-server.ts`) calls `createPythonBridge()`, so setting that env var is sufficient
  to switch the whole server onto a remote worker.

What is **missing**, and what this iteration delivers:

1. A **HuggingFace** worker image. HF nodes need a large ML stack (torch 2.9,
   diffusers, transformers, accelerate, bitsandbytes, sam2, …) and, in production, a
   GPU. No HF Dockerfile exists yet.
2. **Local run ergonomics** to build the two layered images, run the worker, point the
   server at it, and validate a graph end-to-end.
3. **Authentication** on the worker. The WebSocket worker currently has **no auth**:
   anyone who can reach the port can execute arbitrary nodes (remote code execution on
   the GPU). A minimal token handshake is required before the image can ever be exposed
   beyond localhost.

This is a **packaging + wiring + auth** task. It is not a protocol change — the msgpack
WebSocket protocol and the bridge already exist.

---

## 2. Goals / non-goals

**Goals**
- A `nodetool-huggingface` Docker image that layers on the core worker image and
  installs the released `nodetool-huggingface` package from PyPI.
- One-command local build/run (Makefile + compose) and a documented wire-up.
- A minimal, opt-in `Authorization: Bearer` token handshake on the worker, honored by
  the TS bridge on connect and reconnect.
- A repeatable local validation (CPU-only) that proves: image health, auth gate, bridge
  attach, and a real HF graph executing on the remote worker.
- A written record of the RunPod / Vast.ai constraints that the cloud/GPU iteration must
  satisfy.

**Non-goals (this iteration)**
- No changes to `packages/deploy` (no first-class deploy target for the worker).
- No actual cloud/GPU deployment, and no GPU validation (macOS Docker is CPU-only).
- No dynamic endpoint resolution or reconnect-with-re-resolution (recorded as a gap).
- No TLS termination / tunnel automation.

---

## 3. Decisions (locked during brainstorming)

| Decision | Choice |
| --- | --- |
| Primary first target | **Local Docker** (CPU-only validation on macOS) |
| What the iteration is about | **The HF worker image is the goal**; core is the stepping stone |
| HF image base / CUDA strategy | **Layer on the core image + PyPI CUDA wheels** (torch wheel bundles CUDA; host needs only the NVIDIA driver + container runtime) |
| "Done" boundary | **Dockerfile + local run + validation** (no `packages/deploy` changes) |
| Package source | **Released PyPI packages** (version via build-arg) |
| Worker auth | **Build `NODETOOL_WORKER_TOKEN` handshake now** (worker + bridge) |
| Build wrappers | **Makefile** in `nodetool-huggingface` |
| Validation | **Committed smoke DSL** (`SentenceSimilarity` / `all-MiniLM-L6-v2`) |

---

## 4. Architecture

### 4.1 Image layering

```
mambaorg/micromamba:jammy
        │  (nodetool-core/Dockerfile — exists)
        ▼
nodetool-core:local            FROM base; uv pip install nodetool-core==<NODETOOL_VERSION>
   EXPOSE 7777 / HEALTHCHECK / CMD ["python","-m","nodetool.worker","--host","0.0.0.0","--port","7777"]
        │  (nodetool-huggingface/Dockerfile — new)
        ▼
nodetool-hf:local              FROM ${CORE_IMAGE}; uv pip install nodetool-huggingface==<HF_VERSION>
   (EXPOSE / HEALTHCHECK / CMD inherited from core; HF has no worker module of its own)
```

The HF image adds only Python packages on top of core. `python -m nodetool.worker`
comes from the inherited `nodetool-core` dependency, so the HF image needs no new CMD.

### 4.2 Runtime topology (local)

```
web UI ──ws──► TS server (host :7777) ──► createPythonBridge()
                                              │  NODETOOL_WORKER_URL set?
                                              ▼  yes → WebsocketPythonBridge
                                          ws://localhost:8787  ──►  hf-worker container (:7777 internal)
                                          Authorization: Bearer <NODETOOL_WORKER_TOKEN>
```

The TS dev server already binds host `7777`, so the worker container must publish on a
**different host port**. This design uses **`8787`** → `NODETOOL_WORKER_URL=ws://localhost:8787`.

---

## 5. Artifacts

All new files live in the **`nodetool-huggingface`** sibling repo, except the bridge
change (`nodetool2`) and the worker auth change (`nodetool-core`).

### 5.1 `nodetool-huggingface/Dockerfile` (new)

```dockerfile
# Layer the HuggingFace node stack on top of the core worker image.
# CORE_IMAGE: locally-built `nodetool-core:local`, or a published
#   ghcr.io/nodetool-ai/nodetool:<tag>. HF_VERSION pins the PyPI release.
ARG CORE_IMAGE=nodetool-core:local
FROM ${CORE_IMAGE}

ARG HF_VERSION=0.7.1
USER root

# torch 2.9 + the rest pull CUDA-enabled wheels with a bundled CUDA runtime;
# no nvidia/cuda base needed. The host supplies the NVIDIA driver at run time.
RUN uv pip install --python $VIRTUAL_ENV --index-url https://pypi.org/simple \
        "nodetool-huggingface==${HF_VERSION}" \
    && rm -rf /root/.cache/uv /root/.cache/pip /tmp/* /var/tmp/*

# EXPOSE 7777, HEALTHCHECK, CMD all inherited from the core image.
```

Notes:
- Base HF dependencies only. Optional extras (`ocr`, `hunyuan3d`, `triposg`, …) are
  **not** installed; if needed later they become additional build-args / image variants.
- The image is large (multi-GB) by nature of the ML stack. Expected.

### 5.2 `nodetool-huggingface/docker-compose.yaml` (new)

- Service `hf-worker`:
  - `build: { context: ., args: { CORE_IMAGE, HF_VERSION } }`
  - `ports: ["8787:7777"]`
  - `volumes: ["hf-cache:/app/huggingface"]` (named volume; `HF_HOME=/app/huggingface`)
  - `environment`: pass through `NODETOOL_WORKER_TOKEN` (and any provider/runtime env
    the worker needs).
  - Healthcheck inherited from the image (or restated for clarity).
- A **`gpu` compose profile** adds `deploy.resources.reservations.devices` (NVIDIA) /
  `gpus: all`. Not activated on macOS — the default (CPU) service is used locally.
- Named volume `hf-cache` declared at the bottom.

### 5.3 `nodetool-huggingface/Makefile` (new)

| Target | Action |
| --- | --- |
| `build-core` | `docker build -t nodetool-core:local ../nodetool-core` (or document pulling `ghcr.io/nodetool-ai/nodetool:<tag>`) |
| `build-hf` | `docker build -t nodetool-hf:local --build-arg CORE_IMAGE=nodetool-core:local .` |
| `up` | `docker compose up` (CPU) — runs the worker on `localhost:8787` |
| `down` | `docker compose down` |

### 5.4 `nodetool-huggingface/docs/worker-deployment.md` (new)

Build → run → wire → validate steps; the cloud-constraints section (§8); the
CPU-only-on-macOS and host-port-`8787` caveats; the `NODETOOL_WORKER_TOKEN` setup.

### 5.5 `nodetool-huggingface/examples/hf-worker-smoke.{ts,json}` (new)

A minimal workflow using the HuggingFace **SentenceSimilarity** node with
`sentence-transformers/all-MiniLM-L6-v2` (~80 MB, CPU-fast) — a feature-extraction node
that returns an `np_array` embedding per input string. Committed for repeatable
validation: the `.ts` DSL form documents the graph; the exported `.json` form is the
artifact loaded **into the running TS server** (UI import or the server's run API).
Fallback node: `FillMask` / `distilbert-base-uncased`.

**Critical wiring fact (verified):** the remote `WebsocketPythonBridge` is created and
injected **only by the `websocket` server** (`server.ts` / `http-api.ts` /
`mcp-server.ts`; the runner reads `options.pythonBridge`). The CLI/DSL local path
(`nodetool run <file>` → `@nodetool-ai/dsl` `run()` → `ProcessingContext` /
`WorkflowRunner`) does **not** create a Python bridge. Therefore the validation graph
must execute **through a running server** that has `NODETOOL_WORKER_URL` set — not via
`nodetool run`. (Adding remote-worker support to the CLI run path is a possible
follow-up, out of scope here.)

---

## 6. Authentication (`NODETOOL_WORKER_TOKEN`)

A shared-secret bearer token, opt-in, identical env name on both ends.

### 6.1 Worker side — `nodetool-core`

- In `start_server` (`server.py`), pass a `process_request` hook to
  `websockets.asyncio.server.serve(...)`.
- Behavior:
  - Read the expected token from env `NODETOOL_WORKER_TOKEN`.
  - **If unset/empty** → accept all connections (preserves local/stdio/dev behavior and
    backward compatibility).
  - **If set** → require request header `Authorization: Bearer <token>`. Compare with
    `hmac.compare_digest` (constant time). On mismatch/absence, return an HTTP **401**
    `Response` from `process_request`, which aborts the handshake before any frame.
- Optionally make `--host` / `--port` default from env (`NODETOOL_WORKER_HOST`,
  `NODETOOL_WORKER_PORT`) so the >70000 identity-port trick is possible on cloud hosts.
  Optional; not required for local.

### 6.2 Client side — `nodetool2` `python-websocket-bridge.ts`

- The `ws` `WebSocket` constructor at the connect site already takes an options object
  (`{ maxPayload }`). Add `headers: { Authorization: 'Bearer ' + token }` when a token
  is configured.
- Token source: `options.workerToken ?? process.env.NODETOOL_WORKER_TOKEN`, threaded
  through `PythonBridgeOptions` and `createPythonBridge()` (alongside `wsUrl`).
- The header must be applied on **both** the initial connect and every **reconnect**
  (the reconnect path builds a fresh socket).
- When no token is configured, behavior is unchanged (no header sent).

### 6.3 Why a header (not first-message or subprotocol)

- Both libraries support it directly (`ws` `headers` option; `websockets`
  `process_request` + `request.headers`).
- The handshake is rejected **before** any application frame, so an unauthenticated peer
  never reaches the executor.
- Headers survive both direct-TCP and HTTP-proxy paths.

---

## 7. Validation (local, CPU-only)

Performed end-to-end on macOS Docker (CPU):

1. **Image build** — `make build-core` then `make build-hf` succeed.
2. **Image health** — `make up`; the container's ws-handshake healthcheck reports
   healthy.
3. **Auth gate** —
   - Worker started with `NODETOOL_WORKER_TOKEN=secret`.
   - Bridge with **no** / **wrong** token → handshake rejected (401), connect fails.
   - Bridge with **matching** token → connects.
4. **Bridge attach** — start the TS server with
   `NODETOOL_WORKER_URL=ws://localhost:8787 NODETOOL_WORKER_TOKEN=secret npm run dev:server`;
   server logs a successful `discover` + `worker.status`; HF node metadata is present.
5. **Graph run (through the server)** — with the smoke workflow loaded into the running
   server (web UI editor, or the server's run API), execute it. The HF node runs **on the
   container** and returns an **embedding (`np_array`)** — `SentenceSimilarity` is a
   feature-extraction node (one embedding per input string), not a cross-string scorer,
   so the smoke graph previews the embedding(s). This must go through the server, not
   `nodetool run` (see §5.5 wiring fact). First run downloads the model into the
   `hf-cache` volume; subsequent runs reuse it.

CUDA-only nodes (most diffusers/3D) are **expected to fail locally** and are deferred to
the GPU iteration.

---

## 8. Cloud targets — recorded constraints (NEXT iteration, not built here)

Validated against current (2026) RunPod and Vast.ai docs. The **image** design holds on
both (PyPI CUDA wheels + host driver; `CMD` runs on boot). The deltas below are
exposure/ops concerns that the deploy iteration must satisfy.

### 8.1 Transport: direct TCP, never an HTTP proxy

- **RunPod** HTTP proxy (`*.proxy.runpod.net`) is Cloudflare-fronted: **100 MB** body
  cap, **100 s** timeout, WS disconnects observed at ~1.8 MiB. Unusable for large
  binary frames. → Use **Expose TCP Ports** (direct, public IP, random external port).
- **Vast.ai** raw `-p` is direct TCP passthrough (good). Their Caddy auth-proxy (when
  external≠internal port) inserts an HTTP hop → use an **identity port map** (e.g. a
  port >70000) for raw passthrough.
- **Mitigation / preference:** offload large blobs to `ASSET_BUCKET` / S3 (the worker
  already supports asset env) so WebSocket frames stay small. This both relieves the
  frame-size limits and reduces egress. The 256 MB bridge frame ceiling should be
  treated as a backstop, not a routine payload size.

### 8.2 Dynamic endpoint resolution

- Both platforms map internal `7777` to a **random external port** on a public IP, known
  only **after** boot (RunPod: `RUNPOD_PUBLIC_IP` / `RUNPOD_TCP_PORT_*`; Vast: "IP Port
  Info" / API). `NODETOOL_WORKER_URL` must therefore be resolved **at runtime from the
  provider API**, not hardcoded.
- **Gap:** the current `WebsocketPythonBridge` reconnects to a **fixed** URL. For cloud,
  reconnect must **re-resolve** host:port (the instance/IP can change). This is
  deploy-iteration work, explicitly out of scope now.

### 8.3 Security

- A raw, world-reachable port + no app auth = public RCE on the GPU. The
  `NODETOOL_WORKER_TOKEN` handshake (built this iteration) is the app-level gate. For
  public exposure it must be combined with **TLS (`wss`)** — terminated by you, since
  neither platform's usable path gives free TLS at these frame sizes — or, preferably, a
  **private tunnel** (Tailscale / WireGuard / SSH) with the worker bound to the tunnel
  interface. Never expose the raw token-only port over plain `ws://` on the public
  internet.

### 8.4 GPU / host selection, persistence, cost

- **CUDA host filter ≥ 12.x** for torch 2.9 (RunPod `allowedCudaVersions` / UI filter;
  Vast `cuda_vers>=… driver_version>=…`), else the container can land on an old-driver
  host and fail to use the GPU.
- **Product/mode:** RunPod = **Pod** (not Serverless — serverless can't hold a
  persistent client WebSocket). Vast = **entrypoint** launch mode (so the image `CMD`
  runs as PID 1; SSH/Jupyter modes replace it → use `onstart`).
- **Model cache:** RunPod Network Volume mounts at `/workspace` (set
  `HF_HOME=/workspace/.cache/huggingface`); Vast Volume at `/data` (host-pinned, lost if
  the host vanishes); Vast container disk is wiped on destroy. Treat the HF cache as a
  rebuildable warm cache.
- **Cost/reliability:** persistent GPU bills continuously (no scale-to-zero). Vast hosts
  are heterogeneous/interruptible — prefer on-demand, high-reliability hosts; treat the
  worker as ephemeral.

---

## 9. Risks

| Risk | Mitigation |
| --- | --- |
| HF image is very large; slow first build | Expected; layer on core for cache reuse; document build time. |
| macOS Docker can't exercise GPU paths | Validate CPU-capable nodes only; GPU validation deferred to the cloud iteration. |
| First-run model download latency | Healthcheck `start-period`; `hf-cache` volume persists models across restarts. |
| Token mistakenly left unset in a cloud deploy | Document that unset = open; the cloud iteration must require it (and a tunnel/TLS). |
| Bridge reconnects to a stale URL after instance change | Known gap; re-resolution is deploy-iteration work, recorded in §8.2. |
| Validation assumed `nodetool run` would route to the worker (it won't — no bridge on the local CLI path) | Validate **through a running server** (§5.5, §7); CLI remote-worker support is a possible follow-up. |

---

## 10. Out of scope / follow-up (the "cloud/GPU iteration")

- First-class worker deploy target in `packages/deploy` (build → push → run → wire).
- Provider integrations: RunPod **Pods** (direct TCP, network volume), Vast.ai
  (entrypoint mode, identity port, volume), self-hosted GPU box (SSH).
- Dynamic `NODETOOL_WORKER_URL` resolution + reconnect-with-re-resolution.
- TLS / tunnel automation; large-blob S3 offload path.
- Optional HF extras as image variants.
