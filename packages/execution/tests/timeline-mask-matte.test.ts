/**
 * The two ways a mask or a matte can be wired so the renderer quietly ignores
 * it (D6), each with the fixture that triggers the code (I12) and a control the
 * check must stay quiet on.
 *
 * `mask_path_invalid` is a warning: the layer draws unmasked, which is a
 * picture with too much in it rather than no picture. `matte_source_missing` is
 * an error: the whole point of a matte is that something else decides what
 * shows, and a layer that draws unmatted shows everything the matte was there
 * to hide.
 */
import { describe, expect, it } from "vitest";

import { validateTimelineSequence } from "../src/timeline-debug/index.js";

type Json = Record<string, unknown>;

const clip = (over: Json): Json => ({
  trackId: "track-1",
  name: "Clip",
  startMs: 0,
  durationMs: 1000,
  mediaType: "video",
  sourceType: "imported",
  status: "generated",
  locked: false,
  versions: [],
  ...over
});

const doc = (clips: Json[]): Json => ({
  tracks: [
    {
      id: "track-1",
      name: "Video 1",
      type: "video",
      index: 0,
      visible: true,
      locked: false
    }
  ],
  clips,
  markers: []
});

const codesOf = (issues: ReadonlyArray<{ code: string }>): string[] =>
  issues.map((issue) => issue.code);

describe("validateTimelineSequence — masks", () => {
  it("accepts the three kinds it rasterizes", () => {
    const result = validateTimelineSequence(
      doc([
        clip({ id: "a", mask: { kind: "rect", x: 0.1, width: 0.5 } }),
        clip({ id: "b", mask: { kind: "ellipse", featherPx: 6, invert: true } }),
        clip({ id: "c", mask: { kind: "path", d: "M 0 0 L 1 0 l 0 1 Z" } })
      ])
    );
    expect(result.warnings.filter((w) => w.code === "mask_path_invalid")).toEqual(
      []
    );
    expect(result.ok).toBe(true);
  });

  it("reports mask_path_invalid for a kind it cannot rasterize", () => {
    const result = validateTimelineSequence(
      doc([clip({ id: "a", name: "Title", mask: { kind: "star" } })])
    );
    expect(codesOf(result.warnings)).toContain("mask_path_invalid");
    const issue = result.warnings.find((w) => w.code === "mask_path_invalid");
    expect(issue?.message).toContain("star");
    expect(issue?.path).toBe("mask.kind");
    expect(issue?.clipId).toBe("a");
  });

  it("reports mask_path_invalid for path data it cannot parse", () => {
    const result = validateTimelineSequence(
      doc([
        clip({ id: "a", name: "Title", mask: { kind: "path", d: "M 0 0 A 1 1 0 0 1 1 1" } })
      ])
    );
    const issue = result.warnings.find((w) => w.code === "mask_path_invalid");
    expect(issue?.path).toBe("mask.d");
    expect(issue?.message).toContain("unexpected");
  });

  it("reports mask_path_invalid for a path mask carrying no data at all", () => {
    const result = validateTimelineSequence(
      doc([clip({ id: "a", mask: { kind: "path" } })])
    );
    expect(codesOf(result.warnings)).toContain("mask_path_invalid");
  });

  it("says nothing about a clip with no mask", () => {
    const result = validateTimelineSequence(doc([clip({ id: "a" })]));
    expect(codesOf(result.warnings)).not.toContain("mask_path_invalid");
  });
});

describe("validateTimelineSequence — mattes", () => {
  it("accepts a matte naming another clip", () => {
    const result = validateTimelineSequence(
      doc([
        clip({ id: "shot", matte: { sourceClipId: "key", mode: "luma" } }),
        clip({ id: "key" })
      ])
    );
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("reports matte_source_missing for a source no clip carries", () => {
    const result = validateTimelineSequence(
      doc([
        clip({ id: "shot", name: "Shot 1", matte: { sourceClipId: "gone", mode: "alpha" } })
      ])
    );
    expect(codesOf(result.errors)).toEqual(["matte_source_missing"]);
    expect(result.errors[0]?.message).toContain("gone");
    expect(result.errors[0]?.path).toBe("matte.sourceClipId");
    expect(result.errors[0]?.clipId).toBe("shot");
    expect(result.ok).toBe(false);
  });

  it("reports matte_source_missing for a clip matted by itself", () => {
    const result = validateTimelineSequence(
      doc([clip({ id: "shot", matte: { sourceClipId: "shot", mode: "alpha" } })])
    );
    expect(codesOf(result.errors)).toEqual(["matte_source_missing"]);
    expect(result.errors[0]?.message).toContain("never draws itself");
  });

  it("says nothing about a clip with no matte", () => {
    const result = validateTimelineSequence(doc([clip({ id: "shot" })]));
    expect(result.errors).toEqual([]);
  });
});
