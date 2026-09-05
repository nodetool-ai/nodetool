/**
 * The shapes an agent authoring a cut actually sends.
 *
 * Each case here is a call a real run made and the surface refused or silently
 * dropped: a shape clip with no `shape` object, timing sent to
 * `set_clip_params`, a custom animation nested under `custom`.
 */
import { describe, expect, it } from "vitest";
import { createTimelineToolBridge } from "../src/evals/surfaces/timeline.js";
import type { HeadlessTool } from "../src/evals/tool-loop-bridge.js";

function bridge() {
  const b = createTimelineToolBridge({
    tracks: [{ type: "video" }],
    clips: [
      {
        name: "shot",
        trackIndex: 0,
        mediaType: "video",
        startMs: 0,
        durationMs: 4000
      }
    ]
  });
  const byName: Record<string, HeadlessTool> = Object.fromEntries(
    b.tools.map((t) => [t.name, t])
  );
  return { b, byName };
}

const clipOf = (result: unknown): Record<string, unknown> =>
  (result as { clip: Record<string, unknown> }).clip;

describe("ui_timeline_add_shape_clip", () => {
  it("takes the geometry under shapeStyle", async () => {
    const { byName } = bridge();
    const result = await byName["ui_timeline_add_shape_clip"].execute({
      shapeStyle: {
        kind: "rect",
        fill: "#000000",
        stroke: "#FFFFFF",
        x: 0,
        y: 0.8,
        width: 1,
        height: 0.2
      }
    });
    expect(clipOf(result).shapeStyle).toMatchObject({
      kind: "rect",
      fill: "#000000",
      height: 0.2
    });
  });

  it("reads the geometry keys off the op itself", async () => {
    const { byName } = bridge();
    const result = await byName["ui_timeline_add_shape_clip"].execute({
      kind: "ellipse",
      x: 0.25,
      y: 0.25,
      width: 0.5,
      height: 0.5
    });
    expect(clipOf(result).shapeStyle).toMatchObject({
      kind: "ellipse",
      x: 0.25,
      width: 0.5
    });
  });

  it("defaults to a full-frame rect when nothing names a shape", async () => {
    const { byName } = bridge();
    const result = await byName["ui_timeline_add_shape_clip"].execute({});
    expect(clipOf(result).shapeStyle).toMatchObject({
      kind: "rect",
      x: 0,
      y: 0,
      width: 1,
      height: 1
    });
  });
});

describe("ui_timeline_set_clip_params", () => {
  it("applies startMs and durationMs instead of dropping them", async () => {
    const { b, byName } = bridge();
    await byName["ui_timeline_set_clip_params"].execute({
      target: "shot",
      startMs: 1500,
      durationMs: 2500,
      opacity: 0.5
    });
    expect(b.finalState().documentClips[0]).toMatchObject({
      startMs: 1500,
      durationMs: 2500,
      opacity: 0.5
    });
  });

  it("merges fontSizePx into the clip's textStyle", async () => {
    const { byName } = bridge();
    await byName["ui_timeline_add_text_clip"].execute({ text: "Title" });
    const result = await byName["ui_timeline_set_clip_params"].execute({
      target: "selected",
      fontSizePx: 140
    });
    expect(
      (clipOf(result).textStyle as Record<string, unknown>).fontSizePx
    ).toBe(140);
  });

  /**
   * `{op, target, params: {...}}` is the REST-shaped guess. The fields were
   * refused as one unknown key called `params`, with the real ones hidden a
   * level down inside it.
   */
  it("lifts a patch the caller nested under `params`", async () => {
    const { b, byName } = bridge();
    await byName["ui_timeline_set_clip_params"].execute({
      target: "shot",
      params: { opacity: 0.4, durationMs: 3000 }
    });
    expect(b.finalState().documentClips[0]).toMatchObject({
      opacity: 0.4,
      durationMs: 3000
    });
  });

  it("lets a key on the op itself win over the wrapper's copy", async () => {
    const { b, byName } = bridge();
    await byName["ui_timeline_set_clip_params"].execute({
      target: "shot",
      opacity: 0.9,
      params: { opacity: 0.1 }
    });
    expect(b.finalState().documentClips[0].opacity).toBe(0.9);
  });

  /**
   * A finished title needed one field changed. `textStyle` required the whole
   * bag — text, fontSizePx and color — so a partial failed Zod validation, and
   * re-sending the whole object to get past that is how the fields the caller
   * did not mean to touch get overwritten.
   */
  it("merges a partial textStyle over the one the clip carries", async () => {
    const { byName } = bridge();
    await byName["ui_timeline_add_text_clip"].execute({
      text: "MY MOM IS HOMELESS",
      fontSizePx: 64,
      color: "#ffffff"
    });
    const result = await byName["ui_timeline_set_clip_params"].execute({
      target: "selected",
      textStyle: { fontFamily: "Space Grotesk", fontWeight: 800 }
    });
    expect(clipOf(result).textStyle).toMatchObject({
      text: "MY MOM IS HOMELESS",
      fontSizePx: 64,
      color: "#ffffff",
      fontFamily: "Space Grotesk",
      fontWeight: 800
    });
  });

  it("takes a CSS weight keyword and stores the number the renderer draws", async () => {
    const { byName } = bridge();
    await byName["ui_timeline_add_text_clip"].execute({ text: "TITLE" });
    const result = await byName["ui_timeline_set_clip_params"].execute({
      target: "selected",
      textStyle: { fontWeight: "extrabold" }
    });
    expect(
      (clipOf(result).textStyle as Record<string, unknown>).fontWeight
    ).toBe(800);
  });

  it("says what a patch is still missing on a clip with no text style", async () => {
    const { byName } = bridge();
    await expect(
      byName["ui_timeline_set_clip_params"].execute({
        target: "shot",
        textStyle: { fontFamily: "Space Grotesk" }
      })
    ).rejects.toThrow(/still needs .*(text|color|fontSizePx)/);
  });

  it("refuses a key it does not know, naming the op that does the job", async () => {
    const { byName } = bridge();
    await expect(
      byName["ui_timeline_set_clip_params"].execute({
        target: "shot",
        animations: []
      })
    ).rejects.toThrow(/animate_clip/);
    await expect(
      byName["ui_timeline_set_clip_params"].execute({
        target: "shot",
        wobble: 3
      })
    ).rejects.toThrow(/no `wobble` param/);
  });
});

