/**
 * Adjustment clips: a clip that treats the picture beneath it instead of
 * adding one (T23–T25).
 *
 * Two halves, the way `render.precomposite.test.ts` splits them. The scene
 * model decides *what* is treated — which surface, at which z, with which
 * chain — and that half is asserted against the plan records. The Canvas 2D
 * rules decide what lands on the pixels, and that half is asserted against a
 * real `@napi-rs/canvas` context, because "does the grade reach the two layers
 * below and not the one above" is a question only pixels answer. The GPU half
 * of the same claims is `render.adjustment.gpu.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { createCanvas, type Canvas } from "@napi-rs/canvas";
import { timelineClip } from "@nodetool-ai/protocol/api-schemas/timeline.js";

import { clipFitsTrack, makeClip, makeTrack } from "../src/index.js";
import type {
  ClipEffect,
  ClipMask,
  TimelineClip,
  TimelineTrack
} from "../src/index.js";
import {
  computeActiveLayersWithHorizon,
  groupNeedsPrecomposite,
  trackZ
} from "../src/render/sceneModel.js";
import {
  drawTimelineFrame,
  unsupportedEffectTypes,
  type Canvas2DAdjustment,
  type Canvas2DFrameGeometry,
  type Canvas2DLayer,
  type Canvas2DPrecomposite,
  type CompositeContext2D,
  type CompositeSurface
} from "../src/render/canvas2d.js";

const W = 24;
const H = 8;
const CANVAS = { width: W, height: H };
const GEOMETRY: Canvas2DFrameGeometry = { canvasWidth: W, canvasHeight: H };

/** The three vertical bands the fixtures paint into, by x centre. */
const LEFT = 4;
const MIDDLE = 12;
const RIGHT = 20;

const desaturate = (saturation = 0): ClipEffect => ({
  id: "grade",
  type: "color",
  enabled: true,
  saturation
});

const brighten = (brightness: number): ClipEffect => ({
  id: "lift",
  type: "color",
  enabled: true,
  brightness
});

const contrast = (amount: number): ClipEffect => ({
  id: "punch",
  type: "color",
  enabled: true,
  contrast: amount
});

/** A colour with enough chroma that `saturate(0)` moves every channel. */
const CRIMSON = "rgb(192, 32, 48)";
const TEAL = "rgb(32, 160, 144)";
const GREY_40 = "rgb(102, 102, 102)";

const adjustmentClip = (over: Partial<TimelineClip>): TimelineClip =>
  makeClip({
    mediaType: "adjustment",
    trackId: "t1",
    startMs: 0,
    durationMs: 1000,
    ...over
  });

const pictureClip = (over: Partial<TimelineClip>): TimelineClip =>
  makeClip({
    mediaType: "image",
    trackId: "t0",
    startMs: 0,
    durationMs: 1000,
    status: "generated",
    currentAssetId: "asset",
    ...over
  });

const groupClip = (over: Partial<TimelineClip>): TimelineClip =>
  makeClip({
    mediaType: "group",
    trackId: "t0",
    startMs: 0,
    durationMs: 1000,
    ...over
  });

/** Four visual tracks, index 0 on top. */
const tracks: TimelineTrack[] = [
  makeTrack({ id: "t0", type: "video", index: 0, visible: true }),
  makeTrack({ id: "t1", type: "video", index: 1, visible: true }),
  makeTrack({ id: "t2", type: "video", index: 2, visible: true }),
  makeTrack({ id: "t3", type: "video", index: 3, visible: true })
];

// ── The clip itself ──────────────────────────────────────────────────────────

