import { describe, expect, it } from "vitest";
import type { VideoFrame } from "@nodetool/protocol";
import {
  RealtimeMediaBus,
  realtimeIngressSequenceSignature
} from "../src/realtime/media-bus.js";

function mkFrame(seq: number): VideoFrame {
  return {
    type: "realtime_video_frame",
    data: new Uint8Array([seq % 255]),
    width: 1,
    height: 1,
    stride: 4,
    pixel_format: "rgba8",
    timestamp_ns: seq,
    sequence: seq
  };
}

describe("RealtimeMediaBus", () => {
  it("counts dropped frames when overwriting the same slot (latest-wins)", () => {
    const bus = new RealtimeMediaBus();
    const sessionId = "s1";
    for (let i = 1; i <= 1000; i++) {
      bus.setInput(sessionId, "n1", "frame", mkFrame(i));
    }
    const m = bus.metrics(sessionId);
    expect(m.inputs["n1:frame"]?.framesAccepted).toBe(1000);
    expect(m.inputs["n1:frame"]?.framesDropped).toBe(999);
  });

  it("realtimeIngressSequenceSignature reflects sorted ingress slot sequences", () => {
    const bus = new RealtimeMediaBus();
    const sessionId = "s1";
    bus.setInput(sessionId, "b", "h", mkFrame(1));
    bus.setInput(sessionId, "a", "h", mkFrame(2));
    expect(realtimeIngressSequenceSignature(bus, sessionId)).toBe(
      "a:h:1|b:h:1"
    );
    bus.setInput(sessionId, "a", "h", mkFrame(3));
    expect(realtimeIngressSequenceSignature(bus, sessionId)).toBe(
      "a:h:2|b:h:1"
    );
  });
});