/**
 * `sans-serif` names no typeface: it is whatever the machine drawing the frame
 * calls its default, so the editor preview, the render and the frame preview
 * each pick their own. It used to be stored and reported afterwards as a
 * `font_not_portable` validator warning — one round trip after the title was
 * already authored.
 */
describe("generic font families", () => {
  it("refuses one on the clip that is being authored", async () => {
    const { byName } = bridge();
    await expect(
      byName["ui_timeline_add_text_clip"].execute({
        text: "TITLE",
        fontFamily: "sans-serif"
      })
    ).rejects.toThrow(/names no typeface[\s\S]*Space Grotesk/);
  });

  it("refuses one on a set_clip_params patch as well", async () => {
    const { byName } = bridge();
    await byName["ui_timeline_add_text_clip"].execute({ text: "TITLE" });
    await expect(
      byName["ui_timeline_set_clip_params"].execute({
        target: "selected",
        textStyle: { fontFamily: "system-ui" }
      })
    ).rejects.toThrow(/names no typeface/);
  });

  it("still takes a named system font, which the validator reports instead", async () => {
    const { byName } = bridge();
    const result = await byName["ui_timeline_add_text_clip"].execute({
      text: "TITLE",
      fontFamily: "Helvetica Neue"
    });
    expect(
      (clipOf(result).textStyle as Record<string, unknown>).fontFamily
    ).toBe("Helvetica Neue");
  });
});