describe("an adjustment clip", () => {
  it("needs nothing beyond `makeClip` to be a valid clip", () => {
    const clip = makeClip({ mediaType: "adjustment", trackId: "t1" });
    expect(clip.mediaType).toBe("adjustment");
    // No style bag, no asset, no effects — and the document schema takes it,
    // or a PATCH would strip the clip on the first autosave.
    expect(timelineClip.safeParse(clip).success).toBe(true);
  });

  it("sits on a visual track and nowhere else", () => {
    expect(clipFitsTrack("adjustment", "video")).toBe(true);
    expect(clipFitsTrack("adjustment", "overlay")).toBe(true);
    expect(clipFitsTrack("adjustment", "audio")).toBe(false);
    expect(clipFitsTrack("adjustment", "midi")).toBe(false);
  });

  it("draws the same frame with no effects on it as without it at all", () => {
    const picture = pictureClip({ id: "pic", trackId: "t2" });
    const withNone = renderScene([picture, adjustmentClip({ id: "adj" })], 500);
    const without = renderScene([picture], 500);
    expect(pixel(withNone, MIDDLE)).toEqual(pixel(without, MIDDLE));
    expect(pixel(withNone, MIDDLE)).toEqual([192, 32, 48]);
  });
});

// ── Scene model ──────────────────────────────────────────────────────────────

describe("computeActiveLayers — adjustments", () => {
  it("contributes no layer, and one record at its own track's index", () => {
    const clips = [
      pictureClip({ id: "pic", trackId: "t2" }),
      adjustmentClip({ id: "adj", trackId: "t1", effects: [desaturate()] })
    ];
    const scene = computeActiveLayersWithHorizon(tracks, clips, 500, {
      canvas: CANVAS
    });
    expect(scene.layers.map((l) => l.clipId)).toEqual(["pic"]);
    expect(scene.adjustments).toHaveLength(1);
    expect(scene.adjustments[0]).toMatchObject({
      clipId: "adj",
      trackIndex: 1,
      opacity: 1,
      effects: [desaturate()]
    });
  });

  it("reports nothing for an adjustment whose chain treats nothing", () => {
    const empty = adjustmentClip({ id: "empty" });
    const disabled = adjustmentClip({
      id: "off",
      trackId: "t2",
      effects: [{ ...desaturate(), enabled: false }]
    });
    const scene = computeActiveLayersWithHorizon(
      tracks,
      [pictureClip({ id: "pic", trackId: "t3" }), empty, disabled],
      500,
      { canvas: CANVAS }
    );
    expect(scene.adjustments).toEqual([]);
    expect(scene.precomposites).toEqual([]);
  });

  it("drops one outside its own window, and moves the change horizon", () => {
    const clips = [
      pictureClip({ id: "pic", trackId: "t2" }),
      adjustmentClip({
        id: "adj",
        startMs: 200,
        durationMs: 300,
        effects: [desaturate()]
      })
    ];
    expect(
      computeActiveLayersWithHorizon(tracks, clips, 100, { canvas: CANVAS })
        .adjustments
    ).toEqual([]);
    const inside = computeActiveLayersWithHorizon(tracks, clips, 300, {
      canvas: CANVAS
    });
    expect(inside.adjustments.map((a) => a.clipId)).toEqual(["adj"]);
    // The treatment stops at the clip's end, so the frame set changes there.
    expect(inside.nextChangeMs).toBe(500);
  });

  it("folds its own opacity, clamped, into the strength of the treatment", () => {
    const scene = computeActiveLayersWithHorizon(
      tracks,
      [
        pictureClip({ id: "pic", trackId: "t2" }),
        adjustmentClip({ id: "adj", opacity: 4, effects: [desaturate()] })
      ],
      500,
      { canvas: CANVAS }
    );
    expect(scene.adjustments[0]?.opacity).toBe(1);
  });

  it("takes its chain from the animation when the clip has no static effects", () => {
    const animated = adjustmentClip({
      id: "adj",
      animations: [
        { id: "a1", role: "in", preset: "colorFade", durationMs: 400 }
      ]
    });
    const scene = computeActiveLayersWithHorizon(
      tracks,
      [pictureClip({ id: "pic", trackId: "t2" }), animated],
      0,
      { canvas: CANVAS }
    );
    const chain = scene.adjustments[0]?.effects ?? [];
    const color = chain.find((e) => e.type === "color");
    expect(color).toBeDefined();
    // `colorFade` opens at zero saturation, so the frame under it starts grey.
    expect(color && "saturation" in color ? color.saturation : 1).toBeLessThan(
      1
    );
  });

  it("is never a matte source: the layer reading it draws unmatted", () => {
    const scene = computeActiveLayersWithHorizon(
      tracks,
      [
        pictureClip({
          id: "pic",
          trackId: "t2",
          matte: { sourceClipId: "adj", mode: "luma" }
        }),
        adjustmentClip({ id: "adj", effects: [desaturate()] })
      ],
      500,
      { canvas: CANVAS }
    );
    expect(scene.layers.map((l) => l.clipId)).toEqual(["pic"]);
    expect(scene.layers[0]?.matte).toBeUndefined();
    expect(scene.droppedLayers).toEqual([]);
  });
});

