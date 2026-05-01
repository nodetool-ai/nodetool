import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoFrame } from "@nodetool/protocol";
import type { ActiveRealtimeJob } from "../src/realtime/command-handler-types.js";
import { RealtimeCommandHandler } from "../src/realtime/command-handler.js";
import { realtimeSessionManager } from "../src/realtime/session-manager.js";

function stubMediaBus(): ActiveRealtimeJob["mediaBus"] {
  return {
    setInput: vi.fn(),
    getLatestInput: vi.fn(),
    setOutput: vi.fn(),
    getLatestOutput: vi.fn(),
    clearSession: vi.fn(),
    subscribeOutputs: vi.fn(() => () => undefined),
    metrics: vi.fn(() => ({ inputs: {}, outputs: {} }))
  };
}

function stubTrackingMediaBus(): ActiveRealtimeJob["mediaBus"] {
  const inputSlots: Record<
    string,
    import("@nodetool/protocol").RealtimeMediaBusSlotMetrics
  > = {};
  return {
    setInput: vi.fn((_sessionId: string, nodeId: string, handle: string) => {
      const key = `${nodeId}:${handle}`;
      const prevSeq = inputSlots[key]?.lastSequence ?? 0;
      inputSlots[key] = {
        framesAccepted: prevSeq + 1,
        framesDropped: 0,
        lastSequence: prevSeq + 1
      };
    }),
    getLatestInput: vi.fn(),
    setOutput: vi.fn(),
    getLatestOutput: vi.fn(),
    clearSession: vi.fn(),
    subscribeOutputs: vi.fn(() => () => undefined),
    metrics: vi.fn(() => ({
      inputs: { ...inputSlots },
      outputs: {}
    }))
  };
}

function stubActiveJob(
  runner: ActiveRealtimeJob["runner"]
): ActiveRealtimeJob {
  return {
    runner,
    mediaBus: stubMediaBus(),
    tickRealtimeMediaPlane: vi.fn().mockResolvedValue(undefined)
  };
}

