/**
 * Clip effects from the shader catalog on the Canvas 2D path (F12, T13, D7).
 *
 * Canvas 2D draws exactly one of the eight new types — `dropShadow`, through
 * `ctx.shadow*` — and has no equivalent for the rest. What is asserted here is
 * that it says so exactly (I7): a type this path silently skipped would show
 * up as a frame that differs from the GPU render with nothing to read about it.
 *
 * Pixels are the GPU suite's subject (`render.clipEffects.gpu.test.ts`); this
 * one records the context state each draw ran under.
 */
import { describe, expect, it } from "vitest";
import type { ClipEffect, TrackEffect } from "../src/index.js";
import {
  drawTimelineFrame,
  unsupportedEffectTypes,
  type Canvas2DLayer,
  type CompositeContext2D
} from "../src/render/canvas2d.js";

const GEOMETRY = { canvasWidth: 100, canvasHeight: 100 };

/** One of every type the document can carry, so the split is asserted whole. */
const everyEffect: ClipEffect[] = [
  { id: "1", type: "color", enabled: true, brightness: 0.2 },
  { id: "2", type: "blur", enabled: true, radius: 4 },
  { id: "3", type: "glow", enabled: true, radius: 8, intensity: 1 },
  {
    id: "4",
    type: "dropShadow",
    enabled: true,
    offsetX: 6,
    offsetY: 6,
    blur: 9,
    color: "#102030"
  },
  { id: "5", type: "vignette", enabled: true, amount: 0.5, softness: 0.4 },
  { id: "6", type: "sharpen", enabled: true, amount: 1 },
  {
    id: "7",
    type: "chromaKey",
    enabled: true,
    color: "#00ff00",
    tolerance: 0.2,
    softness: 0.05
  },
  {
    id: "8",
    type: "curves",
    enabled: true,
    master: [
      { x: 0, y: 0 },
      { x: 1, y: 1 }
    ]
  },
  {
    id: "9",
    type: "levels",
    enabled: true,
    inBlack: 0,
    inWhite: 1,
    gamma: 1,
    outBlack: 0,
    outWhite: 1
  },
  {
    id: "10",
    type: "liftGammaGain",
    enabled: true,
    lift: [0, 0, 0],
    gamma: [1, 1, 1],
    gain: [1, 1, 1]
  }
];

/** The shadow state a `drawImage` ran under, alongside the filter. */
interface RecordedDraw {
  source: string;
  filter: string;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
}

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

  save(): void {}
  restore(): void {}
  setTransform(): void {}
  clearRect(): void {}
  fillRect(): void {}
  beginPath(): void {}
  closePath(): void {}
  rect(): void {}
  arcTo(): void {}
  clip(): void {}
  drawImage(source: string): void {
    this.draws.push({
      source,
      filter: this.filter,
      shadowColor: this.shadowColor,
      shadowBlur: this.shadowBlur,
      shadowOffsetX: this.shadowOffsetX,
      shadowOffsetY: this.shadowOffsetY
    });
  }
  createLinearGradient(): { addColorStop(o: number, c: string): void } {
    return { addColorStop: () => {} };
  }
  lineTo(): void {}
  moveTo(): void {}
  bezierCurveTo(): void {}
  quadraticCurveTo(): void {}
  ellipse(): void {}
  fill(): void {}
  translate(): void {}
  scale(): void {}
  createRadialGradient(): { addColorStop(o: number, c: string): void } {
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

const layer = (
  over: Partial<Canvas2DLayer<string>>
): Canvas2DLayer<string> => ({
  source: "l1",
  sourceWidth: 100,
  sourceHeight: 100,
  opacity: 1,
  blendMode: "normal",
  zIndex: 0,
  ...over
});

describe("Canvas 2D — the clip effect catalog", () => {
  it("reports exactly the types it cannot draw", () => {
    expect(unsupportedEffectTypes([{ effects: everyEffect }])).toEqual([
      "chromaKey",
      "curves",
      "glow",
      "levels",
      "liftGammaGain",
      "sharpen",
      "vignette"
    ]);
  });

  it("keeps dropShadow off that list — it is the one it draws", () => {
    const shadow = everyEffect.filter((e) => e.type === "dropShadow");
    expect(unsupportedEffectTypes([{ effects: shadow }])).toEqual([]);
  });

  it("does not report a disabled effect it would otherwise skip", () => {
    const off = everyEffect.map((e) => ({ ...e, enabled: false }));
    expect(unsupportedEffectTypes([{ effects: off }])).toEqual([]);
  });

  it("still reports the track effects it cannot draw", () => {
    const track: TrackEffect[] = [
      { id: "t1", type: "videoBlur", enabled: true, radius: 3 },
      {
        id: "t2",
        type: "chromaKey",
        enabled: true,
        keyColor: "#00ff00",
        tolerance: 0.2,
        softness: 0.05,
        spill: 0.5
      }
    ];
    expect(unsupportedEffectTypes([{ trackEffects: track }])).toEqual([
      "chromaKey"
    ]);
  });

  it("arms the shadow from the chain, in canvas units", () => {
    const ctx = new RecordingContext();
    drawTimelineFrame(
      ctx,
      [
        layer({
          effects: [
            {
              id: "s",
              type: "dropShadow",
              enabled: true,
              offsetX: 10,
              offsetY: 0,
              blur: 9,
              color: "#ff0000",
              opacity: 0.5
            }
          ]
        })
      ],
      GEOMETRY
    );

    const draw = ctx.draws[0];
    expect(draw?.shadowColor).toBe("rgba(255, 0, 0, 0.5)");
    // The layer fills the frame at 1:1, so a 10px source offset is 10 canvas
    // px, and `shadowBlur` is two thirds of the radius (it is twice the
    // Gaussian sigma the GPU recipe derives as a third of its radius).
    expect(draw?.shadowOffsetX).toBeCloseTo(10, 5);
    expect(draw?.shadowOffsetY).toBeCloseTo(0, 5);
    expect(draw?.shadowBlur).toBeCloseTo(6, 5);
  });

  it("scales the offset with the layer, the way the GPU path does", () => {
    const ctx = new RecordingContext();
    drawTimelineFrame(
      ctx,
      [
        layer({
          transform: {
            position: { x: 0, y: 0 },
            scale: { x: 0.5, y: 0.5 },
            rotation: 0,
            anchor: { x: 0.5, y: 0.5 }
          },
          effects: [
            {
              id: "s",
              type: "dropShadow",
              enabled: true,
              offsetX: 10,
              offsetY: 0,
              blur: 9,
              color: "#000000"
            }
          ]
        })
      ],
      GEOMETRY
    );

    expect(ctx.draws[0]?.shadowOffsetX).toBeCloseTo(5, 5);
    expect(ctx.draws[0]?.shadowBlur).toBeCloseTo(3, 5);
  });

  it("leaves no shadow armed for the next layer", () => {
    const ctx = new RecordingContext();
    drawTimelineFrame(
      ctx,
      [
        layer({
          zIndex: 0,
          source: "shadowed",
          effects: [
            {
              id: "s",
              type: "dropShadow",
              enabled: true,
              offsetX: 8,
              offsetY: 8,
              blur: 6,
              color: "#000000"
            }
          ]
        }),
        layer({ zIndex: 1, source: "plain" })
      ],
      GEOMETRY
    );

    expect(ctx.draws.map((d) => d.source)).toEqual(["shadowed", "plain"]);
    expect(ctx.draws[1]?.shadowBlur).toBe(0);
    expect(ctx.draws[1]?.shadowOffsetX).toBe(0);
  });
});
