import { describe, expect, it, vi } from "vitest";
import {
  buildVideoClipsFromRefs,
  clampClipEnd,
  readClipEnd,
  readClipStart
} from "../src/video-clip.js";

describe("video-clip helpers", () => {
  it("reads clipStart and clipEnd from metadata", () => {
    const item = {
      type: "video",
      uri: "asset://clip.mp4",
      metadata: { clipStart: 2, clipEnd: 7 }
    };
    expect(readClipStart(item)).toBe(2);
    expect(readClipEnd(item, 2)).toBe(7);
  });

  it("defaults clip range when metadata is missing", () => {
    const item = {
      type: "video",
      uri: "asset://clip.mp4",
      duration: 15
    };
    expect(readClipStart(item)).toBe(0);
    expect(readClipEnd(item)).toBe(10);
  });

  it("clamps clip end to max span", () => {
    expect(clampClipEnd(0, 25)).toBe(10);
    expect(clampClipEnd(5, 6)).toBe(6);
  });

  it("builds clips from refs with trim metadata", async () => {
    const upload = vi.fn(async () => "https://cdn.example.com/source.mp4");
    const clips = await buildVideoClipsFromRefs(upload, [
      {
        type: "video",
        uri: "asset://clip.mp4",
        metadata: { clipStart: 1, clipEnd: 6 }
      }
    ]);

    expect(upload).toHaveBeenCalledOnce();
    expect(clips).toEqual([
      { url: "https://cdn.example.com/source.mp4", start: 1, ends: 6 }
    ]);
  });

  it("passes through prebuilt clip objects", async () => {
    const upload = vi.fn();
    const clips = await buildVideoClipsFromRefs(upload, [
      { url: "https://example.com/source.mp4", start: 0, ends: 8 }
    ]);

    expect(upload).not.toHaveBeenCalled();
    expect(clips).toEqual([
      { url: "https://example.com/source.mp4", start: 0, ends: 8 }
    ]);
  });
});
