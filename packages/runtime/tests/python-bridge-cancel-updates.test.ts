/**
 * Regressions for the Python bridge's run-control paths:
 *
 *  - A workflow cancel (the run's AbortSignal) reaches the worker as a
 *    `cancel` frame for a running `execute` / `execute.stream`, and the call
 *    rejects instead of waiting for the node to finish.
 *  - `update` frames (log, preview and binary updates) reach the caller's
 *    `onUpdate` instead of being dropped.
 *  - The execute timeout is an inactivity limit: progress restarts it.
 *  - Provider TTS and text-to-audio calls send `cancel` on abort, like the
 *    image and video calls.
 */

import { describe, it, expect, afterEach, vi } from "vitest";

import { PythonBridgeBase } from "../src/python-bridge-base.js";
import type { PythonBridgeOptions } from "../src/python-bridge-types.js";

type Frame = Record<string, unknown>;

class TestBridge extends PythonBridgeBase {
  sent: Frame[] = [];

  constructor(options: PythonBridgeOptions = {}) {
    super(options);
  }

  protected async _openTransport(): Promise<void> {
    this._connected = true;
  }

  protected _send(msg: Frame): void {
    this.sent.push(msg);
  }

  close(): void {
    this._rejectAllPending(new Error("bridge closed"));
  }

  handle(msg: Frame): void {
    this._handleMessage(msg);
  }

  reqIdOf(type: string): string {
    const frame = this.sent.find((f) => f.type === type);
    if (!frame) throw new Error(`no ${type} frame sent`);
    return frame.request_id as string;
  }

  cancelledIds(): unknown[] {
    return this.sent
      .filter((f) => f.type === "cancel")
      .map((f) => f.request_id);
  }

  pendingSize(): number {
    return (this as unknown as { _pending: Map<string, unknown> })._pending
      .size;
  }