describe("computeActiveLayers — an adjustment inside a group", () => {
  it("makes the group composite its children, and treats that surface", () => {
    const group = groupClip({ id: "g" });
    expect(groupNeedsPrecomposite(group)).toBe(false);
    expect(groupNeedsPrecomposite(group, true)).toBe(true);

    const scene = computeActiveLayersWithHorizon(
      tracks,
      [
        group,
        pictureClip({ id: "child", trackId: "t2", parentId: "g" }),
        adjustmentClip({
          id: "adj",
          parentId: "g",
          effects: [desaturate()]
        })
      ],
      500,
      { canvas: CANVAS }
    );
    expect(scene.precomposites.map((p) => p.clipId)).toEqual(["g"]);
    expect(scene.layers[0]?.precomposeGroupId).toBe("g");
    expect(scene.adjustments[0]?.precomposeGroupId).toBe("g");
  });

  it("drops an adjustment whose group composites nothing", () => {
    const scene = computeActiveLayersWithHorizon(
      tracks,
      [
        groupClip({ id: "g" }),
        // The group's only other child is off screen at this time.
        pictureClip({
          id: "child",
          trackId: "t2",
          parentId: "g",
          startMs: 5000
        }),
        adjustmentClip({ id: "adj", parentId: "g", effects: [desaturate()] }),
        pictureClip({ id: "outside", trackId: "t3" })
      ],
      500,
      { canvas: CANVAS }
    );
    expect(scene.precomposites).toEqual([]);
    // Nothing composed means nothing to treat — and the layer outside the
    // group is not it.
    expect(scene.adjustments).toEqual([]);
  });
});

// ── Canvas 2D pixels ─────────────────────────────────────────────────────────

/**
 * A frame-sized canvas with one vertical band painted and the rest left
 * transparent, so several full-frame layers cover disjoint parts of the frame.
 */
function band(color: string, x: number, width: number): Canvas {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(x, 0, width, H);
  return canvas;
}

/** A frame-sized canvas of one solid colour. */
function solid(color: string): Canvas {
  return band(color, 0, W);
}

/**
 * A frame-sized canvas of one colour at half alpha — what a group's surface, an
 * alpha export or a softened subject edge hands the compositor.
 */
function translucent(color: string): Canvas {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);
  return canvas;
}

// SAFETY: `CompositeContext2D` is the subset of the 2D canvas API the
// compositing rules use, and `@napi-rs/canvas` implements all of it — the cast
// only bridges the wider concrete type, exactly as `packages/agents` does.
const contextOf = (canvas: Canvas): CompositeContext2D<Canvas> =>
  canvas.getContext("2d") as unknown as CompositeContext2D<Canvas>;

const surfaceOf = (canvas: Canvas): CompositeSurface<Canvas> => ({
  ctx: contextOf(canvas),
  surface: canvas
});

/** RGB at one pixel of a finished frame. */
function pixel(canvas: Canvas, x: number): [number, number, number] {
  const data = canvas.getContext("2d").getImageData(x, H / 2, 1, 1).data;
  return [data[0]!, data[1]!, data[2]!];
}

