import { describe, it, expect, vi, beforeEach } from "vitest";
import { unpack } from "msgpackr";
import { MediaStreamTrack, RTCPeerConnection } from "werift";
import {
  UnifiedWebSocketRunner,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/unified-websocket-runner.js";
import type { NodeExecutor } from "@nodetool/kernel";
import type { RealtimeSessionInfo } from "@nodetool/protocol";
import type { ProcessingContext } from "@nodetool/runtime";
import { realtimeSessionManager } from "../src/realtime/session-manager.js";

class MockWebSocket implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";
  sentBytes: Uint8Array[] = [];
  sentText: string[] = [];
  queue: Array<WebSocketReceiveFrame> = [];

  async accept(): Promise<void> {
    return;
  }

  async receive(): Promise<WebSocketReceiveFrame> {
    const next = this.queue.shift();
    if (!next) {
      return { type: "websocket.disconnect" };
    }
    return next;
  }

  async sendBytes(data: Uint8Array): Promise<void> {
    this.sentBytes.push(data);
  }

  async sendText(data: string): Promise<void> {
    this.sentText.push(data);
  }

  async close(): Promise<void> {
    this.clientState = "disconnected";
    this.applicationState = "disconnected";
  }
}

const makeRuntimeOfferSignal = async () => {
  const peer = new RTCPeerConnection();
  peer.createDataChannel("runtime-smoke");
  peer.addTrack(new MediaStreamTrack({ kind: "video" }));
  await peer.setLocalDescription(await peer.createOffer());

  return {
    peer,
    signal: {
      signal_type: "offer",
      source: "operator",
      target: "runtime",
      description: {
        type: "offer",
        sdp: peer.localDescription!.sdp
      }
    }
  };
};

const resolveExecutor = () => ({
  async process() {
    return {};
  }
});

