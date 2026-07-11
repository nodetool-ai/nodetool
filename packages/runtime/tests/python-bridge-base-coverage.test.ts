/**
 * Direct unit tests for the transport-agnostic {@link PythonBridgeBase}.
 *
 * Rather than spinning up a real WebSocket worker (see python-bridge-models
 * for that), these tests subclass the abstract base with an in-memory
 * transport: `_send` records the frame and an optional responder synthesizes
 * the worker's reply by calling the base's own `_handleMessage`. That isolates
 * the protocol logic — message framing, request/response correlation, the
 * discover/version gate, timeouts, streaming generators and the pending-map
 * bookkeeping — with zero I/O and full determinism.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi
} from "vitest";

import {
  BRIDGE_PROTOCOL_VERSION,
  MIN_BRIDGE_PROTOCOL_VERSION
} from "@nodetool-ai/protocol/bridge-protocol";
import { PythonBridgeBase } from "../src/python-bridge-base.js";
import type {
  PythonBridgeOptions,
  ComfyEvent
} from "../src/python-bridge-types.js";

type Frame = Record<string, unknown>;

/**
 * Concrete test subclass with an in-memory transport. `_send` records the
 * outgoing frame; if a responder is installed it is invoked synchronously so a
 * test can synthesize the worker's reply (via `handle`) exactly when it wants.
 */
class TestBridge extends PythonBridgeBase {
  sent: Frame[] = [];
  openCalls = 0;
  closed = false;
  openError: Error | null = null;
  sendError: Error | null = null;
  assertError: Error | null = null;
  stderrSummary: string | null = null;
  responder: ((msg: Frame) => void) | null = null;

  protected async _openTransport(): Promise<void> {
    this.openCalls += 1;
    if (this.openError) throw this.openError;
    this._connected = true;
  }

  protected _send(msg: Frame): void {
    if (this.sendError) throw this.sendError;
    this.sent.push(msg);
    if (this.responder) this.responder(msg);
  }

  close(): void {
    this.closed = true;
    this._connected = false;
    this._rejectAllPending(new Error("bridge closed"));
  }

  protected _assertCanConnect(): void {
    if (this.assertError) throw this.assertError;
  }

  override getRecentStderrSummary(): string | null {
    return this.stderrSummary;
  }

  // Test helpers ─────────────────────────────────────────────────────────
  handle(msg: Frame): void {
    this._handleMessage(msg);
  }

  lastSent(): Frame {
    return this.sent[this.sent.length - 1]!;
  }

  reqIdOf(type: string): string {
    const frame = this.sent.find((f) => f.type === type);
    return frame!.request_id as string;
  }

  pendingSize(): number {
    return (this as unknown as { _pending: Map<string, unknown> })._pending
      .size;
  }

  pendingStreamSize(): number {
    return (this as unknown as { _pendingStream: Map<string, unknown> })
      ._pendingStream.size;
  }

  comfyEventsSize(): number {
    return (
      this as unknown as { _pendingComfyEvents: Map<string, unknown> }
    )._pendingComfyEvents.size;
  }
}

/**
 * Installs a responder that answers discover + worker.status so connect()
 * resolves, then clears it so subsequent RPCs are driven manually.
 */
async function connectBridge(
  bridge: TestBridge,
  opts: {
    discoverVersion?: number;
    statusVersion?: number;
    comfy?: { enabled: boolean; url?: string };
    loadErrors?: unknown[];
    nodes?: unknown[];
  } = {}
): Promise<void> {
  bridge.responder = (msg) => {
    if (msg.type === "discover") {
      bridge.handle({
        type: "discover",
        request_id: msg.request_id,
        data: {
          nodes: opts.nodes ?? [],
          protocol_version: opts.discoverVersion ?? BRIDGE_PROTOCOL_VERSION,
          load_errors: opts.loadErrors ?? []
        }
      });
    } else if (msg.type === "worker.status") {
      bridge.handle({
        type: "result",
        request_id: msg.request_id,
        data: {
          protocol_version: opts.statusVersion ?? BRIDGE_PROTOCOL_VERSION,
          comfy: opts.comfy
          // No load_errors here: getWorkerStatus keeps the prior value when the
          // field is absent, so discover-reported load_errors survive connect().
        }
      });
    }
  };
  await bridge.connect();
  bridge.responder = null;
}

function makeBridge(options: PythonBridgeOptions = {}): TestBridge {
  return new TestBridge(options);
}

