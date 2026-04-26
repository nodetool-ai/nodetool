import { describe, expect, it } from "vitest";
import {
  BrowserRealtimeModelLoader,
  createInferenceMetrics,
  sampleVideoFrames
} from "../src/index.js";
import type { VideoFrame } from "@nodetool/protocol";

const frame = (sequence: number, timestamp_ns = sequence * 1_000_000): VideoFrame => ({
  type: "realtime_video_frame",
  data: new Uint8Array([sequence]),
  width: 1,
  height: 1,
  stride: 4,
  pixel_format: "rgba8",
  timestamp_ns,
  sequence
});

describe("browser realtime loader contracts", () => {
  it("reports cache and warm-state transitions from an injected model loader", async () => {
    const events: string[] = [];
    const loader = new BrowserRealtimeModelLoader({
      modelId: "mediapipe/hand-landmarker",
      engine: "mediapipe",
      preferredBackends: ["webgpu", "wasm"],
      load: async ({ report }) => {
        report({ status: "resolving", progress: 0, cache: "unknown", warm: false });
        report({
          status: "loading",
          progress: 0.5,
          backend: "wasm",
          cache: "miss",
          warm: false
        });
        report({ status: "ready", progress: 1, backend: "wasm", cache: "miss", warm: true });
        return { model: "ready" };
      },
      onLoadingState: (state) => events.push(`${state.status}:${state.backend ?? "none"}`)
    });

    const result = await loader.load();

    expect(result).toEqual({ model: "ready" });
    expect(loader.state.status).toBe("ready");
    expect(loader.state.backend).toBe("wasm");
    expect(loader.state.warm).toBe(true);
    expect(events).toEqual(["resolving:none", "loading:wasm", "ready:wasm"]);
  });

  it("samples frames by sequence interval without mutating the media frame", () => {
    const frames = [frame(1), frame(2), frame(3), frame(4), frame(5)];

    expect(sampleVideoFrames(frames, { everyNthFrame: 2 }).map((item) => item.sequence)).toEqual([
      1,
      3,
      5
    ]);
    expect(frames[0].data[0]).toBe(1);
  });

  it("creates protocol inference metrics from loader state", () => {
    const metrics = createInferenceMetrics({
      sessionId: "session-1",
      workflowId: "workflow-1",
      jobId: "job-1",
      nodeId: "node-1",
      nodeType: "nodetool.realtime.browser.HandLandmarks",
      placement: "operator_browser",
      engine: "mediapipe",
      modelId: "mediapipe/hand-landmarker",
      state: {
        status: "ready",
        progress: 1,
        backend: "wasm",
        fallbackBackend: "wasm",
        cache: "hit",
        warm: true
      },
      throughput: {
        inferenceFps: 12,
        averageLatencyMs: 20
      },
      createdAt: "2026-01-01T00:00:00.000Z"
    });

    expect(metrics.type).toBe("realtime_inference_metrics");
    expect(metrics.backend).toBe("wasm");
    expect(metrics.loading.cache).toBe("hit");
    expect(metrics.throughput.inference_fps).toBe(12);
  });
});
