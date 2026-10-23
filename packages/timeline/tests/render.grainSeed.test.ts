import { describe, expect, it } from "vitest";
import { makeClip, makeTrack } from "../src/index.js";
import type { ClipEffect, TimelineClip } from "../src/types.js";
import { computeActiveLayersWithHorizon, resolveAnimatedLayerProps } from "../src/render/sceneModel.js";

const effects: ClipEffect[] = [
  { id: "grain", type: "grain", enabled: true, amount: 0.25, animate: true, seed: 9 }
];

function seedAt(timeMs: number, fps: number, overrides: Partial<TimelineClip> = {}): number | undefined {
  const clip = makeClip({ mediaType: "shape", durationMs: 1000, effects, ...overrides });
  const canvas = { width: 1920, height: 1080, fps };
  const effect = resolveAnimatedLayerProps({ clip, opacity: 1 }, timeMs, canvas).effects?.[0];
  return effect?.type === "grain" ? effect.seed : undefined;
}

describe("animated grain sequence frame seed", () => {
  it.each([24, 25, 30, 60, 24000 / 1001])("holds the pattern within each %s fps sequence frame", (fps) => {
    const frameMs = 1000 / fps;
    expect(seedAt(frameMs * 2.1, fps)).toBe(2);
    expect(seedAt(frameMs * 2.9, fps)).toBe(2);
    expect(seedAt(frameMs * 3.1, fps)).toBe(3);
    expect(seedAt(frameMs * 2.1, fps)).toBe(2);
  });

  it("uses the sequence clock even when the clip animation steps at a lower rate", () => {
    expect(seedAt(50, 24, { steppedTime: { fps: 6 } })).toBe(1);
    expect(seedAt(90, 24, { steppedTime: { fps: 6 } })).toBe(2);
  });

  it("keeps the stored seed when animation is off", () => {
    const fixed: ClipEffect[] = [{ id: "grain", type: "grain", enabled: true, amount: 0.25, animate: false, seed: 17 }];
    expect(seedAt(50, 24, { effects: fixed })).toBe(17);
    expect(seedAt(90, 24, { effects: fixed })).toBe(17);
  });

  it("quantizes adjustment and group grain with the same sequence fps", () => {
    const track = makeTrack({ type: "video" });
    const group = makeClip({ id: "group", trackId: track.id, mediaType: "group", durationMs: 1000, effects });
    const child = makeClip({ trackId: track.id, parentId: group.id, mediaType: "shape", durationMs: 1000 });
    const adjustment = makeClip({ trackId: track.id, mediaType: "adjustment", durationMs: 1000, effects });
    for (const timeMs of [50, 70]) {
      const scene = computeActiveLayersWithHorizon([track], [group, child, adjustment], timeMs, {
        canvas: { width: 1920, height: 1080, fps: 24 }
      });
      const adjustmentGrain = scene.adjustments[0]?.effects[0];
      const groupGrain = scene.precomposites[0]?.effects?.[0];
      expect(adjustmentGrain?.type === "grain" && adjustmentGrain.seed).toBe(1);
      expect(groupGrain?.type === "grain" && groupGrain.seed).toBe(1);
    }
  });
});
