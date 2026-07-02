/**
 * Tests for the ComfyUI proxy bridge methods (comfy.* RPC, bridge protocol v3):
 * comfyExecute (with its dedicated comfy.event lifecycle frames), the simple
 * comfy.* forwards, and the supportsComfy / getComfyStatus capability gate.
 *
 * Drives the real WebsocketPythonBridge against the shared fake worker, which
 * fronts a fake ComfyUI and reports a `comfy` block on worker.status.
 */

import { describe, it, expect, afterEach } from "vitest";

import { WebsocketPythonBridge } from "../src/python-websocket-bridge.js";
import {
  startFakeWorker,
  type FakeWorkerHandle
} from "./python-websocket-bridge.test-helpers.js";
import type { ComfyEvent } from "../src/python-bridge-types.js";

describe("comfy.* bridge methods", () => {
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

  const connect = async (
    opts: Parameters<typeof startFakeWorker>[1] = {}
  ): Promise<WebsocketPythonBridge> => {
    worker = await startFakeWorker(0, { protocolVersion: 3, ...opts });
    bridge = new WebsocketPythonBridge({
      wsUrl: `ws://127.0.0.1:${worker.port}`
    });
    await bridge.connect();
    return bridge;
  };

  it("supportsComfy reflects protocol version and the comfy.enabled block", async () => {
    const b = await connect();
    expect(b.supportsComfy()).toBe(true);
    expect(b.getComfyStatus()).toEqual({
      enabled: true,
      url: "http://127.0.0.1:8188"
    });
  });

  it("supportsComfy is false when the worker reports no comfy block", async () => {
    const b = await connect({ comfy: null });
    expect(b.supportsComfy()).toBe(false);
    expect(b.getComfyStatus()).toBeNull();
  });

  it("supportsComfy is false on a pre-v3 worker even if comfy is enabled", async () => {
    // A v2 worker predates comfy.* — the family must not be offered regardless
    // of what an (impossible) comfy block would say.
    const b = await connect({ protocolVersion: 2 });
    expect(b.supportsComfy()).toBe(false);
    expect(b.supportsModelManagement()).toBe(true);
  });

  it("comfyExecute streams comfy.event frames then resolves on the terminal result", async () => {
    const b = await connect();

    const events: ComfyEvent[] = [];
    const result = await b.comfyExecute(
      { "3": { class_type: "KSampler", inputs: {} } },
      { previews: false },
      (e) => events.push(e)
    );

    // Events arrive in emission order; `queued` first (see comfy_handler.py).
    expect(events.map((e) => e.event)).toEqual([
      "queued",
      "started",
      "executing",
      "progress",
      "node_output",
      "completed"
    ]);
    expect(events[0]!.prompt_id).toBe("p1");
    expect(result.prompt_id).toBe("p1");
    expect(result.outputs).toEqual({ "9": { images: ["out.png"] } });

    // The prompt reached the worker verbatim on a comfy.execute frame.
    const frames = worker!.received("comfy.execute");
    expect(frames).toHaveLength(1);
    expect(frames[0]!.data).toEqual({
      prompt: { "3": { class_type: "KSampler", inputs: {} } }
    });

    // No leaked pending state on either map after settle.
    const pendingStream = (
      bridge as unknown as { _pendingStream: Map<string, unknown> }
    )._pendingStream;
    const pendingComfy = (
      bridge as unknown as { _pendingComfyEvents: Map<string, unknown> }
    )._pendingComfyEvents;
    expect(pendingStream.size).toBe(0);
    expect(pendingComfy.size).toBe(0);
  });

  it("comfyExecute forwards previews and timeout options", async () => {
    const b = await connect();
    await b.comfyExecute({ "3": {} }, { previews: true, timeout: 30 }, () => {});
    const frames = worker!.received("comfy.execute");
    expect(frames[0]!.data).toEqual({
      prompt: { "3": {} },
      previews: true,
      timeout: 30
    });
  });

  it("comfyExecute rejects on a terminal error frame and cleans up", async () => {
    const b = await connect({ comfyExecuteMode: "error" });
    await expect(
      b.comfyExecute({ "3": {} }, {}, () => {})
    ).rejects.toThrow(/comfy boom/);

    const pendingStream = (
      bridge as unknown as { _pendingStream: Map<string, unknown> }
    )._pendingStream;
    const pendingComfy = (
      bridge as unknown as { _pendingComfyEvents: Map<string, unknown> }
    )._pendingComfyEvents;
    expect(pendingStream.size).toBe(0);
    expect(pendingComfy.size).toBe(0);
  });

  it("comfyExecute is cancellable via the standard cancel(requestId)", async () => {
    const b = await connect({ comfyExecuteMode: "hang" });

    const events: ComfyEvent[] = [];
    // The worker hangs after `queued`, so this run never settles on its own;
    // swallow the rejection from the afterEach close() so it isn't unhandled.
    b.comfyExecute({ "3": {} }, {}, (e) => events.push(e), "run-1").catch(
      () => {}
    );

    // Wait for the first (queued) event to confirm the run is in flight.
    const start = Date.now();
    while (events.length === 0 && Date.now() - start < 2000) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(events[0]!.event).toBe("queued");

    b.cancel("run-1");
    const cancelStart = Date.now();
    while (
      worker!.received("cancel").length === 0 &&
      Date.now() - cancelStart < 2000
    ) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(worker!.received("cancel")[0]!.request_id).toBe("run-1");
  });

  it("comfyQueue / comfyCancelPrompt / comfyInterrupt issue the right frames", async () => {
    const b = await connect();

    expect(await b.comfyQueue()).toEqual({
      queue_running: [],
      queue_pending: []
    });
    await b.comfyCancelPrompt("p1");
    await b.comfyInterrupt();

    expect(worker!.received("comfy.queue")).toHaveLength(1);
    expect(worker!.received("comfy.cancel")[0]!.data).toEqual({
      prompt_id: "p1"
    });
    expect(worker!.received("comfy.interrupt")).toHaveLength(1);
  });

  it("comfyStatus / comfyModelsList / comfyModelsDelete forward and parse results", async () => {
    const b = await connect();

    expect(await b.comfyStatus()).toEqual({
      enabled: true,
      url: "http://127.0.0.1:8188",
      reachable: true
    });

    const models = await b.comfyModelsList("checkpoints");
    expect(models).toEqual([
      { folder: "checkpoints", filename: "sd_xl_base.safetensors", size: 42 }
    ]);
    expect(worker!.received("comfy.models.list")[0]!.data).toEqual({
      folder: "checkpoints"
    });

    expect(await b.comfyModelsDelete("checkpoints", "sd_xl_base.safetensors")).toBe(
      true
    );
    expect(worker!.received("comfy.models.delete")[0]!.data).toEqual({
      folder: "checkpoints",
      filename: "sd_xl_base.safetensors"
    });
  });
});
