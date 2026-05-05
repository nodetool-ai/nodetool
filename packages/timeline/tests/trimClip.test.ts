import { describe, expect, it } from "vitest";
import { trimClip } from "../src/trimClip.js";
import type { TimelineClip } from "../src/types.js";

function makeBaseClip(): TimelineClip {
  return {
    id: "clip-1",
    trackId: "track-1",
    name: "Base clip",
    startMs: 1000,
    durationMs: 400,
    inPointMs: 200,
    outPointMs: 600,
    mediaType: "video",
    sourceType: "generated",
    dependencyHash: "dep-hash",
    lastGeneratedHash: "last-hash",
    currentAssetId: "asset-1",
    status: "generated",
    locked: false,
    versions: []
  };
}

describe("trimClip", () => {
  it("shrinks and grows from the start edge", () => {
    const clip = makeBaseClip();

    const shrunk = trimClip(clip, "start", -100, 1000);
    expect(shrunk.startMs).toBe(1100);
    expect(shrunk.durationMs).toBe(300);
    expect(shrunk.inPointMs).toBe(300);
    expect(shrunk.outPointMs).toBe(600);

    const grown = trimClip(clip, "start", 100, 1000);
    expect(grown.startMs).toBe(900);
    expect(grown.durationMs).toBe(500);
    expect(grown.inPointMs).toBe(100);
    expect(grown.outPointMs).toBe(600);
  });

  it("shrinks and grows from the end edge", () => {
    const clip = makeBaseClip();

    const shrunk = trimClip(clip, "end", -100, 1000);
    expect(shrunk.startMs).toBe(1000);
    expect(shrunk.durationMs).toBe(300);
    expect(shrunk.inPointMs).toBe(200);
    expect(shrunk.outPointMs).toBe(500);

    const grown = trimClip(clip, "end", 100, 1000);
    expect(grown.startMs).toBe(1000);
    expect(grown.durationMs).toBe(500);
    expect(grown.inPointMs).toBe(200);
    expect(grown.outPointMs).toBe(700);
  });

  it("throws when trim would result in zero or negative duration", () => {
    const clip = makeBaseClip();
    expect(() => trimClip(clip, "end", -400, 1000)).toThrow(/non-positive duration/);
    expect(() => trimClip(clip, "start", -500, 1000)).toThrow(/non-positive duration/);
  });

  it("throws when extending beyond source bounds", () => {
    const clip = makeBaseClip();

    expect(() => trimClip(clip, "start", 250, 1000)).toThrow(/before source start/);
    expect(() => trimClip(clip, "end", 500, 900)).toThrow(/beyond source out-point/);
  });

  it("preserves generation hash fields", () => {
    const clip = makeBaseClip();
    const trimmed = trimClip(clip, "end", -50, 1000);

    expect(trimmed.dependencyHash).toBe(clip.dependencyHash);
    expect(trimmed.lastGeneratedHash).toBe(clip.lastGeneratedHash);
  });
});
