import { describe, expect, it } from "vitest";
import type {
  MessageOfType,
  ProcessingMessage,
  RealtimeInferenceMetrics
} from "../src/index.js";

describe("RealtimeInferenceMetrics protocol message", () => {
  it("is separate from transport realtime metrics and carries JS inference loading state", () => {
    const metrics: RealtimeInferenceMetrics = {
      type: "realtime_inference_metrics",
      session_id: "session-1",
      workflow_id: "workflow-1",
      job_id: "job-1",
      node_id: "pose",
      node_type: "nodetool.realtime.browser.PoseLandmarks",
      placement: "operator_browser",
      engine: "tfjs",
      backend: "webgpu",
      model: {
        id: "mediapipe/pose-landmarks",
        source: "browser_cache"
      },
      loading: {
        status: "warming",
        progress: 0.75,
        warm: false,
        cache: "hit",
        error: null
      },
      throughput: {
        inference_fps: 28,
        average_latency_ms: 12.5
      },
      created_at: "2026-01-01T00:00:00.000Z"
    };

    const message: ProcessingMessage = metrics;
    const narrowed: MessageOfType<"realtime_inference_metrics"> = metrics;

    expect(message.type).toBe("realtime_inference_metrics");
    expect(narrowed.loading.cache).toBe("hit");
    expect(narrowed.engine).toBe("tfjs");
  });
});
