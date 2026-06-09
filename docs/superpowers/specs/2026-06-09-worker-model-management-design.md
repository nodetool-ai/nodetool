# Worker Model Management — Design Spec

**Date:** 2026-06-09
**Status:** Draft for review
**Related:** [worker deployment redesign](2026-06-08-worker-deployment-redesign-design.md); the persistent-volume + `HF_HOME` work that makes a worker's model cache durable across stop/resume.

## Problem

A user can now rent a GPU worker (RunPod pod / Vast instance) and attach to it. The worker runs HuggingFace nodes on its GPU, but **only against models already cached in its `HF_HOME`** — it will not auto-download a model mid-workflow (deliberate: a long download must not stall a running graph). Today there is **no way to see what's cached on the worker or to download a model onto it** from the app.

Two hard constraints shape the design:

1. **The worker's cache is remote.** Local model management is implemented entirely in TypeScript (`@nodetool-ai/huggingface`: `hf-cache.ts`, `hf-download-manager.ts`) scanning the **local** filesystem. It physically cannot see a remote pod's `/workspace/huggingface`.
2. **The bridge protocol has no model-management RPC.** The worker bridge (`nodetool-core/.../worker/protocol.py` ↔ `packages/runtime/.../python-bridge-base.ts`) exposes only: `discover`, `worker.status`, `execute`/`execute.stream`, `cancel`, `provider.list`, `provider.models`, and the `provider.*` inference calls. None of these list a cache, download, or delete.

The underlying **capability already exists in `nodetool-core`** — it is simply not wired to the bridge:
- `integrations/huggingface/huggingface_models.py` — enumerate cached repos/snapshots via `HfFastCache` (no network), `unified_model(...)`, `size_on_disk(...)`, `fetch_model_readme(...)`.
- `integrations/huggingface/async_downloader.py` (`async_hf_download`, resumable) + `progress_download.py` — download with progress.

So this is **additive plumbing**, not new capability work.

## Goal

In the ModelManager, let the user switch the view to an attached worker: see which models are cached on the worker, download models onto its persistent volume (with live progress), and delete them — reusing the existing ModelManager UI, list rendering, and download-progress surface.

## Key insight: reuse the attach seam

There is a **single** `pythonBridge` in the server, re-pointed at the attached worker via `repointPythonBridge` → `bridge.setTarget(wsUrl, token)`. When a worker is attached, that bridge talks to the **worker's** Python process — which sits on the pod's volume. Therefore any `models.*` RPC we add automatically targets the **remote worker's** cache when one is attached. **No new transport is needed**; we ride the existing bridge.

Consequence: the **Worker view is only available while a worker is attached** (`useWorkers().activeWorker != null`). With nothing attached, the bridge points at the local/stdio worker and "Worker view" is hidden/disabled.

## Architecture

```
Web ModelManager  ──(scope: local | worker)──►  TS server model routes
   Local view  ─────────────────────────────►  @nodetool-ai/huggingface (local FS)   [unchanged]
   Worker view ─────────────────────────────►  pythonBridge.models.*  ──bridge──►  attached worker (Python)
                                                                                     huggingface_models.py / async_downloader.py
   download progress  ◄── model-download WS ◄── server relays bridge `progress` frames
```

Four layers, each a thin addition:

### 1. Python worker — new `models.*` RPC handlers

`nodetool-core/src/nodetool/worker/protocol.py` dispatch gains a `models.` branch (mirroring the existing `provider.` branch), delegating to a new `worker/model_handler.py`:

- **`models.list_cached`** → scan `HF_HOME` via `HfFastCache`, build a `unified_model(...)` per cached repo with `size_on_disk(...)` and `downloaded=True`. Returns `{ models: UnifiedModel[] }`. No network.
- **`models.download`** → `async_hf_download(repo_id, allow_patterns?, ignore_patterns?)`, emitting `progress` frames (`{ repo_id, status, downloaded_bytes, total_bytes, downloaded_files, total_files }`) via the transport's existing `progress` frame type — the same mechanism `execute` uses. Honors `cancel`. Terminal `result` frame on completion. The HF token is resolved on the worker (`get_hf_token`), from the worker's env/secret store.
- **`models.delete`** → remove a cached repo from `HF_HOME`; return `{ deleted: bool }`.

Protocol notes:
- Bump `BRIDGE_PROTOCOL_VERSION`. Older worker images will reply `Unknown message type: models.*`; the bridge treats that as "unsupported" (see §2) so old workers degrade gracefully.
- `models.*` is **HuggingFace-scoped** for now (the worker cache is HF). The namespace leaves room for other backends later.

### 2. TS bridge — new methods on `python-bridge-base.ts`

Mirror the existing `provider.*` call/stream pattern:

- **`listCachedModels(): Promise<UnifiedModel[]>`** → `_call("models.list_cached")`, returns the worker-normalized list.
- **`downloadModel(req, onProgress): Promise<void>`** → streaming call to `models.download`, forwarding each `progress` frame to `onProgress`; resolves on the terminal `result`, rejects on `error`. Cancellable.
- **`deleteCachedModel(repoId): Promise<boolean>`** → `_call("models.delete", { repo_id })`.
- **`supportsModelManagement(): boolean`** — derived from the worker's `worker.status` `protocol_version`; `false` for old workers. Used to gate the UI.