describe("ui_timeline_animate_clip", () => {
  it("lifts a custom animation nested under `custom`", async () => {
    const { b, byName } = bridge();
    await byName["ui_timeline_animate_clip"].execute({
      target: "shot",
      animations: [
        {
          role: "in",
          preset: "custom",
          custom: {
            curves: [
              {
                property: "offsetY",
                keyframes: [
                  { t: 0, value: 160 },
                  { t: 1, value: 0 }
                ]
              }
            ]
          }
        }
      ]
    });
    const animations = b.finalState().documentClips[0].animations ?? [];
    expect(animations).toHaveLength(1);
    expect(animations[0].preset).toBe("custom");
    expect(animations[0].custom?.curves?.[0].property).toBe("offsetY");
  });

  it("prints the accepted shape when a custom animation carries neither", async () => {
    const { byName } = bridge();
    await expect(
      byName["ui_timeline_animate_clip"].execute({
        target: "shot",
        animations: [{ role: "in", preset: "custom" }]
      })
    ).rejects.toThrow(/keyframes: \[\{t: 0, value: 160\}/);
  });
});

describe("authored-clip defaults", () => {
  /**
   * A scrim authored as a translucent rect came back with a hard white 8px
   * border around it: the headless surface defaulted a stroke onto every
   * shape, and the browser one did not.
   */
  it("does not outline a shape the caller filled", async () => {
    const { byName } = bridge();
    const result = await byName["ui_timeline_add_shape_clip"].execute({
      kind: "rect",
      x: 0,
      y: 0.6,
      width: 1,
      height: 0.4,
      fill: "#05070CCC"
    });
    expect(clipOf(result).shapeStyle).toEqual({
      kind: "rect",
      x: 0,
      y: 0.6,
      width: 1,
      height: 0.4,
      fill: "#05070CCC"
    });
  });

  it("still makes an uncoloured shape visible", async () => {
    const { byName } = bridge();
    const result = await byName["ui_timeline_add_shape_clip"].execute({
      kind: "rect"
    });
    expect(clipOf(result).shapeStyle).toMatchObject({ fill: "#FFFFFF" });
  });

  /**
   * `fontSizePx: 120` sent at the top level used to be stripped by the schema,
   * so a title silently reverted to the 96px default.
   */
  it("reads text style keys off the op itself", async () => {
    const { byName } = bridge();
    const result = await byName["ui_timeline_add_text_clip"].execute({
      text: "TITLE",
      fontSizePx: 120,
      color: "#FFD60A"
    });
    expect(clipOf(result).textStyle).toMatchObject({
      text: "TITLE",
      fontSizePx: 120,
      color: "#FFD60A"
    });
  });

  it("lets `style` win over a top-level twin", async () => {
    const { byName } = bridge();
    const result = await byName["ui_timeline_add_text_clip"].execute({
      text: "TITLE",
      fontSizePx: 120,
      style: { fontSizePx: 64 }
    });
    expect(clipOf(result).textStyle).toMatchObject({ fontSizePx: 64 });
  });

  it("refuses a style key it does not know rather than dropping it", async () => {
    const { byName } = bridge();
    expect(() =>
      byName["ui_timeline_add_text_clip"].execute({
        text: "TITLE",
        fontSizePixels: 120
      })
    ).toThrow(/fontSizePixels/);
  });
});

describe("ui_timeline_move_track", () => {
  const trackNames = (result: unknown): string[] =>
    (result as { tracks: { name: string }[] }).tracks.map((t) => t.name);

  /**
   * A picture track added after the overlays covered all of them, and there
   * was no op that could fix it — the only remedy was to author the tracks in
   * reverse.
   */
  it("sends the picture track under the overlays", async () => {
    const { byName } = bridge();
    await byName["ui_timeline_add_track"].execute({
      type: "overlay",
      name: "Titles"
    });
    await byName["ui_timeline_add_track"].execute({
      type: "overlay",
      name: "Scrim"
    });
    const moved = await byName["ui_timeline_move_track"].execute({
      target: "Video 1",
      toIndex: 2
    });
    expect(trackNames(moved)).toEqual(["Titles", "Scrim", "Video 1"]);

    const state = await byName["ui_timeline_get_state"].execute({});
    expect(
      (state as { tracks: { name: string; index: number }[] }).tracks.map(
        (t) => [t.name, t.index]
      )
    ).toEqual([
      ["Titles", 0],
      ["Scrim", 1],
      ["Video 1", 2]
    ]);
  });

  it("places a track relative to another by name", async () => {
    const { byName } = bridge();
    await byName["ui_timeline_add_track"].execute({
      type: "overlay",
      name: "Titles"
    });
    const moved = await byName["ui_timeline_move_track"].execute({
      target: "Titles",
      before: "Video 1"
    });
    expect(trackNames(moved)).toEqual(["Titles", "Video 1"]);
  });

  it("says what it needs when no destination is given", async () => {
    const { byName } = bridge();
    await expect(
      byName["ui_timeline_move_track"].execute({ target: "Video 1" })
    ).rejects.toThrow(/toIndex/);
  });

  /**
   * `add_media_clip` takes `trackId`, so a caller reaching for `move_track`
   * right after it sends `{trackId, index}` — refused by name, one round trip
   * per guess.
   */
  it("takes the trackId/index spelling as target/toIndex", async () => {
    const { byName } = bridge();
    await byName["ui_timeline_add_track"].execute({
      type: "overlay",
      name: "Titles"
    });
    const moved = await byName["ui_timeline_move_track"].execute({
      trackId: "Video 1",
      index: 1
    });
    expect(trackNames(moved)).toEqual(["Titles", "Video 1"]);
  });

  it("names the track it cannot find a destination for", async () => {
    const { byName } = bridge();
    await expect(
      byName["ui_timeline_move_track"].execute({ trackId: "Video 1" })
    ).rejects.toThrow(/destination for "Video 1"/);
  });
});

describe("clip opacity at creation", () => {
  it("takes opacity on add_shape_clip", async () => {
    const { b, byName } = bridge();
    await byName["ui_timeline_add_shape_clip"].execute({
      kind: "rect",
      fill: "#05070C",
      opacity: 0.6
    });
    expect(b.finalState().documentClips.at(-1)?.opacity).toBe(0.6);
  });

  it("takes opacity on add_text_clip", async () => {
    const { b, byName } = bridge();
    await byName["ui_timeline_add_text_clip"].execute({
      text: "TITLE",
      opacity: 0.25
    });
    expect(b.finalState().documentClips.at(-1)?.opacity).toBe(0.25);
  });

  it("reports it back on the clip, so the value can be read", async () => {
    const { byName } = bridge();
    const result = await byName["ui_timeline_add_shape_clip"].execute({
      kind: "rect",
      opacity: 0.4
    });
    expect(clipOf(result).opacity).toBe(0.4);
  });

  it("refuses an opacity outside 0..1 rather than storing it", () => {
    const { byName } = bridge();
    expect(() =>
      byName["ui_timeline_add_shape_clip"].execute({ kind: "rect", opacity: 4 })
    ).toThrow(/opacity/);
  });
});


/**
 * The 10-second social ad that produced these cases: eight clips, three of
 * them refused for a zero offset, one of them drawn white over the whole frame
 * because the geometry and the fill arrived in different bags, and a track
 * added by mistake that could not be taken back.
 */
describe("ui_timeline_delete_track", () => {
  it("removes an empty track and closes the stack over it", async () => {
    const { b, byName } = bridge();
    await byName["ui_timeline_add_track"].execute({ type: "overlay" });
    const before = await byName["ui_timeline_get_state"].execute({});
    expect((before as { tracks: unknown[] }).tracks).toHaveLength(2);

    const result = (await byName["ui_timeline_delete_track"].execute({
      target: "Overlay 2"
    })) as { deleted: { name: string }; tracks: Array<{ index: number }> };

    expect(result.deleted.name).toBe("Overlay 2");
    expect(result.tracks.map((t) => t.index)).toEqual([0]);
    expect(b.finalState().tracks).toHaveLength(1);
  });

  it("refuses to take clips with it unless told to", async () => {
    const { byName } = bridge();
    await expect(
      byName["ui_timeline_delete_track"].execute({ trackId: "Video 1" })
    ).rejects.toThrow(/still holds 1 clip/);
  });

  it("deletes the clips when told to, and drops them from the selection", async () => {
    const { b, byName } = bridge();
    await byName["ui_timeline_select_clip"].execute({ target: "shot" });
    const result = (await byName["ui_timeline_delete_track"].execute({
      trackId: "Video 1",
      deleteClips: true
    })) as { deletedClipIds: string[] };

    expect(result.deletedClipIds).toHaveLength(1);
    expect(b.finalState().clips).toHaveLength(0);
    const state = (await byName["ui_timeline_get_state"].execute({})) as {
      selectedClipIds: string[];
    };
    expect(state.selectedClipIds).toEqual([]);
  });
});

describe("ui_timeline_add_text_clip", () => {
  it("takes a drop shadow without its zero offsets", async () => {
    const { byName } = bridge();
    const result = await byName["ui_timeline_add_text_clip"].execute({
      text: "Build AI",
      fontSizePx: 150,
      color: "#FFFFFF",
      shadow: { color: "#000000", blurPx: 24 }
    });
    expect(
      (clipOf(result).textStyle as { shadow: unknown }).shadow
    ).toEqual({ color: "#000000", blurPx: 24, offsetX: 0, offsetY: 0 });
  });

  it("sends a caller reaching for x/y to the anchors", async () => {
    const { byName } = bridge();
    expect(() =>
      byName["ui_timeline_add_text_clip"].execute({
        text: "Build AI",
        x: 0.5,
        y: 0.42
      })
    ).toThrow(/verticalAlign/);
  });

  it("refuses a misspelled key inside a style bag instead of dropping it", async () => {
    const { byName } = bridge();
    expect(() =>
      byName["ui_timeline_add_text_clip"].execute({
        text: "Start building — free",
        background: { color: "#FFFFFF", paddingPx: 34, cornerRadius: 40 }
      })
    ).toThrow(/radiusPx/);
  });
});

describe("ui_timeline_add_shape_clip merges the bags", () => {
  it("refuses a geometry key spelled wrong inside `shape`", () => {
    const { byName } = bridge();
    expect(() =>
      byName["ui_timeline_add_shape_clip"].execute({
        shape: { kind: "rect", fill: "#6D5EF6", radius: 8 }
      })
    ).toThrow(/radius/);
  });


  it("keeps the fill from `shape` and the box from the op", async () => {
    const { byName } = bridge();
    const result = await byName["ui_timeline_add_shape_clip"].execute({
      shape: { kind: "rect", fill: "#0B0E1A" },
      x: 0,
      y: 0,
      width: 1,
      height: 0.5
    });
    expect(clipOf(result).shapeStyle).toEqual({
      kind: "rect",
      fill: "#0B0E1A",
      x: 0,
      y: 0,
      width: 1,
      height: 0.5
    });
  });
});
