# Worker Model Management — Implementation Plan

**Date:** 2026-06-09
**Spec:** [2026-06-09-worker-model-management-design.md](../specs/2026-06-09-worker-model-management-design.md)
**Status:** Ready to execute (TDD)

## Goal

Let a user, while a GPU worker is attached, switch the ModelManager to a **Worker** view to:
list the models cached on the worker's `HF_HOME`, download a model onto the worker's
persistent volume (live progress), and delete one — reusing the existing ModelManager UI,
list rendering, and download-progress surface. This is additive plumbing over the existing
`pythonBridge` attach seam; the capability already exists in `nodetool-core`.

## Architecture

```
Web ModelManager  ──(scope: local | worker)──►  TS server (tRPC models router + /ws/download)
   Local view  ─────────────────────────────►  @nodetool-ai/huggingface (local FS)   [unchanged]
   Worker view ─────────────────────────────►  pythonBridge.listCachedModels / deleteCachedModel
                                                pythonBridge.downloadModel(req, onProgress)
                                                        │ bridge (already re-pointed at worker)
                                                        ▼
                                                attached worker (Python)
                                                  worker/model_handler.py
                                                    → read_cached_hf_models / async_hf_download / delete_cached_hf_model
   download progress  ◄── /ws/download WS ◄── server relays bridge `progress` frames (DECISION below)
```

Four thin layers, each with its own failing-test-first tasks:

1. **Python worker** — new `models.*` RPC in `worker/model_handler.py`, dispatched from `protocol.py`.
2. **TS bridge** — `listCachedModels` / `downloadModel(req,onProgress)` / `deleteCachedModel` / `supportsModelManagement` on `PythonBridgeBase`.
3. **TS server** — `scope: "worker"` on the tRPC `models.huggingfaceList` / `huggingfaceDelete`; worker-download relay onto the existing `/ws/download` endpoint.
4. **Web** — Local↔Worker scope toggle in the ModelManager header; scope-keyed query; scope threaded to download/delete.

## DECISION — download-progress relay (resolves the spec's open question)

**Forward worker `progress` frames onto the EXISTING `/ws/download` WebSocket**, NOT a new
tRPC subscription. The worker's `models.download` progress frame is shaped **exactly** like the
local `DownloadUpdate` that `ModelDownloadStore` already consumes
(`packages/huggingface/src/hf-download-manager.ts:25-36`), so `ModelDownloadStore` /
`DownloadProgress` work unchanged. The `/ws/download` handler gains a `scope: "worker"` branch
on `start_download` that calls `pythonBridge.downloadModel(...)` and pipes each `onProgress`
frame to `socket.send(JSON.stringify(update))` — the identical sink the local manager uses.

## Wire contract (locked — every layer agrees on these exact names)

- **Protocol version:** `BRIDGE_PROTOCOL_VERSION` `1` → `2`
  - Python: `nodetool-core/src/nodetool/worker/__init__.py` — `BRIDGE_PROTOCOL_VERSION`
  - TS: `packages/protocol/src/bridge-protocol.ts` — `export const BRIDGE_PROTOCOL_VERSION`
- **`models.list_cached`** — request `{}` → result `{ models: UnifiedModel[] }` (each `downloaded=True`).
- **`models.download`** — request `{ repo_id: string, allow_patterns?: string[]|null, ignore_patterns?: string[]|null, path?: string|null, model_type?: string|null }`
  → ordered `progress` frames, then terminal `result { repo_id, status:"completed" }`; `error` frame on failure. Honors `cancel`.
  - **progress frame `data`** (matches `DownloadUpdate`):
    `{ status, repo_id, path, model_type, downloaded_bytes, total_bytes, downloaded_files, current_files, total_files, error? }`
    `status ∈ "start" | "progress" | "completed" | "error" | "cancelled"`.
- **`models.delete`** — request `{ repo_id: string }` → result `{ deleted: boolean }`.
- **TS bridge methods:**
  - `listCachedModels(): Promise<UnifiedModel[]>`
  - `downloadModel(req: ModelDownloadRequest, onProgress: (u: ModelDownloadUpdate) => void): Promise<void>`
  - `deleteCachedModel(repoId: string): Promise<boolean>`
  - `supportsModelManagement(): boolean` (true iff `_workerStatus.protocol_version >= 2`)
- **Server:** tRPC `models.huggingfaceList` / `models.huggingfaceDelete` gain `scope?: "local"|"worker"` input; worker scope routes to `ctx.pythonBridge.*` after `ctx.workerManager.getActiveWorker()` confirms an attachment (else throws `CONFLICT`).
- **Web:** `useModels` query key `["allModels"]` → `["allModels", scope]`; `ModelManagerStore.scope` + `setScope`; `ToggleGroup`/`ToggleOption` from `ui_primitives`.

## Tech Stack

- Python: `nodetool-core`, pytest + pytest-asyncio (`loop_scope="function"`), msgpack-over-websocket worker tests.
- TS bridge/server: `packages/runtime`, `packages/websocket`, Vitest.
- Web: React 19 + Zustand + TanStack Query, Jest + RTL, `ui_primitives` only.

---

# Layer 1 — Python worker (`nodetool-core`)

## Task 1.1 — Bump `BRIDGE_PROTOCOL_VERSION` to 2

**File:** `~/workspace/nodetool-core/src/nodetool/worker/__init__.py`

### Failing test

**File:** `~/workspace/nodetool-core/tests/worker/test_model_handler.py` (new)

```python
"""Tests for the models.* bridge handler."""

import asyncio
import os
from pathlib import Path

import msgpack
import pytest
import pytest_asyncio
import websockets

from nodetool.worker import BRIDGE_PROTOCOL_VERSION
from nodetool.worker.server import WorkerServer, start_server


def test_protocol_version_is_2():
    assert BRIDGE_PROTOCOL_VERSION == 2


@pytest_asyncio.fixture(loop_scope="function")
async def server():
    worker = WorkerServer()
    host, port, stop_event, task = await start_server(
        host="127.0.0.1", port=0, worker=worker,
    )
    yield host, port
    stop_event.set()
    await task
```

### Run

```bash
cd ~/workspace/nodetool-core && pytest tests/worker/test_model_handler.py::test_protocol_version_is_2 -q
```

Expected (before): `AssertionError: assert 1 == 2`.

### Implementation

In `__init__.py`, change the constant and extend the history docstring:

```python
History:
  1 - Initial stdio protocol (msgpack length-prefixed framing,
      discover/execute/result/error/chunk/progress + provider.* messages).
  2 - Added models.* messages (models.list_cached / models.download /
      models.delete) for worker-side HuggingFace cache management.
"""

BRIDGE_PROTOCOL_VERSION = 2
```

### Run again → expected output

```
1 passed
```

### Commit

```bash
cd ~/workspace/nodetool-core && git add -A && git commit -m "feat(worker): bump bridge protocol to v2 for models.* RPC"
```

---

## Task 1.2 — `models.list_cached` handler

**Files:**
- `~/workspace/nodetool-core/src/nodetool/worker/model_handler.py` (new)
- `~/workspace/nodetool-core/src/nodetool/worker/protocol.py` (dispatch branch)

### Failing test

Append to `tests/worker/test_model_handler.py`:

```python
@pytest.mark.asyncio(loop_scope="function")
async def test_models_list_cached(server, monkeypatch):
    """models.list_cached returns the worker's cached repos as UnifiedModel[]."""
    from nodetool.types.model import UnifiedModel
    import nodetool.worker.model_handler as mh

    async def fake_read_cached():
        return [
            UnifiedModel(
                id="org/model-a", type="hf.model", name="org/model-a",
                repo_id="org/model-a", downloaded=True, size_on_disk=123,
            )
        ]

    monkeypatch.setattr(mh, "read_cached_hf_models", fake_read_cached)

    host, port = server
    async with websockets.connect(f"ws://{host}:{port}") as ws:
        await ws.send(msgpack.packb(
            {"type": "models.list_cached", "request_id": "ml-1", "data": {}}
        ))
        raw = await asyncio.wait_for(ws.recv(), timeout=5)
        resp = msgpack.unpackb(raw, raw=False)
        assert resp["type"] == "result"
        assert resp["request_id"] == "ml-1"
        models = resp["data"]["models"]
        assert len(models) == 1
        assert models[0]["repo_id"] == "org/model-a"
        assert models[0]["downloaded"] is True


@pytest.mark.asyncio(loop_scope="function")
async def test_models_unknown_type(server):
    host, port = server
    async with websockets.connect(f"ws://{host}:{port}") as ws:
        await ws.send(msgpack.packb(
            {"type": "models.nonexistent", "request_id": "mu-1", "data": {}}
        ))
        raw = await asyncio.wait_for(ws.recv(), timeout=5)
        resp = msgpack.unpackb(raw, raw=False)
        assert resp["type"] == "error"
        assert "Unknown models message type" in resp["data"]["error"]
```

### Run

```bash
cd ~/workspace/nodetool-core && pytest tests/worker/test_model_handler.py -q
```

Expected (before): both tests error/fail — the worker replies `Unknown message type: models.list_cached`.

### Implementation

Create `worker/model_handler.py` (mirrors `provider_handler.handle_provider_message`):

```python
"""Handle models.* bridge messages: HuggingFace cache management on the worker.

models.* are HuggingFace-scoped for now (the worker cache is HF). They run
against whatever HF_HOME the worker process sees — when this worker is a remote
pod with a persistent volume, that is the pod's cache.
"""

from __future__ import annotations

import asyncio
import traceback
from typing import Any, Callable, Optional

from nodetool.integrations.huggingface.huggingface_models import (
    read_cached_hf_models,
    delete_cached_hf_model,
    get_hf_token,
)
from nodetool.integrations.huggingface.async_downloader import async_hf_download


async def handle_models_message(
    msg_type: str,
    request_id: str | None,
    data: dict[str, Any],
    transport: Any,  # WorkerTransport (exposes async send_msg)
    cancel_flags: dict[str, asyncio.Event],
) -> None:
    """Handle a models.* message via any transport exposing ``send_msg``."""

    async def send_result(rid: str | None, d: dict) -> None:
        await transport.send_msg({"type": "result", "request_id": rid, "data": d})

    async def send_error(rid: str | None, error: str, tb: str | None = None) -> None:
        await transport.send_msg(
            {"type": "error", "request_id": rid, "data": {"error": error, "traceback": tb}}
        )

    async def send_progress(rid: str | None, d: dict) -> None:
        await transport.send_msg({"type": "progress", "request_id": rid, "data": d})

    try:
        if msg_type == "models.list_cached":
            models = await read_cached_hf_models()
            # We only enumerate cached repos here, so guarantee downloaded=True.
            payload = []
            for m in models:
                d = m.model_dump()
                d["downloaded"] = True
                payload.append(d)
            await send_result(request_id, {"models": payload})

        elif msg_type == "models.download":
            await _handle_download(data, request_id, cancel_flags, send_progress, send_result)

        elif msg_type == "models.delete":
            deleted = await delete_cached_hf_model(data["repo_id"])
            await send_result(request_id, {"deleted": bool(deleted)})

        else:
            await send_error(request_id, f"Unknown models message type: {msg_type}")

    except Exception as e:
        await send_error(request_id, str(e), traceback.format_exc())
```

Add the dispatch branch in `protocol.py` after the `provider.` branch (lines ~170-180):

```python
        if msg_type and str(msg_type).startswith("models."):
            from nodetool.worker.model_handler import handle_models_message

            await handle_models_message(
                msg_type=str(msg_type),
                request_id=request_id,
                data=msg.get("data", {}),
                transport=transport,
                cancel_flags=self._cancel_flags,
            )
            return
```

