import { describe, expect, it } from "vitest";
import type {
  Edge,
  NodeDescriptor,
  ProcessingMessage,
  RealtimeSessionInfo
} from "@nodetool/protocol";
import {
  NodeInbox,
  RealtimeRunner,
  REALTIME_MESSAGE_BUFFER_LIMIT,
  REALTIME_OUTPUT_BUFFER_LIMIT,
  WorkflowRunner
} from "../src/index.js";
import type { NodeExecutor } from "../src/actor.js";
import type { ProcessingContext, StreamingInputs, StreamingOutputs } from "@nodetool/runtime";

const mockProcessingContext = {
  emit() {},
  setSendControlEvent() {}
} as unknown as ProcessingContext;

const simpleExecutor = (
  fn: (inputs: Record<string, unknown>) => Record<string, unknown>
): NodeExecutor => ({
  async process(inputs) {
    return fn(inputs);
  }
});

const graph: { nodes: NodeDescriptor[]; edges: Edge[] } = {
  nodes: [
    { id: "input", type: "test.Input", name: "value" },
    { id: "output", type: "test.Output", name: "result" }
  ],
  edges: [
    {
      source: "input",
      sourceHandle: "value",
      target: "output",
      targetHandle: "value"
    }
  ]
};

const realtimeSession = (
  overrides: Partial<RealtimeSessionInfo> = {}
): RealtimeSessionInfo => ({
  session_id: "session-rt",
  workflow_id: null,
  job_id: "job-rt",
  status: "starting",
  transport: "websocket",
  parameters: {},
  media_tracks: [],
  signaling: { status: "idle" },
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...overrides
});

const getPrivateMessages = (runner: WorkflowRunner): ProcessingMessage[] =>
  (runner as unknown as { _messages: ProcessingMessage[] })._messages;

const getPrivateOutputValues = (
  runner: WorkflowRunner,
  name: string
): unknown[] | undefined =>
  (runner as unknown as { _outputs: Map<string, unknown[]> })._outputs.get(name);

const getPrivateInbox = (runner: WorkflowRunner, nodeId: string): NodeInbox =>
  (runner as unknown as { _inboxes: Map<string, NodeInbox> })._inboxes.get(
    nodeId
  )!;

