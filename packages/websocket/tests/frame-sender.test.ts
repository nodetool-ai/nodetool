import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoFrame } from "@nodetool/protocol";
import { RealtimeMediaBus } from "../src/realtime/media-bus.js";
import { RealtimeFrameSender } from "../src/realtime/frame-sender.js";

function mkFrame(seq: number): VideoFrame {
  return {
    type: "realtime_video_frame",
    data: new Uint8Array([3]),
    width: 1,
    height: 1,
    stride: 4,
    pixel_format: "rgba8",
    timestamp_ns: seq,
    sequence: seq
  };
}

describe("RealtimeFrameSender", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends realtime_frame_out on the media lane when the bus sequence advances", async () => {
    const bus = new RealtimeMediaBus();
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const sender = new RealtimeFrameSender({
      bus,
      intervalMs: 50,
      sendMessage
    });

    sender.startSession("sid", {
      jobId: "j1",
      workflowId: "w1",
      sinks: [{ nodeId: "sink1", handle: "frame" }]
    });

    bus.setOutput("sid", "sink1", "frame", mkFrame(1));
    await vi.advanceTimersByTimeAsync(50);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][1]).toEqual({ lane: "media" });

    sender.stopSession("sid");
  });
});