describe("PythonBridgeBase — connection lifecycle", () => {
  it("connect() opens transport, discovers, and fetches status", async () => {
    const bridge = makeBridge();
    await connectBridge(bridge, {
      nodes: [
        {
          node_type: "test.Node",
          title: "t",
          description: "",
          properties: [],
          outputs: [],
          required_settings: []
        }
      ]
    });

    expect(bridge.openCalls).toBe(1);
    expect(bridge.isConnected).toBe(true);
    expect(bridge.getNodeMetadata()).toHaveLength(1);
    expect(bridge.hasNodeType("test.Node")).toBe(true);
    expect(bridge.hasNodeType("missing")).toBe(false);
    // Both a discover and a worker.status frame were sent.
    expect(bridge.sent.some((f) => f.type === "discover")).toBe(true);
    expect(bridge.sent.some((f) => f.type === "worker.status")).toBe(true);
  });

  it("_assertCanConnect can refuse connection", async () => {
    const bridge = makeBridge();
    bridge.assertError = new Error("refused in production");
    await expect(bridge.connect()).rejects.toThrow("refused in production");
    expect(bridge.openCalls).toBe(0);
  });

  it("connect() rejects if the transport fails to open", async () => {
    const bridge = makeBridge();
    bridge.openError = new Error("no socket");
    await expect(bridge.connect()).rejects.toThrow("no socket");
  });

  it("connect() still resolves when the initial status fetch times out", async () => {
    const bridge = makeBridge({ statusTimeoutMs: 30 });
    // Respond to discover but never to worker.status.
    bridge.responder = (msg) => {
      if (msg.type === "discover") {
        bridge.handle({
          type: "discover",
          request_id: msg.request_id,
          data: { nodes: [], protocol_version: BRIDGE_PROTOCOL_VERSION }
        });
      }
    };
    await expect(bridge.connect()).resolves.toBeUndefined();
  });

  it("ensureConnected() connects once and caches the in-flight promise", async () => {
    const bridge = makeBridge();
    bridge.responder = (msg) => {
      if (msg.type === "discover") {
        bridge.handle({
          type: "discover",
          request_id: msg.request_id,
          data: { nodes: [], protocol_version: BRIDGE_PROTOCOL_VERSION }
        });
      } else if (msg.type === "worker.status") {
        bridge.handle({
          type: "result",
          request_id: msg.request_id,
          data: { protocol_version: BRIDGE_PROTOCOL_VERSION }
        });
      }
    };
    const connectSpy = vi.spyOn(bridge, "connect");
    await Promise.all([bridge.ensureConnected(), bridge.ensureConnected()]);
    // Two concurrent callers share one connect() call.
    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  it("ensureConnected() short-circuits when already connected", async () => {
    const bridge = makeBridge();
    (bridge as unknown as { _connected: boolean })._connected = true;
    const connectSpy = vi.spyOn(bridge, "connect");
    await bridge.ensureConnected();
    expect(connectSpy).not.toHaveBeenCalled();
  });

  it("ensureConnected() clears the cached promise on failure so a retry can connect", async () => {
    const bridge = makeBridge();
    bridge.openError = new Error("boom");
    await expect(bridge.ensureConnected()).rejects.toThrow("boom");
    expect(
      (bridge as unknown as { _connectPromise: unknown })._connectPromise
    ).toBeNull();
  });

  it("isAvailable() defaults to true", () => {
    expect(makeBridge().isAvailable()).toBe(true);
  });
});

describe("PythonBridgeBase — discover version gate", () => {
  it("rejects a worker below the hard protocol floor", async () => {
    const bridge = makeBridge();
    await expect(
      connectBridge(bridge, {
        discoverVersion: MIN_BRIDGE_PROTOCOL_VERSION - 1
      })
    ).rejects.toThrow(/requires at least/);
  });

  it("treats a worker with no protocol_version as v1", async () => {
    const bridge = makeBridge();
    bridge.responder = (msg) => {
      if (msg.type === "discover") {
        // No protocol_version field → treated as v1.
        bridge.handle({
          type: "discover",
          request_id: msg.request_id,
          data: { nodes: [] }
        });
      } else if (msg.type === "worker.status") {
        bridge.handle({
          type: "result",
          request_id: msg.request_id,
          data: { protocol_version: 1 }
        });
      }
    };
    // MIN floor is 1, so a v1 (unannounced) worker connects.
    await expect(bridge.connect()).resolves.toBeUndefined();
  });

  it("emits a stderr warning when the worker protocol is newer than the runtime", async () => {
    const bridge = makeBridge();
    const stderrEvents: string[] = [];
    bridge.on("stderr", (line: string) => stderrEvents.push(line));
    await connectBridge(bridge, {
      discoverVersion: BRIDGE_PROTOCOL_VERSION + 5
    });
    expect(stderrEvents.join("")).toMatch(/newer than/);
  });

  it("defaults load_errors to [] when the discover frame omits them", async () => {
    const bridge = makeBridge();
    await connectBridge(bridge);
    expect(bridge.getLoadErrors()).toEqual([]);
  });

  it("surfaces load_errors reported by the worker", async () => {
    const bridge = makeBridge();
    const errs = [{ node_type: "x", error: "bad", traceback: "tb" }];
    await connectBridge(bridge, { loadErrors: errs });
    expect(bridge.getLoadErrors()).toEqual(errs);
  });

  it("ignores a discover frame for an unknown request id", async () => {
    const bridge = makeBridge();
    // No pending entry — must not throw.
    expect(() =>
      bridge.handle({
        type: "discover",
        request_id: "ghost",
        data: { nodes: [], protocol_version: BRIDGE_PROTOCOL_VERSION }
      })
    ).not.toThrow();
  });
});

describe("PythonBridgeBase — execute", () => {
  let bridge: TestBridge;
  beforeEach(async () => {
    bridge = makeBridge();
    await connectBridge(bridge);
  });

  it("sends an execute frame and resolves on the terminal result", async () => {
    const p = bridge.execute("n.T", { a: 1 }, { KEY: "v" }, {});
    const frame = bridge.sent.find((f) => f.type === "execute")!;
    expect(frame.data).toEqual({
      node_type: "n.T",
      fields: { a: 1 },
      secrets: { KEY: "v" },
      blobs: {}
    });
    bridge.handle({
      type: "result",
      request_id: frame.request_id,
      data: { outputs: { out: 42 }, blobs: {} }
    });
    await expect(p).resolves.toEqual({ outputs: { out: 42 }, blobs: {} });
    expect(bridge.pendingSize()).toBe(0);
  });

  it("defaults blobs to {} when the result frame omits them", async () => {
    const p = bridge.execute("n.T", {}, {}, {});
    const id = bridge.reqIdOf("execute");
    bridge.handle({ type: "result", request_id: id, data: { outputs: {} } });
    const res = await p;
    expect(res.blobs).toEqual({});
  });

  it("rejects on a terminal error frame and attaches the traceback", async () => {
    const p = bridge.execute("n.T", {}, {}, {});
    const id = bridge.reqIdOf("execute");
    bridge.handle({
      type: "error",
      request_id: id,
      data: { error: "kaboom", traceback: "line 1\nline 2" }
    });
    await expect(p).rejects.toThrow("kaboom");
    await p.catch((e) => {
      expect((e as { traceback?: string }).traceback).toBe("line 1\nline 2");
    });
    expect(bridge.pendingSize()).toBe(0);
  });

  it("forwards progress frames to onProgress and emits a progress event", async () => {
    const progress: unknown[] = [];
    const emitted: unknown[] = [];
    bridge.on("progress", (d: unknown) => emitted.push(d));
    const p = bridge.execute("n.T", {}, {}, {}, (e) => progress.push(e));
    const id = bridge.reqIdOf("execute");
    bridge.handle({
      type: "progress",
      request_id: id,
      data: { progress: 3, total: 10 }
    });
    expect(progress).toEqual([{ request_id: id, progress: 3, total: 10 }]);
    expect(emitted).toEqual([{ progress: 3, total: 10 }]);
    bridge.handle({ type: "result", request_id: id, data: { outputs: {} } });
    await p;
  });

  it("times out, cancels the request, and enriches the error with stderr", async () => {
    bridge = makeBridge({ executeTimeoutMs: 40 });
    await connectBridge(bridge);
    bridge.stderrSummary = "ImportError: torch";
    await expect(bridge.execute("slow.Node", {}, {}, {})).rejects.toThrow(
      /timed out after 40ms.*Recent stderr: ImportError: torch/
    );
    // A cancel frame was issued for the timed-out request.
    expect(bridge.sent.some((f) => f.type === "cancel")).toBe(true);
    expect(bridge.pendingSize()).toBe(0);
  });

  it("does not append a stderr hint when none is available", async () => {
    bridge = makeBridge({ executeTimeoutMs: 30 });
    await connectBridge(bridge);
    bridge.stderrSummary = null;
    await expect(bridge.execute("slow.Node", {}, {}, {})).rejects.toThrow(
      /timed out after 30ms waiting for the worker\.$/
    );
  });

  it("with timeout disabled (0) waits indefinitely on the raw promise", async () => {
    bridge = makeBridge({ executeTimeoutMs: 0 });
    await connectBridge(bridge);
    const p = bridge.execute("n.T", {}, {}, {});
    const id = bridge.reqIdOf("execute");
    bridge.handle({ type: "result", request_id: id, data: { outputs: { ok: 1 } } });
    await expect(p).resolves.toEqual({ outputs: { ok: 1 }, blobs: {} });
  });

  it("rejects and cleans up if the transport throws on send", async () => {
    bridge.sendError = new Error("socket dead");
    await expect(bridge.execute("n.T", {}, {}, {})).rejects.toThrow(
      "socket dead"
    );
    expect(bridge.pendingSize()).toBe(0);
  });

  it("cancel() sends a cancel frame with the request id", () => {
    bridge.cancel("req-9");
    const frame = bridge.sent.find((f) => f.type === "cancel")!;
    expect(frame.request_id).toBe("req-9");
    expect(frame.data).toEqual({});
  });
});

describe("PythonBridgeBase — executeStream", () => {
  let bridge: TestBridge;
  beforeEach(async () => {
    bridge = makeBridge();
    await connectBridge(bridge);
  });

  it("yields streamed chunks in order then the terminal result is not re-emitted", async () => {
    const gen = bridge.executeStream("n.T", {}, {}, {});
    const first = gen.next();
    const id = bridge.reqIdOf("execute.stream");
    bridge.handle({
      type: "chunk",
      request_id: id,
      data: { outputs: { i: 1 }, blobs: {} }
    });
    bridge.handle({
      type: "chunk",
      request_id: id,
      data: { outputs: { i: 2 } }
    });
    bridge.handle({
      type: "result",
      request_id: id,
      data: { outputs: { final: true }, blobs: {} }
    });

    const collected: unknown[] = [];
    const r1 = await first;
    collected.push(r1.value);
    for await (const c of gen) collected.push(c);
    expect(collected).toEqual([
      { outputs: { i: 1 }, blobs: {} },
      { outputs: { i: 2 }, blobs: {} }
    ]);
  });

  it("yields the final result once when no chunks streamed", async () => {
    const gen = bridge.executeStream("n.T", {}, {}, {});
    const p = gen.next();
    const id = bridge.reqIdOf("execute.stream");
    bridge.handle({
      type: "result",
      request_id: id,
      data: { outputs: { only: 1 }, blobs: {} }
    });
    const r = await p;
    expect(r.value).toEqual({ outputs: { only: 1 }, blobs: {} });
    const done = await gen.next();
    expect(done.done).toBe(true);
  });

  it("throws when the stream ends in an error frame", async () => {
    const gen = bridge.executeStream("n.T", {}, {}, {});
    const p = gen.next();
    const id = bridge.reqIdOf("execute.stream");
    bridge.handle({
      type: "error",
      request_id: id,
      data: { error: "stream broke" }
    });
    await expect(p).rejects.toThrow("stream broke");
  });

  it("registers an onProgress pending entry that receives progress frames", async () => {
    const progress: unknown[] = [];
    const gen = bridge.executeStream("n.T", {}, {}, {}, (e) =>
      progress.push(e)
    );
    const p = gen.next();
    const id = bridge.reqIdOf("execute.stream");
    bridge.handle({
      type: "progress",
      request_id: id,
      data: { progress: 1, total: 2 }
    });
    expect(progress).toEqual([{ request_id: id, progress: 1, total: 2 }]);
    bridge.handle({ type: "result", request_id: id, data: { outputs: {} } });
    await p;
  });
});

describe("PythonBridgeBase — worker status & capabilities", () => {
  it("getWorkerStatus() sends worker.status and stores the result", async () => {
    const bridge = makeBridge();
    await connectBridge(bridge);
    const p = bridge.getWorkerStatus();
    // Find the most recent worker.status frame.
    const statusFrames = bridge.sent.filter((f) => f.type === "worker.status");
    const id = statusFrames[statusFrames.length - 1]!.request_id;
    bridge.handle({
      type: "result",
      request_id: id,
      data: { protocol_version: 3, load_errors: [{ e: 1 }] }
    });
    const status = await p;
    expect(status.protocol_version).toBe(3);
    expect(bridge.getLoadErrors()).toEqual([{ e: 1 }]);
  });

  it("_getWorkerStatusWithTimeout with timeout disabled delegates to getWorkerStatus", async () => {
    const bridge = makeBridge({ statusTimeoutMs: 0 });
    await connectBridge(bridge);
    const spy = vi.spyOn(bridge, "getWorkerStatus").mockResolvedValue({
      protocol_version: 2
    } as never);
    await (
      bridge as unknown as {
        _getWorkerStatusWithTimeout: () => Promise<unknown>;
      }
    )._getWorkerStatusWithTimeout();
    expect(spy).toHaveBeenCalled();
  });

  it("_getWorkerStatusWithTimeout rejects on timeout and drops the pending entry", async () => {
    const bridge = makeBridge({ statusTimeoutMs: 30 });
    await connectBridge(bridge);
    await expect(
      (
        bridge as unknown as {
          _getWorkerStatusWithTimeout: () => Promise<unknown>;
        }
      )._getWorkerStatusWithTimeout()
    ).rejects.toThrow(/status timed out after 30ms/);
    expect(bridge.pendingStreamSize()).toBe(0);
  });

  it("supportsModelManagement reflects the worker protocol version", async () => {
    const v2 = makeBridge();
    await connectBridge(v2, { statusVersion: 2 });
    expect(v2.supportsModelManagement()).toBe(true);

    const v1 = makeBridge();
    await connectBridge(v1, { statusVersion: 1 });
    expect(v1.supportsModelManagement()).toBe(false);

    (v1 as unknown as { _workerStatus: unknown })._workerStatus = null;
    expect(v1.supportsModelManagement()).toBe(false);
  });

  it("supportsComfy requires protocol v3+ and comfy.enabled", async () => {
    const on = makeBridge();
    await connectBridge(on, {
      statusVersion: 3,
      comfy: { enabled: true, url: "http://127.0.0.1:8188" }
    });
    expect(on.supportsComfy()).toBe(true);
    expect(on.getComfyStatus()).toEqual({
      enabled: true,
      url: "http://127.0.0.1:8188"
    });

    const off = makeBridge();
    await connectBridge(off, { statusVersion: 3, comfy: { enabled: false } });
    expect(off.supportsComfy()).toBe(false);

    const old = makeBridge();
    await connectBridge(old, { statusVersion: 2 });
    expect(old.supportsComfy()).toBe(false);
    expect(old.getComfyStatus()).toBeNull();
  });

  it("getRecentStderrSummary base implementation returns null", () => {
    // The subclass overrides it; assert the base default via a fresh subclass
    // that does not override.
    class BareBridge extends PythonBridgeBase {
      protected async _openTransport(): Promise<void> {}
      protected _send(): void {}
      close(): void {}
    }
    expect(new BareBridge().getRecentStderrSummary()).toBeNull();
  });
});

describe("PythonBridgeBase — provider RPCs", () => {
  let bridge: TestBridge;
  beforeEach(async () => {
    bridge = makeBridge();
    await connectBridge(bridge);
  });

  /** Reply to the last-sent frame of a given type with a result payload. */
  function reply(type: string, data: Record<string, unknown>): void {
    const frames = bridge.sent.filter((f) => f.type === type);
    const id = frames[frames.length - 1]!.request_id;
    bridge.handle({ type: "result", request_id: id, data });
  }

  it("listProviders unwraps the providers array", async () => {
    const p = bridge.listProviders();
    reply("provider.list", { providers: [{ id: "openai" }] });
    await expect(p).resolves.toEqual([{ id: "openai" }]);
  });

  it("getProviderModels sends provider/model_type/secrets and unwraps models", async () => {
    const p = bridge.getProviderModels("openai", "llm", { K: "v" });
    const frame = bridge.sent.find((f) => f.type === "provider.models")!;
    expect(frame.data).toEqual({
      provider: "openai",
      model_type: "llm",
      secrets: { K: "v" }
    });
    reply("provider.models", { models: [{ id: "gpt" }] });
    await expect(p).resolves.toEqual([{ id: "gpt" }]);
  });

  it("getProviderModels defaults secrets to {} when omitted", async () => {
    const p = bridge.getProviderModels("openai", "llm");
    const frame = bridge.sent.find((f) => f.type === "provider.models")!;
    expect((frame.data as Record<string, unknown>).secrets).toEqual({});
    reply("provider.models", { models: [] });
    await p;
  });

  it("providerGenerate merges options and unwraps the message", async () => {
    const p = bridge.providerGenerate("openai", [{ role: "user" }], "gpt", {
      temperature: 0.5
    });
    const frame = bridge.sent.find((f) => f.type === "provider.generate")!;
    expect(frame.data).toEqual({
      provider: "openai",
      messages: [{ role: "user" }],
      model: "gpt",
      temperature: 0.5
    });
    reply("provider.generate", { message: { role: "assistant", content: "hi" } });
    await expect(p).resolves.toEqual({ role: "assistant", content: "hi" });
  });

  it("providerTextToImage returns the image blob", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const p = bridge.providerTextToImage("fal", { prompt: "x" });
    reply("provider.text_to_image", { blobs: { image: bytes } });
    await expect(p).resolves.toBe(bytes);
  });

  it("providerImageToImage sends the input image and returns the output blob", async () => {
    const input = new Uint8Array([9]);
    const output = new Uint8Array([8]);
    const p = bridge.providerImageToImage("fal", input, { strength: 0.6 });
    const frame = bridge.sent.find((f) => f.type === "provider.image_to_image")!;
    expect((frame.data as Record<string, unknown>).image).toBe(input);
    reply("provider.image_to_image", { blobs: { image: output } });
    await expect(p).resolves.toBe(output);
  });

  it("providerASR maps text and chunks", async () => {
    const p = bridge.providerASR("hf", new Uint8Array([1]), "whisper");
    reply("provider.asr", {
      text: "hello",
      chunks: [{ timestamp: [0, 1], text: "hello" }]
    });
    await expect(p).resolves.toEqual({
      text: "hello",
      chunks: [{ timestamp: [0, 1], text: "hello" }]
    });
  });

  it("providerEmbedding forwards dimensions and unwraps embeddings", async () => {
    const p = bridge.providerEmbedding("openai", ["a", "b"], "emb", 256);
    const frame = bridge.sent.find((f) => f.type === "provider.embedding")!;
    expect(frame.data).toEqual({
      provider: "openai",
      text: ["a", "b"],
      model: "emb",
      dimensions: 256
    });
    reply("provider.embedding", { embeddings: [[1], [2]] });
    await expect(p).resolves.toEqual([[1], [2]]);
  });

  it("providerStream yields chunks then completes on the terminal result", async () => {
    const gen = bridge.providerStream("openai", [{ role: "user" }], "gpt");
    const first = gen.next();
    const id = bridge.reqIdOf("provider.stream");
    bridge.handle({ type: "chunk", request_id: id, data: { delta: "a" } });
    bridge.handle({ type: "chunk", request_id: id, data: { delta: "b" } });
    bridge.handle({ type: "result", request_id: id, data: {} });
    const collected: unknown[] = [];
    collected.push((await first).value);
    for await (const c of gen) collected.push(c);
    expect(collected).toEqual([{ delta: "a" }, { delta: "b" }]);
  });

  it("providerStream throws when the stream errors", async () => {
    const gen = bridge.providerStream("openai", [], "gpt");
    const p = gen.next();
    const id = bridge.reqIdOf("provider.stream");
    bridge.handle({ type: "error", request_id: id, data: { error: "nope" } });
    await expect(p).rejects.toThrow("nope");
  });

  it("providerTTS yields only audio blobs from chunk frames", async () => {
    const gen = bridge.providerTTS("el", "hello", "voice");
    const first = gen.next();
    const id = bridge.reqIdOf("provider.tts");
    const audio1 = new Uint8Array([1]);
    const audio2 = new Uint8Array([2]);
    // A chunk without audio is skipped.
    bridge.handle({ type: "chunk", request_id: id, data: { blobs: {} } });
    bridge.handle({
      type: "chunk",
      request_id: id,
      data: { blobs: { audio: audio1 } }
    });
    bridge.handle({
      type: "chunk",
      request_id: id,
      data: { blobs: { audio: audio2 } }
    });
    bridge.handle({ type: "result", request_id: id, data: {} });
    const collected: Uint8Array[] = [];
    const r1 = await first;
    if (!r1.done) collected.push(r1.value);
    for await (const c of gen) collected.push(c);
    expect(collected).toEqual([audio1, audio2]);
  });
});

describe("PythonBridgeBase — models & comfy proxy RPCs", () => {
  let bridge: TestBridge;
  beforeEach(async () => {
    bridge = makeBridge();
    await connectBridge(bridge, { statusVersion: 3, comfy: { enabled: true } });
  });

  function reply(type: string, data: Record<string, unknown>): void {
    const frames = bridge.sent.filter((f) => f.type === type);
    const id = frames[frames.length - 1]!.request_id;
    bridge.handle({ type: "result", request_id: id, data });
  }

  it("listCachedModels unwraps the models list", async () => {
    const p = bridge.listCachedModels();
    reply("models.list_cached", { models: [{ id: "m", name: "M" }] });
    await expect(p).resolves.toEqual([{ id: "m", name: "M" }]);
  });

  it("deleteCachedModel coerces the deleted flag to a boolean", async () => {
    const p = bridge.deleteCachedModel("org/m");
    reply("models.delete", {});
    await expect(p).resolves.toBe(false);
  });

  it("downloadModel streams progress then resolves on terminal result", async () => {
    const updates: unknown[] = [];
    const p = bridge.downloadModel(
      { repo_id: "org/m" },
      (u) => updates.push(u),
      "dl-1"
    );
    bridge.handle({
      type: "progress",
      request_id: "dl-1",
      data: { status: "start", repo_id: "org/m" }
    });
    bridge.handle({
      type: "progress",
      request_id: "dl-1",
      data: { status: "progress", downloaded_bytes: 50 }
    });
    bridge.handle({ type: "result", request_id: "dl-1", data: {} });
    await expect(p).resolves.toBeUndefined();
    expect(updates).toHaveLength(2);
    expect(bridge.pendingSize()).toBe(0);
    expect(bridge.pendingStreamSize()).toBe(0);
  });

  it("downloadModel rejects on a terminal error frame", async () => {
    const p = bridge.downloadModel({ repo_id: "org/m" }, () => {}, "dl-err");
    bridge.handle({
      type: "error",
      request_id: "dl-err",
      data: { error: "disk full" }
    });
    await expect(p).rejects.toThrow("disk full");
    expect(bridge.pendingSize()).toBe(0);
    expect(bridge.pendingStreamSize()).toBe(0);
  });

  it("downloadModel rejects with a stall error on idle timeout", async () => {
    bridge = makeBridge({ downloadIdleTimeoutMs: 40 });
    await connectBridge(bridge);
    bridge.stderrSummary = "OOM";
    await expect(
      bridge.downloadModel({ repo_id: "org/m" }, () => {}, "dl-idle")
    ).rejects.toThrow(/stalled.*Recent stderr: OOM/);
    expect(bridge.pendingSize()).toBe(0);
    expect(bridge.pendingStreamSize()).toBe(0);
  });

  it("downloadModel rejects and cleans up if send throws", async () => {
    bridge.sendError = new Error("gone");
    await expect(
      bridge.downloadModel({ repo_id: "org/m" }, () => {}, "dl-send")
    ).rejects.toThrow("gone");
    expect(bridge.pendingSize()).toBe(0);
    expect(bridge.pendingStreamSize()).toBe(0);
  });

  it("cancelModelDownload sends a cancel frame and rejects the pending download", async () => {
    const p = bridge.downloadModel({ repo_id: "org/m" }, () => {}, "dl-cancel");
    bridge.cancelModelDownload("dl-cancel");
    await expect(p).rejects.toThrow(/cancelled/i);
    expect(bridge.sent.some((f) => f.type === "cancel")).toBe(true);
    expect(bridge.pendingStreamSize()).toBe(0);
  });

  it("cancelModelDownload is a no-op for an unknown request id", () => {
    expect(() => bridge.cancelModelDownload("nope")).not.toThrow();
  });

  it("comfyExecute streams comfy.event frames then resolves on result", async () => {
    const events: ComfyEvent[] = [];
    const p = bridge.comfyExecute(
      { "1": { class_type: "X" } },
      { previews: true, timeout: 30 },
      (e) => events.push(e),
      "ce-1"
    );
    const frame = bridge.sent.find((f) => f.type === "comfy.execute")!;
    expect(frame.data).toEqual({
      prompt: { "1": { class_type: "X" } },
      previews: true,
      timeout: 30
    });
    bridge.handle({
      type: "comfy.event",
      request_id: "ce-1",
      data: { event: "queued" }
    });
    bridge.handle({
      type: "comfy.event",
      request_id: "ce-1",
      data: { event: "executing", node: "1" }
    });
    bridge.handle({
      type: "result",
      request_id: "ce-1",
      data: { outputs: {} }
    });
    await expect(p).resolves.toEqual({ outputs: {} });
    expect(events.map((e) => e.event)).toEqual(["queued", "executing"]);
    expect(bridge.comfyEventsSize()).toBe(0);
    expect(bridge.pendingStreamSize()).toBe(0);
  });

  it("comfyExecute forwards blobs and rejects on an error frame", async () => {
    const blobs = { in: new Uint8Array([1]) };
    const p = bridge.comfyExecute({ p: 1 }, { blobs }, undefined, "ce-2");
    const frame = bridge.sent.find((f) => f.type === "comfy.execute")!;
    expect((frame.data as Record<string, unknown>).blobs).toBe(blobs);
    bridge.handle({
      type: "error",
      request_id: "ce-2",
      data: { error: "comfy died" }
    });
    await expect(p).rejects.toThrow("comfy died");
  });

  it("comfyExecute rejects and cleans up if send throws", async () => {
    bridge.sendError = new Error("no comfy");
    await expect(
      bridge.comfyExecute({ p: 1 }, {}, undefined, "ce-3")
    ).rejects.toThrow("no comfy");
    expect(bridge.pendingStreamSize()).toBe(0);
    expect(bridge.comfyEventsSize()).toBe(0);
  });

  it("cancelComfyExecute cancels and rejects the in-flight run", async () => {
    const p = bridge.comfyExecute({ p: 1 }, {}, undefined, "ce-4");
    bridge.cancelComfyExecute("ce-4");
    await expect(p).rejects.toThrow(/cancelled/i);
    expect(bridge.sent.some((f) => f.type === "cancel")).toBe(true);
  });

  it("comfyQueue / comfyInterrupt / comfyCancelPrompt issue the right frames", async () => {
    const pQueue = bridge.comfyQueue();
    reply("comfy.queue", { running: [] });
    await expect(pQueue).resolves.toEqual({ running: [] });

    const pInt = bridge.comfyInterrupt();
    reply("comfy.interrupt", {});
    await expect(pInt).resolves.toBeUndefined();

    const pCancel = bridge.comfyCancelPrompt("pid-1");
    const frame = bridge.sent.find((f) => f.type === "comfy.cancel")!;
    expect(frame.data).toEqual({ prompt_id: "pid-1" });
    reply("comfy.cancel", {});
    await pCancel;
  });

  it("comfyUpload sends filename + blob and merges options", async () => {
    const bytes = new Uint8Array([7]);
    const p = bridge.comfyUpload("f.png", bytes, { subfolder: "in" });
    const frame = bridge.sent.find((f) => f.type === "comfy.upload")!;
    expect(frame.data).toEqual({
      filename: "f.png",
      blob: bytes,
      subfolder: "in"
    });
    reply("comfy.upload", { name: "f.png" });
    await expect(p).resolves.toEqual({ name: "f.png" });
  });

  it("comfyModelsList returns [] when the worker omits models", async () => {
    const p = bridge.comfyModelsList("checkpoints");
    const frame = bridge.sent.find((f) => f.type === "comfy.models.list")!;
    expect(frame.data).toEqual({ folder: "checkpoints" });
    reply("comfy.models.list", {});
    await expect(p).resolves.toEqual([]);
  });

  it("comfyModelsList sends empty data when no folder is given", async () => {
    const p = bridge.comfyModelsList();
    const frame = bridge.sent.find((f) => f.type === "comfy.models.list")!;
    expect(frame.data).toEqual({});
    reply("comfy.models.list", { models: [{ name: "a" }] });
    await expect(p).resolves.toEqual([{ name: "a" }]);
  });

  it("comfyModelsDelete coerces the deleted flag", async () => {
    const p = bridge.comfyModelsDelete("checkpoints", "a.safetensors");
    const frame = bridge.sent.find((f) => f.type === "comfy.models.delete")!;
    expect(frame.data).toEqual({
      folder: "checkpoints",
      filename: "a.safetensors"
    });
    reply("comfy.models.delete", { deleted: true });
    await expect(p).resolves.toBe(true);
  });

  it("comfyStatus casts the provider result to ComfyStatusInfo", async () => {
    const p = bridge.comfyStatus();
    reply("comfy.status", { enabled: true, reachable: true });
    await expect(p).resolves.toEqual({ enabled: true, reachable: true });
  });

  it("comfyModelsDownload streams via the shared download engine", async () => {
    const updates: unknown[] = [];
    const p = bridge.comfyModelsDownload(
      { folder: "checkpoints", url: "http://x", filename: "a" } as never,
      (u) => updates.push(u),
      "cd-1"
    );
    bridge.handle({
      type: "progress",
      request_id: "cd-1",
      data: { status: "progress" }
    });
    bridge.handle({ type: "result", request_id: "cd-1", data: {} });
    await expect(p).resolves.toBeUndefined();
    expect(updates).toHaveLength(1);
  });
});

describe("PythonBridgeBase — pending cleanup", () => {
  it("_rejectAllPending rejects and clears every pending map", async () => {
    const bridge = makeBridge();
    await connectBridge(bridge);

    const exec = bridge.execute("n.T", {}, {}, {}).catch((e) => e);
    const status = bridge.getWorkerStatus().catch((e) => e);
    bridge.comfyExecute({ p: 1 }, {}, () => {}, "ce").catch(() => {});

    expect(bridge.pendingSize()).toBeGreaterThan(0);
    expect(bridge.pendingStreamSize()).toBeGreaterThan(0);

    (
      bridge as unknown as { _rejectAllPending: (e: Error) => void }
    )._rejectAllPending(new Error("teardown"));

    expect(await exec).toBeInstanceOf(Error);
    expect(await status).toBeInstanceOf(Error);
    expect(bridge.pendingSize()).toBe(0);
    expect(bridge.pendingStreamSize()).toBe(0);
    expect(bridge.comfyEventsSize()).toBe(0);
  });

  it("close() rejects pending work", async () => {
    const bridge = makeBridge();
    await connectBridge(bridge);
    const exec = bridge.execute("n.T", {}, {}, {}).catch((e) => e);
    bridge.close();
    expect(await exec).toBeInstanceOf(Error);
    expect(bridge.isConnected).toBe(false);
  });
});
