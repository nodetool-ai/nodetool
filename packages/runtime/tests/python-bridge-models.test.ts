/**
 * Tests for the worker model-management bridge methods (models.* RPC):
 * listCachedModels / downloadModel / deleteCachedModel / supportsModelManagement.
 *
 * Stands up the shared fake worker (msgpack-over-WebSocket) and drives the real
 * WebsocketPythonBridge against it, asserting the right frames are issued,
 * progress streams to onProgress, resolve/reject behavior, and that
 * supportsModelManagement reads the worker's protocol_version.
 */

import { describe, it, expect, afterEach } from "vitest";

import { BRIDGE_PROTOCOL_VERSION } from "@nodetool-ai/protocol/bridge-protocol";
import { WebsocketPythonBridge } from "../src/python-websocket-bridge.js";
import {
  startFakeWorker,
  type FakeWorkerHandle
} from "./python-websocket-bridge.test-helpers.js";
import type { ModelDownloadUpdate } from "../src/python-bridge-types.js";

describe("bridge protocol version", () => {
  it("is 2 (models.* support)", () => {
    expect(BRIDGE_PROTOCOL_VERSION).toBe(2);
  });
});

describe("models.* bridge methods", () => {
  let worker: FakeWorkerHandle | null = null;
  let bridge: WebsocketPythonBridge | null = null;

  afterEach(async () => {
    if (bridge) {
      bridge.close();
      bridge = null;
    }
    if (worker) {
      await worker.close();
      worker = null;
    }
  });

  it("listCachedModels returns the worker's cached models", async () => {
    worker = await startFakeWorker(0, { protocolVersion: 2 });
    bridge = new WebsocketPythonBridge({ wsUrl: `ws://127.0.0.1:${worker.port}` });
    await bridge.connect();

    const models = await bridge.listCachedModels();
    expect(models).toHaveLength(1);
    expect(models[0]!.repo_id).toBe("org/m");
    expect(models[0]!.downloaded).toBe(true);

    // The worker received exactly one models.list_cached frame with empty data.
    const frames = worker.received("models.list_cached");
    expect(frames).toHaveLength(1);
    expect(frames[0]!.data).toEqual({});

    expect(bridge.supportsModelManagement()).toBe(true);
  });

  it("deleteCachedModel sends repo_id and returns the boolean result", async () => {
    worker = await startFakeWorker(0, { protocolVersion: 2 });
    bridge = new WebsocketPythonBridge({ wsUrl: `ws://127.0.0.1:${worker.port}` });
    await bridge.connect();

    expect(await bridge.deleteCachedModel("org/m")).toBe(true);

    const frames = worker.received("models.delete");
    expect(frames).toHaveLength(1);
    expect(frames[0]!.data).toEqual({ repo_id: "org/m" });
  });

  it("a real v1 worker connects and degrades gracefully (no models.* support)", async () => {
    // The hard floor is MIN_BRIDGE_PROTOCOL_VERSION (1), distinct from the
    // advertised BRIDGE_PROTOCOL_VERSION (2). A genuine v1 worker therefore
    // still passes the discover gate and connects — it just reports v1, so the
    // soft capability gate hides models.* rather than the connection erroring.
    worker = await startFakeWorker(0, { protocolVersion: 1 });
    bridge = new WebsocketPythonBridge({ wsUrl: `ws://127.0.0.1:${worker.port}` });
    await expect(bridge.connect()).resolves.toBeUndefined();

    expect(bridge.supportsModelManagement()).toBe(false);
  });

  it("supportsModelManagement is false when no worker status is known", async () => {
    worker = await startFakeWorker(0, { protocolVersion: 2 });
    bridge = new WebsocketPythonBridge({ wsUrl: `ws://127.0.0.1:${worker.port}` });
    await bridge.connect();

    (
      bridge as unknown as { _workerStatus: unknown }
    )._workerStatus = null;
    expect(bridge.supportsModelManagement()).toBe(false);
  });

  it("downloadModel streams progress frames then resolves", async () => {
    worker = await startFakeWorker(0, { protocolVersion: 2 });
    bridge = new WebsocketPythonBridge({ wsUrl: `ws://127.0.0.1:${worker.port}` });
    await bridge.connect();

    const updates: ModelDownloadUpdate[] = [];
    await bridge.downloadModel({ repo_id: "org/m" }, (u) => updates.push(u));

    expect(updates.map((u) => u.status)).toEqual(["start", "progress"]);
    expect(updates[0]!.repo_id).toBe("org/m");
    expect(updates[1]!.downloaded_bytes).toBe(100);
    expect(updates[1]!.current_files).toEqual(["model.bin"]);

    // The request payload reached the worker verbatim.
    const frames = worker.received("models.download");
    expect(frames).toHaveLength(1);
    expect(frames[0]!.data).toEqual({ repo_id: "org/m" });
  });

  it("downloadModel forwards optional request fields verbatim", async () => {
    worker = await startFakeWorker(0, { protocolVersion: 2 });
    bridge = new WebsocketPythonBridge({ wsUrl: `ws://127.0.0.1:${worker.port}` });
    await bridge.connect();

    await bridge.downloadModel(
      {
        repo_id: "org/m",
        allow_patterns: ["*.bin"],
        ignore_patterns: null,
        path: null,
        model_type: "hf.model"
      },
      () => {}
    );

    const frames = worker.received("models.download");
    expect(frames[0]!.data).toEqual({
      repo_id: "org/m",
      allow_patterns: ["*.bin"],
      ignore_patterns: null,
      path: null,
      model_type: "hf.model"
    });
  });

  it("downloadModel uses a caller-supplied requestId so cancel can correlate", async () => {
    worker = await startFakeWorker(0, { protocolVersion: 2 });
    bridge = new WebsocketPythonBridge({ wsUrl: `ws://127.0.0.1:${worker.port}` });
    await bridge.connect();

    // The relay passes the web's composite cancel id (repo/path) here so a
    // later cancelModelDownload(sameId) reaches this exact download.
    await bridge.downloadModel({ repo_id: "org/m" }, () => {}, "org/m/model.bin");

    const frames = worker.received("models.download");
    expect(frames).toHaveLength(1);
    expect(frames[0]!.request_id).toBe("org/m/model.bin");
  });

  it("downloadModel rejects on a terminal error frame and cleans up", async () => {
    worker = await startFakeWorker(0, { protocolVersion: 2, downloadMode: "error" });
    bridge = new WebsocketPythonBridge({ wsUrl: `ws://127.0.0.1:${worker.port}` });
    await bridge.connect();

    const updates: ModelDownloadUpdate[] = [];
    await expect(
      bridge.downloadModel({ repo_id: "org/m" }, (u) => updates.push(u))
    ).rejects.toThrow(/boom/);

    // The error-status progress frame still streamed to onProgress before the
    // terminal error rejected the promise.
    expect(updates.map((u) => u.status)).toEqual(["error"]);
    expect(updates[0]!.error).toBe("boom");

    // Both internal maps are cleaned up so no leak / late settle.
    const pending = (
      bridge as unknown as { _pending: Map<string, unknown> }
    )._pending;
    const pendingStream = (
      bridge as unknown as { _pendingStream: Map<string, unknown> }
    )._pendingStream;
    expect(pending.size).toBe(0);
    expect(pendingStream.size).toBe(0);
  });

  it("cancelModelDownload sends a cancel frame for the request", async () => {
    // The worker never terminates the download, so the promise stays pending;
    // we only assert the cancel frame is sent with the right request_id.
    worker = await startFakeWorker(0, { protocolVersion: 2 });
    bridge = new WebsocketPythonBridge({ wsUrl: `ws://127.0.0.1:${worker.port}` });
    await bridge.connect();

    bridge.cancelModelDownload("req-123");
    // The frame travels over the socket asynchronously; wait for the worker to
    // observe it before asserting.
    const start = Date.now();
    while (worker.received("cancel").length === 0 && Date.now() - start < 2000) {
      await new Promise((r) => setTimeout(r, 10));
    }
    const frames = worker.received("cancel");
    expect(frames).toHaveLength(1);
    expect(frames[0]!.request_id).toBe("req-123");
  });
});
