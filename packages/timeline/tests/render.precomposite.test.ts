/**
 * Precomposite: a group's effects and blend mode act on its children together
 * (F5, T10).
 *
 * Two halves are asserted here. The scene model decides *whether* a group needs
 * an intermediate surface and where each layer draws; the Canvas 2D rules
 * decide what actually lands on which context. Both are checked against a
 * recording fake rather than pixels — the pixel proof lives with the hosts that
 * have a real canvas (`packages/agents`) and a real GPU
 * (`render.precomposite.gpu.test.ts`).
 */
import { describe, expect, it, vi } from "vitest";
import { makeClip, makeTrack } from "../src/index.js";
import type { ClipEffect, TimelineClip, TimelineTrack } from "../src/index.js";
import {
  computeActiveLayersWithHorizon,
  groupNeedsPrecomposite,
  trackZ
} from "../src/render/sceneModel.js";
import {
  drawTimelineFrame,
  unsupportedEffectTypes,
  type Canvas2DLayer,
  type Canvas2DPrecomposite,
  type CompositeContext2D,
  type CompositeSurface
} from "../src/render/canvas2d.js";

const CANVAS = { width: 100, height: 100 };

const GEOMETRY = { canvasWidth: 100, canvasHeight: 100 };

/** A neutral grade: enough to make a group precomposite, invisible in the draw. */
const neutralColor: ClipEffect = {
  id: "neutral",
  type: "color",
  enabled: true,
  brightness: 0,
  contrast: 1,
  saturation: 1
};

const blur = (radius: number): ClipEffect => ({
  id: "group-blur",
  type: "blur",
  enabled: true,
  radius
});

const groupClip = (over: Partial<TimelineClip>): TimelineClip =>
  makeClip({
    mediaType: "group",
    trackId: "video",
    startMs: 0,
    durationMs: 1000,
    status: "generated",
    ...over
  });

const childClip = (over: Partial<TimelineClip>): TimelineClip =>
  makeClip({
    mediaType: "image",
    trackId: "video",
    startMs: 0,
    durationMs: 1000,
    status: "generated",
    currentAssetId: "asset-1",
    ...over
  });

const tracks: TimelineTrack[] = [
  makeTrack({ id: "video", type: "video", index: 0, visible: true }),
  makeTrack({ id: "over", type: "overlay", index: 1, visible: true })
];

/** One `drawImage` call, with the context state it drew under. */
interface RecordedDraw {
  source: string;
  alpha: number;
  operation: string;
  filter: string;
}

/**
 * The smallest thing that satisfies {@link CompositeContext2D}: it holds the
 * state the compositing rules set and records what each `drawImage` drew under
 * it. Sources are plain strings, so a draw names the layer it came from.
 */
class RecordingContext implements CompositeContext2D<string> {
  globalAlpha = 1;
  globalCompositeOperation = "source-over";
  filter = "none";
  shadowColor = "rgba(0, 0, 0, 0)";
  shadowBlur = 0;
  shadowOffsetX = 0;
  shadowOffsetY = 0;
  fillStyle: string | object = "#000";
  readonly draws: RecordedDraw[] = [];
  cleared = 0;

  save(): void {}
  restore(): void {}
  setTransform(): void {}
  clearRect(): void {
    this.cleared += 1;
  }
  fillRect(): void {}
  beginPath(): void {}
  closePath(): void {}
  rect(): void {}
  moveTo(): void {}
  arcTo(): void {}
  clip(): void {}
  drawImage(source: string): void {
    this.draws.push({
      source,
      alpha: this.globalAlpha,
      operation: this.globalCompositeOperation,
      filter: this.filter
    });
  }
  createLinearGradient(): { addColorStop(offset: number, color: string): void } {
    return { addColorStop: () => {} };
  }
  lineTo(): void {}
  bezierCurveTo(): void {}
  quadraticCurveTo(): void {}
  ellipse(): void {}
  fill(): void {}
  translate(): void {}
  scale(): void {}
  createRadialGradient(): { addColorStop(offset: number, color: string): void } {
    return { addColorStop: () => {} };
  }
  getImageData(
    _x: number,
    _y: number,
    w: number,
    h: number
  ): { data: Uint8ClampedArray; width: number; height: number } {
    return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  }
  putImageData(): void {}
}

/** A layer whose source names itself, so a recorded draw is readable. */
const drawLayer = (
  name: string,
  over: Partial<Canvas2DLayer<string>> = {}
): Canvas2DLayer<string> => ({
  source: name,
  sourceWidth: 100,
  sourceHeight: 100,
  opacity: 1,
  blendMode: "normal",
  zIndex: 0,
  ...over
});

describe("groupNeedsPrecomposite", () => {
  it("is false for a group with nothing but a transform and an opacity", () => {
    expect(
      groupNeedsPrecomposite(groupClip({ id: "g", opacity: 0.5 }))
    ).toBe(false);
  });

  it("is false for a group whose only effect is disabled", () => {
    const group = groupClip({
      id: "g",
      effects: [{ ...neutralColor, enabled: false }]
    });
    expect(groupNeedsPrecomposite(group)).toBe(false);
  });

  it("is true for an enabled effect and for a blend mode", () => {
    expect(
      groupNeedsPrecomposite(groupClip({ id: "g", effects: [neutralColor] }))
    ).toBe(true);
    expect(
      groupNeedsPrecomposite(groupClip({ id: "g", blendMode: "multiply" }))
    ).toBe(true);
  });
});

