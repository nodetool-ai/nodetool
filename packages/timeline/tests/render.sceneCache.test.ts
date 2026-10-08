/**
 * Per-document caches in the scene model.
 *
 * Playback resolves the same `clips` array every frame. The scene model keeps
 * what depends only on that array (expanded repeaters, indexes, the flex
 * layout) keyed by its identity, so a frame does no per-document work. These
 * cases pin that a frame hits those caches and that a hit answers exactly what
 * a fresh resolve does.
 */
import { describe, expect, it, vi } from "vitest";
import { makeClip, makeTrack } from "../src/index.js";
import type { TimelineClip } from "../src/index.js";
import { computeActiveLayersWithHorizon } from "../src/render/sceneModel.js";
import { expandTemporalClips } from "../src/render/temporal.js";

const canvas = { width: 1000, height: 500, measureText: (text: string) => text.length * 10 };
const clip = (id: string, overrides: Partial<TimelineClip> = {}): TimelineClip =>
  makeClip({ id, trackId: "track", mediaType: "shape", sourceType: "imported", status: "generated", durationMs: 2000, ...overrides });

function sceneClips(): TimelineClip[] {
  return [
    clip("row", { mediaType: "group", layout: { display: "flex", flexDirection: "row", gap: 10 } }),
    clip("cell-a", { parentId: "row", shapeStyle: { kind: "rect", width: 0.1, height: 0.1, fill: "#fff" } }),
    clip("title", {
      mediaType: "text",
      parentId: "row",
      textStyle: { text: "Serein", fontSizePx: 30, color: "#fff" },
      animations: [{ id: "in", preset: "fade", role: "in", durationMs: 400 }]
    }),
    clip("dots", {
      shapeStyle: { kind: "ellipse", x: 0.1, y: 0.1, width: 0.05, height: 0.05, fill: "#f00" },
      repeater: { count: 4, positionStep: { x: 60, y: 0 }, timeStepMs: 0 }
    })
  ];
}

describe("scene model caches", () => {
  it("expands repeaters once per clips array", () => {
    const clips = sceneClips();
    const first = expandTemporalClips(clips);
    expect(first.length).toBeGreaterThan(clips.length);
    expect(expandTemporalClips(clips)).toBe(first);
    expect(expandTemporalClips([...clips])).not.toBe(first);
  });

  it("builds the flex layout once across a played range", async () => {
    const { default: Yoga } = await import("yoga-layout");
    const buildSpy = vi.spyOn(Yoga.Node, "create");
    const tracks = [makeTrack({ id: "track", index: 0 })];
    const clips = sceneClips();
    try {
      computeActiveLayersWithHorizon(tracks, clips, 0, { canvas });
      const afterFirst = buildSpy.mock.calls.length;
      expect(afterFirst).toBeGreaterThan(0);
      for (let t = 40; t < 2000; t += 40) computeActiveLayersWithHorizon(tracks, clips, t, { canvas });
      expect(buildSpy.mock.calls.length).toBe(afterFirst);
    } finally {
      buildSpy.mockRestore();
    }
  });

  it("answers a cached frame exactly as a fresh resolve does", () => {
    const tracks = [makeTrack({ id: "track", index: 0 })];
    const clips = sceneClips();
    for (const t of [0, 200, 900, 1999]) {
      computeActiveLayersWithHorizon(tracks, clips, t, { canvas });
      const cached = computeActiveLayersWithHorizon(tracks, clips, t, { canvas });
      // A copy of every clip in a new array misses every identity-keyed cache.
      const fresh = computeActiveLayersWithHorizon(tracks, clips.map((c) => ({ ...c })), t, { canvas });
      expect(JSON.parse(JSON.stringify(cached))).toEqual(JSON.parse(JSON.stringify(fresh)));
    }
  });
});
