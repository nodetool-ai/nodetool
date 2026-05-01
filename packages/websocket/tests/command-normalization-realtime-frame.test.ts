import { describe, expect, it } from "vitest";
import { normalizeRealtimeVideoFrame } from "../src/realtime/command-normalization.js";

describe("normalizeRealtimeVideoFrame", () => {
  it("accepts JPEG bitstreams and pins stride to byte length", () => {
    const jpegMinimal = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const out = normalizeRealtimeVideoFrame({
      type: "realtime_video_frame",
      data: jpegMinimal,
      width: 320,
      height: 240,
      stride: 999,
      pixel_format: "jpeg",
      timestamp_ns: 0,
      sequence: 3
    });
    expect(out.pixel_format).toBe("jpeg");
    expect(out.stride).toBe(jpegMinimal.byteLength);
    expect(out.sequence).toBe(3);
  });

  it("rejects non-JPEG bytes for jpeg pixel_format", () => {
    expect(() =>
      normalizeRealtimeVideoFrame({
        type: "realtime_video_frame",
        data: new Uint8Array([1, 2, 3, 4]),
        width: 1,
        height: 1,
        stride: 4,
        pixel_format: "jpeg",
        timestamp_ns: 0,
        sequence: 1
      })
    ).toThrow(/JPEG/);
  });
});
