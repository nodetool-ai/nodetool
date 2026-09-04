/**
 * Shape masks and track mattes as the scene model and the drawing rules see
 * them (F7, T12, D6). Pixels are asserted where a real canvas and a real GPU
 * exist — `packages/agents/tests/timeline-mask-frames.test.ts` and
 * `render.mask.gpu.test.ts`; what is decidable without one is here.
 *
 * The invariant worth naming: **a matte source never draws itself**. It is
 * removed from the layer list and handed to the layer it drives, so a document
 * that mattes one clip with another shows one picture, not two.
 */
import { describe, expect, it } from "vitest";
import { makeClip, makeTrack } from "../src/index.js";
import type { ClipMask, TimelineClip } from "../src/index.js";
import {
  computeActiveLayersWithHorizon,
  parseMatteMode
} from "../src/render/sceneModel.js";
import {
  clipMask,
  drawMask,
  maskIsHard,
  type CanvasGradient2D,
  type MaskContext2D
} from "../src/render/draw.js";
import {
  drawTimelineFrame,
  type Canvas2DLayer,
  type CompositeContext2D
} from "../src/render/canvas2d.js";

const track = makeTrack({
  id: "video",
  type: "video",
  index: 0,
  visible: true
});

const clip = (over: Partial<TimelineClip>): TimelineClip =>
  makeClip({
    trackId: track.id,
    mediaType: "image",
    startMs: 0,
    durationMs: 1000,
    status: "generated",
    currentAssetId: "asset-1",
    ...over
  });

const layersAt = (clips: TimelineClip[], timeMs = 500) =>
  computeActiveLayersWithHorizon([track], clips, timeMs, {
    canvas: { width: 100, height: 100 }
  });

// ── Scene model ──────────────────────────────────────────────────────────────

describe("computeActiveLayers — track mattes", () => {
  it("removes the matte source from the stack and hands it to the layer", () => {
    const result = layersAt([
      clip({ id: "shot", name: "Shot", matte: { sourceClipId: "key", mode: "luma" } }),
      clip({ id: "key", name: "Key" })
    ]);

    expect(result.layers.map((l) => l.clipId)).toEqual(["shot"]);
    expect(result.layers[0]?.matte).toMatchObject({
      mode: "luma",
      invert: false
    });
    expect(result.layers[0]?.matte?.layer.clipId).toBe("key");
  });

  it("carries the matte source's own transform on the source layer", () => {
    const result = layersAt([
      clip({ id: "shot", matte: { sourceClipId: "key", mode: "alpha" } }),
      clip({
        id: "key",
        transform: {
          position: { x: 20, y: 0 },
          scale: { x: 1, y: 1 },
          rotation: 0,
          anchor: { x: 0.5, y: 0.5 }
        }
      })
    ]);
    expect(result.layers[0]?.matte?.layer.transform?.position.x).toBe(20);
  });

  it("drops a layer whose matte source is not active at this time", () => {
    const result = layersAt([
      clip({ id: "shot", name: "Shot", matte: { sourceClipId: "key", mode: "alpha" } }),
      clip({ id: "key", startMs: 2000, durationMs: 500 })
    ]);

    expect(result.layers).toEqual([]);
    expect(result.droppedLayers).toEqual([
      { clipId: "shot", reason: "matte_source_inactive" }
    ]);
  });

  it("draws unmatted when the matte source is not in the document", () => {
    const result = layersAt([
      clip({ id: "shot", matte: { sourceClipId: "gone", mode: "alpha" } })
    ]);
    expect(result.layers.map((l) => l.clipId)).toEqual(["shot"]);
    expect(result.layers[0]?.matte).toBeUndefined();
    expect(result.droppedLayers).toEqual([]);
  });

  it("leaves both clips drawing when the mode is one this build cannot read", () => {
    // I2: a mode from a newer build parses, so the source has to keep drawing —
    // holding it back would lose a layer over a field nothing applied.
    const result = layersAt([
      clip({ id: "shot", matte: { sourceClipId: "key", mode: "stencil" } }),
      clip({ id: "key" })
    ]);
    expect(result.layers.map((l) => l.clipId).sort()).toEqual(["key", "shot"]);
    expect(result.layers.every((l) => l.matte === undefined)).toBe(true);
  });

  it("keeps a matte source out of the frame even when it carries a caption", () => {
    const result = layersAt([
      clip({ id: "shot", matte: { sourceClipId: "key", mode: "alpha" } }),
      clip({
        id: "key",
        caption: { words: [{ word: "hi", startMs: 0, endMs: 900 }] }
      })
    ]);
    expect(result.layers.map((l) => l.clipId)).toEqual(["shot"]);
  });

  it("narrows the modes it applies and refuses the rest", () => {
    expect(parseMatteMode("alpha")).toBe("alpha");
    expect(parseMatteMode("luma")).toBe("luma");
    expect(parseMatteMode("stencil")).toBeNull();
  });
});

