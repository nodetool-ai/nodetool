import { describe, expect, it } from "vitest";
import type {
  AudioFrame,
  NodeDescriptor,
  RealtimeSessionInfo,
  VideoFrame
} from "@nodetool/protocol";
import { RealtimeRunner, WorkflowRunner } from "@nodetool/kernel";
import { NodeRegistry } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";
import {
  AudioSink,
  AudioSource,
  Parameter,
  registerRealtimeNodes,
  SessionInfo,
  VideoSink,
  VideoSource
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

const resolveFromRegistry = (nodeRegistry: NodeRegistry) => (node: NodeDescriptor) =>
  nodeRegistry.resolve(node);

const mockProcessingContext = {
  emit() {},
  setSendControlEvent() {}
} as unknown as ProcessingContext;

const getDroppedCount = (
  runner: WorkflowRunner,
  nodeId: string,
  handle: string
): number =>
  (
    runner as unknown as {
      _inboxes: Map<string, { getDroppedCount(handle: string): number }>;
    }
  )._inboxes.get(nodeId)!.getDroppedCount(handle);

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
          {
            ...VideoSource.toDescriptor("video-source"),
            name: "camera",
            properties: { name: "camera" }
          },
          {
            ...VideoSink.toDescriptor("video-sink"),
            name: "preview"
          }
        ],
        edges: [
          {
            source: "video-source",
            sourceHandle: "frame",
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
            label: null,
            enabled: true
          }
        ]
      })
    );

    const pushedFrame = frame(1);
    await realtimeRunner.runner.pushInputValue("camera", pushedFrame);

    const result = await realtimeRunner.stopRealtimeMode();

    expect(result.status).toBe("completed");
    expect(result.outputs.preview).toEqual([pushedFrame]);
  });

  it("applies latest-frame-wins buffering for video sink frames", async () => {
    const nodeRegistry = registry();
    const runner = new WorkflowRunner("job-video-buffer", {
      resolveExecutor: resolveFromRegistry(nodeRegistry),
      runMode: "realtime"
    });

    await runner.initializeForRealtime(
      { job_id: "job-video-buffer" },
      {
        nodes: [
          {
            ...VideoSource.toDescriptor("video-source"),
            name: "camera",
            properties: { name: "camera" }
          },
          VideoSink.toDescriptor("video-sink")
        ],
        edges: [
          {
            source: "video-source",
            sourceHandle: "frame",
            target: "video-sink",
            targetHandle: "frame"
          }
        ]
      }
    );

    await runner.pushInputValue("camera", frame(1));
    await runner.pushInputValue("camera", frame(2));
    await runner.pushInputValue("camera", frame(3));

    expect(getDroppedCount(runner, "video-sink", "frame")).toBe(1);
  });

  it("applies source ingress buffering before non-sink realtime targets", async () => {
    const nodeRegistry = registry();
    const runner = new WorkflowRunner("job-video-source-buffer", {
      resolveExecutor: (node) => {
        if (node.type === "test.Model") {
          return {
            async process(inputs) {
              return inputs;
            }
          };
        }
        return nodeRegistry.resolve(node);
      },
      runMode: "realtime"
    });

    await runner.initializeForRealtime(
      { job_id: "job-video-source-buffer" },
      {
        nodes: [
          {
            ...VideoSource.toDescriptor("video-source"),
            name: "camera",
            properties: { name: "camera" }
          },
          {
            id: "model",
            type: "test.Model",
            is_streaming_input: true
          }
        ],
        edges: [
          {
            source: "video-source",
            sourceHandle: "frame",
            target: "model",
            targetHandle: "frame"
          }
        ]
      }
    );

    await runner.pushInputValue("camera", frame(1));
    await runner.pushInputValue("camera", frame(2));
    await runner.pushInputValue("camera", frame(3));

    expect(getDroppedCount(runner, "model", "frame")).toBe(1);
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

  it("applies source ingress buffering for audio frames", async () => {
    const nodeRegistry = registry();
    const runner = new WorkflowRunner("job-audio-source-buffer", {
      resolveExecutor: (node) => {
        if (node.type === "test.AudioModel") {
          return {
            async process(inputs) {
              return inputs;
            }
          };
        }
        return nodeRegistry.resolve(node);
      },
      runMode: "realtime"
    });

    await runner.initializeForRealtime(
      { job_id: "job-audio-source-buffer" },
      {
        nodes: [
          {
            ...AudioSource.toDescriptor("audio-source"),
            name: "microphone",
            properties: { name: "microphone" }
          },
          {
            id: "model",
            type: "test.AudioModel",
            is_streaming_input: true
          }
        ],
        edges: [
          {
            source: "audio-source",
            sourceHandle: "frame",
            target: "model",
            targetHandle: "frame"
          }
        ]
      }
    );

    await runner.pushInputValue("microphone", audioFrame(1));
    await runner.pushInputValue("microphone", audioFrame(2));
    await runner.pushInputValue("microphone", audioFrame(3));

    expect(getDroppedCount(runner, "model", "frame")).toBe(1);
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
        parameters: { prompt: "live" }
      })
    );
  });
});