/** RGB *and* alpha at one pixel — what a treatment must leave alone. */
function pixelRgba(canvas: Canvas, x: number): [number, number, number, number] {
  const data = canvas.getContext("2d").getImageData(x, H / 2, 1, 1).data;
  return [data[0]!, data[1]!, data[2]!, data[3]!];
}

const isGrey = ([r, g, b]: [number, number, number]): boolean =>
  Math.abs(r - g) <= 1 && Math.abs(g - b) <= 1;

interface Scene {
  layers: Canvas2DLayer<Canvas>[];
  adjustments?: Canvas2DAdjustment[];
  precomposites?: Canvas2DPrecomposite[];
  /** Seed the frame transparent instead of opaque black — an alpha export. */
  alpha?: boolean;
}

/**
 * Draw one frame with a fresh surface for every role the compositor asks for,
 * so nothing here can pass by two roles sharing a canvas.
 */
function render(scene: Scene): Canvas {
  const frame = createCanvas(W, H);
  const pool: Canvas[] = [];
  let taken = 0;
  const take = (): CompositeSurface<Canvas> => {
    const index = taken++;
    let surface = pool[index];
    if (!surface) {
      surface = createCanvas(W, H);
      pool[index] = surface;
    }
    return surfaceOf(surface);
  };
  drawTimelineFrame(contextOf(frame), scene.layers, GEOMETRY, {
    alpha: scene.alpha,
    adjustments: scene.adjustments,
    precomposites: scene.precomposites,
    adjustmentSurface: take,
    precompositeSurface: take,
    maskSurface: take,
    maskScratch: take,
    matteSurface: take
  });
  return frame;
}

const layerOf = (
  source: Canvas,
  trackIndex: number,
  over: Partial<Canvas2DLayer<Canvas>> = {}
): Canvas2DLayer<Canvas> => ({
  source,
  sourceWidth: W,
  sourceHeight: H,
  opacity: 1,
  blendMode: "normal",
  zIndex: trackZ(trackIndex),
  ...over
});

const adjustmentOf = (
  trackIndex: number,
  over: Partial<Canvas2DAdjustment> = {}
): Canvas2DAdjustment => ({
  clipId: "adj",
  zIndex: trackZ(trackIndex),
  opacity: 1,
  ...over
});

/**
 * The whole path: resolve a document at `atMs` and draw what the scene model
 * planned. `sources` names the picture a clip draws; anything left out draws a
 * full-frame crimson.
 */
function renderScene(
  clips: TimelineClip[],
  atMs: number,
  sources: Map<string, Canvas> = new Map()
): Canvas {
  const scene = computeActiveLayersWithHorizon(tracks, clips, atMs, {
    canvas: CANVAS
  });
  return render({
    layers: scene.layers.map((l) =>
      layerOf(sources.get(l.clipId) ?? solid(CRIMSON), l.trackIndex, {
        clipId: l.clipId,
        opacity: l.opacity,
        blendMode: l.blendMode,
        transform: l.transform,
        parentMatrix: l.parentMatrix,
        precomposeGroupId: l.precomposeGroupId,
        effects: l.effects,
        shapeMask: l.shapeMask,
        transition: l.transition
      })
    ),
    adjustments: scene.adjustments.map((a) => ({
      clipId: a.clipId,
      zIndex: trackZ(a.trackIndex),
      opacity: a.opacity,
      effects: a.effects,
      mask: a.mask,
      wipe: a.wipe,
      precomposeGroupId: a.precomposeGroupId
    })),
    precomposites: scene.precomposites.map((p) => ({
      id: p.clipId,
      zIndex: trackZ(p.trackIndex),
      opacity: p.opacity,
      blendMode: p.blendMode,
      effects: p.effects,
      precomposeGroupId: p.precomposeGroupId
    }))
  });
}