(`_handle_download` is implemented in Task 1.3; add a stub that raises `NotImplementedError`
for now so this task's tests pass:)

```python
async def _handle_download(data, request_id, cancel_flags, send_progress, send_result):
    raise NotImplementedError
```

### Run again → expected output

```
test_protocol_version_is_2 PASSED
test_models_list_cached PASSED
test_models_unknown_type PASSED
```

### Commit

```bash
cd ~/workspace/nodetool-core && git add -A && git commit -m "feat(worker): models.list_cached + models.delete bridge handler"
```

---

## Task 1.3 — `models.download` with ordered progress frames

**File:** `~/workspace/nodetool-core/src/nodetool/worker/model_handler.py`

### Failing test

Append to `tests/worker/test_model_handler.py`:

```python
@pytest.mark.asyncio(loop_scope="function")
async def test_models_download_emits_progress_then_result(server, monkeypatch):
    """models.download lists repo files, downloads each, emits ordered progress."""
    import nodetool.worker.model_handler as mh

    # One-file repo; async_hf_download drives the byte-delta progress_callback.
    async def fake_list_repo_files(repo_id, token=None):
        return [("model.bin", 100)]

    async def fake_download(repo_id, filename, *, token=None, progress_callback=None,
                            cancel_event=None, **kwargs):
        progress_callback(50, 100)
        progress_callback(50, 100)
        return Path("/tmp") / filename

    monkeypatch.setattr(mh, "_list_repo_files", fake_list_repo_files)
    monkeypatch.setattr(mh, "async_hf_download", fake_download)

    host, port = server
    async with websockets.connect(f"ws://{host}:{port}") as ws:
        await ws.send(msgpack.packb({
            "type": "models.download",
            "request_id": "md-1",
            "data": {"repo_id": "org/model-a", "model_type": "hf.model"},
        }))
        frames = []
        while True:
            raw = await asyncio.wait_for(ws.recv(), timeout=5)
            f = msgpack.unpackb(raw, raw=False)
            frames.append(f)
            if f["type"] in ("result", "error"):
                break

    progress = [f for f in frames if f["type"] == "progress"]
    assert progress, "expected at least one progress frame"
    first = progress[0]["data"]
    assert first["repo_id"] == "org/model-a"
    assert first["status"] in ("start", "progress")
    # Exact field set the web ModelDownloadStore consumes:
    for key in ("status", "repo_id", "path", "model_type", "downloaded_bytes",
                "total_bytes", "downloaded_files", "current_files", "total_files"):
        assert key in first
    final = frames[-1]
    assert final["type"] == "result"
    assert final["data"]["status"] == "completed"
    assert final["data"]["repo_id"] == "org/model-a"
```

### Run

```bash
cd ~/workspace/nodetool-core && pytest tests/worker/test_model_handler.py::test_models_download_emits_progress_then_result -q
```

Expected (before): fails — `_handle_download` raises `NotImplementedError`.

### Implementation

Replace the `_handle_download` stub and add `_list_repo_files`:

```python
async def _list_repo_files(repo_id: str, token: str | None = None):
    """Return [(filename, size_bytes)] for a repo via the Hub (network)."""
    from huggingface_hub import HfApi

    def _list():
        api = HfApi(token=token) if token else HfApi()
        info = api.model_info(repo_id, files_metadata=True)
        out = []
        for sib in info.siblings or []:
            out.append((sib.rfilename, int(getattr(sib, "size", 0) or 0)))
        return out

    return await asyncio.to_thread(_list)


def _matches(path: str, patterns: list[str] | None) -> bool:
    if not patterns:
        return True
    import fnmatch
    return any(fnmatch.fnmatch(path, p) for p in patterns)


async def _handle_download(
    data: dict[str, Any],
    request_id: str | None,
    cancel_flags: dict[str, asyncio.Event],
    send_progress: Callable,
    send_result: Callable,
) -> None:
    repo_id = data["repo_id"]
    allow = data.get("allow_patterns")
    ignore = data.get("ignore_patterns")
    single = data.get("path")
    model_type = data.get("model_type")

    cancel_event = asyncio.Event()
    if request_id:
        cancel_flags[request_id] = cancel_event

    token = await get_hf_token()

    def frame(status: str, downloaded_bytes: int, total_bytes: int,
              downloaded_files: int, total_files: int, current: list[str],
              error: str | None = None) -> dict:
        d = {
            "status": status,
            "repo_id": repo_id,
            "path": single,
            "model_type": model_type,
            "downloaded_bytes": downloaded_bytes,
            "total_bytes": total_bytes,
            "downloaded_files": downloaded_files,
            "current_files": current,
            "total_files": total_files,
        }
        if error:
            d["error"] = error
        return d

    try:
        files = await _list_repo_files(repo_id, token)
        if single:
            files = [(f, s) for f, s in files if f == single]
        else:
            if allow:
                files = [(f, s) for f, s in files if _matches(f, allow)]
            if ignore:
                files = [(f, s) for f, s in files if not _matches(f, ignore)]

        total_files = len(files)
        total_bytes = sum(s for _, s in files)
        done_bytes = 0
        done_files = 0

        await send_progress(request_id, frame("start", 0, total_bytes, 0, total_files, []))

        for filename, _size in files:
            if cancel_event.is_set():
                await send_progress(
                    request_id,
                    frame("cancelled", done_bytes, total_bytes, done_files, total_files, []),
                )
                await send_result(request_id, {"repo_id": repo_id, "status": "cancelled"})
                return

            file_base = done_bytes

            def on_bytes(delta: int, _file_total):
                nonlocal done_bytes
                done_bytes = file_base + delta
                # fire-and-forget; ordering is preserved by the transport write-lock
                asyncio.create_task(
                    send_progress(
                        request_id,
                        frame("progress", done_bytes, total_bytes, done_files,
                              total_files, [filename]),
                    )
                )

            await async_hf_download(
                repo_id, filename, token=token,
                progress_callback=on_bytes, cancel_event=cancel_event,
            )
            done_files += 1

        if cancel_event.is_set():
            await send_result(request_id, {"repo_id": repo_id, "status": "cancelled"})
            return

        await send_progress(
            request_id,
            frame("completed", total_bytes, total_bytes, total_files, total_files, []),
        )
        await send_result(request_id, {"repo_id": repo_id, "status": "completed"})

    except Exception as e:
        await send_progress(
            request_id,
            frame("error", 0, 0, 0, 0, [], error=str(e)),
        )
        raise
    finally:
        if request_id:
            cancel_flags.pop(request_id, None)
```

### Run again → expected output

```
1 passed
```

Then the whole file:

```bash
cd ~/workspace/nodetool-core && pytest tests/worker/test_model_handler.py -q
# → 5 passed
```

### Commit

```bash
cd ~/workspace/nodetool-core && git add -A && git commit -m "feat(worker): models.download with ordered progress + cancel"
```

---

# Layer 2 — TS bridge (`packages/runtime`)

## Task 2.1 — Bump `BRIDGE_PROTOCOL_VERSION` + bridge types

**Files:**
- `~/workspace/nodetool2/packages/protocol/src/bridge-protocol.ts`
- `~/workspace/nodetool2/packages/runtime/src/python-bridge-types.ts`

### Failing test

**File:** `~/workspace/nodetool2/packages/runtime/tests/python-bridge-models.test.ts` (new)

```ts
import { describe, it, expect } from "vitest";
import { BRIDGE_PROTOCOL_VERSION } from "@nodetool-ai/protocol/bridge-protocol";

describe("bridge protocol version", () => {
  it("is 2 (models.* support)", () => {
    expect(BRIDGE_PROTOCOL_VERSION).toBe(2);
  });
});
```

### Run

```bash
cd ~/workspace/nodetool2/packages/runtime && npx vitest run tests/python-bridge-models.test.ts
```

Expected (before): `expected 1 to be 2`.

### Implementation

`bridge-protocol.ts`:

```ts
export const BRIDGE_PROTOCOL_VERSION = 2;
```

(Leave `MIN_NODETOOL_CORE_VERSION` for the release step; the comment block already documents the lockstep rule. Note in the plan: bump it when the nodetool-core release that ships v2 is published.)

Add to `python-bridge-types.ts` (after `ProgressEvent`):

```ts
export interface ModelDownloadRequest {
  repo_id: string;
  allow_patterns?: string[] | null;
  ignore_patterns?: string[] | null;
  path?: string | null;
  model_type?: string | null;
}

/** Mirrors the worker `models.download` progress frame AND the local
 *  DownloadUpdate consumed by the web ModelDownloadStore. */
export interface ModelDownloadUpdate {
  status: "start" | "progress" | "completed" | "error" | "cancelled";
  repo_id: string;
  path: string | null;
  model_type: string | null;
  downloaded_bytes: number;
  total_bytes: number;
  downloaded_files: number;
  current_files: string[];
  total_files: number;
  error?: string;
}
```

### Run again → expected output

```
1 passed
```

### Commit

```bash
cd ~/workspace/nodetool2 && git add packages/protocol packages/runtime && git commit -m "feat(protocol): bump bridge protocol to v2; add model download types"
```

---

## Task 2.2 — `listCachedModels` / `deleteCachedModel` / `supportsModelManagement`

**File:** `~/workspace/nodetool2/packages/runtime/src/python-bridge-base.ts`

### Failing test

Append to `tests/python-bridge-models.test.ts`. Reuse the `startFakeWorker` factory from
`tests/python-websocket-bridge.test.ts` — extend it with `models.*` cases (see Task 2.3 for the
download case). Add to that factory's `switch`:

```ts
        case "models.list_cached":
          send({
            type: "result",
            request_id: requestId,
            data: { models: [{ id: "org/m", name: "org/m", repo_id: "org/m", downloaded: true }] }
          });
          break;
        case "models.delete":
          send({ type: "result", request_id: requestId, data: { deleted: true } });
          break;
```

Test:

```ts
import { startFakeWorker } from "./python-websocket-bridge.test-helpers.js";
import { PythonWebSocketBridge } from "../src/python-websocket-bridge.js";

describe("models.* bridge methods", () => {
  it("listCachedModels returns the worker's cached models", async () => {
    const { url, close } = await startFakeWorker({ protocolVersion: 2 });
    const bridge = new PythonWebSocketBridge({ wsUrl: url });
    await bridge.connect();
    const models = await bridge.listCachedModels();
    expect(models).toHaveLength(1);
    expect(models[0].repo_id).toBe("org/m");
    expect(bridge.supportsModelManagement()).toBe(true);
    bridge.close();
    await close();
  });

  it("deleteCachedModel returns the boolean result", async () => {
    const { url, close } = await startFakeWorker({ protocolVersion: 2 });
    const bridge = new PythonWebSocketBridge({ wsUrl: url });
    await bridge.connect();
    expect(await bridge.deleteCachedModel("org/m")).toBe(true);
    bridge.close();
    await close();
  });

  it("supportsModelManagement is false for an old (v1) worker", async () => {
    const { url, close } = await startFakeWorker({ protocolVersion: 1 });
    const bridge = new PythonWebSocketBridge({ wsUrl: url });
    await bridge.connect();
    expect(bridge.supportsModelManagement()).toBe(false);
    bridge.close();
    await close();
  });
});
```

> Note: factor the existing `startFakeWorker` (currently inline in
> `python-websocket-bridge.test.ts`) into a shared `python-websocket-bridge.test-helpers.ts`
> that accepts `{ protocolVersion }` (defaulting to `BRIDGE_PROTOCOL_VERSION`) and the new
> `models.*` cases. Update the original test to import from the helper.

### Run

```bash
cd ~/workspace/nodetool2/packages/runtime && npx vitest run tests/python-bridge-models.test.ts
```

Expected (before): `bridge.listCachedModels is not a function`.

### Implementation

Add to `PythonBridgeBase`, after the provider methods (near line 765), reusing `_providerCall`
and `_workerStatus`:

```ts
  // ── Worker model management (HuggingFace cache) ───────────────────────

  async listCachedModels(): Promise<import("./python-bridge-types.js").UnifiedModelLike[]> {
    const result = await this._providerCall("models.list_cached", {});
    return (result as { models: import("./python-bridge-types.js").UnifiedModelLike[] }).models;
  }

  async deleteCachedModel(repoId: string): Promise<boolean> {
    const result = await this._providerCall("models.delete", { repo_id: repoId });
    return Boolean((result as { deleted?: boolean }).deleted);
  }

  supportsModelManagement(): boolean {
    return (this._workerStatus?.protocol_version ?? 0) >= 2;
  }
```

`listCachedModels` returns the worker-normalized `UnifiedModel` JSON. To avoid a hard import
cycle into `@nodetool-ai/protocol` from the runtime base, type it as a structural alias declared
in `python-bridge-types.ts`:

```ts
/** Structural subset of @nodetool-ai/protocol UnifiedModel the bridge passes through. */
export type UnifiedModelLike = Record<string, unknown> & {
  id: string;
  name: string;
  repo_id?: string | null;
  downloaded?: boolean | null;
};
```

### Run again → expected output

```
3 passed (+ the version test) — 4 passed
```

### Commit

```bash
cd ~/workspace/nodetool2 && git add packages/runtime && git commit -m "feat(runtime): listCachedModels/deleteCachedModel/supportsModelManagement bridge methods"
```

---

## Task 2.3 — `downloadModel(req, onProgress)` streaming

**File:** `~/workspace/nodetool2/packages/runtime/src/python-bridge-base.ts`

### Failing test

Add to the fake worker `switch` (in the test-helpers):

```ts
        case "models.download": {
          send({ type: "progress", request_id: requestId,
            data: { status: "start", repo_id: "org/m", path: null, model_type: null,
                    downloaded_bytes: 0, total_bytes: 100, downloaded_files: 0,
                    current_files: [], total_files: 1 } });
          send({ type: "progress", request_id: requestId,
            data: { status: "progress", repo_id: "org/m", path: null, model_type: null,
                    downloaded_bytes: 100, total_bytes: 100, downloaded_files: 0,
                    current_files: ["model.bin"], total_files: 1 } });
          send({ type: "result", request_id: requestId,
            data: { repo_id: "org/m", status: "completed" } });
          break;
        }
```

Test:

```ts
it("downloadModel streams progress then resolves", async () => {
  const { url, close } = await startFakeWorker({ protocolVersion: 2 });
  const bridge = new PythonWebSocketBridge({ wsUrl: url });
  await bridge.connect();

  const updates: any[] = [];
  await bridge.downloadModel(
    { repo_id: "org/m" },
    (u) => updates.push(u)
  );

  expect(updates.map((u) => u.status)).toEqual(["start", "progress"]);
  expect(updates[1].downloaded_bytes).toBe(100);
  bridge.close();
  await close();
});
```

### Run

```bash
cd ~/workspace/nodetool2/packages/runtime && npx vitest run tests/python-bridge-models.test.ts
```

Expected (before): `bridge.downloadModel is not a function`.

### Implementation

`downloadModel` mirrors the `_providerCall` pattern but routes `progress` frames to `onProgress`.
The base `_handleMessage` only forwards `progress` to `_pending[...].onProgress`, and `result`
to `_pendingStream`. So register the request in **both** maps: `_pendingStream` for the terminal
`result`/`error`, `_pending` (with `onProgress`) for the progress frames. Clean both up on settle.

```ts
  async downloadModel(
    req: import("./python-bridge-types.js").ModelDownloadRequest,
    onProgress: (update: import("./python-bridge-types.js").ModelDownloadUpdate) => void
  ): Promise<void> {
    const requestId = randomUUID();
    return new Promise<void>((resolve, reject) => {
      const settle = (fn: () => void) => {
        this._pending.delete(requestId);
        this._pendingStream.delete(requestId);
        fn();
      };
      this._pending.set(requestId, {
        resolve: () => undefined,
        reject: () => undefined,
        onProgress: (event) =>
          onProgress(event as unknown as import("./python-bridge-types.js").ModelDownloadUpdate)
      });
      this._pendingStream.set(requestId, {
        resolve: () => settle(resolve),
        reject: (err) => settle(() => reject(err)),
        onChunk: () => {}
      });
      this._send({ type: "models.download", request_id: requestId, data: req });
    });
  }

  cancelModelDownload(requestId: string): void {
    this.cancel(requestId);
  }
```

> `_handleMessage` passes the whole `msg.data` to `onProgress` (`{ request_id, ...data }`).
> The worker's progress `data` carries the full `ModelDownloadUpdate` fields, so `onProgress`
> receives them verbatim (plus an extra `request_id`, harmless).

### Run again → expected output

```
5 passed
```

### Commit

```bash
cd ~/workspace/nodetool2 && git add packages/runtime && git commit -m "feat(runtime): downloadModel streaming bridge method with progress + cancel"
```

---

# Layer 3 — TS server (`packages/websocket`)

## Task 3.1 — `scope: "worker"` on tRPC `models.huggingfaceList` / `huggingfaceDelete`

**File:** `~/workspace/nodetool2/packages/websocket/src/trpc/routers/models.ts`

### Failing test

**File:** `~/workspace/nodetool2/packages/websocket/tests/trpc-models-worker.test.ts` (new)
(mirror `tests/trpc-models.test.ts`: `makeCtx` + `createCallerFactory`)

```ts
import { describe, it, expect, vi } from "vitest";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";

const createCaller = createCallerFactory(appRouter);

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    userId: "1",
    registry: {} as any,
    apiOptions: {} as any,
    pythonBridge: {} as any,
    getPythonBridgeReady: () => true,
    ...overrides
  } as any;
}

describe("models.huggingfaceList scope=worker", () => {
  it("routes to pythonBridge.listCachedModels when a worker is attached", async () => {
    const listCachedModels = vi.fn().mockResolvedValue([
      { id: "org/m", name: "org/m", repo_id: "org/m", downloaded: true }
    ]);
    const ctx = makeCtx({
      pythonBridge: { listCachedModels, supportsModelManagement: () => true },
      workerManager: { getActiveWorker: async () => ({ id: "w1", status: "attached" }) }
    });
    const caller = createCaller(ctx);
    const models = await caller.models.huggingfaceList({ scope: "worker" });
    expect(listCachedModels).toHaveBeenCalledOnce();
    expect(models[0].repo_id).toBe("org/m");
  });

  it("throws CONFLICT when no worker is attached", async () => {
    const ctx = makeCtx({
      pythonBridge: { listCachedModels: vi.fn(), supportsModelManagement: () => true },
      workerManager: { getActiveWorker: async () => null }
    });
    const caller = createCaller(ctx);
    await expect(caller.models.huggingfaceList({ scope: "worker" })).rejects.toThrow(
      /No worker attached/
    );
  });

  it("deletes via the bridge when scope=worker", async () => {
    const deleteCachedModel = vi.fn().mockResolvedValue(true);
    const ctx = makeCtx({
      pythonBridge: { deleteCachedModel, supportsModelManagement: () => true },
      workerManager: { getActiveWorker: async () => ({ id: "w1", status: "attached" }) }
    });
    const caller = createCaller(ctx);
    expect(await caller.models.huggingfaceDelete({ repo_id: "org/m", scope: "worker" })).toBe(true);
    expect(deleteCachedModel).toHaveBeenCalledWith("org/m");
  });
});
```

### Run

```bash
cd ~/workspace/nodetool2/packages/websocket && npx vitest run tests/trpc-models-worker.test.ts
```

Expected (before): input rejects `scope` (unknown key) / list ignores worker → fails.

### Implementation

In `models.ts`, add a shared helper + extend the two procedures:

```ts
const modelScope = z.enum(["local", "worker"]).default("local");

async function requireWorkerBridge(ctx: {
  pythonBridge: import("@nodetool-ai/runtime").PythonBridge;
  workerManager?: import("@nodetool-ai/compute").WorkerManager;
}) {
  const active = await ctx.workerManager?.getActiveWorker();
  if (!active) {
    throw new TRPCError({ code: "CONFLICT", message: "No worker attached" });
  }
  if (!ctx.pythonBridge.supportsModelManagement()) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "This worker's image is too old for model management. Upgrade the worker image."
    });
  }
  return ctx.pythonBridge;
}
```

`huggingfaceList`:

```ts
  huggingfaceList: protectedProcedure
    .input(z.object({ scope: modelScope }).optional())
    .output(modelsListOutput)
    .query(async ({ ctx, input }) => {
      if (input?.scope === "worker") {
        const bridge = await requireWorkerBridge(ctx);
        return (await bridge.listCachedModels()) as UnifiedModel[];
      }
      if (isProduction()) return [];
      try {
        return await readCachedHfModels();
      } catch {
        return [];
      }
    }),
```

`huggingfaceDelete`:

```ts
  huggingfaceDelete: protectedProcedure
    .input(hfDeleteInput.extend({ scope: modelScope }))
    .output(z.boolean())
    .mutation(async ({ ctx, input }) => {
      if (input.scope === "worker") {
        const bridge = await requireWorkerBridge(ctx);
        return bridge.deleteCachedModel(input.repo_id);
      }
      if (isProduction()) return false;
      try {
        return await deleteCachedHfModel(input.repo_id);
      } catch {
        return false;
      }
    }),
```

Add `import { TRPCError } from "@trpc/server";` if absent.

### Run again → expected output

```
3 passed
```

### Commit

```bash
cd ~/workspace/nodetool2 && git add packages/websocket && git commit -m "feat(server): scope=worker on models.huggingfaceList/Delete via bridge"
```

---

## Task 3.2 — Worker-download relay on `/ws/download`

**Files:**
- `~/workspace/nodetool2/packages/websocket/src/plugins/websocket.ts`
- `~/workspace/nodetool2/packages/websocket/src/server.ts` (pass `workerManager` to the plugin)

### Failing test

**File:** `~/workspace/nodetool2/packages/websocket/tests/ws-download-worker.test.ts` (new)

Drive the relay function directly (extract it so it's testable without a live socket):

```ts
import { describe, it, expect, vi } from "vitest";
import { relayWorkerDownload } from "../src/plugins/ws-download-worker.js";

describe("relayWorkerDownload", () => {
  it("pipes bridge progress frames to the socket sink and resolves on completion", async () => {
    const sent: any[] = [];
    const socket = { send: (s: string) => sent.push(JSON.parse(s)) };
    const downloadModel = vi.fn(async (_req, onProgress) => {
      onProgress({ status: "start", repo_id: "org/m", path: null, model_type: null,
        downloaded_bytes: 0, total_bytes: 100, downloaded_files: 0, current_files: [],
        total_files: 1 });
      onProgress({ status: "progress", repo_id: "org/m", path: null, model_type: null,
        downloaded_bytes: 100, total_bytes: 100, downloaded_files: 1, current_files: ["m.bin"],
        total_files: 1 });
    });
    const bridge = { downloadModel, supportsModelManagement: () => true } as any;
    const workerManager = { getActiveWorker: async () => ({ id: "w1", status: "attached" }) } as any;

    await relayWorkerDownload(socket as any, bridge, workerManager, {
      command: "start_download", repo_id: "org/m", model_type: "hf.model"
    });

    expect(sent.map((s) => s.status)).toEqual(["start", "progress"]);
    expect(downloadModel).toHaveBeenCalledOnce();
  });

  it("sends an error frame when no worker is attached", async () => {
    const sent: any[] = [];
    const socket = { send: (s: string) => sent.push(JSON.parse(s)) };
    const bridge = { downloadModel: vi.fn(), supportsModelManagement: () => true } as any;
    const workerManager = { getActiveWorker: async () => null } as any;

    await relayWorkerDownload(socket as any, bridge, workerManager, {
      command: "start_download", repo_id: "org/m"
    });

    expect(sent[0].status).toBe("error");
    expect(sent[0].error).toMatch(/No worker attached/);
  });
});
```

### Run

```bash
cd ~/workspace/nodetool2/packages/websocket && npx vitest run tests/ws-download-worker.test.ts
```

Expected (before): module `ws-download-worker.js` does not exist.

### Implementation

New file `src/plugins/ws-download-worker.ts`:

```ts
import type { PythonBridge } from "@nodetool-ai/runtime";
import type { WorkerManager } from "@nodetool-ai/compute";

interface DownloadSocket {
  send(data: string): void;
}

interface StartDownloadCommand {
  command: string;
  repo_id?: string;
  path?: string | null;
  allow_patterns?: string[] | null;
  ignore_patterns?: string[] | null;
  model_type?: string | null;
}

/** Relay a worker-scoped model download: bridge progress frames → the
 *  /ws/download socket, using the same JSON shape the local manager emits. */
export async function relayWorkerDownload(
  socket: DownloadSocket,
  bridge: PythonBridge,
  workerManager: WorkerManager | undefined,
  msg: StartDownloadCommand
): Promise<void> {
  const repoId = msg.repo_id ?? "";
  const fail = (error: string) => {
    try {
      socket.send(JSON.stringify({
        status: "error", repo_id: repoId, path: msg.path ?? null,
        model_type: msg.model_type ?? null, downloaded_bytes: 0, total_bytes: 0,
        downloaded_files: 0, current_files: [], total_files: 0, error
      }));
    } catch { /* socket gone */ }
  };

  const active = await workerManager?.getActiveWorker();
  if (!active) return fail("No worker attached");
  if (!bridge.supportsModelManagement()) {
    return fail("This worker's image is too old for model management.");
  }

  try {
    await bridge.downloadModel(
      {
        repo_id: repoId,
        path: msg.path ?? null,
        allow_patterns: msg.allow_patterns ?? null,
        ignore_patterns: msg.ignore_patterns ?? null,
        model_type: msg.model_type ?? null
      },
      (update) => {
        try {
          socket.send(JSON.stringify(update));
        } catch { /* socket gone */ }
      }
    );
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}
```

Wire it into the `/ws/download` `start_download` handler in `plugins/websocket.ts`. The plugin
gains `workerManager` in `WebSocketPluginOptions`; the `start_download` branch checks
`msg.scope === "worker"` first:

```ts
              if (msg.command === "start_download") {
                if (msg.scope === "worker") {
                  const { relayWorkerDownload } = await import("./ws-download-worker.js");
                  await relayWorkerDownload(socket, pythonBridge, workerManager, msg);
                  return;
                }
                // ...existing local path unchanged...
```

In `server.ts`, pass `workerManager` to the plugin registration (line ~797):

```ts
await app.register(websocketPlugin, {
  registry,
  pythonBridge,
  workerManager,
  apiOptions,
  getPythonBridgeReady: () => pythonBridgeReady,
  ensurePythonBridge: async () => { /* unchanged */ }
});
```

Add `workerManager?: WorkerManager;` to `WebSocketPluginOptions` and import its type.

### Run again → expected output

```
2 passed
```

### Commit

```bash
cd ~/workspace/nodetool2 && git add packages/websocket && git commit -m "feat(server): relay worker model downloads onto /ws/download"
```

---

# Layer 4 — Web ModelManager (`web/`)

## Task 4.1 — `scope` in `ModelManagerStore`

**File:** `~/workspace/nodetool2/web/src/stores/ModelManagerStore.ts`

### Failing test

**File:** `~/workspace/nodetool2/web/src/stores/__tests__/ModelManagerStore.test.ts` (new)

```ts
import { useModelManagerStore } from "../ModelManagerStore";

describe("ModelManagerStore scope", () => {
  it("defaults to local and setScope switches it", () => {
    expect(useModelManagerStore.getState().scope).toBe("local");
    useModelManagerStore.getState().setScope("worker");
    expect(useModelManagerStore.getState().scope).toBe("worker");
    useModelManagerStore.getState().setScope("local");
  });
});
```

### Run

```bash
cd ~/workspace/nodetool2/web && npm test -- src/stores/__tests__/ModelManagerStore.test.ts
```

Expected (before): `scope` is `undefined`.

### Implementation

```ts
export type ModelScope = "local" | "worker";

interface ModelManagerState {
  // ...existing fields...
  scope: ModelScope;
  setScope: (scope: ModelScope) => void;
}

export const useModelManagerStore = create<ModelManagerState>((set) => ({
  // ...existing...
  scope: "local",
  setScope: (scope) => set({ scope }),
}));
```

### Run again → expected output

```
1 passing
```

### Commit

```bash
cd ~/workspace/nodetool2 && git add web/src/stores/ModelManagerStore.ts web/src/stores/__tests__/ModelManagerStore.test.ts && git commit -m "feat(web): model scope state (local|worker) in ModelManagerStore"
```

---

## Task 4.2 — `useModels(scope)`: scope-keyed query

**File:** `~/workspace/nodetool2/web/src/components/hugging_face/model_list/useModels.ts`

### Failing test

**File:** `~/workspace/nodetool2/web/src/components/hugging_face/model_list/__tests__/useModels.scope.test.ts` (new)

```ts
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useModels } from "../useModels";
import { trpc } from "../../../../lib/trpc";

jest.mock("../../../../lib/trpc", () => ({
  trpc: {
    models: {
      all: { query: jest.fn().mockResolvedValue([]) },
      huggingfaceList: { query: jest.fn().mockResolvedValue([{ id: "org/m", name: "org/m", repo_id: "org/m", downloaded: true }]) }
    }
  }
}));

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient();
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe("useModels scope", () => {
  it("worker scope calls huggingfaceList with scope=worker", async () => {
    const { result } = renderHook(() => useModels("worker"), { wrapper });
    await new Promise((r) => setTimeout(r, 0));
    expect(trpc.models.huggingfaceList.query).toHaveBeenCalledWith({ scope: "worker" });
    void result;
  });
});
```

### Run

```bash
cd ~/workspace/nodetool2/web && npm test -- src/components/hugging_face/model_list/__tests__/useModels.scope.test.ts
```

Expected (before): `useModels` takes no arg / never calls `huggingfaceList`.

### Implementation

Change the signature and query:

```ts
import type { ModelScope } from "../../../stores/ModelManagerStore";

export const useModels = (scope: ModelScope = "local"): UseModelsResult => {
  // ...existing selectors...

  const {
    data: allModels,
    isLoading,
    isFetching,
    error
  } = useQuery({
    queryKey: ["allModels", scope],
    queryFn: () =>
      scope === "worker"
        ? trpc.models.huggingfaceList.query({ scope: "worker" })
        : trpc.models.all.query(),
    refetchOnWindowFocus: false
  });
```

### Run again → expected output

```
1 passing
```

### Commit

```bash
cd ~/workspace/nodetool2 && git add web/src/components/hugging_face/model_list/useModels.ts web/src/components/hugging_face/model_list/__tests__/useModels.scope.test.ts && git commit -m "feat(web): useModels(scope) keys query on scope, worker hits huggingfaceList"
```

---

## Task 4.3 — Scope toggle in `ModelListHeader` (ui_primitives only)

**Files:**
- `~/workspace/nodetool2/web/src/components/hugging_face/model_list/ModelListHeader.tsx`
- `~/workspace/nodetool2/web/src/components/hugging_face/model_list/ModelListIndex.tsx`

### Failing test

**File:** `~/workspace/nodetool2/web/src/components/hugging_face/model_list/__tests__/ScopeToggle.test.tsx` (new)

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScopeToggle } from "../ScopeToggle";

describe("ScopeToggle", () => {
  it("hidden when no worker is attached", () => {
    const { container } = render(
      <ScopeToggle scope="local" onChange={() => {}} workerName={null} supported={false} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows Local + Worker when a supported worker is attached", async () => {
    const onChange = jest.fn();
    render(<ScopeToggle scope="local" onChange={onChange} workerName="pod-a" supported={true} />);
    expect(screen.getByRole("button", { name: /Local/i })).toBeInTheDocument();
    const worker = screen.getByRole("button", { name: /pod-a/i });
    await userEvent.click(worker);
    expect(onChange).toHaveBeenCalledWith("worker");
  });

  it("disables Worker option when the worker is too old", () => {
    render(<ScopeToggle scope="local" onChange={() => {}} workerName="pod-a" supported={false} />);
    expect(screen.getByRole("button", { name: /pod-a/i })).toBeDisabled();
  });
});
```

### Run

```bash
cd ~/workspace/nodetool2/web && npm test -- src/components/hugging_face/model_list/__tests__/ScopeToggle.test.tsx
```

Expected (before): module `../ScopeToggle` does not exist.

### Implementation

New `ScopeToggle.tsx` (uses `ToggleGroup`/`ToggleOption`/`Tooltip` primitives — no raw MUI):

```tsx
import React from "react";
import { ToggleGroup, ToggleOption } from "../../ui_primitives/ToggleGroup";
import { Tooltip } from "../../ui_primitives/Tooltip";
import type { ModelScope } from "../../../stores/ModelManagerStore";

interface ScopeToggleProps {
  scope: ModelScope;
  onChange: (scope: ModelScope) => void;
  workerName: string | null;
  supported: boolean;
}

export const ScopeToggle: React.FC<ScopeToggleProps> = ({
  scope, onChange, workerName, supported
}) => {
  if (!workerName) return null;
  return (
    <ToggleGroup
      value={scope}
      exclusive
      size="small"
      compact
      onChange={(_e, value: ModelScope | null) => {
        if (value) onChange(value);
      }}
    >
      <ToggleOption value="local">Local</ToggleOption>
      <Tooltip
        title={supported ? "" : "This worker's image is too old for model management."}
      >
        <span>
          <ToggleOption value="worker" disabled={!supported}>
            {workerName}
          </ToggleOption>
        </span>
      </Tooltip>
    </ToggleGroup>
  );
};
```

Wire into `ModelListIndex.tsx`: read `scope`/`setScope` from `useModelManagerStore`, `activeWorker`
from `useWorkers()`, pass `useModels(scope)`, and thread scope into delete + download. Render the
toggle in `ModelListHeader` (header `FlexRow`), passing:

```tsx
const scope = useModelManagerStore((s) => s.scope);
const setScope = useModelManagerStore((s) => s.setScope);
const { activeWorker } = useWorkers();
const supported = activeWorker != null; // worker.status protocol gate is enforced server-side;
                                        // here we treat "attached" as candidate, server returns
                                        // CONFLICT for old images.

// in header:
<ScopeToggle
  scope={scope}
  onChange={setScope}
  workerName={activeWorker?.profile_name ?? activeWorker?.id ?? null}
  supported={supported}
/>
```

> When `scope` changes, reset filters/search/scroll (the store already exposes setters; call
> `setModelSearchTerm("")` + `setSelectedModelType("All")` in a `setScope` wrapper or in
> `ModelListIndex` on scope change) to avoid stale cross-scope state.

### Run again → expected output

```
3 passing
```

### Commit

```bash
cd ~/workspace/nodetool2 && git add web/src/components/hugging_face/model_list && git commit -m "feat(web): Local/Worker scope toggle in ModelManager header"
```

---

## Task 4.4 — Thread scope through download + delete

**Files:**
- `~/workspace/nodetool2/web/src/stores/ModelDownloadStore.ts` (`startDownload` sends `scope`)
- `~/workspace/nodetool2/web/src/components/hugging_face/model_list/DeleteModelDialog.tsx` (delete + invalidate scope key)
- `~/workspace/nodetool2/web/src/components/hugging_face/model_list/ModelListIndex.tsx`

### Failing test

**File:** `~/workspace/nodetool2/web/src/stores/__tests__/ModelDownloadStore.scope.test.ts` (new)

```ts
import { useModelDownloadStore } from "../ModelDownloadStore";

describe("startDownload scope", () => {
  it("includes scope=worker in the start_download WS command", async () => {
    const sent: any[] = [];
    const fakeWs = { send: (s: string) => sent.push(JSON.parse(s)), readyState: 1 } as any;
    jest.spyOn(useModelDownloadStore.getState(), "connectWebSocket").mockResolvedValue(fakeWs);

    await useModelDownloadStore.getState().startDownload(
      "org/m", "hf.model", null, null, null, "worker"
    );

    const cmd = sent.find((s) => s.command === "start_download");
    expect(cmd.scope).toBe("worker");
  });
});
```

### Run

```bash
cd ~/workspace/nodetool2/web && npm test -- src/stores/__tests__/ModelDownloadStore.scope.test.ts
```

Expected (before): `startDownload` has no `scope` arg; command lacks `scope`.

### Implementation

`ModelDownloadStore.startDownload` gains a trailing `scope: ModelScope = "local"` arg and adds it
to the WS command JSON:

```ts
  startDownload: (
    repoId: string, modelType: string, path?: string | null,
    allowPatterns?: string[] | null, ignorePatterns?: string[] | null,
    scope: "local" | "worker" = "local"
  ) => { /* ...existing... */
      ws.send(JSON.stringify({
        command: "start_download",
        repo_id: repoId, path, allow_patterns: allowPatterns,
        ignore_patterns: ignorePatterns, model_type: modelType,
        scope
      }));
  },
```

`DeleteModelDialog` passes `scope` to `huggingfaceDelete` and invalidates the scope-keyed query:

```ts
await trpc.models.huggingfaceDelete.mutate({ repo_id: repoId, scope });
queryClient.invalidateQueries({ queryKey: ["allModels", scope] });
```

`ModelListIndex` passes the current `scope` into both `handleStartDownload` and the delete dialog.

### Run again → expected output

```
1 passing
```

### Commit

```bash
cd ~/workspace/nodetool2 && git add web/src/stores/ModelDownloadStore.ts web/src/components/hugging_face/model_list && git commit -m "feat(web): thread model scope through download + delete"
```

---

# Final verification

```bash
# Python
cd ~/workspace/nodetool-core && pytest tests/worker/test_model_handler.py tests/worker/test_provider_handler.py -q

# TS packages
cd ~/workspace/nodetool2 && npm run typecheck && npm run lint
cd ~/workspace/nodetool2/packages/runtime && npx vitest run
cd ~/workspace/nodetool2/packages/websocket && npx vitest run

# Web
cd ~/workspace/nodetool2/web && npm run typecheck && npm test -- src/components/hugging_face src/stores
```

Expected: all green. Then build packages so decorator/dist consumers pick up the bridge changes:

```bash
cd ~/workspace/nodetool2 && npm run build:packages
```

## Release follow-up (out of the TDD loop)

When the `nodetool-core` release that ships `BRIDGE_PROTOCOL_VERSION = 2` is published, bump
`MIN_NODETOOL_CORE_VERSION` in `packages/protocol/src/bridge-protocol.ts` to that version so the
Electron prebuild pin is satisfied. The bridge already rejects a v1 worker at `discover` for
node execution; `supportsModelManagement()` is the soft gate that hides/disables the Worker
toggle for older attached workers without breaking the rest of the app.
