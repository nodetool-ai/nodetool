/**
 * Bridge-level tests for the realtime session protocol (PLAN-REALTIME.md
 * item 6c-ts). The PythonStdioBridge spawn/connect path is intentionally
 * bypassed: we exercise the four verb methods and the
 * `realtime_output_frame` dispatch by intercepting `_send` and feeding
 * synthetic messages back through `_handleMessage`.
 */

import { describe, it, expect } from "vitest";

import { PythonStdioBridge } from "../src/python-stdio-bridge.js";
import type {
  RealtimeOutputFrameEvent,
  RealtimePushInputFrameResult,
  RealtimeStartSessionRequest,
  RealtimeStartSessionResult,
  RealtimeStopSessionResult,
  RealtimeUpdateParameterResult
} from "../src/python-bridge-types.js";

interface SentEnvelope {
  type: string;
  request_id: string;
  data: Record<string, unknown>;
}

/**
 * Internal bridge surface we need to drive in tests. The bridge keeps the
 * spawn flow private but `_send` and `_handleMessage` are the only two
 * touch-points for a transport-less harness.
 */
type BridgeInternals = {
  _send: (msg: Record<string, unknown>) => void;
  _handleMessage: (msg: Record<string, unknown>) => void;
};

/**
 * Build a bridge whose stdin/stdout has been short-circuited. Sent messages
 * land in `sent`; tests pre-arm responses so the verb's promise resolves on
 * the next microtask.
 */
function createHarnessBridge(): {
  bridge: PythonStdioBridge;
  sent: SentEnvelope[];
  reply: (data: Record<string, unknown>) => void;
  push: (msg: Record<string, unknown>) => void;
} {
  const bridge = new PythonStdioBridge();
  const sent: SentEnvelope[] = [];

  const internals = bridge as unknown as BridgeInternals;
  internals._send = (msg: Record<string, unknown>) => {
    sent.push(msg as unknown as SentEnvelope);
  };

  // Reply to the most recently sent message. This matches how the verbs
  // produce a single envelope per call, so the most recent send is the one
  // awaiting a result.
  const reply = (data: Record<string, unknown>) => {
    const last = sent[sent.length - 1];
    if (!last) {
      throw new Error("reply() called before any verb was sent");
    }
    internals._handleMessage({
      type: "result",
      request_id: last.request_id,
      data
    });
  };

  const push = (msg: Record<string, unknown>) => {
    internals._handleMessage(msg);
  };

  return { bridge, sent, reply, push };
}