describe("drawTimelineFrame — adjustments", () => {
  it("treats every layer below it and none above", () => {
    const frame = render({
      layers: [
        layerOf(band(CRIMSON, 0, 8), 3),
        layerOf(band(TEAL, 8, 8), 2),
        layerOf(band(CRIMSON, 16, 8), 0)
      ],
      adjustments: [adjustmentOf(1, { effects: [desaturate()] })]
    });
    expect(isGrey(pixel(frame, LEFT))).toBe(true);
    expect(isGrey(pixel(frame, MIDDLE))).toBe(true);
    // The layer above the adjustment drew after it and keeps its colour.
    expect(isGrey(pixel(frame, RIGHT))).toBe(false);
    expect(pixel(frame, RIGHT)).toEqual([192, 32, 48]);
  });

  it("blends treated over untreated at the adjustment's opacity", () => {
    const layers = (): Canvas2DLayer<Canvas>[] => [layerOf(solid(CRIMSON), 3)];
    const untreated = pixel(render({ layers: layers() }), MIDDLE);
    const treated = pixel(
      render({
        layers: layers(),
        adjustments: [adjustmentOf(1, { effects: [desaturate()] })]
      }),
      MIDDLE
    );
    const half = pixel(
      render({
        layers: layers(),
        adjustments: [
          adjustmentOf(1, { opacity: 0.5, effects: [desaturate()] })
        ]
      }),
      MIDDLE
    );
    expect(treated).not.toEqual(untreated);
    for (let i = 0; i < 3; i++) {
      expect(half[i]!).toBeCloseTo((untreated[i]! + treated[i]!) / 2, -0.5);
    }
  });

  it("runs stacked adjustments bottom-up", () => {
    // +0.25 brightness then ×2 contrast on 40% grey lands at 205; the other
    // order — contrast first — lands at 141, which is what this discriminates.
    const frame = render({
      layers: [layerOf(solid(GREY_40), 3)],
      adjustments: [
        adjustmentOf(2, { clipId: "lower", effects: [brighten(0.25)] }),
        adjustmentOf(1, { clipId: "upper", effects: [contrast(2)] })
      ]
    });
    const [r] = pixel(frame, MIDDLE);
    expect(r).toBeGreaterThan(195);
    expect(r).toBeLessThan(215);
  });

  it("treats only the siblings below it inside its group", () => {
    const group: Canvas2DPrecomposite = {
      id: "g",
      zIndex: trackZ(0),
      opacity: 1,
      blendMode: "normal"
    };
    const frame = render({
      layers: [
        // Outside the group, beneath it.
        layerOf(band(CRIMSON, 0, 8), 3),
        // Inside, below the adjustment.
        layerOf(band(CRIMSON, 8, 8), 2, { precomposeGroupId: "g" }),
        // Inside, above it.
        layerOf(band(CRIMSON, 16, 8), 0, { precomposeGroupId: "g" })
      ],
      adjustments: [
        adjustmentOf(1, {
          effects: [desaturate()],
          precomposeGroupId: "g"
        })
      ],
      precomposites: [group]
    });
    expect(isGrey(pixel(frame, MIDDLE))).toBe(true);
    expect(isGrey(pixel(frame, LEFT))).toBe(false);
    expect(isGrey(pixel(frame, RIGHT))).toBe(false);
  });

  it("treats only inside its mask", () => {
    // The left half of the frame, in the treated surface's own 0..1 space.
    const mask: ClipMask = { kind: "rect", x: 0, y: 0, width: 0.5, height: 1 };
    const frame = render({
      layers: [layerOf(solid(CRIMSON), 3)],
      adjustments: [adjustmentOf(1, { effects: [desaturate()], mask })]
    });
    expect(isGrey(pixel(frame, LEFT))).toBe(true);
    expect(isGrey(pixel(frame, RIGHT))).toBe(false);
  });

  it("leaves a crossfade underneath it blending", () => {
    // Mid-dissolve: the incoming clip at half opacity over the outgoing one.
    const dissolve = (): Canvas2DLayer<Canvas>[] => [
      layerOf(solid(CRIMSON), 3),
      layerOf(solid(TEAL), 3, { opacity: 0.5 })
    ];
    const plain = pixel(render({ layers: dissolve() }), MIDDLE);
    // Neither endpoint: the two pictures are still mixing.
    expect(plain).not.toEqual([192, 32, 48]);
    expect(plain).not.toEqual([32, 160, 144]);

    // A chain that changes nothing must leave the mix exactly where it was.
    const throughNeutral = pixel(
      render({
        layers: dissolve(),
        adjustments: [adjustmentOf(1, { effects: [desaturate(1)] })]
      }),
      MIDDLE
    );
    expect(throughNeutral).toEqual(plain);

    // And a chain that does something treats the mix, not one side of it.
    const greyed = pixel(
      render({
        layers: dissolve(),
        adjustments: [adjustmentOf(1, { effects: [desaturate()] })]
      }),
      MIDDLE
    );
    expect(isGrey(greyed)).toBe(true);
  });

  it("carries the rule from a document to the pixels", () => {
    const frame = renderScene(
      [
        pictureClip({ id: "low", trackId: "t3" }),
        pictureClip({ id: "mid", trackId: "t2" }),
        adjustmentClip({ id: "adj", trackId: "t1", effects: [desaturate()] }),
        pictureClip({ id: "top", trackId: "t0" })
      ],
      500,
      new Map([
        ["low", band(CRIMSON, 0, 8)],
        ["mid", band(TEAL, 8, 8)],
        ["top", band(CRIMSON, 16, 8)]
      ])
    );
    expect(isGrey(pixel(frame, LEFT))).toBe(true);
    expect(isGrey(pixel(frame, MIDDLE))).toBe(true);
    expect(isGrey(pixel(frame, RIGHT))).toBe(false);
  });

  it("reports the treatment it could not run, and draws the frame anyway", () => {
    const frame = createCanvas(W, H);
    const report = drawTimelineFrame(
      contextOf(frame),
      [layerOf(solid(CRIMSON), 3)],
      GEOMETRY,
      { adjustments: [adjustmentOf(1, { effects: [desaturate()] })] }
    );
    expect(report.degraded).toEqual([
      { clipId: "adj", reason: "adjustment_skipped" }
    ]);
    expect(pixel(frame, MIDDLE)).toEqual([192, 32, 48]);
  });

  it("never runs a group's treatment on the frame instead", () => {
    const frame = createCanvas(W, H);
    // The group is gone from this frame — the treatment goes with it rather
    // than reaching the layer that was never inside it.
    const report = drawTimelineFrame(
      contextOf(frame),
      [layerOf(solid(CRIMSON), 3)],
      GEOMETRY,
      {
        adjustments: [
          adjustmentOf(1, {
            effects: [desaturate()],
            precomposeGroupId: "gone"
          })
        ],
        adjustmentSurface: () => surfaceOf(createCanvas(W, H))
      }
    );
    expect(report.degraded).toEqual([
      { clipId: "adj", reason: "adjustment_skipped" }
    ]);
    expect(isGrey(pixel(frame, MIDDLE))).toBe(false);
  });
});

