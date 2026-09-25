import { createCanvas, type Canvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { compileClipAnimations } from "../src/animation/compile.js";
import { resolveAnimatedStyleTracks, resolveAnimatedTextContent, morphCompatiblePath, validateAnimationStyleTracks } from "../src/animation/styleTracks.js";
import { applyCpuVisualEffects } from "../src/render/cpuVisualEffects.js";
import { applyCpuLegacyEffects } from "../src/render/cpuLegacyEffects.js";
import { drawTimelineFrame, type CompositeContext2D } from "../src/render/canvas2d.js";
import type { ClipAnimation } from "../src/animation/types.js";
import type { ClipEffect } from "../src/types.js";

const canvas = { width: 1000, height: 1000 };

describe("visual animation tracks", () => {
  it("interpolates colors, gradient angle, radius and effect strength", () => {
    const animation: ClipAnimation = {
      id: "a", preset: "custom", role: "emphasis", durationMs: 1000,
      styleTracks: [
        { target: "shape.fill", keyframes: [{ t: 0, value: "#000000" }, { t: 1, value: "#ffffff" }] },
        { target: "shape.cornerRadius", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 0.2 }] },
        { target: "clip.borderRadius", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 30 }] },
        { target: "mask.radiusPx", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 20 }] },
        { target: "shape.fillStyle.angle", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 90 }] },
        { target: "effect.glow.strength", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 2 }] }
      ]
    };
    const clip = {
      animations: [animation],
      shapeStyle: { kind: "rect", fill: "#000000", cornerRadius: 0,
        fillStyle: { type: "linear" as const, angle: 0, stops: [
          { offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }
        ] } },
      effects: [{ id: "glow", type: "glow" as const, enabled: true, radius: 5, strength: 0 }],
      mask: { kind: "rect", radiusPx: 0 }, borderRadius: 0
    };
    const compiled = compileClipAnimations(clip.animations, 1000, canvas);
    const resolved = resolveAnimatedStyleTracks(clip, compiled, 500);
    expect(resolved.shapeStyle?.fill).toBe("#808080ff");
    expect(resolved.shapeStyle?.cornerRadius).toBeCloseTo(0.1);
    expect(resolved.borderRadius).toBeCloseTo(15);
    expect(resolved.clipMask?.radiusPx).toBeCloseTo(10);
    expect(resolved.shapeStyle?.fillStyle?.type).toBe("linear");
    if (resolved.shapeStyle?.fillStyle?.type === "linear") {
      expect(resolved.shapeStyle.fillStyle.angle).toBeCloseTo(45);
    }
    expect(resolved.effects?.[0]).toMatchObject({ strength: 1 });
  });

  it("morphs compatible cubic paths and rejects incompatible commands", () => {
    expect(morphCompatiblePath("M 0 0 C 0 0 1 1 1 1", "M 0 1 C 0 1 1 0 1 0", 0.5))
      .toBe("M 0 0.5 C 0 0.5 1 0.5 1 0.5");
    expect(morphCompatiblePath("M 0 0 L 1 1", "M 0 0 C 0 0 1 1 1 1", 0.5)).toBeNull();
  });

  it("interpolates named and RGB CSS colors", () => {
    const animation: ClipAnimation = {
      id: "css", preset: "custom", role: "emphasis", durationMs: 1000,
      styleTracks: [{ target: "text.color", keyframes: [
        { t: 0, value: "red" }, { t: 1, value: "rgb(0 0 255)" }
      ] }]
    };
    const clip = { animations: [animation], textStyle: { text: "CSS", color: "red", fontSizePx: 40 } };
    const compiled = compileClipAnimations([animation], 1000, canvas);
    expect(resolveAnimatedStyleTracks(clip, compiled, 500).textStyle?.color).toBe("#800080ff");
  });

  it("interpolates supported effect colors and rejects unrelated string fields", () => {
    const effect = { id: "field", type: "generator" as const, mode: "gradientField" as const,
      enabled: true, colorA: "#000000", colorB: "#0000ff", scale: 4 };
    const colorTrack = { target: "effect.field.colorB", keyframes: [
      { t: 0, value: "red" }, { t: 1, value: "rgb(0 0 255)" }
    ] };
    const animation: ClipAnimation = { id: "color", preset: "custom", role: "emphasis", durationMs: 1000,
      styleTracks: [colorTrack] };
    const clip = { animations: [animation], effects: [effect] };
    expect(validateAnimationStyleTracks(clip, [colorTrack])).toEqual([]);
    expect(resolveAnimatedStyleTracks(clip, compileClipAnimations([animation], 1000, canvas), 500).effects?.[0])
      .toMatchObject({ colorB: "#800080ff", scale: 4 });
    expect(validateAnimationStyleTracks(clip, [
      { target: "effect.field.mode", keyframes: [{ t: 0, value: "noise" }, { t: 1, value: "particles" }] },
      { target: "effect.field.colorB", keyframes: [{ t: 0, value: "red" }, { t: 1, value: "not-a-color" }] }
    ])).toHaveLength(2);
    const pixels = (): { data: Uint8ClampedArray; width: number; height: number } => {
      const data = new Uint8ClampedArray(16 * 16 * 4);
      for (let index = 0; index < data.length; index += 4) data.set([0, 0, 0, 255], index);
      return { data, width: 16, height: 16 };
    };
    const before = pixels();
    const after = pixels();
    applyCpuVisualEffects(before, [effect]);
    applyCpuVisualEffects(after, resolveAnimatedStyleTracks(clip,
      compileClipAnimations([animation], 1000, canvas), 500).effects ?? []);
    expect(after.data).not.toEqual(before.data);
  });

  it("recognizes only color fields present on supported effect types", () => {
    const effects: ClipEffect[] = [
      { id: "stylize", type: "stylize", mode: "lightLeakOverlay", enabled: true, amount: 1, color: "#ffffff" },
      { id: "rgb", type: "stylize", mode: "rgbSplit", enabled: true, amount: 1, color: "#ffffff" },
      { id: "glow", type: "glow", enabled: true, radius: 5, intensity: 1, color: "#ffffff" },
      { id: "shadow", type: "dropShadow", enabled: true, offsetX: 0, offsetY: 0, blur: 5, color: "#ffffff" },
      { id: "key", type: "chromaKey", enabled: true, color: "#ffffff", tolerance: 0.2, softness: 0.1 },
      { id: "lut", type: "lut", enabled: true, cube: "LUT_3D_SIZE 2" }
    ];
    const track = (target: string) => ({ target, keyframes: [
      { t: 0, value: "#000000" }, { t: 1, value: "#ffffff" }
    ] });
    for (const id of ["stylize", "shadow", "key"]) {
      expect(validateAnimationStyleTracks({ effects }, [track(`effect.${id}.color`)])).toEqual([]);
    }
    expect(validateAnimationStyleTracks({ effects }, [track("effect.glow.color")])).toHaveLength(1);
    expect(validateAnimationStyleTracks({ effects }, [track("effect.rgb.color")])).toHaveLength(1);
    expect(validateAnimationStyleTracks({ effects }, [track("effect.lut.cube")])).toHaveLength(1);
  });

  it("renders a visible color change for every supported effect family", () => {
    const animated = (effect: ClipEffect, field: string): ClipEffect => {
      const animation: ClipAnimation = { id: "effect-color", preset: "custom", role: "emphasis", durationMs: 1000,
        styleTracks: [{ target: `effect.${effect.id}.${field}`, keyframes: [
          { t: 0, value: "#ff0000" }, { t: 1, value: "#0000ff" }
        ] }] };
      expect(validateAnimationStyleTracks({ effects: [effect] }, animation.styleTracks ?? [])).toEqual([]);
      return resolveAnimatedStyleTracks({ animations: [animation], effects: [effect] },
        compileClipAnimations([animation], 1000, { width: 32, height: 32 }), 500).effects![0];
    };
    const pixels = (r: number, g: number, b: number) => {
      const data = new Uint8ClampedArray(32 * 32 * 4);
      for (let index = 0; index < data.length; index += 4) data.set([r, g, b, 255], index);
      return { data, width: 32, height: 32 };
    };
    const visualOutput = (effect: ClipEffect) => {
      const image = pixels(0, 0, 0);
      applyCpuVisualEffects(image, [effect]);
      return image.data;
    };
    const generator: ClipEffect = { id: "generator", type: "generator", mode: "conicGradient",
      enabled: true, amount: 0.5, colorA: "#ff0000", colorB: "#ff0000" };
    for (const field of ["colorA", "colorB"]) {
      expect(visualOutput(animated(generator, field))).not.toEqual(visualOutput(generator));
    }
    const stylize: ClipEffect = { id: "stylize", type: "stylize", mode: "lightLeakOverlay",
      enabled: true, amount: 1, scale: 2, color: "#ff0000" };
    expect(visualOutput(animated(stylize, "color"))).not.toEqual(visualOutput(stylize));

    const chromaKey: ClipEffect = { id: "key", type: "chromaKey", enabled: true,
      color: "#ff0000", tolerance: 0.05, softness: 0.05 };
    const keyed = (effect: ClipEffect) => {
      const image = pixels(255, 0, 0);
      applyCpuLegacyEffects(image, [effect]);
      return image.data;
    };
    expect(keyed(animated(chromaKey, "color"))).not.toEqual(keyed(chromaKey));

    const source = createCanvas(32, 32);
    const sourceContext = source.getContext("2d");
    sourceContext.fillStyle = "#ffffff";
    sourceContext.fillRect(8, 8, 4, 4);
    const shadow: ClipEffect = { id: "shadow", type: "dropShadow", enabled: true,
      offsetX: 8, offsetY: 0, blur: 0, color: "#ff0000" };
    const shadowed = (effect: ClipEffect) => {
      const output = createCanvas(32, 32);
      drawTimelineFrame(output.getContext("2d") as unknown as CompositeContext2D<Canvas>, [{
        source, sourceWidth: 32, sourceHeight: 32, opacity: 1, blendMode: "normal", zIndex: 0,
        effects: [effect]
      }], { canvasWidth: 32, canvasHeight: 32 }, { alpha: true });
      return output.getContext("2d").getImageData(0, 0, 32, 32).data;
    };
    expect(shadowed(animated(shadow, "color"))).not.toEqual(shadowed(shadow));
  });

  it("reports tracks hidden by an active fill or incompatible geometry", () => {
    const frames = [{ t: 0, value: "red" }, { t: 1, value: "blue" }];
    const errors = validateAnimationStyleTracks({
      shapeStyle: { kind: "ellipse", fillStyle: { type: "solid", color: "red" } },
      textStyle: { text: "A", fontSizePx: 20, color: "red", fill: { type: "solid", color: "blue" } },
      mask: { kind: "ellipse" }
    }, [
      { target: "shape.fill", keyframes: frames },
      { target: "text.color", keyframes: frames },
      { target: "mask.radiusPx", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 10 }] },
      { target: "shape.d", keyframes: [{ t: 0, value: "M 0 0 L 1 1" }, { t: 1, value: "M 0 1 L 1 0" }] }
    ]);
    expect(errors).toHaveLength(4);
  });

  it("leaves an authored style unchanged when its animation is disabled", () => {
    const animation: ClipAnimation = {
      id: "disabled", preset: "custom", role: "emphasis", durationMs: 1000,
      enabled: false,
      styleTracks: [{ target: "clip.borderRadius", keyframes: [
        { t: 0, value: 0 }, { t: 1, value: 40 }
      ] }]
    };
    const clip = { animations: [animation], borderRadius: 6 };
    expect(resolveAnimatedStyleTracks(clip, compileClipAnimations([animation], 1000, canvas), 500).borderRadius).toBe(6);
  });

  it("renders a padded ticker and deterministic scramble from one clock", () => {
    const ticker: ClipAnimation = { id: "ticker", preset: "custom", role: "emphasis", durationMs: 1000,
      textAnimator: { kind: "ticker", from: 0, to: 7, padTo: 2 } };
    const compiled = compileClipAnimations([ticker], 1000, canvas);
    expect(resolveAnimatedTextContent({ animations: [ticker], textStyle: { text: "00", fontSizePx: 30, color: "#fff" } }, compiled, 500)).toBe("04");

    const scramble: ClipAnimation = { id: "scramble", preset: "custom", role: "emphasis", durationMs: 1000,
      textAnimator: { kind: "scramble", seed: 4 } };
    const scrambleCompiled = compileClipAnimations([scramble], 1000, canvas);
    const input = { animations: [scramble], textStyle: { text: "HELLO", fontSizePx: 30, color: "#fff" } };
    expect(resolveAnimatedTextContent(input, scrambleCompiled, 500)).toBe(resolveAnimatedTextContent(input, scrambleCompiled, 500));
    expect(resolveAnimatedTextContent(input, scrambleCompiled, 1000)).toBe("HELLO");
  });

  it("groups ticker thousands when requested and preserves ungrouped legacy output", () => {
    const make = (groupSeparator?: string): ClipAnimation => ({
      id: "count", preset: "custom", role: "emphasis", durationMs: 1000,
      textAnimator: { kind: "ticker", from: 0, to: 2847, decimals: 1, groupSeparator }
    });
    const content = (animation: ClipAnimation) => resolveAnimatedTextContent(
      { animations: [animation], textStyle: { text: "0", fontSizePx: 30, color: "#fff" } },
      compileClipAnimations([animation], 1000, canvas), 1000
    );
    expect(content(make())).toBe("2847.0");
    expect(content(make(","))).toBe("2,847.0");
    expect(content(make(" "))).toBe("2 847.0");
    expect(content(make("$&"))).toBe("2$&847.0");
    expect(content(make("$$"))).toBe("2$$847.0");
    const precise: ClipAnimation = { id: "precise", preset: "custom", role: "emphasis", durationMs: 1000,
      textAnimator: { kind: "ticker", from: 0, to: 2847.123456, decimals: 6, groupSeparator: "," } };
    expect(content(precise)).toBe("2,847.123456");
  });
});