describe("PythonStdioBridge realtime verbs", () => {
  it("startRealtimeSession sends start_session and resolves with the result", async () => {
    const { bridge, sent, reply } = createHarnessBridge();

    const request: RealtimeStartSessionRequest = {
      session_id: "sess-1",
      session: {
        session_id: "sess-1",
        workflow_id: "wf-1",
        transport: "websocket",
        parameters: { fps: 30 },
        media_tracks: []
      },
      node_type: "nodetool.realtime.Identity",
      fields: { mode: "passthrough" },
      secrets: { OPENAI_API_KEY: "redacted" }
    };

    const promise = bridge.startRealtimeSession(request);

    expect(sent).toHaveLength(1);
    expect(sent[0]!.type).toBe("start_session");
    expect(sent[0]!.request_id).toBeTypeOf("string");
    expect(sent[0]!.data).toEqual({
      session_id: request.session_id,
      session: request.session,
      node_type: request.node_type,
      fields: request.fields,
      secrets: request.secrets
    });

    // Worker emits status="running" once pre_process + on_session_start
    // have completed; pinned by the Python contract test
    // test_wire_contract_start_session_response_status_is_running.
    reply({ session_id: "sess-1", status: "running" });
    const result: RealtimeStartSessionResult = await promise;
    expect(result).toEqual({ session_id: "sess-1", status: "running" });
  });

  it("startRealtimeSession includes input_buffer_size only when provided", async () => {
    const { bridge, sent, reply } = createHarnessBridge();

    const promise = bridge.startRealtimeSession({
      session_id: "sess-2",
      session: {
        session_id: "sess-2",
        workflow_id: null,
        transport: "webrtc",
        parameters: {},
        media_tracks: []
      },
      node_type: "nodetool.realtime.Identity",
      input_buffer_size: 8
    });

    expect(sent[0]!.data).toMatchObject({ input_buffer_size: 8 });
    reply({ session_id: "sess-2", status: "running" });
    await promise;
  });

  it("updateRealtimeParameter sends update_parameter with the routing payload", async () => {
    const { bridge, sent, reply } = createHarnessBridge();

    const promise = bridge.updateRealtimeParameter({
      session_id: "sess-1",
      name: "prompt",
      value: "hello world"
    });

    expect(sent[0]!.type).toBe("update_parameter");
    expect(sent[0]!.data).toEqual({
      session_id: "sess-1",
      name: "prompt",
      value: "hello world"
    });

    reply({ session_id: "sess-1", ok: true, routed: true });
    const result: RealtimeUpdateParameterResult = await promise;
    expect(result).toEqual({ session_id: "sess-1", ok: true, routed: true });
  });

  it("pushRealtimeInputFrame forwards handle, payload, and metadata", async () => {
    const { bridge, sent, reply } = createHarnessBridge();

    const payload = { tensor: new Uint8Array([1, 2, 3]) };
    const promise = bridge.pushRealtimeInputFrame({
      session_id: "sess-1",
      handle: "video",
      payload,
      metadata: { ts: 12345 }
    });

    expect(sent[0]!.type).toBe("push_input_frame");
    expect(sent[0]!.data).toEqual({
      session_id: "sess-1",
      handle: "video",
      payload,
      metadata: { ts: 12345 }
    });

    reply({ session_id: "sess-1", ok: true, dropped_count: 0 });
    const result: RealtimePushInputFrameResult = await promise;
    expect(result.dropped_count).toBe(0);
  });

  it("stopRealtimeSession resolves with the worker's result", async () => {
    const { bridge, sent, reply } = createHarnessBridge();

    const promise = bridge.stopRealtimeSession({
      session_id: "sess-1",
      timeout: 2.5
    });

    expect(sent[0]!.type).toBe("stop_session");
    expect(sent[0]!.data).toEqual({ session_id: "sess-1", timeout: 2.5 });

    reply({ session_id: "sess-1", ok: true, error: null });
    const result: RealtimeStopSessionResult = await promise;
    expect(result).toEqual({ session_id: "sess-1", ok: true, error: null });
  });

  it("realtime verbs propagate worker errors", async () => {
    const { bridge, sent, push } = createHarnessBridge();

    const promise = bridge.startRealtimeSession({
      session_id: "sess-bad",
      session: {
        session_id: "sess-bad",
        workflow_id: null,
        transport: "websocket",
        parameters: {},
        media_tracks: []
      },
      node_type: "nodetool.realtime.Missing"
    });

    push({
      type: "error",
      request_id: sent[0]!.request_id,
      data: { error: "Unknown node type", traceback: "..." }
    });

    await expect(promise).rejects.toThrow(/Unknown node type/);
  });

  it("emits realtimeOutputFrame for server-pushed frames", () => {
    const { bridge, push } = createHarnessBridge();

    const events: RealtimeOutputFrameEvent[] = [];
    bridge.on("realtimeOutputFrame", (event: RealtimeOutputFrameEvent) => {
      events.push(event);
    });

    // Wire format: server-pushed events follow the same {type, data: {...}}
    // envelope as result/error/chunk/progress; the body uses `payload` (not
    // `data`) for the frame value, matching push_input_frame request shape.
    // Pinned by the Python contract test
    // test_wire_contract_push_and_emit_uses_payload_key.
    push({
      type: "realtime_output_frame",
      data: {
        session_id: "sess-1",
        handle: "out",
        payload: { value: 42 }
      }
    });

    expect(events).toEqual([
      {
        session_id: "sess-1",
        handle: "out",
        payload: { value: 42 }
      }
    ]);
  });
});