describe("UnifiedWebSocketRunner", () => {
  let ws: MockWebSocket;
  let runner: UnifiedWebSocketRunner;

  beforeEach(() => {
    ws = new MockWebSocket();
    runner = new UnifiedWebSocketRunner({ resolveExecutor });
    realtimeSessionManager.reset();
  });

  it("connects and defaults user id", async () => {
    await runner.connect(ws);
    expect(runner.userId).toBe("1");
    expect(runner.websocket).toBe(ws);
    await runner.disconnect();
  });

  it("sends binary messages by default", async () => {
    await runner.connect(ws);
    await runner.sendMessage({ type: "test", value: "hello" });
    expect(ws.sentBytes).toHaveLength(1);
    const decoded = unpack(ws.sentBytes[0]) as Record<string, unknown>;
    expect(decoded.type).toBe("test");
    await runner.disconnect();
  });

  it("switches to text mode", async () => {
    const res = await runner.handleCommand({
      command: "set_mode",
      data: { mode: "text" }
    });
    expect(res.message).toBe("Mode set to text");
    expect(runner.mode).toBe("text");
  });

  it("validates chat_message thread id", async () => {
    const res = await runner.handleCommand({
      command: "chat_message",
      data: { content: "hello" }
    });
    expect(res.error).toContain("thread_id is required");
  });

  it("stop with empty data cancels in-progress generation", async () => {
    const res = await runner.handleCommand({ command: "stop", data: {} });
    expect(res.message).toBe("Stop command processed");
    expect(res.job_id).toBeNull();
    expect(res.thread_id).toBeNull();
  });

  it("replies pong for ping in receive loop", async () => {
    await runner.connect(ws);
    ws.queue.push({
      type: "websocket.message",
      text: JSON.stringify({ type: "ping" })
    });
    ws.queue.push({ type: "websocket.disconnect" });

    await runner.receiveMessages();

    expect(ws.sentBytes.length + ws.sentText.length).toBeGreaterThan(0);
    const first =
      ws.sentBytes.length > 0
        ? (unpack(ws.sentBytes[0]) as Record<string, unknown>)
        : (JSON.parse(ws.sentText[0]) as Record<string, unknown>);
    expect(first.type).toBe("pong");
    await runner.disconnect();
  });

  it("processes get_status command envelope", async () => {
    await runner.connect(ws);
    ws.queue.push({
      type: "websocket.message",
      text: JSON.stringify({ command: "get_status", data: {} })
    });
    ws.queue.push({ type: "websocket.disconnect" });

    await runner.receiveMessages();

    const out =
      ws.sentBytes.length > 0
        ? (unpack(ws.sentBytes[0]) as Record<string, unknown>)
        : (JSON.parse(ws.sentText[0]) as Record<string, unknown>);
    expect(Array.isArray(out.active_jobs)).toBe(true);
    await runner.disconnect();
  });

  it("stores client tools manifest", async () => {
    await runner.connect(ws);
    ws.queue.push({
      type: "websocket.message",
      text: JSON.stringify({
        type: "client_tools_manifest",
        tools: [{ name: "tool_1", description: "x" }]
      })
    });
    ws.queue.push({ type: "websocket.disconnect" });

    const sendSpy = vi.spyOn(runner, "sendMessage");
    await runner.receiveMessages();

    // manifest itself doesn't require response
    expect(sendSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ error: "invalid_message" })
    );
    await runner.disconnect();
  });

  it("handles stream_input and end_input_stream commands", async () => {
    await runner.connect(ws);

    const graph = {
      nodes: [
        { id: "stream_input", type: "test.Input", name: "stream_input" },
        { id: "sink", type: "test.Sink", name: "sink" }
      ],
      edges: [
        {
          source: "stream_input",
          sourceHandle: "value",
          target: "sink",
          targetHandle: "value"
        }
      ]
    };

    await runner.handleCommand({
      command: "run_job",
      data: { graph, params: {} }
    });
    const status = runner.getStatus() as {
      active_jobs: Array<{ job_id: string }>;
    };
    expect(status.active_jobs.length).toBeGreaterThan(0);
    const jobId = status.active_jobs[0].job_id;

    const streamed = await runner.handleCommand({
      command: "stream_input",
      data: { job_id: jobId, input: "stream_input", value: 7 }
    });
    expect(streamed.message).toBe("Input item streamed");

    const ended = await runner.handleCommand({
      command: "end_input_stream",
      data: { job_id: jobId, input: "stream_input" }
    });
    expect(ended.message).toBe("Input stream ended");

    // Give the runner time to drain queue and complete.
    await new Promise((r) => setTimeout(r, 20));
    await runner.disconnect();
  });

  it("starts a realtime session with a linked job and graph payload", async () => {
    await runner.connect(ws);

    const response = await runner.handleCommand({
      command: "start_realtime_session",
      data: {
        workflow_id: "workflow-1",
        transport: "webrtc",
        media_tracks: [
          {
            track_id: "video-track-1",
            kind: "video",
            node_id: "camera",
            input_name: "video"
          },
          {
            track_id: "audio-track-1",
            kind: "audio",
            node_id: "microphone",
            input_name: "audio",
            label: "Desk Mic",
            enabled: false
          }
        ],
        graph: {
          nodes: [
            { id: "brightness", type: "test.Input", name: "brightness" },
            { id: "sink", type: "test.Sink", name: "sink" }
          ],
          edges: [
            {
              source: "brightness",
              sourceHandle: "value",
              target: "sink",
              targetHandle: "value",
              edge_type: "data"
            }
          ]
        },
        parameters: { brightness: 120 }
      }
    });

    expect(response.error).toBeUndefined();
    expect(response).toMatchObject({ ok: true });
    expect(typeof response.job_id).toBe("string");
    expect(response.status).toBe("starting");

    const sessions = realtimeSessionManager.listSessions("1");
    expect(sessions).toHaveLength(1);
    expect(sessions[0].job_id).toBe(response.job_id);
    expect(sessions[0].status).toBe("starting");
    expect(sessions[0].transport).toBe("webrtc");
    expect(sessions[0].media_tracks).toEqual([
      {
        track_id: "video-track-1",
        kind: "video",
        node_id: "camera",
        input_name: "video",
        label: null,
        enabled: true
      },
      {
        track_id: "audio-track-1",
        kind: "audio",
        node_id: "microphone",
        input_name: "audio",
        label: "Desk Mic",
        enabled: false
      }
    ]);

    const sent = ws.sentBytes.map((b) => unpack(b) as Record<string, unknown>);
    expect(sent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "realtime_session_started",
          workflow_id: "workflow-1",
          job_id: response.job_id,
          status: "starting"
        }),
        expect.objectContaining({
          type: "realtime_session_started",
          workflow_id: "workflow-1",
          job_id: response.job_id,
          status: "starting"
        })
      ])
    );

    await runner.disconnect();
  });

  it("starts production realtime sessions through RealtimeRunner with real session metadata", async () => {
    const seenSessions: RealtimeSessionInfo[] = [];
    const warmExecutor: NodeExecutor = {
      async process() {
        return {};
      },
      async onSessionStart(
        _context: ProcessingContext,
        session: RealtimeSessionInfo
      ) {
        seenSessions.push(session);
      }
    };
    runner = new UnifiedWebSocketRunner({
      resolveExecutor: (node) =>
        node.id === "warm" ? warmExecutor : resolveExecutor()
    });
    await runner.connect(ws);

    const response = await runner.handleCommand({
      command: "start_realtime_session",
      data: {
        session_id: "session-webrtc",
        workflow_id: "workflow-webrtc",
        transport: "webrtc",
        parameters: { strength: 0.75 },
        media_tracks: [
          {
            track_id: "video-track-1",
            kind: "video",
            node_id: "camera",
            input_name: "video"
          }
        ],
        graph: {
          nodes: [
            {
              id: "warm",
              type: "test.Warm",
              owns_warm_state: true
            }
          ],
          edges: []
        }
      }
    });

    expect(response).toMatchObject({ ok: true });
    expect(seenSessions).toHaveLength(1);
    expect(seenSessions[0]).toMatchObject({
      session_id: "session-webrtc",
      workflow_id: "workflow-webrtc",
      job_id: response.job_id,
      transport: "webrtc",
      parameters: { strength: 0.75 },
      media_tracks: [
        {
          track_id: "video-track-1",
          kind: "video",
          node_id: "camera",
          input_name: "video",
          label: null,
          enabled: true
        }
      ]
    });

    const activeJobs = (
      runner as unknown as {
        activeJobs: Map<
          string,
          {
            realtimeRunner?: unknown;
            runner: { _options: { runMode?: "one_shot" | "realtime" } };
          }
        >;
      }
    ).activeJobs;
    const active = activeJobs.get(String(response.job_id));
    expect(active?.realtimeRunner).toBeDefined();
    expect(active?.runner._options.runMode).toBe("realtime");

    await runner.disconnect();
  });

  it("routes realtime parameter updates into the active workflow when possible", async () => {
    await runner.connect(ws);

    const start = await runner.handleCommand({
      command: "start_realtime_session",
      data: {
        workflow_id: "workflow-2",
        graph: {
          nodes: [
            { id: "brightness", type: "test.Input", name: "brightness" },
            { id: "sink", type: "test.Sink", name: "sink" }
          ],
          edges: [
            {
              source: "brightness",
              sourceHandle: "value",
              target: "sink",
              targetHandle: "value",
              edge_type: "data"
            }
          ]
        }
      }
    });

    const sessions = realtimeSessionManager.listSessions("1");
    const sessionId = sessions[0]?.session_id;
    expect(sessionId).toBeTruthy();
    if (!sessionId) {
      throw new Error("Expected realtime session id to be set");
    }

    const update = await runner.handleCommand({
      command: "update_realtime_session",
      data: {
        session_id: sessionId,
        parameters: { brightness: 180, unused_control: 3 }
      }
    });

    expect(update.ok).toBe(true);
    expect(update.job_id).toBe(start.job_id);
    expect(update.routed_parameters).toEqual(["brightness"]);
    expect(update.unrouted_parameters).toEqual(["unused_control"]);

    const updatedSession = realtimeSessionManager.getSession(sessionId, "1");
    expect(updatedSession?.parameters).toMatchObject({
      brightness: 180,
      unused_control: 3
    });

    await runner.disconnect();
  });

  it("relays realtime signaling messages and persists signaling status", async () => {
    await runner.connect(ws);

    await runner.handleCommand({
      command: "start_realtime_session",
      data: {
        workflow_id: "workflow-signal",
        transport: "websocket",
        media_tracks: [
          {
            track_id: "video-track-1",
            kind: "video",
            node_id: "camera",
            input_name: "video"
          }
        ],
        graph: {
          nodes: [
            { id: "brightness", type: "test.Input", name: "brightness" },
            { id: "sink", type: "test.Sink", name: "sink" }
          ],
          edges: [
            {
              source: "brightness",
              sourceHandle: "value",
              target: "sink",
              targetHandle: "value",
              edge_type: "data"
            }
          ]
        }
      }
    });

    const [session] = realtimeSessionManager.listSessions("1");
    const response = await runner.handleCommand({
      command: "signal_realtime_session",
      data: {
        session_id: session.session_id,
        signaling_status: "negotiating",
        signal: {
          signal_type: "offer",
          source: "operator",
          target: "runtime",
          description: {
            type: "offer",
            sdp: "test-sdp"
          }
        }
      }
    });

    expect(response.ok).toBe(true);
    expect(response.signaling_status).toBe("negotiating");

    const updatedSession = realtimeSessionManager.getSession(session.session_id, "1");
    expect(updatedSession?.signaling.status).toBe("negotiating");
    expect(updatedSession?.signaling.last_signal_type).toBe("offer");

    const sent = ws.sentBytes.map((b) => unpack(b) as Record<string, unknown>);
    expect(sent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "realtime_session_updated",
          session_id: session.session_id
        }),
        expect.objectContaining({
          type: "realtime_session_signal",
          session_id: session.session_id,
          signal_type: "offer",
          source: "operator",
          target: "runtime"
        })
      ])
    );

    await runner.disconnect();
  });

  it("closes backend WebRTC sessions on websocket disconnect", async () => {
    await runner.connect(ws);

    await runner.handleCommand({
      command: "start_realtime_session",
      data: {
        workflow_id: "workflow-backend-signal",
        transport: "webrtc",
        media_tracks: [
          {
            track_id: "video-track-1",
            kind: "video",
            node_id: "camera",
            input_name: "video"
          }
        ],
        graph: {
          nodes: [
            { id: "camera", type: "test.Input", name: "video" },
            { id: "sink", type: "test.Sink", name: "sink" }
          ],
          edges: [
            {
              source: "camera",
              sourceHandle: "value",
              target: "sink",
              targetHandle: "value",
              edge_type: "data"
            }
          ],
        }
      }
    });
    const [session] = realtimeSessionManager.listSessions("1");
    const { peer, signal } = await makeRuntimeOfferSignal();

    try {
      const response = await runner.handleCommand({
        command: "signal_realtime_session",
        data: {
          session_id: session.session_id,
          signaling_status: "negotiating",
          signal
        }
      });
      const server = (
        runner as unknown as {
          realtimeWebRTCServer: { getSessionState(sessionId: string): string };
        }
      ).realtimeWebRTCServer;

      expect(response.ok).toBe(true);
      expect(server.getSessionState(session.session_id)).toBe("running");
      expect(
        realtimeSessionManager.getSession(session.session_id, "1")?.status
      ).toBe("running");
      await runner.disconnect();
      expect(server.getSessionState(session.session_id)).toBe("closed");
    } finally {
      await peer.close();
    }
  });

  it("emits realtime_metrics messages for active realtime sessions", async () => {
    await runner.connect(ws);

    await runner.handleCommand({
      command: "start_realtime_session",
      data: {
        workflow_id: "workflow-metrics",
        transport: "webrtc",
        media_tracks: [
          {
            track_id: "video-track-1",
            kind: "video",
            node_id: "camera",
            input_name: "video"
          }
        ],
        graph: {
          nodes: [
            { id: "camera", type: "test.Input", name: "video" },
            { id: "sink", type: "test.Sink", name: "sink" }
          ],
          edges: [
            {
              source: "camera",
              sourceHandle: "value",
              target: "sink",
              targetHandle: "value",
              edge_type: "data"
            }
          ]
        }
      }
    });
    const [session] = realtimeSessionManager.listSessions("1");

    await (
      runner as unknown as {
        emitRealtimeMetrics(): Promise<void>;
      }
    ).emitRealtimeMetrics();

    const sent = ws.sentBytes.map((b) => unpack(b) as Record<string, unknown>);
    expect(sent).toEqual(
        expect.arrayContaining([
        expect.objectContaining({
          type: "realtime_metrics",
          session_id: session.session_id,
          workflow_id: "workflow-metrics",
          codec: expect.objectContaining({
            status: "unsupported"
          }),
          frames: expect.objectContaining({
            inbound: 0,
            outbound: 0
          }),
          queues: expect.objectContaining({
            total_depth: 0,
            total_dropped: 0
          }),
          media_plane: expect.objectContaining({
            inputs: {},
            outputs: {}
          }),
          frame_sender: expect.objectContaining({
            framesSent: 0,
            framesDroppedByPacer: 0
          }),
          websocket_lanes: expect.objectContaining({
            control_pending: 0,
            media_pending: 0
          })
        })
      ])
    );

    await runner.disconnect();
  });

  it("stops realtime sessions and emits a session-stopped event", async () => {
    await runner.connect(ws);

    await runner.handleCommand({
      command: "start_realtime_session",
      data: {
        workflow_id: "workflow-3",
        graph: {
          nodes: [
            { id: "brightness", type: "test.Input", name: "brightness" },
            { id: "sink", type: "test.Sink", name: "sink" }
          ],
          edges: [
            {
              source: "brightness",
              sourceHandle: "value",
              target: "sink",
              targetHandle: "value",
              edge_type: "data"
            }
          ]
        }
      }
    });

    const [session] = realtimeSessionManager.listSessions("1");
    const response = await runner.handleCommand({
      command: "stop_realtime_session",
      data: {
        session_id: session.session_id,
        reason: "user"
      }
    });

    expect(response.ok).toBe(true);
    expect(realtimeSessionManager.listSessions("1")).toHaveLength(1);
    expect(
      realtimeSessionManager.getSession(session.session_id, "1")?.status
    ).toBe("stopped");
    await new Promise((resolve) => setTimeout(resolve, 20));

    const sent = ws.sentBytes.map((b) => unpack(b) as Record<string, unknown>);
    const stoppedEvents = sent.filter(
      (message) => message.type === "realtime_session_stopped"
    );
    expect(stoppedEvents).toHaveLength(1);
    expect(sent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "realtime_session_stopped",
          session_id: session.session_id,
          status: "stopped",
          reason: "user"
        })
      ])
    );

    await runner.disconnect();
  });

  it("emits output_update for constant -> output graph", async () => {
    const outputRunner = new UnifiedWebSocketRunner({
      resolveExecutor: (node) => {
        if (node.type === "nodetool.constant.String") {
          return {
            async process(inputs: Record<string, unknown>) {
              return { output: inputs.value ?? "hello world" };
            }
          };
        }
        if (node.type === "nodetool.output.Output") {
          return {
            async process(inputs: Record<string, unknown>) {
              return { output: inputs.value ?? null };
            }
          };
        }
        return {
          async process() {
            return {};
          }
        };
      }
    });

    await outputRunner.connect(ws);
    const graph = {
      nodes: [
        {
          id: "n1",
          type: "nodetool.constant.String",
          name: "nodetool.constant.String",
          properties: { value: "hello world" }
        },
        {
          id: "n2",
          type: "nodetool.output.Output",
          name: "nodetool.output.Output",
          properties: {}
        }
      ],
      edges: [
        {
          id: "e1",
          source: "n1",
          target: "n2",
          sourceHandle: "output",
          targetHandle: "value",
          edge_type: "data"
        }
      ]
    };

    await outputRunner.handleCommand({
      command: "run_job",
      data: { graph, params: {} }
    });
    await new Promise((r) => setTimeout(r, 30));

    const sent = ws.sentBytes.map((b) => unpack(b) as Record<string, unknown>);
    const updates = sent.filter((m) => m.type === "output_update");
    expect(updates.length).toBe(1);
    expect(updates.some((m) => m.value === "hello world")).toBe(true);

    await outputRunner.disconnect();
  });

  it("streams node_update events for executed nodes", async () => {
    const outputRunner = new UnifiedWebSocketRunner({
      resolveExecutor: (node) => {
        if (node.type === "nodetool.text.Template") {
          return {
            async process(inputs: Record<string, unknown>) {
              return { output: inputs.value ?? "hello world" };
            }
          };
        }
        if (node.type === "nodetool.output.Output") {
          return {
            async process(inputs: Record<string, unknown>) {
              return { output: inputs.value ?? null };
            }
          };
        }
        return {
          async process() {
            return {};
          }
        };
      }
    });

    await outputRunner.connect(ws);
    const graph = {
      nodes: [
        {
          id: "n1",
          type: "nodetool.text.Template",
          name: "nodetool.text.Template",
          properties: { value: "hello world" }
        },
        {
          id: "n2",
          type: "nodetool.output.Output",
          name: "nodetool.output.Output",
          properties: {}
        }
      ],
      edges: [
        {
          id: "e1",
          source: "n1",
          target: "n2",
          sourceHandle: "output",
          targetHandle: "value",
          edge_type: "data"
        }
      ]
    };

    await outputRunner.handleCommand({
      command: "run_job",
      data: { graph, params: {} }
    });
    await new Promise((r) => setTimeout(r, 30));

    const sent = ws.sentBytes.map((b) => unpack(b) as Record<string, unknown>);
    const nodeUpdates = sent.filter((m) => m.type === "node_update");

    expect(
      nodeUpdates.some((m) => m.node_id === "n1" && m.status === "running")
    ).toBe(true);
    expect(
      nodeUpdates.some((m) => m.node_id === "n1" && m.status === "completed")
    ).toBe(true);
    expect(
      nodeUpdates.some((m) => m.node_id === "n2" && m.status === "running")
    ).toBe(true);
    expect(
      nodeUpdates.some((m) => m.node_id === "n2" && m.status === "completed")
    ).toBe(true);

    await outputRunner.disconnect();
  });

  it("includes outputs in terminal job_update", async () => {
    const outputRunner = new UnifiedWebSocketRunner({
      resolveExecutor: (node) => {
        if (node.type === "nodetool.constant.String") {
          return {
            async process(inputs: Record<string, unknown>) {
              return { output: inputs.value ?? "hello world" };
            }
          };
        }
        if (node.type === "nodetool.output.Output") {
          return {
            async process(inputs: Record<string, unknown>) {
              return { output: inputs.value ?? null };
            }
          };
        }
        return {
          async process() {
            return {};
          }
        };
      }
    });

    await outputRunner.connect(ws);
    const graph = {
      nodes: [
        {
          id: "n1",
          type: "nodetool.constant.String",
          name: "nodetool.constant.String",
          properties: { value: "hello world" }
        },
        {
          id: "n2",
          type: "nodetool.output.Output",
          name: "nodetool.output.Output",
          properties: {}
        }
      ],
      edges: [
        {
          id: "e1",
          source: "n1",
          target: "n2",
          sourceHandle: "output",
          targetHandle: "value",
          edge_type: "data"
        }
      ]
    };

    await outputRunner.handleCommand({
      command: "run_job",
      data: { graph, params: {} }
    });
    await new Promise((r) => setTimeout(r, 30));

    const sent = ws.sentBytes.map((b) => unpack(b) as Record<string, unknown>);
    const terminal = sent
      .filter((m) => m.type === "job_update" && m.status === "completed")
      .at(-1) as Record<string, unknown> | undefined;
    expect(terminal).toBeDefined();
    expect(terminal?.result).toBeDefined();
    const result = terminal?.result as { outputs?: Record<string, unknown[]> };
    expect(result.outputs).toBeDefined();
    const outputValues = result.outputs?.["nodetool.output.Output"] ?? [];
    expect(Array.isArray(outputValues)).toBe(true);
    expect(outputValues).toContain("hello world");

    await outputRunner.disconnect();
  });

  it("emits output_update in text mode", async () => {
    const outputRunner = new UnifiedWebSocketRunner({
      resolveExecutor: (node) => {
        if (node.type === "nodetool.constant.String") {
          return {
            async process(inputs: Record<string, unknown>) {
              return { output: inputs.value ?? "hello world" };
            }
          };
        }
        if (node.type === "nodetool.output.Output") {
          return {
            async process(inputs: Record<string, unknown>) {
              return { output: inputs.value ?? null };
            }
          };
        }
        return {
          async process() {
            return {};
          }
        };
      }
    });

    await outputRunner.connect(ws);
    await outputRunner.handleCommand({
      command: "set_mode",
      data: { mode: "text" }
    });

    const graph = {
      nodes: [
        {
          id: "n1",
          type: "nodetool.constant.String",
          name: "nodetool.constant.String",
          properties: { value: "hello world" }
        },
        {
          id: "n2",
          type: "nodetool.output.Output",
          name: "nodetool.output.Output",
          properties: {}
        }
      ],
      edges: [
        {
          id: "e1",
          source: "n1",
          target: "n2",
          sourceHandle: "output",
          targetHandle: "value",
          edge_type: "data"
        }
      ]
    };

    await outputRunner.handleCommand({
      command: "run_job",
      data: { graph, params: {} }
    });
    await new Promise((r) => setTimeout(r, 30));

    const sent = ws.sentText.map(
      (t) => JSON.parse(t) as Record<string, unknown>
    );
    const outputUpdate = sent.find((m) => m.type === "output_update");
    expect(outputUpdate).toBeDefined();
    expect(outputUpdate?.value).toBe("hello world");

    await outputRunner.disconnect();
  });

  it("hydrates stored graphs so streaming nodes use genProcess during run_job", async () => {
    const sinkValues: unknown[] = [];
    let processCalls = 0;
    let genProcessCalls = 0;
    const outputRunner = new UnifiedWebSocketRunner({
      resolveExecutor: (node) => {
        if (node.type === "test.Streamer") {
          return {
            async process() {
              processCalls += 1;
              return { chunk: "buffered" };
            },
            async *genProcess() {
              genProcessCalls += 1;
              yield { chunk: "first" };
              yield { chunk: "second" };
            }
          };
        }
        if (node.type === "nodetool.workflows.base_node.Preview") {
          return {
            async process(inputs: Record<string, unknown>) {
              sinkValues.push(inputs.value ?? null);
              return { output: inputs.value ?? null };
            }
          };
        }
        return {
          async process() {
            return {};
          }
        };
      },
      resolveNodeType: {
        resolveNodeType: async (nodeType: string) => {
          if (nodeType === "test.Streamer") {
            return {
              nodeType,
              outputs: { chunk: "chunk" },
              descriptorDefaults: {
                is_streaming_output: true,
                name: "Streamer"
              }
            };
          }
          if (nodeType === "nodetool.workflows.base_node.Preview") {
            return {
              nodeType,
              propertyTypes: { value: "any" },
              outputs: { output: "any" },
              descriptorDefaults: { name: "Preview" }
            };
          }
          return null;
        }
      }
    });

    await outputRunner.connect(ws);
    await outputRunner.handleCommand({
      command: "run_job",
      data: {
        graph: {
          nodes: [
            { id: "stream", type: "test.Streamer" },
            { id: "preview", type: "nodetool.workflows.base_node.Preview" }
          ],
          edges: [
            {
              id: "e1",
              source: "stream",
              sourceHandle: "chunk",
              target: "preview",
              targetHandle: "value",
              edge_type: "data"
            }
          ]
        }
      }
    });
    await new Promise((r) => setTimeout(r, 50));

    expect(processCalls).toBe(0);
    expect(genProcessCalls).toBe(1);
    expect(sinkValues).toEqual(["first", "second"]);

    await outputRunner.disconnect();
  });
});