describe("computeActiveLayers — shape masks", () => {
  it("carries the clip's mask onto its layer", () => {
    const mask: ClipMask = { kind: "ellipse", featherPx: 4 };
    const result = layersAt([clip({ id: "shot", mask })]);
    expect(result.layers[0]?.shapeMask).toEqual(mask);
  });

  it("leaves a caption layer unmasked", () => {
    const result = layersAt([
      clip({
        id: "shot",
        mask: { kind: "rect" },
        caption: { words: [{ word: "hi", startMs: 0, endMs: 900 }] }
      })
    ]);
    const caption = result.layers.find((l) => l.kind === "caption");
    expect(caption?.shapeMask).toBeUndefined();
  });
});

// ── Drawing rules ────────────────────────────────────────────────────────────

/** Records what a mask draw asked the surface to do. */
class RecordingMaskContext implements MaskContext2D {
  fillStyle: string | object = "#000";
  filter = "none";
  globalCompositeOperation = "source-over";
  readonly calls: string[] = [];
  /** The composite op in force at each `fill`/`fillRect`. */
  readonly paints: string[] = [];

  private record(name: string): void {
    this.calls.push(name);
  }
  save(): void {
    this.record("save");
  }
  restore(): void {
    this.record("restore");
  }
  translate(): void {
    this.record("translate");
  }
  scale(): void {
    this.record("scale");
  }
  beginPath(): void {
    this.record("beginPath");
  }
  closePath(): void {
    this.record("closePath");
  }
  moveTo(): void {
    this.record("moveTo");
  }
  lineTo(): void {
    this.record("lineTo");
  }
  bezierCurveTo(): void {
    this.record("bezierCurveTo");
  }
  quadraticCurveTo(): void {
    this.record("quadraticCurveTo");
  }
  rect(): void {
    this.record("rect");
  }
  ellipse(): void {
    this.record("ellipse");
  }
  fill(fillRule?: string): void {
    this.record(`fill:${fillRule ?? "nonzero"}`);
    this.paints.push(this.globalCompositeOperation);
  }
  clip(fillRule?: string): void {
    this.record(`clip:${fillRule ?? "nonzero"}`);
  }
  clearRect(): void {
    this.record("clearRect");
  }
  fillRect(): void {
    this.record("fillRect");
    this.paints.push(this.globalCompositeOperation);
  }
  createLinearGradient(): CanvasGradient2D {
    this.record("createLinearGradient");
    return { addColorStop: () => {} };
  }
  createRadialGradient(): CanvasGradient2D {
    this.record("createRadialGradient");
    return { addColorStop: () => {} };
  }
}