/**
 * A treatment on a composite that is not opaque — a group's own surface, an
 * alpha export, the softened edge of an isolated subject.
 *
 * The treated copy carries the composite's alpha, so blending it *over* the
 * composite it was copied from added that alpha to itself and thickened the
 * pixel: a neutral chain at full opacity took a 50%-opaque pixel to 75% (F3).
 * A fully applied treatment replaces what is under it and a partial one mixes
 * with it, both on premultiplied channels, alpha included — which is what these
 * assert on a real `@napi-rs/canvas` surface, where an opaque frame cannot see
 * the difference.
 */
describe("drawTimelineFrame — a treatment on a translucent composite", () => {
  const halfAlpha = (): Canvas2DLayer<Canvas>[] => [
    layerOf(translucent(CRIMSON), 3)
  ];

  it("leaves a neutral treatment's alpha and colour exactly where it found them", () => {
    const untreated = render({ layers: halfAlpha(), alpha: true });
    // The pixel the claim is about: half transparent, and coloured.
    expect(pixelRgba(untreated, MIDDLE)[3]).toBe(127);

    // An enabled grade at its identity — the chain runs and changes nothing, so
    // every channel including alpha has to come back untouched.
    const treated = render({
      layers: halfAlpha(),
      alpha: true,
      adjustments: [adjustmentOf(1, { effects: [contrast(1)] })]
    });
    expect(pixelRgba(treated, MIDDLE)).toEqual(pixelRgba(untreated, MIDDLE));
  });

  it("mixes a half-strength treatment in without moving the alpha", () => {
    const untreated = pixelRgba(render({ layers: halfAlpha(), alpha: true }), MIDDLE);
    const treated = pixelRgba(
      render({
        layers: halfAlpha(),
        alpha: true,
        adjustments: [adjustmentOf(1, { effects: [desaturate()] })]
      }),
      MIDDLE
    );
    const half = pixelRgba(
      render({
        layers: halfAlpha(),
        alpha: true,
        adjustments: [
          adjustmentOf(1, { opacity: 0.5, effects: [desaturate()] })
        ]
      }),
      MIDDLE
    );
    expect(treated).not.toEqual(untreated);
    // A grade moves colour, not coverage: both ends of the mix carry the
    // composite's own alpha, so the premultiplied midpoint is the plain one.
    expect(treated[3]).toBe(untreated[3]);
    expect(half[3]).toBe(untreated[3]);
    for (let i = 0; i < 3; i++) {
      expect(half[i]!).toBeCloseTo((untreated[i]! + treated[i]!) / 2, -0.5);
    }
  });

  it("leaves a hard-masked pixel outside the mask byte for byte", () => {
    const mask: ClipMask = { kind: "rect", x: 0, y: 0, width: 0.5, height: 1 };
    const untreated = render({ layers: halfAlpha(), alpha: true });
    const frame = render({
      layers: halfAlpha(),
      alpha: true,
      adjustments: [adjustmentOf(1, { effects: [desaturate()], mask })]
    });
    expect(pixelRgba(frame, RIGHT)).toEqual(pixelRgba(untreated, RIGHT));
    expect(isGrey(pixel(frame, LEFT))).toBe(true);
    expect(pixelRgba(frame, LEFT)[3]).toBe(pixelRgba(untreated, LEFT)[3]);
  });

  it("leaves a feathered-masked pixel outside the mask byte for byte", () => {
    // Feathered, so the coverage is a raster the mix reads per pixel rather
    // than a path clip — the other half of the masking code.
    const mask: ClipMask = {
      kind: "rect",
      x: 0,
      y: 0,
      width: 0.5,
      height: 1,
      featherPx: 2
    };
    const untreated = render({ layers: halfAlpha(), alpha: true });
    const frame = render({
      layers: halfAlpha(),
      alpha: true,
      adjustments: [adjustmentOf(1, { effects: [desaturate()], mask })]
    });
    // RIGHT is 8px clear of the feather band, LEFT 8px inside it.
    expect(pixelRgba(frame, RIGHT)).toEqual(pixelRgba(untreated, RIGHT));
    expect(isGrey(pixel(frame, LEFT))).toBe(true);
    expect(pixelRgba(frame, LEFT)[3]).toBe(pixelRgba(untreated, LEFT)[3]);
  });
});

describe("unsupportedEffectTypes — adjustments", () => {
  const glow: ClipEffect = {
    id: "glow",
    type: "glow",
    enabled: true,
    radius: 8,
    intensity: 1
  };

  it("names a GPU-only effect on an adjustment", () => {
    expect(unsupportedEffectTypes([{ effects: [glow] }])).toEqual(["glow"]);
  });

  it("says nothing about one Canvas 2D draws", () => {
    expect(unsupportedEffectTypes([{ effects: [desaturate()] }])).toEqual([]);
  });
});
