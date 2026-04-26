import { describe, expect, it } from "vitest";
import {
  createAnalysisEvent,
  FrameClassificationNode,
  HandLandmarksNode,
  REALTIME_BROWSER_NODE_DEFINITIONS
} from "../src/index.js";
import type { VideoFrame } from "@nodetool/protocol";

const frame = (sequence: number): VideoFrame => ({
  type: "realtime_video_frame",
  data: new Uint8Array([sequence]),
  width: 2,
  height: 2,
  stride: 8,
  pixel_format: "rgba8",
  timestamp_ns: sequence * 1_000_000,
  sequence
});

describe("browser realtime proof nodes", () => {
  it("declares browser-local realtime metadata for hand landmarks", () => {
    expect(REALTIME_BROWSER_NODE_DEFINITIONS.HandLandmarks.realtime_profile).toEqual({
      browser_capable: true,
      requires_browser_frame: true,
      requires_webgpu: false,
      emits_analysis_event: true,
      emits_parameter_update: false,
      emits_media_frame: false
    });
  });

  it("runs hand landmark detection through an injected MediaPipe-compatible model", async () => {
    const node = new HandLandmarksNode({
      detector: {
        detect: async (input) => ({
          hands: [
            {
              handedness: "Left",
              landmarks: [{ x: input.sequence, y: 0.5, z: 0 }]
            }
          ]
        })
      }
    });

    const result = await node.analyze(frame(7));

    expect(result.kind).toBe("hand_landmarks");
    expect(result.frame.sequence).toBe(7);
    expect(result.hands[0].landmarks[0].x).toBe(7);
  });

  it("samples frames before running a Transformers.js-style classifier", async () => {
    const seen: number[] = [];
    const node = new FrameClassificationNode({
      everyNthFrame: 2,
      classifier: {
        classify: async (input) => {
          seen.push(input.sequence);
          return [{ label: `frame-${input.sequence}`, score: 0.9 }];
        }
      }
    });

    const result = await node.analyzeBatch([frame(1), frame(2), frame(3)]);

    expect(seen).toEqual([1, 3]);
    expect(result.map((item) => item.classifications[0].label)).toEqual([
      "frame-1",
      "frame-3"
    ]);
  });

  it("wraps proof node output in a realtime analysis event", async () => {
    const result = await new HandLandmarksNode({
      detector: {
        detect: async () => ({ hands: [] })
      }
    }).analyze(frame(2));

    const event = createAnalysisEvent({
      sessionId: "session-1",
      workflowId: "workflow-1",
      jobId: "job-1",
      nodeId: "hand-node",
      nodeType: REALTIME_BROWSER_NODE_DEFINITIONS.HandLandmarks.node_type,
      event: result
    });

    expect(event.type).toBe("realtime_analysis_event");
    expect(event.event).toBe("hand_landmarks");
    expect(event.frame?.sequence).toBe(2);
    expect(event.payload).toEqual({ hands: [] });
  });
});
