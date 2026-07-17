/**
 * Unit tests for pure helpers that need no child_process mock:
 * cropdetect stderr parsing and the missing-binary error class.
 */
import { describe, it, expect } from "vitest";
import { parseCropDetectCrop } from "@nodetool-ai/video-nodes";

describe("parseCropDetectCrop", () => {
  it("returns the LAST crop suggestion from cropdetect stderr", () => {
    const stderr = [
      "[Parsed_cropdetect_1 @ 0x1] x1:0 x2:1919 y1:10 y2:1069 crop=1920:1060:0:10",
      "[Parsed_cropdetect_1 @ 0x1] x1:0 x2:1919 y1:12 y2:1067 crop=1920:1056:0:12"
    ].join("\n");
    expect(parseCropDetectCrop(stderr)).toBe("1920:1056:0:12");
  });

  it("returns null when no crop suggestion is present", () => {
    expect(parseCropDetectCrop("frame= 100 fps=25 no crops here")).toBeNull();
    expect(parseCropDetectCrop("")).toBeNull();
  });

  it("parses a single suggestion", () => {
    expect(parseCropDetectCrop("... crop=640:480:0:0 ...")).toBe("640:480:0:0");
  });
});
