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
import { makeClip } from "../src/index.js";
import type { ClipEffect, TrackEffect } from "../src/index.js";
import { resolveAnimatedLayerProps } from "../src/render/sceneModel.js";
import {
  drawTimelineFrame,
  unsupportedEffectTypes,
  type Canvas2DLayer,
  type CompositeContext2D
} from "../src/render/canvas2d.js";

const GEOMETRY = { canvasWidth: 100, canvasHeight: 100 };

/** One of every type the document can carry, so the split is asserted whole. */
const everyEffect: ClipEffect[] = [
  {
    id: "1",
    type: "color",
    enabled: true,
    brightness: 0.2,
    temperature: 0.3,
    tint: -0.2
  },
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

/**
 * A context whose pixels are real, so a per-pixel pass can be read back. The
 * buffer is one flat value, which is all a numeric grade check needs.
 */
class PixelContext extends RecordingContext {
  pixels: Uint8ClampedArray;

  constructor(value: number, pixelCount = 4) {
    super();
    this.pixels = new Uint8ClampedArray(pixelCount * 4);
    for (let i = 0; i < this.pixels.length; i += 4) {
      this.pixels[i] = value;
      this.pixels[i + 1] = value;
      this.pixels[i + 2] = value;
      this.pixels[i + 3] = 255;
    }
  }

  override getImageData(
    _x: number,
    _y: number,
    w: number,
    h: number
  ): { data: Uint8ClampedArray; width: number; height: number } {
    return { data: this.pixels, width: w, height: h };
  }

  override putImageData(pixels: { data: Uint8ClampedArray }): void {
    this.pixels = pixels.data;
  }
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
      "color.temperature",
      "color.tint",
      "curves",
      "glow",
      "levels",
      "liftGammaGain",
      "sharpen",
      "vignette"
    ]);
  });

  it("reports the white balance a `ctx.filter` grade has no knob for", () => {
    // `color` is a type this path draws, so a whole-type report would never
    // name it — and temperature and tint would go to the GPU and not to 2D
    // with nothing to read about the difference (I7).
    const warm: ClipEffect[] = [
      { id: "c", type: "color", enabled: true, temperature: 0.4 }
    ];
    expect(unsupportedEffectTypes([{ effects: warm }])).toEqual([
      "color.temperature"
    ]);

    const green: ClipEffect[] = [
      { id: "c", type: "color", enabled: true, tint: -0.4 }
    ];
    expect(unsupportedEffectTypes([{ effects: green }])).toEqual(["color.tint"]);
  });

  it("reports the shadow and highlight rolloff the filter has no knob for", () => {
    // Both run on the GPU (`colorGradeV1`) and neither maps onto `ctx.filter`,
    // so without this the two hosts grade the same clip differently with
    // nothing to read about it (I7).
    const lifted: ClipEffect[] = [
      { id: "c", type: "color", enabled: true, shadows: 0.4 }
    ];
    expect(unsupportedEffectTypes([{ effects: lifted }])).toEqual([
      "color.shadows"
    ]);

    const rolled: ClipEffect[] = [
      { id: "c", type: "color", enabled: true, highlights: -0.3 }
    ];
    expect(unsupportedEffectTypes([{ effects: rolled }])).toEqual([
      "color.highlights"
    ]);

    const track: TrackEffect[] = [
      {
        id: "t",
        type: "colorCorrection",
        enabled: true,
        brightness: 0,
        contrast: 1,
        saturation: 1,
        hue: 0,
        temperature: 0,
        tint: 0,
        shadows: 0.5,
        highlights: 0.5
      }
    ];
    expect(unsupportedEffectTypes([{ trackEffects: track }])).toEqual([
      "color.highlights",
      "color.shadows"
    ]);
  });

  it("keeps a grade at the white-balance identity off the list", () => {
    const neutral: ClipEffect[] = [
      {
        id: "c",
        type: "color",
        enabled: true,
        brightness: 0.5,
        contrast: 1.4,
        saturation: 0.6,
        hue: 30,
        temperature: 0,
        tint: 0
      }
    ];
    expect(unsupportedEffectTypes([{ effects: neutral }])).toEqual([]);
  });

  it("reports the animated grade the scene model synthesizes", () => {
    // An animated temperature curve reaches the compositor as an ordinary
    // enabled `color` effect (`composeAnimatedEffects`), so the report has to
    // read the channel rather than the document's static effect list.
    const props = resolveAnimatedLayerProps(
      {
        clip: makeClip({
          status: "generated",
          mediaType: "shape",
          startMs: 0,
          durationMs: 2000,
          animations: [
            {
              id: "warm",
              role: "in",
              preset: "custom",
              durationMs: 1000,
              easing: "linear",
              custom: {
                curves: [
                  {
                    property: "temperature",
                    keyframes: [
                      { t: 0, value: 0.4 },
                      { t: 1, value: 0.4 }
                    ]
                  }
                ]
              }
            }
          ]
        }),
        opacity: 1
      },
      500,
      { width: 100, height: 100 }
    );

    expect(props.effects).toHaveLength(1);
    expect(unsupportedEffectTypes([{ effects: props.effects }])).toEqual([
      "color.temperature"
    ]);
  });

  it("still reports the white balance a track grade carries", () => {
    const track: TrackEffect[] = [
      {
        id: "t",
        type: "colorCorrection",
        enabled: true,
        brightness: 0,
        contrast: 1,
        saturation: 1,
        hue: 0,
        temperature: 0.5,
        tint: 0,
        shadows: 0,
        highlights: 0
      }
    ];
    expect(unsupportedEffectTypes([{ trackEffects: track }])).toEqual([
      "color.temperature"
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

  it("arms the first drop shadow and reports the rest as degraded", () => {
    // `mixer.dropShadow@1` runs once per enabled effect in document order;
    // `ctx.shadow*` is one set of fields, so the second cast is not drawn.
    const ctx = new RecordingContext();
    const { degraded } = drawTimelineFrame(
      ctx,
      [
        layer({
          clipId: "shot",
          effects: [
            {
              id: "s1",
              type: "dropShadow",
              enabled: true,
              offsetX: 4,
              offsetY: 4,
              blur: 3,
              color: "#ff0000"
            },
            {
              id: "s2",
              type: "dropShadow",
              enabled: true,
              offsetX: 20,
              offsetY: 20,
              blur: 12,
              color: "#00ff00"
            }
          ]
        })
      ],
      GEOMETRY
    );

    expect(ctx.draws[0]?.shadowColor).toBe("rgba(255, 0, 0, 1)");
    expect(degraded).toEqual([
      { clipId: "shot", reason: "drop_shadow_extra_ignored" }
    ]);
  });
});

describe("Canvas 2D — brightness parity with the GPU grade", () => {
  const lift: ClipEffect[] = [
    { id: "b", type: "color", enabled: true, brightness: 0.25 }
  ];

  it("adds brightness on a scratch copy rather than multiplying it", () => {
    const ctx = new RecordingContext();
    const scratch = new PixelContext(128);
    const { degraded } = drawTimelineFrame(
      ctx,
      [layer({ clipId: "shot", effects: lift })],
      GEOMETRY,
      { maskScratch: () => ({ ctx: scratch, surface: "scratch" }) }
    );

    // `colorGradeV1` is `rgb + brightness` on straight colour, so mid-grey at
    // +0.25 is 128 + 0.25 × 255 = 192. A CSS `brightness(1.25)` multiplies and
    // lands on 160 — the same document, two pictures.
    expect(scratch.pixels[0]).toBe(192);
    expect(scratch.pixels[3]).toBe(255);
    // The brightened copy is what reaches the frame, and the filter no longer
    // carries a brightness term that would apply the lift twice.
    expect(ctx.draws[0]?.source).toBe("scratch");
    expect(ctx.draws[0]?.filter).toBe("none");
    expect(degraded).toEqual([]);
  });

  it("subtracts a negative brightness on the same pass", () => {
    const ctx = new RecordingContext();
    const scratch = new PixelContext(128);
    drawTimelineFrame(ctx, [layer({ effects: [
      { id: "b", type: "color", enabled: true, brightness: -0.25 }
    ] })], GEOMETRY, {
      maskScratch: () => ({ ctx: scratch, surface: "scratch" })
    });

    expect(scratch.pixels[0]).toBe(64);
  });

  it("keeps the rest of the grade in the filter, after the lift", () => {
    const ctx = new RecordingContext();
    const scratch = new PixelContext(128);
    drawTimelineFrame(
      ctx,
      [
        layer({
          effects: [
            {
              id: "g",
              type: "color",
              enabled: true,
              brightness: 0.25,
              contrast: 1.5
            }
          ]
        })
      ],
      GEOMETRY,
      { maskScratch: () => ({ ctx: scratch, surface: "scratch" }) }
    );

    // The shader runs brightness before contrast; drawing the brightened copy
    // through the remaining filter is the same order.
    expect(scratch.pixels[0]).toBe(192);
    expect(ctx.draws[0]?.filter).toBe("contrast(1.500)");
  });

  it("falls back to the CSS multiply and says so with no scratch surface", () => {
    const ctx = new RecordingContext();
    const { degraded } = drawTimelineFrame(
      ctx,
      [layer({ clipId: "shot", effects: lift })],
      GEOMETRY
    );

    expect(ctx.draws[0]?.filter).toBe("brightness(1.250)");
    expect(degraded).toEqual([
      { clipId: "shot", reason: "brightness_multiplicative" }
    ]);
  });

  it("asks for no scratch when the grade moves no brightness", () => {
    const ctx = new RecordingContext();
    const scratch = new PixelContext(128);
    const { degraded } = drawTimelineFrame(
      ctx,
      [
        layer({
          effects: [
            { id: "c", type: "color", enabled: true, contrast: 1.5 }
          ]
        })
      ],
      GEOMETRY,
      { maskScratch: () => ({ ctx: scratch, surface: "scratch" }) }
    );

    expect(ctx.draws[0]?.source).toBe("l1");
    expect(ctx.draws[0]?.filter).toBe("contrast(1.500)");
    expect(degraded).toEqual([]);
  });
});
