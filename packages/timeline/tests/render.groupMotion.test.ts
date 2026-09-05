/**
 * A still child of a moving group is a moving layer: the static-frame shortcut
 * must see the ancestor's animation, or motion blur is dropped on exactly the
 * clips a group exists to move together.
 */
import { describe, expect, it } from "vitest";
import { makeClip, makeTrack } from "../src/index.js";
import type { TimelineClip, TimelineTrack } from "../src/index.js";
import {
  computeActiveLayersWithHorizon,
  hasActiveAnimation
} from "../src/render/sceneModel.js";

const canvas = { width: 1920, height: 1080 };
const tracks: TimelineTrack[] = [
  makeTrack({ id: "video", type: "video", index: 0, visible: true })
];

const group: TimelineClip = makeClip({
  id: "group",
  mediaType: "group",
  trackId: "video",
  startMs: 0,
  durationMs: 1000,
  status: "generated",
  animations: [
    { id: "float", role: "loop", preset: "float", durationMs: 600 }
  ]
});
const still: TimelineClip = makeClip({
  id: "still",
  mediaType: "image",
  trackId: "video",
  startMs: 0,
  durationMs: 1000,
  status: "generated",
  currentAssetId: "asset-1",
  parentId: "group"
});

describe("hasActiveAnimation with parented clips", () => {
  it("counts an animated ancestor as motion on a still child", () => {
    const clips = [group, still];
    const { layers } = computeActiveLayersWithHorizon(tracks, clips, 100, {
      canvas
    });
    expect(layers.map((l) => l.clipId)).toEqual(["still"]);
    expect(hasActiveAnimation(layers, 100, canvas, undefined, clips)).toBe(true);
  });

  it("is still when neither the child nor its ancestors animate", () => {
    const quietGroup = { ...group, animations: [] };
    const clips = [quietGroup, still];
    const { layers } = computeActiveLayersWithHorizon(tracks, clips, 100, {
      canvas
    });
    expect(hasActiveAnimation(layers, 100, canvas, undefined, clips)).toBe(false);
  });

  it("counts an animated matte source as motion on the layer it keys", () => {
    const source: TimelineClip = makeClip({
      id: "source",
      mediaType: "image",
      trackId: "video",
      startMs: 0,
      durationMs: 1000,
      status: "generated",
      currentAssetId: "asset-2",
      animations: [{ id: "drift", role: "loop", preset: "float", durationMs: 600 }]
    });
    const fill: TimelineClip = makeClip({
      id: "fill",
      mediaType: "image",
      trackId: "video",
      startMs: 0,
      durationMs: 1000,
      status: "generated",
      currentAssetId: "asset-3",
      matte: { sourceClipId: "source", mode: "alpha" }
    });
    const clips = [source, fill];
    const { layers } = computeActiveLayersWithHorizon(tracks, clips, 100, {
      canvas
    });
    expect(layers.map((l) => l.clipId)).toEqual(["fill"]);
    expect(hasActiveAnimation(layers, 100, canvas, undefined, clips)).toBe(true);
  });
});