describe("drawMask", () => {
  it("clears the surface before it paints", () => {
    const ctx = new RecordingMaskContext();
    expect(drawMask(ctx, { kind: "rect" }, 100, 100)).toBe(true);
    expect(ctx.calls.indexOf("clearRect")).toBeLessThan(
      ctx.calls.indexOf("fill:nonzero")
    );
  });

  it("draws an ellipse mask as an ellipse", () => {
    const ctx = new RecordingMaskContext();
    drawMask(ctx, { kind: "ellipse" }, 100, 100);
    expect(ctx.calls).toContain("ellipse");
  });

  it("erases the shape out of a full cover when inverted", () => {
    const ctx = new RecordingMaskContext();
    drawMask(ctx, { kind: "ellipse", invert: true }, 100, 100);
    // The first paint covers the surface; every paint after it erases, which
    // is what makes an inverted mask keep the feather band.
    expect(ctx.paints[0]).toBe("source-over");
    expect(ctx.paints.slice(1).every((op) => op === "destination-out")).toBe(
      true
    );
  });

  it("feathers a rect through a ring of disjoint fills", () => {
    const ctx = new RecordingMaskContext();
    drawMask(ctx, { kind: "rect", featherPx: 8 }, 100, 100);
    // One solid inset rect, four edge gradients, four corner gradients.
    expect(
      ctx.calls.filter((c) => c === "createLinearGradient")
    ).toHaveLength(4);
    expect(
      ctx.calls.filter((c) => c === "createRadialGradient")
    ).toHaveLength(4);
  });

  it("feathers a path with the context filter", () => {
    const ctx = new RecordingMaskContext();
    let filterAtFill = "none";
    const spy = new Proxy(ctx, {
      get(target, key) {
        if (key === "fill") {
          return (rule?: string) => {
            filterAtFill = target.filter;
            target.fill(rule);
          };
        }
        return Reflect.get(target, key);
      }
    }) as MaskContext2D;
    drawMask(spy, { kind: "path", d: "M 0 0 L 1 1 Z", featherPx: 6 }, 100, 100);
    expect(filterAtFill).toBe("blur(3.00px)");
  });

  it("refuses a kind it cannot rasterize", () => {
    const ctx = new RecordingMaskContext();
    expect(drawMask(ctx, { kind: "star" }, 100, 100)).toBe(false);
  });

  it("refuses path data it cannot parse", () => {
    const ctx = new RecordingMaskContext();
    expect(drawMask(ctx, { kind: "path", d: "M 0 0 A 1 1 0 0 1 1 1" }, 10, 10)).toBe(
      false
    );
  });
});

describe("clipMask", () => {
  it("clips a hard mask with the non-zero rule", () => {
    const ctx = new RecordingMaskContext();
    expect(clipMask(ctx, { kind: "rect" }, 100, 100)).toBe(true);
    expect(ctx.calls).toContain("clip:nonzero");
  });

  it("clips an inverted mask as the surface minus the shape", () => {
    const ctx = new RecordingMaskContext();
    clipMask(ctx, { kind: "ellipse", invert: true }, 100, 100);
    // The rect is the mask's other half: even-odd keeps what sits between it
    // and the shape.
    expect(ctx.calls).toEqual([
      "beginPath",
      "rect",
      "ellipse",
      "clip:evenodd"
    ]);
  });

  it("clips nothing when the mask is unreadable", () => {
    const ctx = new RecordingMaskContext();
    expect(clipMask(ctx, { kind: "path", d: "H 1" }, 100, 100)).toBe(false);
    expect(ctx.calls.some((c) => c.startsWith("clip"))).toBe(false);
  });
});

describe("maskIsHard", () => {
  it("is true with no feather and false with one", () => {
    expect(maskIsHard({ kind: "rect" })).toBe(true);
    expect(maskIsHard({ kind: "rect", featherPx: 0 })).toBe(true);
    expect(maskIsHard({ kind: "rect", featherPx: 2 })).toBe(false);
  });
});

// ── What the 2D path degrades, and says it degraded ──────────────────────────