  pendingStreamSize(): number {
    return (this as unknown as { _pendingStream: Map<string, unknown> })
      ._pendingStream.size;
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("execute cancellation", () => {
  it("sends a cancel frame and rejects when the run signal aborts", async () => {
    const bridge = new TestBridge({ executeTimeoutMs: 0 });
    const controller = new AbortController();
    const p = bridge.execute("hf.Video", {}, {}, {}, undefined, undefined, {
      signal: controller.signal
    });
    const id = bridge.reqIdOf("execute");
    controller.abort();
    await expect(p).rejects.toThrow(/was cancelled/);
    expect(bridge.cancelledIds()).toEqual([id]);
    expect(bridge.pendingSize()).toBe(0);
  });

  it("does not dispatch when the signal is already aborted", async () => {
    const bridge = new TestBridge();
    const controller = new AbortController();
    controller.abort();
    await expect(
      bridge.execute("hf.Video", {}, {}, {}, undefined, undefined, {
        signal: controller.signal
      })
    ).rejects.toThrow(/was cancelled/);
    expect(bridge.sent).toEqual([]);
  });

  it("ignores an abort after the result arrived", async () => {
    const bridge = new TestBridge();
    const controller = new AbortController();
    const p = bridge.execute("n.T", {}, {}, {}, undefined, undefined, {
      signal: controller.signal
    });
    const id = bridge.reqIdOf("execute");
    bridge.handle({
      type: "result",
      request_id: id,
      data: { outputs: { output: 1 }, blobs: {} }
    });
    await expect(p).resolves.toEqual({ outputs: { output: 1 }, blobs: {} });
    controller.abort();
    expect(bridge.cancelledIds()).toEqual([]);
  });

  it("cancels a running execute.stream on abort", async () => {
    const bridge = new TestBridge();
    const controller = new AbortController();
    const gen = bridge.executeStream(
      "n.Stream",
      {},
      {},
      {},
      undefined,
      undefined,
      { signal: controller.signal }
    );
    const next = gen.next();
    await Promise.resolve();
    const id = bridge.reqIdOf("execute.stream");
    controller.abort();
    await expect(next).rejects.toThrow(/was cancelled/);
    expect(bridge.cancelledIds()).toEqual([id]);
    expect(bridge.pendingStreamSize()).toBe(0);
  });
});

describe("update frames", () => {
  it("routes update frames to onUpdate for execute", async () => {
    const bridge = new TestBridge();
    const updates: unknown[] = [];
    const p = bridge.execute("n.T", {}, {}, {}, undefined, undefined, {
      onUpdate: (u) => updates.push(u)
    });
    const id = bridge.reqIdOf("execute");
    const log = {
      type: "log_update",
      node_id: "n1",
      node_name: "N",
      content: "Loading weights",
      severity: "info"
    };
    bridge.handle({ type: "update", request_id: id, data: log });
    bridge.handle({ type: "result", request_id: id, data: { outputs: {} } });
    await p;
    expect(updates).toEqual([log]);
  });

  it("routes update frames to onUpdate for execute.stream", async () => {
    const bridge = new TestBridge();
    const updates: unknown[] = [];
    const gen = bridge.executeStream("n.S", {}, {}, {}, undefined, undefined, {
      onUpdate: (u) => updates.push(u)
    });
    const next = gen.next();
    await Promise.resolve();
    const id = bridge.reqIdOf("execute.stream");
    bridge.handle({
      type: "update",
      request_id: id,
      data: { type: "preview_update", node_id: "n1", value: 1 }
    });
    bridge.handle({
      type: "chunk",
      request_id: id,
      data: { outputs: { out: 1 }, blobs: {} }
    });
    await next;
    bridge.handle({ type: "result", request_id: id, data: { outputs: {} } });
    for await (const _ of gen) {
      // drain
    }
    expect(updates).toEqual([
      { type: "preview_update", node_id: "n1", value: 1 }
    ]);
  });
});

describe("update frame validation", () => {
  it("fails the request for an update frame without a data type", async () => {
    const bridge = new TestBridge();
    const p = bridge.execute("n.T", {}, {}, {}, undefined, undefined, {
      onUpdate: () => undefined
    });
    const id = bridge.reqIdOf("execute");
    bridge.handle({ type: "update", request_id: id, data: { content: "x" } });
    await expect(p).rejects.toThrow(/malformed 'update' frame/);
  });
});

describe("execute inactivity timeout", () => {
  it("keeps a request alive while progress frames arrive", async () => {
    vi.useFakeTimers();
    const bridge = new TestBridge({ executeTimeoutMs: 1000 });
    const p = bridge.execute("hf.Video", {}, {}, {});
    const id = bridge.reqIdOf("execute");
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(800);
      bridge.handle({
        type: "progress",
        request_id: id,
        data: { progress: i, total: 5 }
      });
    }
    // 4 s elapsed in total, far past the 1 s limit, but never 1 s idle.
    bridge.handle({
      type: "result",
      request_id: id,
      data: { outputs: { output: "done" }, blobs: {} }
    });
    await expect(p).resolves.toEqual({
      outputs: { output: "done" },
      blobs: {}
    });
    expect(bridge.cancelledIds()).toEqual([]);
  });

  it("times out after the limit passes with no activity", async () => {
    vi.useFakeTimers();
    const bridge = new TestBridge({ executeTimeoutMs: 1000 });
    const p = bridge.execute("hf.Video", {}, {}, {});
    const assertion = expect(p).rejects.toThrow(/timed out after 1000ms/);
    const id = bridge.reqIdOf("execute");
    await vi.advanceTimersByTimeAsync(600);
    bridge.handle({
      type: "progress",
      request_id: id,
      data: { progress: 1, total: 5 }
    });
    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
    expect(bridge.cancelledIds()).toEqual([id]);
  });
});

describe("provider audio cancellation", () => {
  it.each([
    ["providerTextToAudio", "provider.text_to_audio"],
    ["providerTTSEncoded", "provider.tts_encoded"]
  ] as const)("%s sends cancel on abort", async (method, frameType) => {
    const bridge = new TestBridge();
    const controller = new AbortController();
    const p = bridge[method]("hf", { model: "m" }, {}, controller.signal);
    const id = bridge.reqIdOf(frameType);
    controller.abort();
    await expect(p).rejects.toThrow(/was cancelled/);
    expect(bridge.cancelledIds()).toEqual([id]);
  });

  it("providerTTS stops the stream and sends cancel on abort", async () => {
    const bridge = new TestBridge();
    const controller = new AbortController();
    const gen = bridge.providerTTS("hf", "hi", "kokoro", {}, controller.signal);
    const next = gen.next();
    await Promise.resolve();
    const id = bridge.reqIdOf("provider.tts");
    controller.abort();
    await expect(next).rejects.toThrow(/was cancelled/);
    expect(bridge.cancelledIds()).toEqual([id]);
    expect(bridge.pendingStreamSize()).toBe(0);
  });
});
