import { describe, expect, it } from "vitest";
import type {
  AudioFrame,
  NodeDescriptor,
  RealtimeSessionInfo,
  VideoFrame
} from "@nodetool/protocol";
import { RealtimeRunner, WorkflowRunner } from "@nodetool/kernel";
import { NodeRegistry } from "@nodetool/node-sdk";
import {
  PythonNodeExecutor,
  type ProcessingContext,
  type RealtimeOutputFrameEvent,
  type StreamingInputs,
  type StreamingOutputs
} from "@nodetool/runtime";
import {
  AudioSink,
  AudioSource,
  Parameter,
  registerRealtimeNodes,
  SessionInfo,
  VideoPassthrough,
  VideoSink
} from "../src/index.js";

const frame = (sequence: number): VideoFrame => ({
  type: "realtime_video_frame",
  data: new Uint8Array([sequence, 0, 0, 255]),
  width: 1,
  height: 1,
  stride: 4,
  pixel_format: "rgba8",
  timestamp_ns: sequence,
  sequence
});

const audioFrame = (sequence: number): AudioFrame => ({
  type: "realtime_audio_frame",
  data: new Uint8Array([sequence, 0, 255, 127]),
  sample_rate: 48_000,
  channels: 2,
  sample_format: "s16le",
  samples: 1,
  timestamp_ns: sequence,
  sequence
});

const realtimeSession = (
  overrides: Partial<RealtimeSessionInfo> = {}
): RealtimeSessionInfo => ({
  session_id: "session-1",
  workflow_id: "workflow-1",
  job_id: "job-1",
  status: "starting",
  transport: "webrtc",
  parameters: {},
  media_tracks: [],
  signaling: { status: "idle" },
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...overrides
});

const registry = (): NodeRegistry => {
  const nodeRegistry = new NodeRegistry();
  registerRealtimeNodes(nodeRegistry);
  return nodeRegistry;
};

const videoSourceDescriptor = (
  id: string,
  overrides: Partial<NodeDescriptor> = {}
): NodeDescriptor => ({
  id,
  type: "nodetool.video.VideoSource",
  name: "camera",
  properties: { source: "camera", image: null, realtime_frame: null },
  outputs: { image: "image", realtime_frame: "realtime_video_frame" },
  is_streaming_output: true,
  is_realtime_capable: true,
  is_media_adapter: true,
  inputBufferPolicy: {
    realtime_frame: { capacity: 2, overflowPolicy: "drop_oldest" }
  },
  ...overrides
});

const resolveFromRegistry = (nodeRegistry: NodeRegistry) => (node: NodeDescriptor) => {
  if (node.type === "nodetool.video.VideoSource") {
    return {
      async process() {
        return { image: null, realtime_frame: null };
      }
    };
  }

  return nodeRegistry.resolve(node);
};

const mockProcessingContext = {
  getSecret: async () => null,
  emit() {},
  setSendControlEvent() {}
} as unknown as ProcessingContext;

class FakePythonRealtimeBridge {
  private frameListeners = new Set<(event: RealtimeOutputFrameEvent) => void>();

  readonly startRealtimeSession = async () => ({
    session_id: "session-python-model",
    status: "running"
  });

  readonly pushRealtimeInputFrame = async () => {
    queueMicrotask(() => {
      for (const listener of this.frameListeners) {
        listener({
          session_id: "session-python-model",
          handle: "frame",
          payload: frame(9)
        });
      }
    });
    return {
      session_id: "session-python-model",
      ok: true,
      dropped_count: 0
    };
  };

  readonly stopRealtimeSession = async () => ({
    session_id: "session-python-model",
    ok: true,
    error: null
  });

  readonly execute = async () => {
    throw new Error("one-shot execute should not run for warm realtime frames");
  };

  on(event: string, listener: (event: RealtimeOutputFrameEvent) => void) {
    if (event === "realtimeOutputFrame") {
      this.frameListeners.add(listener);
    }
    return this;
  }

  off(event: string, listener: (event: RealtimeOutputFrameEvent) => void) {
    if (event === "realtimeOutputFrame") {
      this.frameListeners.delete(listener);
    }
    return this;
  }
}

