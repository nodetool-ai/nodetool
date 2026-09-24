import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import { computeActiveLayers, computeActiveLayersWithHorizon } from "@nodetool-ai/timeline/render";
import type { ActiveLayer } from "@nodetool-ai/timeline/render";

import { layoutDependsOnAnimatedText, sceneRequiresPerFrameResolution } from "../PreviewCompositor";
import { buildCompositePrecomposites } from "../compositeLayers";

function layer(reframe: boolean): ActiveLayer {
  const clip = makeClip({ id: "shot" });
  if (reframe) {
    clip.reframe = {
      mode: "auto",
      samples: [
        { sourceMs: 0, x: 0.2, y: 0.5 },
        { sourceMs: 1000, x: 0.8, y: 0.5 }
      ]
    };
  }
  return {
    kind: "image",
    clip,
    clipId: "shot",
    trackIndex: 0,
    blendMode: "normal",
    opacity: 1,
    assetId: "asset"
  };
}

describe("Smart Reframe preview scheduling", () => {
  it("resolves reframed still and video layers on every playback frame", () => {
    expect(sceneRequiresPerFrameResolution([layer(true)])).toBe(true);
    expect(sceneRequiresPerFrameResolution([layer(false)])).toBe(false);
  });
});

describe("group transition preview scheduling", () => {
  it("re-resolves a group-only still scene as its transition progresses", () => {
    const video = makeTrack({ id: "video", type: "video", index: 0, visible: true });
    const overlay = makeTrack({ id: "overlay", type: "overlay", index: 1, visible: true });
    const group = makeClip({
      id: "group", trackId: video.id, mediaType: "group", status: "generated",
      startMs: 0, durationMs: 1000,
      transitionIn: { type: "crossfade", durationMs: 400 }
    });
    const child = makeClip({
      id: "child", trackId: overlay.id, parentId: group.id,
      mediaType: "image", currentAssetId: "asset", status: "generated",
      startMs: 0, durationMs: 1000
    });
    const at = (timeMs: number) => computeActiveLayersWithHorizon(
      [video, overlay], [group, child], timeMs,
      { canvas: { width: 100, height: 100 } }
    );
    const first = at(100);
    const firstGroups = buildCompositePrecomposites(first.precomposites);
    expect(first.layers.every((item) => item.transition === undefined)).toBe(true);
    expect(sceneRequiresPerFrameResolution(first.layers, false, firstGroups)).toBe(true);
    const laterGroups = buildCompositePrecomposites(at(300).precomposites);
    expect(firstGroups[0].opacity).toBeCloseTo(0.25);
    expect(laterGroups[0].opacity).toBeCloseTo(0.75);
    expect(first.nextChangeMs).toBe(400);
    expect(buildCompositePrecomposites(at(400).precomposites)[0].transition).toBeUndefined();
  });
});

describe("animated text layout preview scheduling", () => {
  it("re-resolves a fitted plate when its text target changes size", () => {
    const track = makeTrack({ id: "track", type: "video", visible: true });
    const target = makeClip({ id: "title", trackId: track.id, mediaType: "text", status: "generated", startMs: 0, durationMs: 1000, textStyle: { text: "Title", fontSizePx: 20, color: "#fff" }, animations: [{ id: "grow", role: "emphasis", preset: "custom", durationMs: 1000, styleTracks: [{ target: "text.fontSizePx", keyframes: [{ t: 0, value: 20 }, { t: 1, value: 100 }] }] }] });
    const plate = makeClip({ id: "plate", trackId: track.id, mediaType: "shape", status: "generated", startMs: 0, durationMs: 1000, shapeStyle: { kind: "rect", x: 0, y: 0, width: 0.2, height: 0.2 }, layout: { kind: "relative", targetClipId: "title", fitText: { paddingXPx: 10, paddingYPx: 10 } } });
    expect(sceneRequiresPerFrameResolution([{ ...layer(false), clip: plate, clipId: "plate" }], layoutDependsOnAnimatedText([target, plate]))).toBe(true);
    const at = (timeMs: number) => computeActiveLayers([track], [target, plate], timeMs, { canvas: { width: 1000, height: 500 } }).find((candidate) => candidate.clipId === "plate")?.transform?.scale.x;
    expect(at(500)).toBeGreaterThan(at(0) ?? 0);
  });
});
