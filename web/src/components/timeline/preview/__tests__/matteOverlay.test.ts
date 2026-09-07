/**
 * "Show matte" and the slot keying it shares with the compositor.
 *
 * Both are driven through the real scene model rather than hand-built layers,
 * because the thing under test is exactly what the scene model produces for a
 * clip with a generated matte (D2): two video layers carrying the SAME clip id
 * and different assets — the picture, and the mask nested under it.
 */

import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import type { TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";
import { computeActiveLayers } from "@nodetool-ai/timeline/render";
import type { ActiveLayer } from "@nodetool-ai/timeline/render";

import { matteOnlyLayers } from "../matteOverlay";
import { bindVideoSlots, videoSlotKey } from "../videoSlotPool";
import type { VideoSlotBinding } from "../videoSlotPool";

const CANVAS = { width: 1920, height: 1080 };

const track: TimelineTrack = makeTrack({ id: "v1", type: "video", index: 0 });

const clip = (over: Partial<TimelineClip> = {}): TimelineClip =>
  makeClip({
    id: "shot",
    trackId: "v1",
    mediaType: "video",
    startMs: 0,
    durationMs: 4000,
    inPointMs: 0,
    status: "generated",
    currentAssetId: "picture-asset",
    generatedMatte: {
      assetId: "mask-asset",
      sourceAssetId: "picture-asset",
      sourceRange: { fromMs: 0, toMs: 4000 },
      settings: { model: "General Use (Light)" },
      status: "ready"
    },
    ...over
  });

const sceneAt = (c: TimelineClip): ActiveLayer[] =>
  computeActiveLayers([track], [c], 1000, { canvas: CANVAS });

/** The asset a layer's pixels come from — the pool's half of the slot key. */
const urlOf = (assetId: string | undefined): string => `https://cdn/${assetId}`;

describe("the scene model's generated matte", () => {
  it("yields a picture layer and a mask layer sharing one clip id", () => {
    const layers = sceneAt(clip());
    expect(layers).toHaveLength(1);
    expect(layers[0].assetId).toBe("picture-asset");
    expect(layers[0].matte?.layer.clipId).toBe("shot");
    expect(layers[0].matte?.layer.assetId).toBe("mask-asset");
  });
});

describe("video slots for a matted clip", () => {
  it("binds the picture and the mask to different elements", () => {
    const layers = sceneAt(clip());
    const picture = layers[0];
    const mask = picture.matte!.layer;
    const bindings = new Map<string, VideoSlotBinding>();

    bindVideoSlots(
      [
        { clipId: mask.clipId, assetUrl: urlOf(mask.assetId) },
        { clipId: picture.clipId, assetUrl: urlOf(picture.assetId) }
      ],
      bindings,
      4
    );

    const pictureSlot = bindings.get(
      videoSlotKey(picture.clipId, urlOf(picture.assetId))
    );
    const maskSlot = bindings.get(
      videoSlotKey(mask.clipId, urlOf(mask.assetId))
    );
    expect(pictureSlot).toBeDefined();
    expect(maskSlot).toBeDefined();
    expect(pictureSlot!.index).not.toBe(maskSlot!.index);
  });
});

describe("matteOnlyLayers", () => {
  it("draws the mask alone, unmatted, in the picture's place", () => {
    const layers = sceneAt(clip());
    const only = matteOnlyLayers(layers, "shot");

    expect(only).toHaveLength(1);
    expect(only[0].assetId).toBe("mask-asset");
    expect(only[0].matte).toBeUndefined();
    // Same clip, same placement — it is the frame the keyhole reads.
    expect(only[0].clipId).toBe("shot");
    expect(only[0].transform).toBe(layers[0].transform);
  });

  it("leaves the composite alone with no selection", () => {
    const layers = sceneAt(clip());
    expect(matteOnlyLayers(layers, null)).toBe(layers);
  });

  it("leaves the composite alone for a clip with no ready matte", () => {
    const generating = sceneAt(
      clip({
        generatedMatte: {
          assetId: "mask-asset",
          sourceAssetId: "picture-asset",
          sourceRange: { fromMs: 0, toMs: 4000 },
          settings: {},
          status: "generating"
        }
      })
    );
    expect(generating[0].matte).toBeUndefined();
    expect(matteOnlyLayers(generating, "shot")).toBe(generating);
  });
});