/** The smallest {@link CompositeContext2D} that records what it drew. */
class RecordingCompositeContext implements CompositeContext2D<string> {
  globalAlpha = 1;
  globalCompositeOperation = "source-over";
  filter = "none";
  shadowColor = "rgba(0, 0, 0, 0)";
  shadowBlur = 0;
  shadowOffsetX = 0;
  shadowOffsetY = 0;
  fillStyle: string | object = "#000";
  readonly draws: string[] = [];

  save(): void {}
  restore(): void {}
  setTransform(): void {}
  clearRect(): void {}
  fillRect(): void {}
  beginPath(): void {}
  closePath(): void {}
  rect(): void {}
  moveTo(): void {}
  lineTo(): void {}
  bezierCurveTo(): void {}
  quadraticCurveTo(): void {}
  ellipse(): void {}
  arcTo(): void {}
  clip(): void {}
  fill(): void {}
  translate(): void {}
  scale(): void {}
  drawImage(source: string): void {
    this.draws.push(source);
  }
  createLinearGradient(): CanvasGradient2D {
    return { addColorStop: () => {} };
  }
  createRadialGradient(): CanvasGradient2D {
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

const GEOMETRY = { canvasWidth: 100, canvasHeight: 100 };

const drawLayer = (
  over: Partial<Canvas2DLayer<string>> = {}
): Canvas2DLayer<string> => ({
  source: "shot",
  sourceWidth: 100,
  sourceHeight: 100,
  opacity: 1,
  blendMode: "normal",
  zIndex: 0,
  ...over
});

describe("drawTimelineFrame — the masks and mattes it degrades", () => {
  it("draws a feathered mask hard, and reports the hard edge", () => {
    const ctx = new RecordingCompositeContext();
    const { degraded } = drawTimelineFrame(
      ctx,
      [drawLayer({ clipId: "shot", shapeMask: { kind: "rect", featherPx: 8 } })],
      GEOMETRY
    );

    expect(ctx.draws).toEqual(["shot"]);
    expect(degraded).toEqual([{ clipId: "shot", reason: "mask_hard_edge" }]);
  });

  it("keeps a hard mask off the list — the path clip is the same edge", () => {
    const ctx = new RecordingCompositeContext();
    const { degraded } = drawTimelineFrame(
      ctx,
      [drawLayer({ clipId: "shot", shapeMask: { kind: "rect" } })],
      GEOMETRY
    );

    expect(degraded).toEqual([]);
  });

  it("draws a matted layer unmatted, and reports the matte it dropped", () => {
    const ctx = new RecordingCompositeContext();
    const { degraded } = drawTimelineFrame(
      ctx,
      [
        drawLayer({
          clipId: "shot",
          matte: {
            mode: "luma",
            invert: false,
            layer: drawLayer({ clipId: "key", source: "key" })
          }
        })
      ],
      GEOMETRY
    );

    // The picture survives — unmatted, which is a visible difference from the
    // GPU render and so has to be named (I7).
    expect(ctx.draws).toEqual(["shot"]);
    expect(degraded).toEqual([{ clipId: "shot", reason: "matte_skipped" }]);
  });

  it("reports nothing when the host vends the pair a matte needs", () => {
    const ctx = new RecordingCompositeContext();
    const surfaces = [
      new RecordingCompositeContext(),
      new RecordingCompositeContext()
    ];
    let taken = 0;
    const { degraded } = drawTimelineFrame(
      ctx,
      [
        drawLayer({
          clipId: "shot",
          matte: {
            mode: "alpha",
            invert: false,
            layer: drawLayer({ clipId: "key", source: "key" })
          }
        })
      ],
      GEOMETRY,
      {
        matteSurface: () => {
          const index = taken++;
          return { ctx: surfaces[index]!, surface: `surface-${index}` };
        }
      }
    );

    expect(ctx.draws).toEqual(["surface-0"]);
    expect(degraded).toEqual([]);
  });
});
