import { describe, expect, it } from "vitest";
import type { ProcessingMessage, RealtimeMetrics } from "../src/index.js";

describe("RealtimeMetrics protocol message", () => {
  it("is a websocket control-plane processing message", () => {
    const metrics: RealtimeMetrics = {
      type: "realtime_metrics",
      session_id: "session-1",
      workflow_id: "workflow-1",
      job_id: "job-1",
      transport: "webrtc",
      peer: {
        connection_state: "connected",
        ice_connection_state: "connected"
      },
      codec: {
        status: "unsupported",
        name: null
      },
      frames: {
        inbound: 3,
        outbound: 0,
        inbound_rtp_packets: 4,
        routed: 2,
        unrouted: 1,
        decode_unsupported: 1,
        encoded: 0
      },
      rates: {
        inbound_fps: 6,
        outbound_fps: 0,
        routed_fps: 4
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
      bitrate: {
        target_bps: null
      },
      reconnect_count: 0,
      created_at: "2026-01-01T00:00:00.000Z"
    };

    const message: ProcessingMessage = metrics;

    expect(message.type).toBe("realtime_metrics");
    expect(message.session_id).toBe("session-1");
  });
});