describe("realtime frame routing nodes", () => {
  it("routes pushed video frames from VideoSource to VideoSink", async () => {
    const nodeRegistry = registry();
    const realtimeRunner = new RealtimeRunner("job-video-loopback", {
      resolveExecutor: resolveFromRegistry(nodeRegistry)
    });

    await realtimeRunner.startRealtimeMode(
      { job_id: "job-video-loopback", workflow_id: "workflow-1" },
      {
        nodes: [
          videoSourceDescriptor("video-source"),
          {
            ...VideoSink.toDescriptor("video-sink"),
            name: "preview"
          }
        ],
        edges: [
          {
            source: "video-source",
            sourceHandle: "realtime_frame",
            target: "video-sink",
            targetHandle: "frame"
          }
        ]
      },
      realtimeSession({
        session_id: "session-video-loopback",
        media_tracks: [
          {
            track_id: "track-camera",
            kind: "video",
            node_id: "video-source",
            input_name: "camera",
            source_handle: "realtime_frame",
            label: null,
            enabled: true
          }
        ]
      })
    );

    const pushedFrame = frame(1);
    await realtimeRunner.runner.pushInputValue(
      "camera",
      pushedFrame,
      "realtime_frame"
    );

    const result = await realtimeRunner.stopRealtimeMode();

    expect(result.status).toBe("completed");
    expect(result.outputs.preview).toEqual([pushedFrame]);
  });

  it("routes pushed video frames through a model frame input handle", async () => {
    const nodeRegistry = registry();
    const realtimeRunner = new RealtimeRunner("job-video-model-frame", {
      resolveExecutor(node) {
        if (node.type === "test.Model") {
          return {
            async process(inputs) {
              return { frame: inputs.frame };
            },
            async run(inputs: StreamingInputs, outputs: StreamingOutputs) {
              for await (const frame of inputs.stream("frame")) {
                await outputs.emit("frame", frame);
              }
            }
          };
        }
        return resolveFromRegistry(nodeRegistry)(node);
      }
    });

    await realtimeRunner.startRealtimeMode(
      { job_id: "job-video-model-frame", workflow_id: "workflow-1" },
      {
        nodes: [
          videoSourceDescriptor("video-source"),
          {
            id: "model",
            type: "test.Model",
            is_streaming_input: true,
            outputs: { frame: "realtime_video_frame" }
          },
          {
            ...VideoSink.toDescriptor("video-sink"),
            name: "preview"
          }
        ],
        edges: [
          {
            source: "video-source",
            sourceHandle: "realtime_frame",
            target: "model",
            targetHandle: "frame"
          },
          {
            source: "model",
            sourceHandle: "frame",
            target: "video-sink",
            targetHandle: "frame"
          }
        ]
      },
      realtimeSession({
        session_id: "session-video-model-frame",
        media_tracks: [
          {
            track_id: "track-camera",
            kind: "video",
            node_id: "video-source",
            input_name: "camera",
            source_handle: "realtime_frame",
            label: null,
            enabled: true
          }
        ]
      })
    );

    const pushedFrame = frame(2);
    await realtimeRunner.runner.pushInputValue(
      "camera",
      pushedFrame,
      "realtime_frame"
    );

    const result = await realtimeRunner.stopRealtimeMode();

    expect(result.status).toBe("completed");
    expect(result.outputs.preview).toEqual([pushedFrame]);
  });

  it("routes pushed video frames through VideoPassthrough into VideoSink", async () => {
    const nodeRegistry = registry();
    const realtimeRunner = new RealtimeRunner("job-video-passthrough", {
      resolveExecutor: resolveFromRegistry(nodeRegistry)
    });

    await realtimeRunner.startRealtimeMode(
      { job_id: "job-video-passthrough", workflow_id: "workflow-1" },
      {
        nodes: [
          videoSourceDescriptor("video-source"),
          {
            ...VideoPassthrough.toDescriptor("passthrough"),
            name: "passthrough"
          },
          {
            ...VideoSink.toDescriptor("video-sink"),
            name: "preview"
          }
        ],
        edges: [
          {
            source: "video-source",
            sourceHandle: "realtime_frame",
            target: "passthrough",
            targetHandle: "frame"
          },
          {
            source: "passthrough",
            sourceHandle: "frame",
            target: "video-sink",
            targetHandle: "frame"
          }
        ]
      },
      realtimeSession({
        session_id: "session-video-passthrough",
        media_tracks: [
          {
            track_id: "track-camera",
            kind: "video",
            node_id: "video-source",
            input_name: "camera",
            source_handle: "realtime_frame",
            label: null,
            enabled: true
          }
        ]
      })
    );

    const pushedFrame = frame(3);
    await realtimeRunner.runner.pushInputValue(
      "camera",
      pushedFrame,
      "realtime_frame"
    );

    const result = await realtimeRunner.stopRealtimeMode();

    expect(result.status).toBe("completed");
    expect(result.outputs.preview).toEqual([pushedFrame]);
  });

  it("routes pushed frames through a warm Python realtime model into VideoSink", async () => {
    const nodeRegistry = registry();
    const bridge = new FakePythonRealtimeBridge();
    const realtimeRunner = new RealtimeRunner("job-python-model-frame", {
      executionContext: mockProcessingContext,
      resolveExecutor(node) {
        if (node.type === "realtime.longlive.LongLive") {
          return new PythonNodeExecutor(
            bridge as never,
            node.type,
            (node.properties ?? {}) as Record<string, unknown>,
            { frame: "realtime_video_frame" },
            []
          );
        }
        return resolveFromRegistry(nodeRegistry)(node);
      }
    });

    await realtimeRunner.startRealtimeMode(
      { job_id: "job-python-model-frame", workflow_id: "workflow-1" },
      {
        nodes: [
          videoSourceDescriptor("video-source"),
          {
            id: "model",
            type: "realtime.longlive.LongLive",
            name: "LongLive",
            properties: { prompt: "test prompt" },
            outputs: { frame: "realtime_video_frame" },
            sync_mode: "on_any",
            is_realtime_capable: true,
            owns_warm_state: true
          },
          {
            ...VideoSink.toDescriptor("video-sink"),
            name: "preview"
          }
        ],
        edges: [
          {
            source: "video-source",
            sourceHandle: "realtime_frame",
            target: "model",
            targetHandle: "frame"
          },
          {
            source: "model",
            sourceHandle: "frame",
            target: "video-sink",
            targetHandle: "frame"
          }
        ]
      },
      realtimeSession({
        session_id: "session-python-model",
        media_tracks: [
          {
            track_id: "track-camera",
            kind: "video",
            node_id: "video-source",
            input_name: "camera",
            source_handle: "realtime_frame",
            label: null,
            enabled: true
          }
        ]
      })
    );

    await realtimeRunner.runner.pushInputValue(
      "camera",
      frame(3),
      "realtime_frame"
    );

    const result = await realtimeRunner.stopRealtimeMode();

    expect(result.status).toBe("completed");
    expect(result.outputs.preview).toEqual([frame(9)]);
  });

  it("routes pushed audio frames from AudioSource to AudioSink", async () => {
    const nodeRegistry = registry();
    const realtimeRunner = new RealtimeRunner("job-audio-loopback", {
      resolveExecutor: resolveFromRegistry(nodeRegistry)
    });

    await realtimeRunner.startRealtimeMode(
      { job_id: "job-audio-loopback", workflow_id: "workflow-1" },
      {
        nodes: [
          {
            ...AudioSource.toDescriptor("audio-source"),
            name: "microphone",
            properties: { name: "microphone" }
          },
          {
            ...AudioSink.toDescriptor("audio-sink"),
            name: "speaker"
          }
        ],
        edges: [
          {
            source: "audio-source",
            sourceHandle: "frame",
            target: "audio-sink",
            targetHandle: "frame"
          }
        ]
      },
      realtimeSession({
        session_id: "session-audio-loopback",
        media_tracks: [
          {
            track_id: "track-microphone",
            kind: "audio",
            node_id: "audio-source",
            input_name: "microphone",
            label: null,
            enabled: true
          }
        ]
      })
    );

    const pushedFrame = audioFrame(1);
    await realtimeRunner.runner.pushInputValue("microphone", pushedFrame);

    const result = await realtimeRunner.stopRealtimeMode();

    expect(result.status).toBe("completed");
    expect(result.outputs.speaker).toEqual([pushedFrame]);
  });

});

