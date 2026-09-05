/**
 * Tests for `executeBlender` (packages/runtime/src/blender-executor.ts):
 * the worker-tier Blender executor behind Stage 4a's `blender.execute` /
 * `blender.event` frames.
 *
 * Drives the real WebsocketPythonBridge against the shared fake worker with
 * a `blender` status block. The fake answers `blender.execute` with blobs
 * and answers malformed requests the way the real worker does (an `error`
 * frame), so a bridge that sends the wrong field names fails here instead
 * of passing against a silent fake.
 */

import { describe, it, expect, afterEach } from "vitest";

import { WebsocketPythonBridge } from "../src/python-websocket-bridge.js";
import {
  executeBlender,
  BlenderExecutorError,
  type BlenderWorkerJob
} from "../src/blender-executor.js";
import {
  startFakeWorker,
  type FakeWorkerHandle
} from "./python-websocket-bridge.test-helpers.js";

const imageJob = (): BlenderWorkerJob => ({
  version: 1,
  inputs: { model: "model.glb" },
  outputs: { image: "render.png" },
  job: { op: "render_image", params: {} }
});

/** Small caps so the fake's overrides trip them without big buffers. */
const CAPS = { maxOutputBytes: 1024, maxTotalOutputBytes: 4096 };

/** The fake's deterministic bytes for an output name. */
const fakeBytesFor = (name: string): Uint8Array =>
  new Uint8Array([name.length, 0x50, 0x4e, 0x47]);

