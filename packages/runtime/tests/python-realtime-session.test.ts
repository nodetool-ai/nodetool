/**
 * Wrapper-level tests for PythonRealtimeSession (PLAN-REALTIME.md item
 * 6c-ts). The bridge is a typed mock that records calls and lets the test
 * inject server-pushed frames via the EventEmitter contract.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

import { PythonRealtimeSession } from "../src/python-realtime-session.js";
import type { PythonStdioBridge } from "../src/python-stdio-bridge.js";
import type {
  RealtimeOutputFrameEvent,
  RealtimePushInputFrameRequest,
  RealtimePushInputFrameResult,
  RealtimeSessionInfoPayload,
  RealtimeStartSessionRequest,
  RealtimeStartSessionResult,
  RealtimeStopSessionRequest,
  RealtimeStopSessionResult,
  RealtimeUpdateParameterRequest,
  RealtimeUpdateParameterResult
} from "../src/python-bridge-types.js";

interface MockBridge {
  bridge: PythonStdioBridge;
  emitter: EventEmitter;
  startRealtimeSession: ReturnType<typeof vi.fn>;
  pushRealtimeInputFrame: ReturnType<typeof vi.fn>;
  updateRealtimeParameter: ReturnType<typeof vi.fn>;
  stopRealtimeSession: ReturnType<typeof vi.fn>;
}

function makeMockBridge(): MockBridge {
  const emitter = new EventEmitter();
  const start = vi
    .fn<(req: RealtimeStartSessionRequest) => Promise<RealtimeStartSessionResult>>()
    .mockImplementation(async (req) => ({
      session_id: req.session.session_id,
      status: "running"
    }));
  const push = vi
    .fn<(req: RealtimePushInputFrameRequest) => Promise<RealtimePushInputFrameResult>>()
    .mockImplementation(async (req) => ({
      session_id: req.session_id,
      ok: true,
      dropped_count: 0
    }));
  const update = vi
    .fn<(req: RealtimeUpdateParameterRequest) => Promise<RealtimeUpdateParameterResult>>()
    .mockImplementation(async (req) => ({
      session_id: req.session_id,
      ok: true,
      routed: true
    }));
  const stop = vi
    .fn<(req: RealtimeStopSessionRequest) => Promise<RealtimeStopSessionResult>>()
    .mockImplementation(async (req) => ({
      session_id: req.session_id,
      ok: true,
      error: null
    }));

  // The wrapper relies on bridge.on / bridge.off / bridge.emit. Stand up a
  // real EventEmitter and forward those methods through.
  const bridge = {
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
    emit: emitter.emit.bind(emitter),
    startRealtimeSession: start,
    pushRealtimeInputFrame: push,
    updateRealtimeParameter: update,
    stopRealtimeSession: stop
  } as unknown as PythonStdioBridge;

  return {
    bridge,
    emitter,
    startRealtimeSession: start,
    pushRealtimeInputFrame: push,
    updateRealtimeParameter: update,
    stopRealtimeSession: stop
  };
}

const baseSession: RealtimeSessionInfoPayload = {
  session_id: "sess-1",
  workflow_id: "wf-1",
  transport: "websocket",
  parameters: {},
  media_tracks: []
};

describe("PythonRealtimeSession", () => {
  let mock: MockBridge;

  beforeEach(() => {
    mock = makeMockBridge();
  });

  it("forwards start() to the bridge and transitions to running", async () => {
    const session = new PythonRealtimeSession(mock.bridge, {
      session: baseSession,
      nodeType: "nodetool.realtime.Identity",
      fields: { mode: "passthrough" },
      secrets: { TOKEN: "x" },
      inputBufferSize: 8
    });

    expect(session.state).toBe("idle");

    const result = await session.start();
    expect(result).toEqual({ session_id: "sess-1", status: "running" });
    expect(session.state).toBe("running");

    // The wrapper extracts session_id from session.session_id and sends
    // both fields so the wire envelope matches what StdioWorkerServer
    // expects (top-level session_id is the routing key).
    expect(mock.startRealtimeSession).toHaveBeenCalledWith({
      session_id: "sess-1",
      session: baseSession,
      node_type: "nodetool.realtime.Identity",
      fields: { mode: "passthrough" },
      secrets: { TOKEN: "x" },
      input_buffer_size: 8
    });
  });

  it("rejects start() if called twice", async () => {
    const session = new PythonRealtimeSession(mock.bridge, {
      session: baseSession,
      nodeType: "nodetool.realtime.Identity"
    });
    await session.start();
    await expect(session.start()).rejects.toThrow(/invalid state running/);
  });

  it("releases the bridge listener if start() rejects", async () => {
    mock.startRealtimeSession.mockRejectedValueOnce(new Error("boom"));
    const session = new PythonRealtimeSession(mock.bridge, {
      session: baseSession,
      nodeType: "nodetool.realtime.Identity"
    });

    await expect(session.start()).rejects.toThrow("boom");
    expect(session.state).toBe("stopped");
    expect(mock.emitter.listenerCount("realtimeOutputFrame")).toBe(0);
  });

  it("delivers output frames matching this session_id", async () => {
    const session = new PythonRealtimeSession(mock.bridge, {
      session: baseSession,
      nodeType: "nodetool.realtime.Identity"
    });
    await session.start();

    const received: RealtimeOutputFrameEvent[] = [];
    session.on("frame", (event) => received.push(event));

    mock.emitter.emit("realtimeOutputFrame", {
      session_id: "sess-1",
      handle: "out",
      payload: { v: 1 }
    });
    mock.emitter.emit("realtimeOutputFrame", {
      session_id: "sess-other",
      handle: "out",
      payload: { v: 99 }
    });
    mock.emitter.emit("realtimeOutputFrame", {
      session_id: "sess-1",
      handle: "out",
      payload: { v: 2 }
    });

    expect(received).toEqual([
      { session_id: "sess-1", handle: "out", payload: { v: 1 } },
      { session_id: "sess-1", handle: "out", payload: { v: 2 } }
    ]);
  });

  it("survives a 100-frame end-to-end push/pull", async () => {
    const session = new PythonRealtimeSession(mock.bridge, {
      session: baseSession,
      nodeType: "nodetool.realtime.Identity"
    });
    await session.start();

    // Wire the mock so every push triggers a corresponding output frame
    // (mirrors RealtimeNodeInstance + IdentityFrameNode in the Python tests).
    mock.pushRealtimeInputFrame.mockImplementation(async (req) => {
      mock.emitter.emit("realtimeOutputFrame", {
        session_id: req.session_id,
        handle: "out",
        payload: req.payload
      });
      return { session_id: req.session_id, ok: true, dropped_count: 0 };
    });

    const received: unknown[] = [];
    session.on("frame", (event) => received.push(event.payload));

    for (let i = 0; i < 100; i++) {
      await session.pushFrame("input", { i });
    }

    expect(received).toHaveLength(100);
    expect(received[0]).toEqual({ i: 0 });
    expect(received[99]).toEqual({ i: 99 });
  });

  it("updateParameter forwards to the bridge", async () => {
    const session = new PythonRealtimeSession(mock.bridge, {
      session: baseSession,
      nodeType: "nodetool.realtime.Identity"
    });
    await session.start();

    const result = await session.updateParameter("prompt", "hi");
    expect(result.routed).toBe(true);
    expect(mock.updateRealtimeParameter).toHaveBeenCalledWith({
      session_id: "sess-1",
      name: "prompt",
      value: "hi"
    });
  });

  it("stop() detaches the listener and is idempotent", async () => {
    const session = new PythonRealtimeSession(mock.bridge, {
      session: baseSession,
      nodeType: "nodetool.realtime.Identity"
    });
    await session.start();
    expect(mock.emitter.listenerCount("realtimeOutputFrame")).toBe(1);

    const first = await session.stop();
    expect(first.ok).toBe(true);
    expect(session.state).toBe("stopped");
    expect(mock.emitter.listenerCount("realtimeOutputFrame")).toBe(0);

    const second = await session.stop();
    expect(second).toEqual({
      session_id: "sess-1",
      ok: true,
      error: null
    });
    // Worker is only contacted once.
    expect(mock.stopRealtimeSession).toHaveBeenCalledTimes(1);
  });

  it("dispose() detaches without contacting the worker", () => {
    const session = new PythonRealtimeSession(mock.bridge, {
      session: baseSession,
      nodeType: "nodetool.realtime.Identity"
    });
    expect(mock.emitter.listenerCount("realtimeOutputFrame")).toBe(1);

    session.dispose();
    expect(session.state).toBe("stopped");
    expect(mock.emitter.listenerCount("realtimeOutputFrame")).toBe(0);
    expect(mock.stopRealtimeSession).not.toHaveBeenCalled();
  });

  it("pushFrame and updateParameter reject when not running", async () => {
    const session = new PythonRealtimeSession(mock.bridge, {
      session: baseSession,
      nodeType: "nodetool.realtime.Identity"
    });

    await expect(session.pushFrame("input", { v: 1 })).rejects.toThrow(/not running/);
    await expect(session.updateParameter("x", 1)).rejects.toThrow(/not running/);
  });
});
