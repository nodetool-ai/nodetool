import { describe, expect, it } from "vitest";
import type {
  MessageOfType,
  ProcessingMessage,
  RealtimeAnalysisEvent
} from "../src/index.js";

describe("RealtimeAnalysisEvent protocol message", () => {
  it("carries browser-local analysis without extending the media frame union", () => {
    const event: RealtimeAnalysisEvent = {
      type: "realtime_analysis_event",
      session_id: "session-1",
      workflow_id: "workflow-1",
      job_id: "job-1",
      node_id: "hand-node",
      node_type: "nodetool.realtime.browser.HandLandmarks",
      event: "hand_landmarks",
      frame: {
        sequence: 4,
        timestamp_ns: 4000,
        width: 640,
        height: 480
      },
      payload: {
        hands: []
      },
      created_at: "2026-01-01T00:00:00.000Z"
    };

    const message: ProcessingMessage = event;
    const narrowed: MessageOfType<"realtime_analysis_event"> = event;

    expect(message.type).toBe("realtime_analysis_event");
    expect(narrowed.frame?.sequence).toBe(4);
    expect(narrowed.payload).toEqual({ hands: [] });
  });
});