describe("realtime control and session nodes", () => {
  it("routes parameter updates through the real Parameter node", async () => {
    const nodeRegistry = registry();
    const runner = new WorkflowRunner("job-parameter", {
      resolveExecutor: resolveFromRegistry(nodeRegistry),
      runMode: "realtime"
    });

    await runner.initializeForRealtime(
      { job_id: "job-parameter" },
      {
        nodes: [
          {
            ...Parameter.toDescriptor("strength"),
            name: "strength",
            properties: { name: "strength", value: 0 }
          }
        ],
        edges: []
      }
    );

    await expect(runner.pushParameter("strength", 0.75)).resolves.toEqual({
      routed: true,
      nodeIds: ["strength"]
    });
  });

  it("stops realtime sessions that contain standalone Parameter nodes", async () => {
    const nodeRegistry = registry();
    const realtimeRunner = new RealtimeRunner("job-parameter-stop", {
      resolveExecutor: resolveFromRegistry(nodeRegistry)
    });

    await realtimeRunner.startRealtimeMode(
      { job_id: "job-parameter-stop", workflow_id: "workflow-parameter" },
      {
        nodes: [
          {
            ...Parameter.toDescriptor("strength"),
            name: "strength",
            properties: { name: "strength", value: 0 }
          }
        ],
        edges: []
      },
      realtimeSession({
        session_id: "session-parameter-stop",
        job_id: "job-parameter-stop",
        workflow_id: "workflow-parameter"
      })
    );
    await realtimeRunner.pushParameter("strength", 0.75);

    const result = await Promise.race([
      realtimeRunner.stopRealtimeMode(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("stop timed out")), 500)
      )
    ]);

    expect(result.status).toBe("completed");
  });

  it("emits session metadata captured from realtime lifecycle hooks", async () => {
    const nodeRegistry = registry();
    const realtimeRunner = new RealtimeRunner("job-session-info", {
      executionContext: mockProcessingContext,
      resolveExecutor: resolveFromRegistry(nodeRegistry)
    });

    await realtimeRunner.startRealtimeMode(
      { job_id: "job-session-info", workflow_id: "workflow-session" },
      {
        nodes: [
          {
            ...SessionInfo.toDescriptor("session-info"),
            name: "session"
          }
        ],
        edges: []
      },
      realtimeSession({
        session_id: "session-info-1",
        workflow_id: "workflow-session",
        job_id: "job-session-info",
        parameters: { prompt: "live" },
        metrics: {
          type: "realtime_metrics",
          session_id: "session-info-1",
          workflow_id: "workflow-session",
          job_id: "job-session-info",
          transport: "webrtc",
          peer: { connection_state: "connected" },
          codec: { status: "unsupported", name: null },
          frames: {
            inbound: 1,
            outbound: 0,
            inbound_rtp_packets: 1,
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
          created_at: "2026-01-01T00:00:00.000Z"
        },
        media_tracks: [
          {
            track_id: "track-1",
            kind: "video",
            node_id: "video-source",
            input_name: "camera",
            label: null,
            enabled: true
          }
        ]
      })
    );

    const result = await realtimeRunner.stopRealtimeMode();

    expect(result.status).toBe("completed");
    expect(result.outputs.session?.[0]).toEqual(
      expect.objectContaining({
        session_id: "session-info-1",
        workflow_id: "workflow-session",
        transport: "webrtc",
        parameters: { prompt: "live" },
        metrics: expect.objectContaining({
          type: "realtime_metrics",
          frames: expect.objectContaining({ inbound: 1 })
        })
      })
    );
  });
});
