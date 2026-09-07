/**
 * Video-pool slot keys.
 *
 * The case that forced the key to carry the asset: a clip with a generated
 * matte (D2) yields two video layers with the SAME clip id — its picture and
 * the luma mask cut from the same source. Keyed by clip id alone they shared
 * one `<video>`, so the compositor read the picture where it wanted the mask.
 */

import {
  bindVideoSlots,
  videoSlotKey,
  type VideoSlotBinding
} from "../videoSlotPool";

const HOT = 4;

describe("bindVideoSlots", () => {
  it("gives a clip's picture and its matte a slot each", () => {
    const bindings = new Map<string, VideoSlotBinding>();
    const used = bindVideoSlots(
      [
        { clipId: "shot", assetUrl: "https://cdn/mask.mp4" },
        { clipId: "shot", assetUrl: "https://cdn/picture.mp4" }
      ],
      bindings,
      HOT
    );

    expect(bindings.size).toBe(2);
    expect(used.size).toBe(2);
    const picture = bindings.get(videoSlotKey("shot", "https://cdn/picture.mp4"));
    const matte = bindings.get(videoSlotKey("shot", "https://cdn/mask.mp4"));
    expect(picture?.index).not.toBe(matte?.index);
    // Both still name the clip: the seek math is the clip's, not the asset's.
    expect(picture?.clipId).toBe("shot");
    expect(matte?.clipId).toBe("shot");
  });

  it("keeps an existing binding rather than reloading its element", () => {
    const bindings = new Map<string, VideoSlotBinding>();
    bindVideoSlots([{ clipId: "a", assetUrl: "u-a" }], bindings, HOT);
    const first = bindings.get(videoSlotKey("a", "u-a"))?.index;

    bindVideoSlots(
      [
        { clipId: "b", assetUrl: "u-b" },
        { clipId: "a", assetUrl: "u-a" }
      ],
      bindings,
      HOT
    );

    expect(bindings.get(videoSlotKey("a", "u-a"))?.index).toBe(first);
  });

  it("frees the slot of a pair that is no longer active", () => {
    const bindings = new Map<string, VideoSlotBinding>();
    bindVideoSlots([{ clipId: "a", assetUrl: "u-a" }], bindings, HOT);

    const used = bindVideoSlots(
      [{ clipId: "b", assetUrl: "u-b" }],
      bindings,
      HOT
    );

    expect(bindings.has(videoSlotKey("a", "u-a"))).toBe(false);
    expect(used).toEqual(new Set([0]));
  });

  it("re-binds a clip whose asset changed under it", () => {
    const bindings = new Map<string, VideoSlotBinding>();
    bindVideoSlots([{ clipId: "a", assetUrl: "old" }], bindings, HOT);

    bindVideoSlots([{ clipId: "a", assetUrl: "new" }], bindings, HOT);

    expect([...bindings.keys()]).toEqual([videoSlotKey("a", "new")]);
  });

  it("leaves a request unbound once the hot pool is full", () => {
    const bindings = new Map<string, VideoSlotBinding>();
    const requests = Array.from({ length: HOT + 1 }, (_, i) => ({
      clipId: `c${i}`,
      assetUrl: `u${i}`
    }));

    const used = bindVideoSlots(requests, bindings, HOT);

    expect(bindings.size).toBe(HOT);
    expect(used.size).toBe(HOT);
    expect(bindings.has(videoSlotKey(`c${HOT}`, `u${HOT}`))).toBe(false);
  });
});
