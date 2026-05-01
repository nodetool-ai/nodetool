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

  it("does not overlap ticks while a slow send is still in flight", async () => {
    const bus = new RealtimeMediaBus();
    let active = 0;
    let peakConcurrent = 0;
    const pendingResolvers: Array<() => void> = [];
    const sendMessage = vi.fn(() => {
      active++;
      peakConcurrent = Math.max(peakConcurrent, active);
      return new Promise<void>((resolve) => {
        pendingResolvers.push(() => {
          active--;
          resolve();
        });
      });
    });

    const sender = new RealtimeFrameSender({
      bus,
      intervalMs: 10,
      sendMessage
    });

    sender.startSession("sid", {
      jobId: "j1",
      workflowId: "w1",
      sinks: [{ nodeId: "sink1", handle: "frame" }]
    });

    bus.setOutput("sid", "sink1", "frame", mkFrame(1));
    await vi.advanceTimersByTimeAsync(10);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(peakConcurrent).toBe(1);

    await vi.advanceTimersByTimeAsync(100);
    expect(sendMessage).toHaveBeenCalledTimes(1);

    pendingResolvers.shift()?.();
    await Promise.resolve();

    sender.stopSession("sid");
  });
});