describe("blender worker executor", () => {
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
    worker = await startFakeWorker(0, {
      blender: { enabled: true, version: "5.2.1" },
      ...opts
    });
    bridge = new WebsocketPythonBridge({
      wsUrl: `ws://127.0.0.1:${worker.port}`
    });
    await bridge.connect();
    return bridge;
  };

  const pendingSizes = (): { stream: number; events: number } => ({
    stream: (
      bridge as unknown as { _pendingStream: Map<string, unknown> }
    )._pendingStream.size,
    events: (
      bridge as unknown as { _pendingBlenderEvents: Map<string, unknown> }
    )._pendingBlenderEvents.size
  });

  it("supportsBlender reflects the worker.status blender block", async () => {
    const b = await connect();
    expect(b.supportsBlender()).toBe(true);
    expect(b.getBlenderStatus()).toEqual({
      enabled: true,
      version: "5.2.1"
    });
  });

  it("supportsBlender is false when the worker says nothing about Blender", async () => {
    const b = await connect({ blender: null });
    expect(b.supportsBlender()).toBe(false);
    expect(b.getBlenderStatus()).toBeNull();
  });

  it("supportsBlender is false when the worker reports enabled: false", async () => {
    const b = await connect({ blender: { enabled: false } });
    expect(b.supportsBlender()).toBe(false);
  });

  it("a successful job returns declared outputs with stats", async () => {
    const b = await connect();
    const progress: Array<[number, number]> = [];
    const result = await executeBlender(
      b,
      imageJob(),
      { model: new Uint8Array([1, 2, 3]) },
      {
        timeoutMs: 6000,
        onProgress: (frame, total) => progress.push([frame, total]),
        ...CAPS
      }
    );
    expect(Object.keys(result.outputs)).toEqual(["image"]);
    expect(result.outputs["image"]).toEqual(fakeBytesFor("image"));
    expect(result.stats.blender_version).toBe("5.2.1");
    expect(result.stats.render_seconds).toBe(1.5);
    expect(result.stats.frames).toBe(3);
    expect(progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3]
    ]);

    // The request carried the verbatim job, the blob-key manifest, the input
    // bytes under those keys, and the timeout in whole seconds.
    const frames = worker!.received("blender.execute");
    expect(frames).toHaveLength(1);
    const sent = frames[0]!.data as {
      job: unknown;
      inputs: unknown;
      blobs: Record<string, Uint8Array>;
      timeout: unknown;
    };
    expect(sent.job).toEqual(imageJob());
    expect(sent.inputs).toEqual({ model: "model" });
    // The fake decodes blobs as Buffers; normalize before comparing bytes.
    expect(new Uint8Array(sent.blobs["model"]!)).toEqual(
      new Uint8Array([1, 2, 3])
    );
    expect(sent.timeout).toBe(6);

    // No leaked pending state on either map after settle.
    expect(pendingSizes()).toEqual({ stream: 0, events: 0 });
  });

  it("an undeclared produced name is ignored and logged at warn", async () => {
    const b = await connect({ blenderExtraProduced: ["evil"] });
    const chunks: string[] = [];
    const origWrite = process.stderr.write;
    process.stderr.write = ((chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    try {
      const result = await executeBlender(b, imageJob(), {
        model: new Uint8Array([1])
      }, { timeoutMs: 6000, ...CAPS });
      expect(Object.keys(result.outputs)).toEqual(["image"]);
      expect(result.outputs["image"]).toEqual(fakeBytesFor("image"));
    } finally {
      process.stderr.write = origWrite;
    }
    expect(chunks.join("")).toContain('undeclared output "evil"');
  });

  it("a declared size over maxOutputBytes is refused before transfer", async () => {
    // The fake sends 4 real bytes but declares 1000: only the declared-size
    // pass can refuse this, proving caps enforce before blob consumption.
    const b = await connect({ blenderSizesOverride: { image: 1000 } });
    const err = await executeBlender(
      b,
      imageJob(),
      { model: new Uint8Array([1]) },
      { timeoutMs: 6000, maxOutputBytes: 16, maxTotalOutputBytes: 1 << 20 }
    ).then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(BlenderExecutorError);
    expect((err as BlenderExecutorError).code).toBe("output_too_large");
    expect((err as Error).message).toContain("image");
    expect((err as Error).message).toContain("16");
    expect(pendingSizes()).toEqual({ stream: 0, events: 0 });
  });

  it("declared sizes summing over the total cap are refused", async () => {
    const b = await connect({
      blenderSizesOverride: { a: 60, b: 60 }
    });
    const job: BlenderWorkerJob = {
      version: 1,
      inputs: { model: "model.glb" },
      outputs: { a: "a.png", b: "b.png" },
      job: { op: "render_passes", params: {} }
    };
    const err = await executeBlender(
      b,
      job,
      { model: new Uint8Array([1]) },
      { timeoutMs: 6000, maxOutputBytes: 1024, maxTotalOutputBytes: 100 }
    ).then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(BlenderExecutorError);
    expect((err as BlenderExecutorError).code).toBe("output_too_large");
    expect((err as Error).message).toContain("100");
  });

  it("an op failure preserves the worker's error code", async () => {
    const b = await connect({ blenderExecuteMode: "opfail" });
    const err = await executeBlender(
      b,
      imageJob(),
      { model: new Uint8Array([1]) },
      { timeoutMs: 6000, ...CAPS }
    ).then(
      () => null,
      (e: unknown) => e
    );
    // Same code the local tier throws for a failed render: Stage 4b maps it
    // one-to-one into BlenderJobError.
    expect(err).toBeInstanceOf(BlenderExecutorError);
    expect((err as BlenderExecutorError).code).toBe("render_failed");
    expect((err as Error).message).toContain("Eevee complained");
  });

  it("a terminal error frame surfaces as bad_result", async () => {
    const b = await connect({ blenderExecuteMode: "error" });
    const err = await executeBlender(
      b,
      imageJob(),
      { model: new Uint8Array([1]) },
      { timeoutMs: 6000, ...CAPS }
    ).then(
      () => null,
      (e: unknown) => e
    );
    // Same code the local tier throws for a crashed Blender with no result.
    expect(err).toBeInstanceOf(BlenderExecutorError);
    expect((err as BlenderExecutorError).code).toBe("bad_result");
    expect((err as Error).message).toContain("blender exploded");
  });

  it("an op failure with a code but no message names the code", async () => {
    const b = await connect({ blenderExecuteMode: "opfail_nomessage" });
    const err = await executeBlender(
      b,
      imageJob(),
      { model: new Uint8Array([1]) },
      { timeoutMs: 6000, ...CAPS }
    ).then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(BlenderExecutorError);
    expect((err as BlenderExecutorError).code).toBe("gpu_lost");
    expect((err as Error).message).toContain("gpu_lost");
  });

  it("an op failure whose error is a bare string keeps the string", async () => {
    const b = await connect({ blenderExecuteMode: "opfail_string" });
    const err = await executeBlender(
      b,
      imageJob(),
      { model: new Uint8Array([1]) },
      { timeoutMs: 6000, ...CAPS }
    ).then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(BlenderExecutorError);
    expect((err as BlenderExecutorError).code).toBe("bad_result");
    expect((err as Error).message).toContain("scratch disk full");
  });

  it("a malformed terminal result surfaces as bad_result", async () => {
    const b = await connect({ blenderExecuteMode: "malformed" });
    const err = await executeBlender(
      b,
      imageJob(),
      { model: new Uint8Array([1]) },
      { timeoutMs: 6000, ...CAPS }
    ).then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(BlenderExecutorError);
    expect((err as BlenderExecutorError).code).toBe("bad_result");
    expect((err as Error).message).toContain("fields: ok");
  });

  it("an input the job did not declare is bad_job before anything is sent", async () => {
    const b = await connect();
    const err = await executeBlender(
      b,
      imageJob(),
      { nope: new Uint8Array([1]) },
      { timeoutMs: 6000, ...CAPS }
    ).then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(BlenderExecutorError);
    expect((err as BlenderExecutorError).code).toBe("bad_job");
    expect(worker!.received("blender.execute")).toHaveLength(0);
  });

  it("an abort mid-job reaches the worker and rejects with the reason", async () => {
    const b = await connect({ blenderExecuteMode: "hang" });
    const controller = new AbortController();
    const reason = new Error("user stopped the render");
    const progress: Array<[number, number]> = [];
    const runPromise = executeBlender(
      b,
      imageJob(),
      { model: new Uint8Array([1]) },
      {
        timeoutMs: 60000,
        signal: controller.signal,
        onProgress: (frame, total) => progress.push([frame, total]),
        ...CAPS
      }
    );

    // Wait for the first progress frame to confirm the run is in flight.
    const start = Date.now();
    while (progress.length === 0 && Date.now() - start < 5000) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(progress[0]).toEqual([1, 3]);

    controller.abort(reason);
    const err = await runPromise.then(
      () => null,
      (e: unknown) => e
    );
    // Unwrapped abort reason, the way the local tier rejects.
    expect(err).toBe(reason);

    // The cancel reached the worker for the same request id — the run was
    // stopped remotely, not just abandoned locally.
    const cancelStart = Date.now();
    while (
      worker!.received("cancel").length === 0 &&
      Date.now() - cancelStart < 5000
    ) {
      await new Promise((r) => setTimeout(r, 10));
    }
    const executeFrames = worker!.received("blender.execute");
    const cancelFrames = worker!.received("cancel");
    expect(executeFrames).toHaveLength(1);
    expect(cancelFrames).toHaveLength(1);
    expect(cancelFrames[0]!.request_id).toBe(executeFrames[0]!.request_id);
    expect(pendingSizes()).toEqual({ stream: 0, events: 0 });
  });

  it("times out locally when the worker never sends a terminal result", async () => {
    const b = await connect({ blenderExecuteMode: "hang" });
    const err = await executeBlender(
      b,
      imageJob(),
      { model: new Uint8Array([1]) },
      { timeoutMs: 30, ...CAPS }
    ).then(
      () => null,
      (e: unknown) => e
    );

    expect(err).toBeInstanceOf(BlenderExecutorError);
    expect((err as BlenderExecutorError).code).toBe("timeout");
    const cancelStart = Date.now();
    while (
      worker!.received("cancel").length === 0 &&
      Date.now() - cancelStart < 2000
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(worker!.received("cancel")).toHaveLength(1);
    expect(pendingSizes()).toEqual({ stream: 0, events: 0 });
  });

  it("an already-aborted signal rejects without sending", async () => {
    const b = await connect();
    const controller = new AbortController();
    const reason = new Error("already gone");
    controller.abort(reason);
    const err = await executeBlender(
      b,
      imageJob(),
      { model: new Uint8Array([1]) },
      { timeoutMs: 6000, signal: controller.signal, ...CAPS }
    ).then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBe(reason);
    expect(worker!.received("blender.execute")).toHaveLength(0);
  });

  it("does not dispatch after an abort before bridge dispatch", async () => {
    const b = await connect();
    const controller = new AbortController();
    const reason = new Error("stopped before dispatch");
    const pending = executeBlender(
      b,
      imageJob(),
      { model: new Uint8Array([1]) },
      { timeoutMs: 6000, signal: controller.signal, ...CAPS }
    );
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
    expect(worker!.received("blender.execute")).toHaveLength(0);
  });
});