describe("WorkflowRunner realtime primitives", () => {
  it("initializes a realtime graph without entering the normal run loop", async () => {
    const runner = new WorkflowRunner("rt-init", {
      resolveExecutor: () => simpleExecutor((inputs) => inputs),
      runMode: "realtime"
    });

    await runner.initializeForRealtime({ job_id: "rt-init" }, graph);

    expect(getPrivateMessages(runner)).toHaveLength(0);

    await expect(runner.pushInputValue("value", 42)).resolves.toBeUndefined();
    expect((getPrivateMessages(runner)[0] as { type: string }).type).toBe(
      "edge_update"
    );
  });

  it("bounds the realtime message buffer", () => {
    const runner = new WorkflowRunner("rt-messages", {
      resolveExecutor: () => simpleExecutor((inputs) => inputs),
      runMode: "realtime"
    });

    const emit = (
      runner as unknown as { _emit: (message: ProcessingMessage) => void }
    )._emit.bind(runner);

    for (let index = 0; index < REALTIME_MESSAGE_BUFFER_LIMIT + 25; index += 1) {
      emit({
        type: "job_update",
        status: "running",
        job_id: `job-${index}`,
        workflow_id: null
      });
    }

    const messages = getPrivateMessages(runner);
    expect(messages).toHaveLength(REALTIME_MESSAGE_BUFFER_LIMIT);
    expect((messages.at(0) as { job_id: string }).job_id).toBe("job-25");
    expect((messages.at(-1) as { job_id: string }).job_id).toBe(
      `job-${REALTIME_MESSAGE_BUFFER_LIMIT + 24}`
    );
  });

  it("bounds collected realtime output values", () => {
    const runner = new WorkflowRunner("rt-outputs", {
      resolveExecutor: () => simpleExecutor((inputs) => inputs),
      runMode: "realtime"
    });

    const appendOutputValue = (
      runner as unknown as {
        _appendOutputValue: (name: string, value: unknown) => void;
      }
    )._appendOutputValue.bind(runner);

    for (let index = 0; index < REALTIME_OUTPUT_BUFFER_LIMIT + 10; index += 1) {
      appendOutputValue("result", index);
    }

    const outputs = getPrivateOutputValues(runner, "result");

    expect(outputs).toBeDefined();
    expect(outputs).toHaveLength(REALTIME_OUTPUT_BUFFER_LIMIT);
    expect(outputs?.[0]).toBe(10);
    expect(outputs?.at(-1)).toBe(REALTIME_OUTPUT_BUFFER_LIMIT + 9);
  });

  it("applies node-level input buffer policy during realtime initialization", async () => {
    const runner = new WorkflowRunner("rt-node-policy", {
      resolveExecutor: () => simpleExecutor((inputs) => inputs),
      runMode: "realtime"
    });

    await runner.initializeForRealtime(
      { job_id: "rt-node-policy" },
      {
        nodes: [
          { id: "input", type: "test.Input", name: "value" },
          {
            id: "buffered",
            type: "test.Buffered",
            inputBufferPolicy: {
              value: { capacity: 2, overflowPolicy: "drop_oldest" }
            }
          }
        ],
        edges: [
          {
            source: "input",
            sourceHandle: "value",
            target: "buffered",
            targetHandle: "value"
          }
        ]
      }
    );

    await runner.pushInputValue("value", 1);
    await runner.pushInputValue("value", 2);
    await runner.pushInputValue("value", 3);
    runner.finishInputStream("value");

    const inbox = getPrivateInbox(runner, "buffered");
    const values: unknown[] = [];
    for await (const value of inbox.iterInput("value")) {
      values.push(value);
    }

    expect(values).toEqual([2, 3]);
    expect(inbox.getDroppedCount("value")).toBe(1);
  });

  it("lets per-edge metadata override node-level input buffer policy", async () => {
    const runner = new WorkflowRunner("rt-edge-policy", {
      resolveExecutor: () => simpleExecutor((inputs) => inputs),
      runMode: "realtime"
    });

    await runner.initializeForRealtime(
      { job_id: "rt-edge-policy" },
      {
        nodes: [
          { id: "input", type: "test.Input", name: "value" },
          {
            id: "buffered",
            type: "test.Buffered",
            inputBufferPolicy: {
              value: { capacity: 2, overflowPolicy: "drop_oldest" }
            }
          }
        ],
        edges: [
          {
            source: "input",
            sourceHandle: "value",
            target: "buffered",
            targetHandle: "value",
            metadata: { capacity: 1, overflowPolicy: "drop_newest" }
          }
        ]
      }
    );

    await runner.pushInputValue("value", 1);
    await runner.pushInputValue("value", 2);
    await runner.pushInputValue("value", 3);
    runner.finishInputStream("value");

    const inbox = getPrivateInbox(runner, "buffered");
    const values: unknown[] = [];
    for await (const value of inbox.iterInput("value")) {
      values.push(value);
    }

    expect(values).toEqual([1]);
    expect(inbox.getDroppedCount("value")).toBe(2);
  });

  it("routes realtime parameter updates into matching parameter node control inboxes", async () => {
    const runner = new WorkflowRunner("rt-parameter", {
      resolveExecutor: () => simpleExecutor((inputs) => inputs),
      runMode: "realtime"
    });

    await runner.initializeForRealtime(
      { job_id: "rt-parameter" },
      {
        nodes: [
          {
            id: "parameter",
            type: "nodetool.realtime.Parameter",
            is_controlled: true,
            properties: { name: "strength" }
          }
        ],
        edges: []
      }
    );

    await expect(runner.pushParameter("strength", 0.5)).resolves.toEqual({
      routed: true,
      nodeIds: ["parameter"]
    });

    const inbox = getPrivateInbox(runner, "parameter");
    expect(inbox.tryPopAny()).toEqual([
      "__control__",
      {
        event_type: "run",
        properties: { value: 0.5 }
      }
    ]);
  });

  it("reports unrouted realtime parameters when no parameter node matches", async () => {
    const runner = new WorkflowRunner("rt-parameter-miss", {
      resolveExecutor: () => simpleExecutor((inputs) => inputs),
      runMode: "realtime"
    });

    await runner.initializeForRealtime(
      { job_id: "rt-parameter-miss" },
      {
        nodes: [
          {
            id: "parameter",
            type: "nodetool.realtime.Parameter",
            is_controlled: true,
            properties: { name: "strength" }
          }
        ],
        edges: []
      }
    );

    await expect(runner.pushParameter("guidance", 0.5)).resolves.toEqual({
      routed: false,
      nodeIds: []
    });
  });
});

