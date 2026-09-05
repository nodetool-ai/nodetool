/**
 * The legacy track-effect spellings, pinned on the Canvas 2D path.
 *
 * `TrackEffect`'s video kinds (`colorCorrection`, `videoBlur`, `sharpen`,
 * `vignette`, `chromaKey`) and `ClipEffect` do the same job under different
 * field names, and a migration that folds the first into the second is
 * proposed. Saved documents carry the legacy spellings, so this fixture states
 * what they draw today: any such migration has to leave every expectation here
 * untouched.
 *
 * The GPU chain is the other half and is not asserted here — it needs a
 * WebGPU device (`render.clipEffects.gpu.test.ts` skips without one).
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

class FilterRecorder implements CompositeContext2D<string> {
  globalAlpha = 1;
  globalCompositeOperation = "source-over";
  filter = "none";
  shadowColor = "rgba(0, 0, 0, 0)";
  shadowBlur = 0;
  shadowOffsetX = 0;
  shadowOffsetY = 0;
  fillStyle: string | object = "#000";
  readonly filters: string[] = [];

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
  drawImage(): void {
    this.filters.push(this.filter);
  }
  createLinearGradient(): { addColorStop(o: number, c: string): void } {
    return { addColorStop: () => {} };
  }
  createRadialGradient(): { addColorStop(o: number, c: string): void } {
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

const drawFilter = (over: Partial<Canvas2DLayer<string>>): string => {
  const ctx = new FilterRecorder();
  drawTimelineFrame(ctx, [layer(over)], GEOMETRY);
  return ctx.filters[0] ?? "none";
};

/** A grade in the legacy track spelling: every field required, no `?`. */
const legacyGrade: TrackEffect = {
  id: "t-cc",
  type: "colorCorrection",
  enabled: true,
  brightness: 0.2,
  contrast: 1.5,
  saturation: 0.5,
  hue: 30,
  temperature: 0,
  tint: 0,
  shadows: 0,
  highlights: 0
};

const legacyBlur: TrackEffect = {
  id: "t-blur",
  type: "videoBlur",
  enabled: true,
  radius: 6
};

describe("legacy track effects on the Canvas 2D path", () => {
  it("draws a `colorCorrection` track effect as the same filter a clip `color` gives", () => {
    const track = drawFilter({ trackEffects: [legacyGrade] });
    const clip: ClipEffect[] = [
      {
        id: "c",
        type: "color",
        enabled: true,
        brightness: 0.2,
        contrast: 1.5,
        saturation: 0.5,
        hue: 30
      }
    ];
    expect(track).toBe("brightness(1.200) contrast(1.500) saturate(0.500) hue-rotate(30.00deg)");
    expect(drawFilter({ effects: clip })).toBe(track);
  });

  it("draws a `videoBlur` track effect as the same filter a clip `blur` gives", () => {
    const track = drawFilter({ trackEffects: [legacyBlur] });
    expect(track).toBe("blur(6.00px)");
    expect(
      drawFilter({ effects: [{ id: "c", type: "blur", enabled: true, radius: 6 }] })
    ).toBe(track);
  });

  it("folds clip and track grades into one filter, track scope last", () => {
    expect(
      drawFilter({
        effects: [
          { id: "c", type: "color", enabled: true, brightness: 0.1, contrast: 2 },
          { id: "b", type: "blur", enabled: true, radius: 2 }
        ],
        trackEffects: [legacyGrade, legacyBlur]
      })
    ).toBe(
      "brightness(1.300) contrast(3.000) saturate(0.500) hue-rotate(30.00deg) blur(8.00px)"
    );
  });

  it("skips a disabled track effect", () => {
    expect(
      drawFilter({ trackEffects: [{ ...legacyGrade, enabled: false }] })
    ).toBe("none");
  });

  it("names the legacy video kinds this path cannot draw", () => {
    const track: TrackEffect[] = [
      { id: "s", type: "sharpen", enabled: true, amount: 1, threshold: 0.3 },
      {
        id: "v",
        type: "vignette",
        enabled: true,
        intensity: 0.4,
        radius: 0.9,
        softness: 0.5
      },
      {
        id: "k",
        type: "chromaKey",
        enabled: true,
        keyColor: "#00ff00",
        tolerance: 0.2,
        softness: 0.1,
        spill: 0.5
      }
    ];
    expect(unsupportedEffectTypes([{ trackEffects: track }])).toEqual([
      "chromaKey",
      "sharpen",
      "vignette"
    ]);
  });
});
