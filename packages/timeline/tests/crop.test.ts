import { describe, expect, it } from "vitest";
import { cropRectPx, hasCrop, isCropUsable } from "../src/crop.js";
import { splitClip } from "../src/splitClip.js";
import { trimClip } from "../src/trimClip.js";
import type { ClipCrop, TimelineClip } from "../src/types.js";

const crop = (
  left: number,
  right: number,
  top: number,
  bottom: number
): ClipCrop => ({ left, right, top, bottom });

function makeClip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return {
    id: "clip-1",
    trackId: "track-1",
    name: "Shot",
    startMs: 0,
    durationMs: 1000,
    inPointMs: 0,
    outPointMs: 1000,
    mediaType: "video",
    sourceType: "imported",
    status: "generated",
    locked: false,
    versions: [],
    ...overrides
  };
}

describe("hasCrop", () => {
  it("is false for absent, zero and sub-epsilon insets", () => {
    expect(hasCrop(undefined)).toBe(false);
    expect(hasCrop(crop(0, 0, 0, 0))).toBe(false);
    // A drag that rounded to nothing is not an edit.
    expect(hasCrop(crop(1e-6, 0, 0, 0))).toBe(false);
  });

  it("is true once any edge is actually inset", () => {
    expect(hasCrop(crop(0.1, 0, 0, 0))).toBe(true);
    expect(hasCrop(crop(0, 0, 0, 0.25))).toBe(true);
  });

  it("is false for insets that keep no picture", () => {
    expect(hasCrop(crop(0.6, 0.6, 0, 0))).toBe(false);
    expect(hasCrop(crop(0, 0, 0.5, 0.5))).toBe(false);
  });
});

describe("isCropUsable", () => {
  it("accepts a pair that leaves picture and refuses one that does not", () => {
    expect(isCropUsable(crop(0.25, 0.25, 0.25, 0.25))).toBe(true);
    expect(isCropUsable(crop(0.5, 0.5, 0, 0))).toBe(false);
    expect(isCropUsable(crop(0, 0, 0.99, 0.02))).toBe(false);
  });

  it("refuses negative and non-finite insets", () => {
    expect(isCropUsable(crop(-0.1, 0, 0, 0))).toBe(false);
    expect(isCropUsable(crop(Number.NaN, 0, 0, 0))).toBe(false);
    expect(isCropUsable(crop(0, Number.POSITIVE_INFINITY, 0, 0))).toBe(false);
  });
});

describe("cropRectPx", () => {
  it("returns the whole source when there is nothing to crop", () => {
    expect(cropRectPx(undefined, 1920, 1080)).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080
    });
  });

  it("keeps the middle half of the width", () => {
    expect(cropRectPx(crop(0.25, 0.25, 0, 0), 1920, 1080)).toEqual({
      x: 480,
      y: 0,
      width: 960,
      height: 1080
    });
  });

  it("crops 16:9 to a centred square", () => {
    // (1920 - 1080) / 2 / 1920 = 0.21875 off each side.
    const rect = cropRectPx(crop(0.21875, 0.21875, 0, 0), 1920, 1080);
    expect(rect).toEqual({ x: 420, y: 0, width: 1080, height: 1080 });
  });

  it("never leaves the source, whatever the insets round to", () => {
    for (const c of [
      crop(0.999, 0, 0, 0),
      crop(0, 0.999, 0, 0),
      crop(0.4999, 0.4999, 0.4999, 0.4999)
    ]) {
      const rect = cropRectPx(c, 101, 57);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(101);
      expect(rect.y + rect.height).toBeLessThanOrEqual(57);
    }
  });

  it("falls back to the whole source rather than blanking the shot", () => {
    expect(cropRectPx(crop(0.7, 0.7, 0, 0), 640, 480)).toEqual({
      x: 0,
      y: 0,
      width: 640,
      height: 480
    });
  });

  it("answers with the whole source for a zero-sized source", () => {
    expect(cropRectPx(crop(0.25, 0.25, 0, 0), 0, 0)).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0
    });
  });
});

describe("a crop survives a window edit", () => {
  // The crop is source-space and says nothing about time, so trimming and
  // splitting carry it across untouched — the same argument `generatedMatte`
  // makes for sharing the clip's in-point.
  it("is kept by trimClip", () => {
    const clip = makeClip({ crop: crop(0.1, 0.2, 0, 0) });
    const trimmed = trimClip(clip, "start", -200, 10_000);
    expect(trimmed.crop).toEqual(crop(0.1, 0.2, 0, 0));
  });

  it("is kept by both halves of splitClip", () => {
    const clip = makeClip({ crop: crop(0.1, 0.2, 0.05, 0) });
    const [left, right] = splitClip(clip, 400);
    expect(left.crop).toEqual(crop(0.1, 0.2, 0.05, 0));
    expect(right.crop).toEqual(crop(0.1, 0.2, 0.05, 0));
  });
});