describe("computeActiveLayers — precomposites", () => {
  it("reports none, and folds the group opacity per child, without them", () => {
    const clips = [
      groupClip({ id: "g", opacity: 0.5 }),
      childClip({ id: "c", parentId: "g", opacity: 0.5 })
    ];
    const { layers, precomposites } = computeActiveLayersWithHorizon(
      tracks,
      clips,
      100,
      { canvas: CANVAS }
    );
    expect(precomposites).toEqual([]);
    expect(layers[0]?.precomposeGroupId).toBeUndefined();
    expect(layers[0]?.opacity).toBeCloseTo(0.25);
  });

  it("moves the group's opacity off the children and onto the surface", () => {
    const clips = [
      groupClip({ id: "g", opacity: 0.5, effects: [neutralColor] }),
      childClip({ id: "c", parentId: "g", opacity: 0.5 })
    ];
    const { layers, precomposites } = computeActiveLayersWithHorizon(
      tracks,
      clips,
      100,
      { canvas: CANVAS }
    );
    expect(layers[0]?.precomposeGroupId).toBe("g");
    // The child keeps only its own opacity; the group's is applied once, when
    // the composed surface blends.
    expect(layers[0]?.opacity).toBeCloseTo(0.5);
    expect(precomposites).toEqual([
      {
        clipId: "g",
        trackIndex: 0,
        opacity: 0.5,
        blendMode: "normal",
        effects: [neutralColor],
        precomposeGroupId: undefined
      }
    ]);
  });

  it("blends the surface at the group's own track, not its children's", () => {
    const clips = [
      groupClip({ id: "g", trackId: "over", effects: [neutralColor] }),
      childClip({ id: "c", parentId: "g", trackId: "video" })
    ];
    const { precomposites } = computeActiveLayersWithHorizon(tracks, clips, 100, {
      canvas: CANVAS
    });
    expect(precomposites[0]?.trackIndex).toBe(1);
  });

  it("reports nothing for a precompositing group with no children on screen", () => {
    const clips = [
      groupClip({ id: "g", effects: [neutralColor] }),
      childClip({ id: "c", parentId: "g", startMs: 5000, durationMs: 1000 })
    ];
    const { precomposites } = computeActiveLayersWithHorizon(tracks, clips, 100, {
      canvas: CANVAS
    });
    expect(precomposites).toEqual([]);
  });

  it("orders nested surfaces innermost first and links the inner to the outer", () => {
    const clips = [
      groupClip({ id: "outer", opacity: 0.5, effects: [neutralColor] }),
      groupClip({
        id: "inner",
        parentId: "outer",
        opacity: 0.5,
        effects: [neutralColor]
      }),
      childClip({ id: "c", parentId: "inner" })
    ];
    const { layers, precomposites } = computeActiveLayersWithHorizon(
      tracks,
      clips,
      100,
      { canvas: CANVAS }
    );
    expect(layers[0]?.precomposeGroupId).toBe("inner");
    expect(layers[0]?.opacity).toBe(1);
    expect(precomposites.map((p) => p.clipId)).toEqual(["inner", "outer"]);
    // The inner group's own opacity stops at its surface; the outer's applies
    // to the outer surface, so the two multiply exactly once each.
    expect(precomposites[0]).toMatchObject({
      opacity: 0.5,
      precomposeGroupId: "outer"
    });
    expect(precomposites[1]).toMatchObject({
      opacity: 0.5,
      precomposeGroupId: undefined
    });
  });

  it("keeps a plain group between two precompositing ones out of the way", () => {
    const clips = [
      groupClip({ id: "outer", effects: [neutralColor] }),
      groupClip({ id: "middle", parentId: "outer", opacity: 0.5 }),
      childClip({ id: "c", parentId: "middle" })
    ];
    const { layers, precomposites } = computeActiveLayersWithHorizon(
      tracks,
      clips,
      100,
      { canvas: CANVAS }
    );
    expect(precomposites.map((p) => p.clipId)).toEqual(["outer"]);
    // The plain group has no surface of its own, so its opacity still rides on
    // the child and the child draws into the outer group's surface.
    expect(layers[0]?.precomposeGroupId).toBe("outer");
    expect(layers[0]?.opacity).toBeCloseTo(0.5);
  });
});

