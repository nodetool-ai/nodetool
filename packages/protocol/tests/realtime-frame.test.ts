import { describe, expect, it } from "vitest";
import type { AudioFrame, RealtimeFrame, VideoFrame } from "../src/index.js";

const frameKind = (frame: RealtimeFrame): "audio" | "video" => {
  switch (frame.type) {
    case "realtime_video_frame":
      return "video";
    case "realtime_audio_frame":
      return "audio";
  }
};

describe("Realtime frame protocol types", () => {
  it("models video frames as raw binary pixel buffers", () => {
    const frame: VideoFrame = {
      type: "realtime_video_frame",
      data: new Uint8Array([255, 0, 0, 255]),
      width: 1,
      height: 1,
      stride: 4,
      pixel_format: "rgba8",
      timestamp_ns: 123_000_000,
      sequence: 7
    };

    expect(frameKind(frame)).toBe("video");
    expect(frame.data).toBeInstanceOf(Uint8Array);
    expect(frame.pixel_format).toBe("rgba8");
  });

  it("allows JPEG-compressed realtime video payloads", () => {
    const frame: VideoFrame = {
      type: "realtime_video_frame",
      data: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      width: 320,
      height: 240,
      stride: 4,
      pixel_format: "jpeg",
      timestamp_ns: 1,
      sequence: 1
    };

    expect(frameKind(frame)).toBe("video");
    expect(frame.pixel_format).toBe("jpeg");
  });

  it("models audio frames as raw PCM chunks", () => {
    const frame: AudioFrame = {
      type: "realtime_audio_frame",
      data: new Uint8Array([0, 0, 255, 127]),
      sample_rate: 48_000,
      channels: 2,
      sample_format: "s16le",
      samples: 1,
      timestamp_ns: 456_000_000,
      sequence: 8
    };

    expect(frameKind(frame)).toBe("audio");
    expect(frame.data).toBeInstanceOf(Uint8Array);
    expect(frame.sample_format).toBe("s16le");
  });
});