describe("RealtimeCommandHandler", () => {
  beforeEach(() => {
    realtimeSessionManager.reset();
  });

  it("fails startup if runJob resolves without registering an active job", async () => {
    const failSessionStartup = vi.fn().mockResolvedValue(undefined);
    const emitSessionStarted = vi.fn().mockResolvedValue(undefined);
    const emitSessionUpdated = vi.fn().mockResolvedValue(undefined);

    const handler = new RealtimeCommandHandler({
      getUserId: () => "user-1",
      runRealtimeJob: vi.fn().mockResolvedValue(undefined),
      cancelJob: vi.fn().mockResolvedValue(undefined),
      getActiveJob: vi.fn().mockReturnValue(undefined),
      trackSessionJob: vi.fn(),
      clearSessionTracking: vi.fn(),
      failSessionStartup,
      emitSessionStarted,
      emitSessionUpdated,
      emitSessionStopped: vi.fn().mockResolvedValue(undefined),
      emitSessionSignal: vi.fn().mockResolvedValue(undefined)
    });

    const result = await handler.handleStart({
      workflow_id: "workflow-1",
      parameters: { brightness: 100 }
    });

    expect(result).toMatchObject({
      type: "realtime_session_ack",
      ok: false,
      action: "start",
      workflow_id: "workflow-1",
      error: "Failed to start realtime session: job runner did not stay active"
    });
    expect(failSessionStartup).toHaveBeenCalledTimes(1);
    expect(emitSessionStarted).toHaveBeenCalledTimes(1);
    expect(emitSessionUpdated).not.toHaveBeenCalled();
  });

  it("emits the starting session before the realtime job finishes startup", async () => {
    const emitSessionStarted = vi.fn().mockResolvedValue(undefined);
    let resolveRunJob: (() => void) | undefined;
    const runRealtimeJob = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRunJob = resolve;
        })
    );
    const getActiveJob = vi.fn().mockReturnValue(stubActiveJob({}));
    const handler = new RealtimeCommandHandler({
      getUserId: () => "user-1",
      runRealtimeJob,
      cancelJob: vi.fn().mockResolvedValue(undefined),
      getActiveJob,
      trackSessionJob: vi.fn(),
      clearSessionTracking: vi.fn(),
      failSessionStartup: vi.fn().mockResolvedValue(undefined),
      emitSessionStarted,
      emitSessionUpdated: vi.fn().mockResolvedValue(undefined),
      emitSessionStopped: vi.fn().mockResolvedValue(undefined),
      emitSessionSignal: vi.fn().mockResolvedValue(undefined)
    });

    const startPromise = handler.handleStart({
      workflow_id: "workflow-1",
      graph: { nodes: [], edges: [] }
    });
    await Promise.resolve();

    expect(emitSessionStarted).toHaveBeenCalledWith(
      expect.objectContaining({
        workflow_id: "workflow-1",
        status: "starting"
      })
    );

    resolveRunJob?.();
    await startPromise;
    expect(getActiveJob).toHaveBeenCalled();
  });

  it("reports routed and unrouted realtime parameter updates", async () => {
    const emitSessionUpdated = vi.fn().mockResolvedValue(undefined);
    const pushParameter = vi
      .fn()
      .mockResolvedValue({ routed: false, nodeIds: [] })
      .mockResolvedValueOnce({ routed: true, nodeIds: ["param-1"] })
      .mockResolvedValueOnce({ routed: false, nodeIds: [] });
    const pushInputValue = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("missing input"));

    const session = realtimeSessionManager.createSession({
      userId: "user-1",
      workflowId: "workflow-1",
      jobId: "job-1",
      parameters: {},
      status: "running"
    });

    const handler = new RealtimeCommandHandler({
      getUserId: () => "user-1",
      runRealtimeJob: vi.fn().mockResolvedValue(undefined),
      cancelJob: vi.fn().mockResolvedValue(undefined),
      getActiveJob: vi.fn().mockReturnValue(
        stubActiveJob({
          pushParameter,
          pushInputValue
        })
      ),
      trackSessionJob: vi.fn(),
      clearSessionTracking: vi.fn(),
      failSessionStartup: vi.fn().mockResolvedValue(undefined),
      emitSessionStarted: vi.fn().mockResolvedValue(undefined),
      emitSessionUpdated,
      emitSessionStopped: vi.fn().mockResolvedValue(undefined),
      emitSessionSignal: vi.fn().mockResolvedValue(undefined)
    });

    const result = await handler.handleUpdate({
      session_id: session.session_id,
      parameters: {
        strength: 0.5,
        fallback_input: 12,
        unknown_input: 99
      }
    });

    expect(pushParameter).toHaveBeenNthCalledWith(1, "strength", 0.5);
    expect(pushParameter).toHaveBeenNthCalledWith(2, "fallback_input", 12);
    expect(pushParameter).toHaveBeenNthCalledWith(3, "unknown_input", 99);
    expect(pushInputValue).toHaveBeenNthCalledWith(1, "fallback_input", 12);
    expect(pushInputValue).toHaveBeenNthCalledWith(2, "unknown_input", 99);
    expect(result).toMatchObject({
      type: "realtime_session_ack",
      ok: true,
      action: "update",
      session_id: session.session_id,
      routed_parameters: ["strength", "fallback_input"],
      unrouted_parameters: ["unknown_input"]
    });
    expect(emitSessionUpdated).toHaveBeenCalledTimes(1);
  });

  it("routes session-targeted realtime video frames through media track mappings", async () => {
    const mediaBus = stubTrackingMediaBus();
    const setInput = vi.mocked(mediaBus.setInput);
    const tickRealtimeMediaPlane = vi.fn().mockResolvedValue(undefined);
    const recordFramePushResult = vi.fn();
    const session = realtimeSessionManager.createSession({
      userId: "user-1",
      workflowId: "workflow-1",
      jobId: "job-1",
      mediaTracks: [
        {
          track_id: "deterministic-video",
          kind: "video",
          node_id: "video-source",
          input_name: "camera",
          source_handle: "realtime_frame",
          label: "Deterministic frame",
          enabled: true
        }
      ],
      parameters: {},
      status: "running"
    });

    const handler = new RealtimeCommandHandler({
      getUserId: () => "user-1",
      runRealtimeJob: vi.fn().mockResolvedValue(undefined),
      cancelJob: vi.fn().mockResolvedValue(undefined),
      getActiveJob: vi.fn().mockReturnValue({
        runner: {},
        mediaBus,
        tickRealtimeMediaPlane
      }),
      trackSessionJob: vi.fn(),
      clearSessionTracking: vi.fn(),
      failSessionStartup: vi.fn().mockResolvedValue(undefined),
      emitSessionStarted: vi.fn().mockResolvedValue(undefined),
      emitSessionUpdated: vi.fn().mockResolvedValue(undefined),
      emitSessionStopped: vi.fn().mockResolvedValue(undefined),
      emitSessionSignal: vi.fn().mockResolvedValue(undefined),
      realtimeWebRTCServer: {
        handleSignal: vi.fn().mockResolvedValue(undefined),
        stopSession: vi.fn().mockResolvedValue(undefined),
        recordFramePushResult
      }
    });

    const result = await handler.handlePushFrame({
      session_id: session.session_id,
      track_id: "deterministic-video",
      frame: {
        type: "realtime_video_frame",
        data: [255, 0, 0, 255],
        width: 1,
        height: 1,
        stride: 4,
        pixel_format: "rgba8",
        timestamp_ns: 1000,
        sequence: 1
      }
    });

    await vi.waitFor(() =>
      expect(tickRealtimeMediaPlane).toHaveBeenCalledWith(session.session_id)
    );

    expect(result).toMatchObject({
      type: "realtime_session_ack",
      ok: true,
      action: "push_frame",
      session_id: session.session_id,
      workflow_id: "workflow-1",
      job_id: "job-1",
      track_id: "deterministic-video",
      routed: true
    });
    const pushedFrame = setInput.mock.calls[0][3] as VideoFrame;
    expect(setInput).toHaveBeenCalledWith(
      session.session_id,
      "video-source",
      "realtime_frame",
      expect.objectContaining({
        type: "realtime_video_frame",
        width: 1,
        height: 1,
        stride: 4,
        pixel_format: "rgba8",
        timestamp_ns: 1000,
        sequence: 1
      })
    );
    expect(pushedFrame.data).toEqual(new Uint8Array([255, 0, 0, 255]));
    expect(recordFramePushResult).toHaveBeenCalledWith(session.session_id, true);
  });

  it("runs one kernel tick per advancing ingress sequence across pushes", async () => {
    const mediaBus = stubTrackingMediaBus();
    const tickRealtimeMediaPlane = vi.fn().mockResolvedValue(undefined);
    const session = realtimeSessionManager.createSession({
      userId: "user-1",
      workflowId: "workflow-1",
      jobId: "job-1",
      mediaTracks: [
        {
          track_id: "deterministic-video",
          kind: "video",
          node_id: "video-source",
          input_name: "camera",
          source_handle: "realtime_frame",
          label: "Deterministic frame",
          enabled: true
        }
      ],
      parameters: {},
      status: "running"
    });

    const handler = new RealtimeCommandHandler({
      getUserId: () => "user-1",
      runRealtimeJob: vi.fn().mockResolvedValue(undefined),
      cancelJob: vi.fn().mockResolvedValue(undefined),
      getActiveJob: vi.fn().mockReturnValue({
        runner: {},
        mediaBus,
        tickRealtimeMediaPlane,
        pulseRealtimeFrameSender: vi.fn()
      }),
      trackSessionJob: vi.fn(),
      clearSessionTracking: vi.fn(),
      failSessionStartup: vi.fn().mockResolvedValue(undefined),
      emitSessionStarted: vi.fn().mockResolvedValue(undefined),
      emitSessionUpdated: vi.fn().mockResolvedValue(undefined),
      emitSessionStopped: vi.fn().mockResolvedValue(undefined),
      emitSessionSignal: vi.fn().mockResolvedValue(undefined),
      realtimeWebRTCServer: {
        handleSignal: vi.fn().mockResolvedValue(undefined),
        stopSession: vi.fn().mockResolvedValue(undefined),
        recordFramePushResult: vi.fn()
      }
    });

    await handler.handlePushFrame({
      session_id: session.session_id,
      track_id: "deterministic-video",
      frame: {
        type: "realtime_video_frame",
        data: [255, 0, 0, 255],
        width: 1,
        height: 1,
        stride: 4,
        pixel_format: "rgba8",
        timestamp_ns: 1000,
        sequence: 1
      }
    });
    await vi.waitFor(() =>
      expect(tickRealtimeMediaPlane).toHaveBeenCalledTimes(1)
    );

    await handler.handlePushFrame({
      session_id: session.session_id,
      track_id: "deterministic-video",
      frame: {
        type: "realtime_video_frame",
        data: [0, 255, 0, 255],
        width: 1,
        height: 1,
        stride: 4,
        pixel_format: "rgba8",
        timestamp_ns: 2000,
        sequence: 2
      }
    });
    await vi.waitFor(() =>
      expect(tickRealtimeMediaPlane).toHaveBeenCalledTimes(2)
    );
  });

  it("delegates runtime-targeted WebRTC signaling to the backend server", async () => {
    const emitSessionSignal = vi.fn().mockResolvedValue(undefined);
    const realtimeWebRTCServer = {
      handleSignal: vi.fn().mockResolvedValue(undefined),
      stopSession: vi.fn().mockResolvedValue(undefined)
    };
    const session = realtimeSessionManager.createSession({
      userId: "user-1",
      workflowId: "workflow-1",
      jobId: "job-1",
      transport: "webrtc",
      mediaTracks: [
        {
          track_id: "video-track",
          kind: "video",
          node_id: "camera",
          input_name: "camera"
        }
      ],
      parameters: {},
      status: "running"
    });

    const handler = new RealtimeCommandHandler({
      getUserId: () => "user-1",
      runRealtimeJob: vi.fn().mockResolvedValue(undefined),
      cancelJob: vi.fn().mockResolvedValue(undefined),
      getActiveJob: vi.fn().mockReturnValue(undefined),
      trackSessionJob: vi.fn(),
      clearSessionTracking: vi.fn(),
      failSessionStartup: vi.fn().mockResolvedValue(undefined),
      emitSessionStarted: vi.fn().mockResolvedValue(undefined),
      emitSessionUpdated: vi.fn().mockResolvedValue(undefined),
      emitSessionStopped: vi.fn().mockResolvedValue(undefined),
      emitSessionSignal,
      realtimeWebRTCServer
    });

    const result = await handler.handleSignal({
      session_id: session.session_id,
      signaling_status: "negotiating",
      signal: {
        signal_type: "offer",
        source: "operator",
        target: "runtime",
        description: {
          type: "offer",
          sdp: "v=0\r\n"
        }
      }
    });

    expect(result).toMatchObject({ ok: true, action: "signal" });
    expect(realtimeWebRTCServer.handleSignal).toHaveBeenCalledWith(
      expect.objectContaining({ session_id: session.session_id }),
      expect.objectContaining({
        signal_type: "offer",
        source: "operator",
        target: "runtime"
      })
    );
    expect(emitSessionSignal).not.toHaveBeenCalled();
  });

  it("keeps relay-only signaling for non-WebRTC transports", async () => {
    const emitSessionSignal = vi.fn().mockResolvedValue(undefined);
    const realtimeWebRTCServer = {
      handleSignal: vi.fn().mockResolvedValue(undefined),
      stopSession: vi.fn().mockResolvedValue(undefined)
    };
    const session = realtimeSessionManager.createSession({
      userId: "user-1",
      workflowId: "workflow-1",
      jobId: "job-1",
      transport: "websocket",
      parameters: {},
      status: "running"
    });

    const handler = new RealtimeCommandHandler({
      getUserId: () => "user-1",
      runRealtimeJob: vi.fn().mockResolvedValue(undefined),
      cancelJob: vi.fn().mockResolvedValue(undefined),
      getActiveJob: vi.fn().mockReturnValue(undefined),
      trackSessionJob: vi.fn(),
      clearSessionTracking: vi.fn(),
      failSessionStartup: vi.fn().mockResolvedValue(undefined),
      emitSessionStarted: vi.fn().mockResolvedValue(undefined),
      emitSessionUpdated: vi.fn().mockResolvedValue(undefined),
      emitSessionStopped: vi.fn().mockResolvedValue(undefined),
      emitSessionSignal,
      realtimeWebRTCServer
    });

    await handler.handleSignal({
      session_id: session.session_id,
      signal: {
        signal_type: "offer",
        source: "operator",
        target: "runtime",
        description: {
          type: "offer",
          sdp: "v=0\r\n"
        }
      }
    });

    expect(realtimeWebRTCServer.handleSignal).not.toHaveBeenCalled();
    expect(emitSessionSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: session.session_id,
        signal_type: "offer",
        source: "operator",
        target: "runtime"
      })
    );
  });
});