describe("RealtimeRunner skeleton", () => {
  it("composes a WorkflowRunner configured for realtime mode", async () => {
    const realtimeRunner = new RealtimeRunner("rt-shell", {
      resolveExecutor: () => simpleExecutor((inputs) => inputs)
    });

    await realtimeRunner.startRealtimeMode(
      { job_id: "rt-shell" },
      graph,
      realtimeSession({ session_id: "rt-shell", job_id: "rt-shell" })
    );

    expect(realtimeRunner.runner).toBeInstanceOf(WorkflowRunner);
    expect(
      (
        realtimeRunner.runner as unknown as {
          _options: { runMode?: "one_shot" | "realtime" };
        }
      )._options.runMode
    ).toBe("realtime");
  });

  it("returns an empty completed result if realtime mode never started", async () => {
    const realtimeRunner = new RealtimeRunner("rt-stubs", {
      resolveExecutor: () => simpleExecutor((inputs) => inputs)
    });

    await expect(realtimeRunner.stopRealtimeMode()).resolves.toEqual({
      outputs: {},
      messages: [],
      status: "completed",
      error: undefined
    });
  });

  it("delegates pushParameter to the underlying realtime-configured WorkflowRunner", async () => {
    const realtimeRunner = new RealtimeRunner("rt-push-parameter", {
      resolveExecutor: () => simpleExecutor((inputs) => inputs)
    });

    await realtimeRunner.startRealtimeMode(
      { job_id: "rt-push-parameter" },
      {
        nodes: [
          {
            id: "parameter",
            type: "nodetool.realtime.Parameter",
            is_controlled: true,
            properties: { name: "strength" }
          }
        ],
        edges: []
      },
      realtimeSession({
        session_id: "rt-push-parameter",
        job_id: "rt-push-parameter"
      })
    );

    await expect(realtimeRunner.pushParameter("strength", 0.5)).resolves.toEqual({
      routed: true,
      nodeIds: ["parameter"]
    });
  });

  it("starts background processing, invokes warm-state hooks, and stops cleanly", async () => {
    const lifecycleEvents: string[] = [];
    const seenSessions: RealtimeSessionInfo[] = [];

    const warmExecutor: NodeExecutor = {
      async process() {
        return {};
      },
      async run(inputs: StreamingInputs, outputs: StreamingOutputs) {
        for await (const frame of inputs.stream("frame")) {
          await outputs.emit("frame", frame);
        }
      },
      resetWarmState() {
        lifecycleEvents.push("reset");
      },
      async onSessionStart(
        _context: ProcessingContext,
        session: RealtimeSessionInfo
      ) {
        lifecycleEvents.push("start");
        seenSessions.push(session);
      },
      async onSessionStop(
        _context: ProcessingContext,
        session: RealtimeSessionInfo
      ) {
        lifecycleEvents.push("stop");
        seenSessions.push(session);
      }
    };

    const realtimeRunner = new RealtimeRunner("rt-live", {
      executionContext: mockProcessingContext,
      resolveExecutor: (node) => {
        if (node.id === "warm") {
          return warmExecutor;
        }
        return simpleExecutor((inputs) => inputs);
      }
    });

    await realtimeRunner.startRealtimeMode(
      {
        job_id: "rt-live",
        workflow_id: "workflow-live"
      },
      {
        nodes: [
          {
            id: "source",
            type: "test.Input",
            name: "camera",
            is_streaming_output: true,
            is_media_adapter: true
          },
          {
            id: "warm",
            type: "test.WarmStreaming",
            is_streaming_input: true,
            owns_warm_state: true,
            outputs: { frame: "int" }
          },
          {
            id: "sink",
            type: "test.Output",
            name: "result"
          }
        ],
        edges: [
          {
            source: "source",
            sourceHandle: "value",
            target: "warm",
            targetHandle: "frame"
          },
          {
            source: "warm",
            sourceHandle: "frame",
            target: "sink",
            targetHandle: "value"
          }
        ]
      },
      realtimeSession({
        session_id: "session-live",
        workflow_id: "workflow-live",
        job_id: "rt-live",
        transport: "webrtc",
        parameters: { fps: 24 },
        media_tracks: [
          {
            track_id: "camera-track",
            kind: "video",
            node_id: "source",
            input_name: "camera",
            label: null,
            enabled: true
          }
        ]
      })
    );

    expect(lifecycleEvents).toEqual(["reset", "start"]);
    expect(seenSessions[0]).toMatchObject({
      session_id: "session-live",
      workflow_id: "workflow-live",
      job_id: "rt-live",
      transport: "webrtc",
      parameters: { fps: 24 },
      media_tracks: [
        {
          track_id: "camera-track",
          kind: "video",
          node_id: "source",
          input_name: "camera"
        }
      ]
    });

    await realtimeRunner.runner.pushInputValue("camera", 7);

    const result = await realtimeRunner.stopRealtimeMode();

    expect(lifecycleEvents).toEqual(["reset", "start", "stop"]);
    expect(seenSessions[1]?.session_id).toBe("session-live");
    expect(result.status).toBe("completed");
    expect(result.outputs.result).toEqual([7]);
  });

  it("routes pushed frames from video media adapter outputs by source handle", async () => {
    const realtimeRunner = new RealtimeRunner("rt-video-source", {
      resolveExecutor(node) {
        if (node.id === "sink") {
          return simpleExecutor((inputs) => ({ result: inputs.value }));
        }
        return simpleExecutor((inputs) => inputs);
      }
    });

    await realtimeRunner.startRealtimeMode(
      {
        job_id: "rt-video-source",
        workflow_id: "workflow-video-source"
      },
      {
        nodes: [
          {
            id: "video-source",
            type: "nodetool.video.VideoSource",
            is_streaming_output: true,
            is_media_adapter: true
          },
          {
            id: "sink",
            type: "test.Output",
            name: "result"
          }
        ],
        edges: [
          {
            source: "video-source",
            sourceHandle: "realtime_frame",
            target: "sink",
            targetHandle: "value"
          }
        ]
      },
      realtimeSession()
    );

    await realtimeRunner.runner.pushInputValue(
      "video-source",
      "frame-1",
      "realtime_frame"
    );

    const result = await realtimeRunner.stopRealtimeMode();

    expect(result.status).toBe("completed");
    expect(result.outputs.result).toEqual(["frame-1"]);
  });

  it("updates the live session info metrics object for warm-state nodes", async () => {
    const seenSessions: RealtimeSessionInfo[] = [];
    const warmExecutor: NodeExecutor = {
      async process() {
        return {};
      },
      async onSessionStart(_context, session) {
        seenSessions.push(session);
      }
    };
    const realtimeRunner = new RealtimeRunner("rt-metrics", {
      executionContext: mockProcessingContext,
      resolveExecutor: () => warmExecutor
    });

    await realtimeRunner.startRealtimeMode(
      { job_id: "rt-metrics" },
      {
        nodes: [
          {
            id: "warm",
            type: "test.WarmMetrics",
            owns_warm_state: true
          }
        ],
        edges: []
      },
      realtimeSession({
        session_id: "rt-metrics",
        job_id: "rt-metrics"
      })
    );

    realtimeRunner.updateMetrics({
      type: "realtime_metrics",
      session_id: "rt-metrics",
      workflow_id: null,
      job_id: "rt-metrics",
      transport: "websocket",
      peer: { connection_state: "connected" },
      codec: { status: "loopback", name: null },
      frames: {
        inbound: 1,
        outbound: 0,
        inbound_rtp_packets: 0,
        routed: 1,
        unrouted: 0,
        decode_unsupported: 0,
        encoded: 0
      },
      rates: {
        inbound_fps: 2,
        outbound_fps: 0,
        routed_fps: 2
      },
      queues: {
        total_depth: 0,
        total_dropped: 0,
        consumers: []
      },
      latency: {
        decode_ms_avg: null,
        encode_ms_avg: null,
        frame_age_ms_avg: null
      },
      bitrate: { target_bps: null },
      reconnect_count: 0,
      created_at: "2026-01-01T00:00:01.000Z"
    });

    expect(seenSessions[0].metrics).toMatchObject({
      type: "realtime_metrics",
      frames: expect.objectContaining({ inbound: 1 }),
      rates: expect.objectContaining({ inbound_fps: 2 })
    });

    await realtimeRunner.stopRealtimeMode();
  });

  it("bounds stopRealtimeMode so non-cooperative realtime nodes cannot hang teardown forever", async () => {
    const stuckExecutor: NodeExecutor = {
      async process() {
        return {};
      },
      async run() {
        await new Promise<void>(() => undefined);
      }
    };
    const realtimeRunner = new RealtimeRunner("rt-stuck-stop", {
      executionContext: mockProcessingContext,
      stopTimeoutMs: 10,
      resolveExecutor: (node) => {
        if (node.id === "stuck") {
          return stuckExecutor;
        }
        return simpleExecutor((inputs) => inputs);
      }
    });

    await realtimeRunner.startRealtimeMode(
      {
        job_id: "rt-stuck-stop"
      },
      {
        nodes: [
          {
            id: "source",
            type: "test.Input",
            name: "camera",
            is_streaming_output: true,
            is_media_adapter: true
          },
          {
            id: "stuck",
            type: "test.StuckRealtimeNode",
            is_streaming_input: true,
            owns_warm_state: true
          }
        ],
        edges: [
          {
            source: "source",
            sourceHandle: "value",
            target: "stuck",
            targetHandle: "frame"
          }
        ]
      },
      realtimeSession({
        session_id: "rt-stuck-stop",
        job_id: "rt-stuck-stop"
      })
    );

    const result = await realtimeRunner.stopRealtimeMode("cancelled");

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Realtime stop timed out");
  });

  it("bounds warm-state stop hooks so teardown cannot hang forever", async () => {
    const stuckStopExecutor: NodeExecutor = {
      async process() {
        return {};
      },
      async onSessionStop() {
        await new Promise<void>(() => undefined);
      }
    };
    const realtimeRunner = new RealtimeRunner("rt-stuck-stop-hook", {
      executionContext: mockProcessingContext,
      stopTimeoutMs: 10,
      resolveExecutor: (node) => {
        if (node.id === "warm") {
          return stuckStopExecutor;
        }
        return simpleExecutor((inputs) => inputs);
      }
    });

    await realtimeRunner.startRealtimeMode(
      {
        job_id: "rt-stuck-stop-hook"
      },
      {
        nodes: [
          {
            id: "warm",
            type: "test.StuckWarmStop",
            owns_warm_state: true
          }
        ],
        edges: []
      },
      realtimeSession({
        session_id: "rt-stuck-stop-hook",
        job_id: "rt-stuck-stop-hook"
      })
    );

    const result = await realtimeRunner.stopRealtimeMode("cancelled");

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Realtime stop timed out");
  });

  it("fails warm-state startup without an execution context", async () => {
    const realtimeRunner = new RealtimeRunner("rt-no-context", {
      resolveExecutor: () => simpleExecutor((inputs) => inputs)
    });

    await expect(
      realtimeRunner.startRealtimeMode(
        { job_id: "rt-no-context" },
        {
          nodes: [
            {
              id: "warm",
              type: "test.Warm",
              owns_warm_state: true
            }
          ],
          edges: []
        },
        realtimeSession({
          session_id: "rt-no-context",
          job_id: "rt-no-context"
        })
      )
    ).rejects.toThrow(
      "RealtimeRunner requires an executionContext for warm-state hooks"
    );
  });
});