describe("drawTimelineFrame — precomposites", () => {
  it("asks for no surface when no group precomposites", () => {
    const ctx = new RecordingContext();
    const surfaceFactory = vi.fn();
    drawTimelineFrame(ctx, [drawLayer("a"), drawLayer("b")], GEOMETRY, {
      precompositeSurface: surfaceFactory
    });
    expect(surfaceFactory).not.toHaveBeenCalled();
    expect(ctx.draws.map((d) => d.source)).toEqual(["a", "b"]);
  });

  it("draws the children on the surface and the surface on the frame once", () => {
    const ctx = new RecordingContext();
    const surface = new RecordingContext();
    const groups: Canvas2DPrecomposite[] = [
      { id: "g", zIndex: trackZ(0), opacity: 0.5, blendMode: "normal" }
    ];
    drawTimelineFrame(
      ctx,
      [
        drawLayer("a", { precomposeGroupId: "g" }),
        drawLayer("b", { precomposeGroupId: "g" })
      ],
      GEOMETRY,
      {
        precomposites: groups,
        precompositeSurface: () => ({ ctx: surface, surface: "surface" })
      }
    );
    expect(surface.draws.map((d) => d.source)).toEqual(["a", "b"]);
    // Each child at its own opacity; the group's half applied once, to the
    // composed surface. That is what stops the overlap darkening twice.
    expect(surface.draws.every((d) => d.alpha === 1)).toBe(true);
    expect(ctx.draws).toEqual([
      { source: "surface", alpha: 0.5, operation: "source-over", filter: "none" }
    ]);
  });

  it("filters the composite, not each child", () => {
    const ctx = new RecordingContext();
    const surface = new RecordingContext();
    drawTimelineFrame(
      ctx,
      [
        drawLayer("a", { precomposeGroupId: "g" }),
        drawLayer("b", { precomposeGroupId: "g" })
      ],
      GEOMETRY,
      {
        precomposites: [
          {
            id: "g",
            zIndex: trackZ(0),
            opacity: 1,
            blendMode: "normal",
            effects: [blur(6)]
          }
        ],
        precompositeSurface: () => ({ ctx: surface, surface: "surface" })
      }
    );
    expect(surface.draws.map((d) => d.filter)).toEqual(["none", "none"]);
    expect(ctx.draws[0]?.filter).toBe("blur(6.00px)");
  });

  it("carries a nested surface into the one above it", () => {
    const ctx = new RecordingContext();
    const inner = new RecordingContext();
    const outer = new RecordingContext();
    const surfaces = [
      { ctx: inner, surface: "inner-surface" },
      { ctx: outer, surface: "outer-surface" }
    ];
    let taken = 0;
    drawTimelineFrame(
      ctx,
      [
        drawLayer("child", { precomposeGroupId: "inner" }),
        drawLayer("sibling", { precomposeGroupId: "outer" })
      ],
      GEOMETRY,
      {
        precomposites: [
          {
            id: "inner",
            zIndex: trackZ(0),
            opacity: 0.5,
            blendMode: "normal",
            precomposeGroupId: "outer"
          },
          { id: "outer", zIndex: trackZ(1), opacity: 0.5, blendMode: "normal" }
        ],
        precompositeSurface: (): CompositeSurface<string> => surfaces[taken++]!
      }
    );
    expect(inner.draws.map((d) => d.source)).toEqual(["child"]);
    expect(outer.draws.map((d) => d.source)).toEqual([
      "sibling",
      "inner-surface"
    ]);
    expect(ctx.draws.map((d) => d.source)).toEqual(["outer-surface"]);
  });

  it("draws the children onto the frame when the host has no surface", () => {
    const ctx = new RecordingContext();
    const { degraded } = drawTimelineFrame(
      ctx,
      [drawLayer("a", { precomposeGroupId: "g" })],
      GEOMETRY,
      {
        precomposites: [
          { id: "g", zIndex: trackZ(0), opacity: 0.5, blendMode: "multiply" }
        ],
        precompositeSurface: () => null
      }
    );
    expect(ctx.draws.map((d) => d.source)).toEqual(["a"]);
    // The picture survives, the group's blend and effects do not — and saying
    // so is the whole point, since `unsupportedEffectTypes` names the effects
    // and has nothing to say about a lost blend mode (I7).
    expect(degraded).toEqual([{ clipId: "g", reason: "group_blend_lost" }]);
  });

  it("reports nothing for a group with no children on screen", () => {
    const ctx = new RecordingContext();
    const { degraded } = drawTimelineFrame(ctx, [drawLayer("a")], GEOMETRY, {
      precomposites: [
        { id: "g", zIndex: trackZ(0), opacity: 0.5, blendMode: "multiply" }
      ],
      precompositeSurface: () => null
    });
    expect(degraded).toEqual([]);
  });
});

describe("unsupportedEffectTypes — group effects", () => {
  it("names a group effect Canvas 2D cannot draw, and only that one", () => {
    const glow: ClipEffect = {
      id: "glow",
      type: "glow",
      enabled: true,
      radius: 8,
      intensity: 1
    };
    const clips = [
      groupClip({ id: "g", effects: [glow, blur(4)] }),
      childClip({ id: "c", parentId: "g" })
    ];
    const { layers, precomposites } = computeActiveLayersWithHorizon(
      tracks,
      clips,
      100,
      { canvas: CANVAS }
    );
    expect(unsupportedEffectTypes([...layers, ...precomposites])).toEqual([
      "glow"
    ]);
  });
});
