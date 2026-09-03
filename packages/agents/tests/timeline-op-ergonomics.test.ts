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