These call through whatever target the bridge currently points at, so they hit the worker when attached.

### 3. TS server — worker-scoped model routes

Extend the model API so the web can target the worker. Add a `scope` discriminator (`local` default, `worker`):

- **List:** `GET /api/models/huggingface?scope=worker` → if a worker is attached and `supportsModelManagement()`, `pythonBridge.listCachedModels()`; else `409`/empty with a clear reason. Output is already `UnifiedModel[]` — no extra normalization beyond what the Python handler emits.
- **Delete:** `DELETE /api/models/huggingface?scope=worker&repo_id=…` → `pythonBridge.deleteCachedModel(repoId)`.
- **Download:** the existing download trigger gains `scope: "worker"`. When set, the server calls `pythonBridge.downloadModel(...)` and **relays each bridge `progress` frame onto the existing model-download WebSocket** channel (`ModelDownloadStore` already consumes `{ repo_id, status, downloaded_bytes, total_bytes, downloaded_files }`). So the web's progress UI works unchanged for worker downloads.

Routing is by the attach pointer the worker subsystem already owns (`WorkerManager.getActiveWorker()`), surfaced to the model routes.

### 4. Web ModelManager — Local ↔ Worker toggle

- A scope toggle in the ModelManager header: **Local** (default) ↔ **Worker** (`<worker name>`). Worker is shown only when `useWorkers().activeWorker != null` and the worker reports `supportsModelManagement()`.
- The cached-list query (`useModels`) keys on scope and passes `scope=worker` for the worker view; rendering, sort, filter, and the `UnifiedModel` row component are unchanged.
- Download/delete actions pass `scope` through; the existing `ModelDownloadStore` + `DownloadProgress` surface handle progress identically.
- Empty state for an attached worker with an empty cache: "No models cached on this worker yet. Download one to its volume."

## Data shapes (grounded in existing types)

The worker returns the existing `UnifiedModel` (`packages/protocol/src/api-types.ts`): `{ id, name, repo_id, type, path, cache_path, downloaded, size_on_disk, pipeline_tag, tags, has_model_index, … }`. The Python `unified_model(...)` already produces this shape for the local server path; the worker handler reuses it verbatim, so no client-side mapping is required.

Download progress frames match the existing `ModelDownloadStore.Download` shape: `{ repo_id, status: pending|start|running|progress|completed|error|cancelled, downloaded_bytes, total_bytes, downloaded_files, total_files }`.

## Error handling & edge cases

- **No worker attached / detached mid-action:** worker-scope routes return a clear `409 "No worker attached"`; the toggle hides the Worker option. An in-flight download whose worker detaches surfaces an `error` progress frame.
- **Old worker image (no `models.*`):** `supportsModelManagement()` is `false`; the Worker toggle is disabled with a tooltip ("worker image too old"). No silent failures.
- **HF token / gated models:** the token is resolved **on the worker** (its env / mounted secret), not forwarded from the client. Gated-repo errors surface as `error` frames with the HF message.
- **Disk full on volume:** the download `error` frame carries the failure; the user sized the volume in the profile (`disk` GB) — link the error text to "increase the profile's Disk (GB)".
- **Concurrent downloads / cancel:** reuse the worker's existing per-request `cancel` flag; the bridge's `downloadModel` is cancellable like `execute`.
- **Large model lists:** `models.list_cached` is cache-only (no network), so it's fast; no pagination needed initially.

## Testing strategy

- **Python (`nodetool-core`):** unit-test `model_handler` against a temp `HF_HOME` — `list_cached` enumerates seeded snapshots; `download` emits ordered progress then result (mock `async_hf_download`); `delete` removes a repo. Protocol-dispatch test for the `models.` branch + unknown-method fallback.
- **TS bridge:** mock transport; assert `listCachedModels`/`downloadModel`/`deleteCachedModel` issue the right frames, stream progress to `onProgress`, and resolve/reject correctly; `supportsModelManagement` reads `protocol_version`.
- **TS server routes:** with a fake bridge + fake active-worker, assert `scope=worker` routes to the bridge and relays progress to the model-download WS; `scope=local` is unchanged; no-worker → 409.
- **Web:** ModelManager toggle visibility (attached vs not, supported vs old); worker-scope list query keys correctly; download/delete pass `scope`; progress renders via the existing store.

## Scope

**In:** HuggingFace cached-model list / download (with progress) / delete on an attached worker, surfaced via a Local↔Worker toggle in the existing ModelManager.

**Out / parked:**
- Non-HF backends on the worker (Ollama, etc.) — the namespace allows it later.
- Pushing a locally-cached model to the worker without re-downloading from the hub (would need a worker-to-worker / local-to-worker transfer; for now the worker pulls from the hub).
- Multi-worker management in one view (current model is a single attached worker).
- Background/queued downloads that outlive the session.

## Open question for review

Download progress relay: forward worker `progress` frames onto the **existing** model-download WebSocket (so the current `ModelDownloadStore`/`DownloadProgress` work unchanged — recommended), versus a new tRPC subscription. The spec assumes the former.
