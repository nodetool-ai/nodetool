/**
 * Preview/export parity (AS1: preview == export).
 *
 * The browser used to walk the scene model itself and copy across the fields it
 * happened to know about, so a group's precomposite, a transition's geometry, a
 * shape mask and a track matte were resolved and then dropped — the editor drew
 * a different picture from the export and the agent's frame preview. These
 * cases pin the two halves that keep them the same:
 *
 * 1. Every field the shared draw rules read reaches the layer list this browser
 *    hands a compositor, identical to what the scene model resolved.
 * 2. Driving `drawTimelineFrame` — the same function the server-side frame
 *    preview draws through — with that list produces the draws the feature
 *    calls for.
 *
 * The assertions are on the draw calls rather than on pixels: jsdom has no 2D
 * canvas implementation, so a real `getContext("2d")` returns null here. The
 * pixel proofs live where a canvas exists — `packages/agents` for skia and
 * `packages/timeline/tests/render.*.gpu.test.ts` for a real device, both of
 * which now composite through the very same code this browser does.
 */

import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import type { ClipEffect, TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";
import {
  computeActiveLayersWithHorizon,
  drawTimelineFrame,
  trackZ,
  type ActiveLayer,
  type Canvas2DLayer,
  type CompositeContext2D,
  type CompositeSurface,
  type ImagePixels
} from "@nodetool-ai/timeline/render";

import {
  buildCompositeLayers,
  buildCompositePrecomposites,
  toCanvas2DLayer
} from "../compositeLayers";
import type { CompositeSource } from "../gpu/types";

const FRAME = { width: 200, height: 100 };
const GEOMETRY = {
  canvasWidth: FRAME.width,
  canvasHeight: FRAME.height,
  refWidth: FRAME.width,
  refHeight: FRAME.height
};
const SOURCE_SIZE = { width: FRAME.width, height: FRAME.height };

/** A stand-in for decoded pixels that names the layer it came from. */
interface NamedSource {
  name: string;
}

const sourceFor = (layer: ActiveLayer): CompositeSource =>
  ({ name: layer.clipId }) as unknown as CompositeSource;

const nameOf = (source: CompositeSource): string =>
  (source as unknown as NamedSource).name;

/** One recorded `drawImage`, with the context state it drew under. */
interface RecordedDraw {
  source: string;
  alpha: number;
  operation: string;
  /** Horizontal translation of the placement affine, in canvas pixels. */
  translateX: number;
}

/** One recorded `fillRect`, with the paint it filled with. */
interface RecordedFill {
  fillStyle: string;
  alpha: number;
  width: number;
}

/**
 * The smallest thing satisfying {@link CompositeContext2D}. It holds the state
 * the shared rules set and records what each draw drew under it, so a test can
 * read "which source, at what opacity, moved how far".
 */
class RecordingContext implements CompositeContext2D<CompositeSource> {
  globalAlpha = 1;
  globalCompositeOperation = "source-over";
  filter = "none";
  shadowColor = "rgba(0, 0, 0, 0)";
  shadowBlur = 0;
  shadowOffsetX = 0;
  shadowOffsetY = 0;
  fillStyle: string | object = "#000";
  readonly draws: RecordedDraw[] = [];
  readonly fills: RecordedFill[] = [];
  readonly shapes: string[] = [];
  private tx = 0;

  constructor(readonly label: string) {}

  save(): void {}
  restore(): void {}
  setTransform(
    _a: number,
    _b: number,
    _c: number,
    _d: number,
    e: number
  ): void {
    this.tx = e;
  }
  clearRect(): void {}
  fillRect(_x: number, _y: number, w: number): void {
    this.fills.push({
      fillStyle: String(this.fillStyle),
      alpha: this.globalAlpha,
      width: w
    });
  }
  beginPath(): void {}
  closePath(): void {}
  rect(): void {}
  moveTo(): void {}
  lineTo(): void {}
  arcTo(): void {}
  bezierCurveTo(): void {}
  quadraticCurveTo(): void {}
  ellipse(): void {
    this.shapes.push("ellipse");
  }
  fill(): void {}
  clip(): void {}
  translate(): void {}
  scale(): void {}
  drawImage(source: CompositeSource): void {
    this.draws.push({
      source: nameOf(source),
      alpha: this.globalAlpha,
      operation: this.globalCompositeOperation,
      translateX: this.tx
    });
  }
  createLinearGradient(): { addColorStop(offset: number, color: string): void } {
    return { addColorStop: () => {} };
  }
  createRadialGradient(): { addColorStop(offset: number, color: string): void } {
    return { addColorStop: () => {} };
  }
  getImageData(_x: number, _y: number, w: number, h: number): ImagePixels {
    return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  }
  putImageData(): void {}
}

/** A pool of recording surfaces, one per call, named so draws are traceable. */
class SurfacePool {
  readonly taken: RecordingContext[] = [];
  private next = 0;

  reset(): void {
    this.next = 0;
  }

  take = (): CompositeSurface<CompositeSource> => {
    const index = this.next++;
    let ctx = this.taken[index];
    if (!ctx) {
      ctx = new RecordingContext(`surface-${index}`);
      this.taken[index] = ctx;
    }
    return {
      ctx,
      surface: { name: ctx.label } as unknown as CompositeSource
    };
  };
}

const videoTrack = (over: Partial<TimelineTrack> = {}): TimelineTrack =>
  makeTrack({ id: "video", type: "video", index: 0, visible: true, ...over });

const imageClip = (over: Partial<TimelineClip>): TimelineClip =>
  makeClip({
    mediaType: "image",
    trackId: "video",
    startMs: 0,
    durationMs: 1000,
    status: "generated",
    currentAssetId: "asset-1",
    ...over
  });

/** A neutral grade: enough to make a group precomposite, invisible in the draw. */
const neutralGrade: ClipEffect = {
  id: "neutral",
  type: "color",
  enabled: true,
  brightness: 0,
  contrast: 1,
  saturation: 1
};

/** The browser's whole path from document to draw list, at one timecode. */
function browserFrame(
  tracks: TimelineTrack[],
  clips: TimelineClip[],
  atMs: number
) {
  const scene = computeActiveLayersWithHorizon(tracks, clips, atMs, {
    canvas: FRAME
  });
  const layers = buildCompositeLayers(scene.layers, {
    atMs,
    canvas: FRAME,
    resolveSource: (layer) => ({ source: sourceFor(layer) })
  });
  const drawable = layers
    .map((layer) => toCanvas2DLayer(layer, () => SOURCE_SIZE))
    .filter((layer): layer is Canvas2DLayer<CompositeSource> => layer !== null);
  return {
    scene,
    layers,
    drawable,
    precomposites: buildCompositePrecomposites(scene.precomposites)
  };
}

describe("the browser layer list carries what the scene model resolved", () => {
  it("copies transition, shape mask, matte and precomposite across untouched", () => {
    const tracks = [videoTrack()];
    const clips = [
      imageClip({ id: "group", mediaType: "group", effects: [neutralGrade] }),
      imageClip({ id: "matte-src", startMs: 0, durationMs: 1000 }),
      imageClip({
        id: "under",
        startMs: 0,
        durationMs: 600
      }),
      imageClip({
        id: "over",
        parentId: "group",
        startMs: 400,
        durationMs: 600,
        mask: { kind: "ellipse" },
        matte: { sourceClipId: "matte-src", mode: "luma" },
        transitionIn: { type: "push", durationMs: 200, direction: "left" }
      })
    ];
    const { scene, layers } = browserFrame(tracks, clips, 500);

    expect(scene.layers.length).toBeGreaterThan(0);
    expect(layers).toHaveLength(scene.layers.length);
    for (const [index, active] of scene.layers.entries()) {
      const built = layers[index];
      expect(built.zIndex).toBe(trackZ(active.trackIndex));
      expect(built.opacity).toBeCloseTo(active.opacity);
      expect(built.precomposeGroupId).toBe(active.precomposeGroupId);
      expect(built.transition).toBe(active.transition);
      expect(built.shapeMask).toBe(active.shapeMask);
      expect(built.parentMatrix).toBe(active.parentMatrix);
      expect(built.matte?.mode).toBe(active.matte?.mode);
    }
  });
});

describe("a group's effects and blend act on its children together", () => {
  const tracks = [videoTrack()];
  const clips = [
    imageClip({
      id: "group",
      mediaType: "group",
      opacity: 0.5,
      effects: [neutralGrade]
    }),
    imageClip({ id: "left", parentId: "group" }),
    imageClip({ id: "right", parentId: "group" })
  ];

  it("blends two overlapping children once, so the overlap is not darkened twice", () => {
    const { drawable, precomposites } = browserFrame(tracks, clips, 500);
    const ctx = new RecordingContext("frame");
    const pool = new SurfacePool();
    pool.reset();

    drawTimelineFrame(ctx, drawable, GEOMETRY, {
      precomposites,
      precompositeSurface: pool.take,
      maskScratch: pool.take,
      maskSurface: pool.take,
      matteSurface: pool.take
    });

    // Both children draw at full opacity onto the group's surface …
    const surface = pool.taken[0];
    expect(surface.draws.map((d) => d.source)).toEqual(["left", "right"]);
    for (const draw of surface.draws) expect(draw.alpha).toBeCloseTo(1);

    // … and the composed surface reaches the frame once, at the group's 0.5.
    expect(ctx.draws).toHaveLength(1);
    expect(ctx.draws[0].source).toBe("surface-0");
    expect(ctx.draws[0].alpha).toBeCloseTo(0.5);
  });

  it("stacks the children and loses the group's opacity without them", () => {
    // The pre-parity browser: the scene model resolved the group and the
    // browser handed the compositor its children alone. A precompositing group
    // hands each child full opacity — its own is meant to be applied once, to
    // the composed surface — so dropping the group drops the 0.5 entirely and
    // the two children stack at full strength.
    const { drawable } = browserFrame(tracks, clips, 500);
    const ctx = new RecordingContext("frame");
    const pool = new SurfacePool();
    pool.reset();

    drawTimelineFrame(ctx, drawable, GEOMETRY, {
      precomposites: [],
      precompositeSurface: pool.take,
      maskScratch: pool.take
    });

    expect(ctx.draws.map((d) => d.source)).toEqual(["left", "right"]);
    for (const draw of ctx.draws) expect(draw.alpha).toBeCloseTo(1);
  });
});

describe("a cut moves both clips and draws its own colour", () => {
  const cutClips = (
    transitionIn: TimelineClip["transitionIn"]
  ): TimelineClip[] => [
    imageClip({ id: "outgoing", startMs: 0, durationMs: 600 }),
    imageClip({ id: "incoming", startMs: 400, durationMs: 600, transitionIn })
  ];

  it("offsets a push by a whole frame across the cut", () => {
    const clips = cutClips({
      type: "push",
      durationMs: 200,
      direction: "left",
      easing: "linear"
    });
    const { layers, drawable } = browserFrame([videoTrack()], clips, 500);

    const roles = layers.map((layer) => layer.transition?.role);
    expect(roles).toEqual(["out", "in"]);
    for (const layer of layers) {
      expect(layer.transition?.type).toBe("push");
      expect(layer.transition?.progress).toBeCloseTo(0.5);
    }

    const ctx = new RecordingContext("frame");
    drawTimelineFrame(ctx, drawable, GEOMETRY);
    const byName = new Map(ctx.draws.map((d) => [d.source, d]));
    // Half a frame either side of centre at the midpoint, so the pair travels
    // one whole frame across the cut and no gap ever opens between them.
    expect(byName.get("outgoing")?.translateX).toBeCloseTo(FRAME.width / 2);
    expect(byName.get("incoming")?.translateX).toBeCloseTo(-FRAME.width / 2);
  });

  it("fills the frame with a dip's colour, not with black", () => {
    const clips = cutClips({
      type: "dipToColor",
      durationMs: 200,
      color: "#ff8800",
      easing: "linear"
    });
    const { drawable } = browserFrame([videoTrack()], clips, 500);

    const ctx = new RecordingContext("frame");
    drawTimelineFrame(ctx, drawable, GEOMETRY);

    // The first fill is the opaque-black ground every frame starts from; the
    // dip's own solid is the one drawn between the two clips.
    const dip = ctx.fills.find((fill) => fill.fillStyle === "#ff8800");
    expect(dip).toBeDefined();
    expect(dip?.width).toBe(FRAME.width);
    // Fully through the colour at the midpoint of the cut.
    expect(dip?.alpha).toBeCloseTo(1);
  });
});

describe("a shape mask cuts the layer it is authored on", () => {
  it("reaches the draw as a clip path", () => {
    const clips = [imageClip({ id: "masked", mask: { kind: "ellipse" } })];
    const { layers, drawable } = browserFrame([videoTrack()], clips, 500);

    expect(layers[0].shapeMask).toEqual({ kind: "ellipse" });

    const ctx = new RecordingContext("frame");
    drawTimelineFrame(ctx, drawable, GEOMETRY);
    expect(ctx.shapes).toContain("ellipse");
    expect(ctx.draws.map((d) => d.source)).toEqual(["masked"]);
  });
});

describe("a track matte drives a layer's alpha and never draws itself", () => {
  const clips = [
    imageClip({ id: "keyhole" }),
    imageClip({
      id: "matted",
      matte: { sourceClipId: "keyhole", mode: "luma" }
    })
  ];

  it("carries the resolved source and keeps it off the frame", () => {
    const { scene, layers, drawable } = browserFrame([videoTrack()], clips, 500);

    // The scene model holds the source back, so it is only reachable through
    // the layer it mattes.
    expect(scene.layers.map((l) => l.clipId)).toEqual(["matted"]);
    expect(layers[0].matte?.mode).toBe("luma");
    expect(nameOf(layers[0].matte!.layer.source)).toBe("keyhole");

    const ctx = new RecordingContext("frame");
    const pool = new SurfacePool();
    pool.reset();
    drawTimelineFrame(ctx, drawable, GEOMETRY, {
      maskScratch: pool.take,
      matteSurface: pool.take
    });

    // The layer and its keyhole are composed on their own surfaces, the
    // keyhole is multiplied into the layer's alpha, and only the finished
    // composite reaches the frame.
    expect(pool.taken[0].draws.map((d) => d.source)).toEqual([
      "matted",
      "surface-1"
    ]);
    expect(pool.taken[0].draws[1].operation).toBe("destination-in");
    expect(pool.taken[1].draws.map((d) => d.source)).toEqual(["keyhole"]);
    expect(ctx.draws.map((d) => d.source)).toEqual(["surface-0"]);
  });
});
