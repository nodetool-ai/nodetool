import {
  isClipChromaKeyEffect, isClipColorEffect, isClipCurvesEffect, isClipGlowEffect,
  isClipGrainEffect, isClipLevelsEffect, isClipLiftGammaGainEffect,
  isClipSharpenEffect, isClipVignetteEffect, type ClipEffect
} from "../types.js";
import { parseCssColorOrBlack } from "./color.js";
import { channelMidtones, fitCurve } from "./curveFitting.js";
import type { PixelBuffer } from "./cpuVisualEffects.js";

const clamp = (v: number): number => Math.max(0, Math.min(1, v));
const smooth = (v: number): number => { const t = clamp(v); return t * t * (3 - 2 * t); };
const byte = (v: number): number => Math.round(clamp(v) * 255);

export function isCpuLegacyEffect(effect: ClipEffect): boolean {
  return isClipGlowEffect(effect) || isClipVignetteEffect(effect)
    || isClipSharpenEffect(effect) || isClipChromaKeyEffect(effect)
    || isClipCurvesEffect(effect) || isClipLevelsEffect(effect)
    || isClipLiftGammaGainEffect(effect) || isClipGrainEffect(effect);
}

/** The GPU pool stores an 8-bit premultiplied intermediate after each pass. */
function premultiply(data: Uint8ClampedArray): Uint8ClampedArray {
  const result = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]! / 255;
    for (let c = 0; c < 3; c++) result[i + c] = Math.round(data[i + c]! * a);
    result[i + 3] = data[i + 3]!;
  }
  return result;
}

function unpremultiply(input: Uint8ClampedArray, output: Uint8ClampedArray): void {
  for (let i = 0; i < input.length; i += 4) {
    const a = input[i + 3]!;
    for (let c = 0; c < 3; c++) output[i + c] = a ? Math.round(input[i + c]! / a * 255) : 0;
    output[i + 3] = a;
  }
}

interface PixelBounds { x0: number; y0: number; x1: number; y1: number }

export function alphaBounds(pixels: PixelBuffer): PixelBounds | null {
  const { width, height, data } = pixels;
  let x0 = width;
  let y0 = height;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < height; y++) {
    let alphaIndex = y * width * 4 + 3;
    for (let x = 0; x < width; x++, alphaIndex += 4) {
      if (data[alphaIndex] === 0) {
        continue;
      }
      if (x < x0) {
        x0 = x;
      }
      if (y < y0) {
        y0 = y;
      }
      if (x + 1 > x1) {
        x1 = x + 1;
      }
      if (y + 1 > y1) {
        y1 = y + 1;
      }
    }
  }
  return x1 > x0 ? { x0, y0, x1, y1 } : null;
}

function extractPixels(pixels: PixelBuffer, bounds: PixelBounds): PixelBuffer {
  const width = bounds.x1 - bounds.x0;
  const height = bounds.y1 - bounds.y0;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const source = ((bounds.y0 + y) * pixels.width + bounds.x0) * 4;
    data.set(pixels.data.subarray(source, source + width * 4), y * width * 4);
  }
  return { width, height, data };
}

function writePixels(pixels: PixelBuffer, bounds: PixelBounds, data: Uint8ClampedArray): void {
  const width = bounds.x1 - bounds.x0;
  for (let y = 0; y < bounds.y1 - bounds.y0; y++) {
    pixels.data.set(data.subarray(y * width * 4, (y + 1) * width * 4), ((bounds.y0 + y) * pixels.width + bounds.x0) * 4);
  }
}

function coversSurface(bounds: PixelBounds, pixels: PixelBuffer): boolean {
  return bounds.x0 === 0 && bounds.y0 === 0 && bounds.x1 === pixels.width && bounds.y1 === pixels.height;
}

function gaussian(input: Uint8ClampedArray, width: number, height: number, radius: number): Uint8ClampedArray {
  if (radius < 0.5) return input;
  const taps = Math.floor(Math.min(radius, 20));
  const step = Math.max(1, radius / 20);
  const sigma = radius / 3;
  const weights = Array.from({ length: taps * 2 + 1 }, (_, i) => Math.exp(-Math.pow((i - taps) * step, 2) / (2 * sigma * sigma)));
  const total = weights.reduce((a, b) => a + b, 0);
  let source = input;
  for (let axis = 0; axis < 2; axis++) {
    const output = new Uint8ClampedArray(input.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        for (let c = 0; c < 4; c++) {
          let sum = 0;
          for (let tap = -taps; tap <= taps; tap++) {
            const offset = Math.round(tap * step);
            const sx = Math.max(0, Math.min(width - 1, x + (axis === 0 ? offset : 0)));
            const sy = Math.max(0, Math.min(height - 1, y + (axis === 1 ? offset : 0)));
            sum += source[(sy * width + sx) * 4 + c]! * weights[tap + taps]!;
          }
          output[(y * width + x) * 4 + c] = Math.round(sum / total);
        }
      }
    }
    source = output;
  }
  return source;
}

// Match the float32 arithmetic of filters.grain@1, including hash rounding.
function grain(x: number, y: number, seed: number, channel: number): number {
  const f = Math.fround;
  const fract = (n: number): number => f(n - Math.floor(n));
  let px = fract(f(f(x) * f(0.1031)));
  let py = fract(f(f(y) * f(0.1031)));
  let pz = fract(f(f(f(seed) + f(channel * f(19.19))) * f(0.1031)));
  const dot = f(f(f(px * f(py + f(33.33))) + f(py * f(pz + f(33.33)))) + f(pz * f(px + f(33.33))));
  px = f(px + dot); py = f(py + dot); pz = f(pz + dot);
  return fract(f(f(px + py) * pz)) * 2 - 1;
}

/** CPU counterparts of the persisted GPU color, keying and texture effects. */
export function applyCpuLegacyEffects(pixels: PixelBuffer, effects: readonly ClipEffect[]): void {
  const { width, height, data } = pixels;
  for (const effect of effects) {
    if (!effect.enabled || !isCpuLegacyEffect(effect)) continue;
    const input = premultiply(data);
    const output = new Uint8ClampedArray(input.length);
    if (isClipGlowEffect(effect)) {
      const bright = new Uint8ClampedArray(input.length);
      for (let i = 0; i < input.length; i += 4) {
        const a = Math.max(1, input[i + 3]!);
        const luma = (input[i]! * 0.299 + input[i + 1]! * 0.587 + input[i + 2]! * 0.114) / a;
        const coverage = smooth((luma - 0.6) / 0.2);
        for (let c = 0; c < 4; c++) bright[i + c] = Math.round(input[i + c]! * coverage);
      }
      const blurred = gaussian(bright, width, height, effect.radius);
      for (let i = 0; i < input.length; i++) output[i] = Math.round(input[i]! + blurred[i]! * effect.intensity);
      unpremultiply(output, data);
      continue;
    }
    const curve = isClipCurvesEffect(effect) ? fitCurve(effect.master) : undefined;
    const channelGamma = isClipCurvesEffect(effect)
      ? [effect.r, effect.g, effect.b].map((points) => 1 / Math.max(0.01, 1 + channelMidtones(points))) : [];
    const key = isClipChromaKeyEffect(effect) ? parseCssColorOrBlack(effect.color) : undefined;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        let a = input[i + 3]! / 255;
        const rgb = [input[i]!, input[i + 1]!, input[i + 2]!].map((v) => v / Math.max(1, input[i + 3]!));
        if (isClipChromaKeyEffect(effect) && key) {
          // Keying reads straight pixels, before the premultiplied bridge.
          for (let c = 0; c < 3; c++) rgb[c] = data[i + c]! / 255;
          const dist = Math.hypot(rgb[0]! - key.r, rgb[1]! - key.g, rgb[2]! - key.b);
          const coverage = smooth((dist - effect.tolerance) / Math.max(effect.softness, 0.001));
          const other = (rgb[0]! + rgb[1]! + rgb[2]! - Math.max(...rgb)) * 0.5;
          const channels = [key.r, key.g, key.b];
          const dominant = channels.indexOf(Math.max(...channels));
          if (channels.filter((v) => v === channels[dominant]).length === 1) {
            const current = rgb[dominant]!;
            rgb[dominant] = current + (Math.min(current, other) - current) * (effect.spill ?? 0.5) * (1 - coverage);
          }
          a *= coverage;
        } else if (isClipSharpenEffect(effect)) {
          const sums = [0, 0, 0];
          let sumA = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const j = (Math.max(0, Math.min(height - 1, y + dy)) * width + Math.max(0, Math.min(width - 1, x + dx))) * 4;
              for (let c = 0; c < 3; c++) sums[c] = sums[c]! + input[j + c]!;
              sumA += input[j + 3]!;
            }
          }
          const diff = rgb.map((v, c) => v - sums[c]! / Math.max(9, sumA));
          const luma = Math.abs(diff[0]! * 0.299 + diff[1]! * 0.587 + diff[2]! * 0.114);
          if (luma >= (effect.threshold ?? 0)) {
            for (let c = 0; c < 3; c++) rgb[c] = clamp(rgb[c]! + diff[c]! * effect.amount);
          }
        } else {
          for (let c = 0; c < 3; c++) {
            let v = rgb[c]!;
            if (isClipLevelsEffect(effect)) {
              v = Math.pow(clamp((v - effect.inBlack) / Math.max(1 / 255, effect.inWhite - effect.inBlack)), 1 / Math.max(0.01, effect.gamma));
              v = v * (effect.outWhite - effect.outBlack) + effect.outBlack;
            } else if (isClipLiftGammaGainEffect(effect)) {
              v = Math.pow(Math.max(0, (v + effect.lift[c]!) * effect.gain[c]!), 1 / Math.max(0.01, effect.gamma[c]!));
            } else if (curve) {
              v = clamp((v - curve.blackPoint) / Math.max(0.001, curve.whitePoint - curve.blackPoint));
              v += curve.shadows * (1 - v) * v;
              v = Math.pow(Math.max(0, v), 1 / Math.max(0.01, 1 + curve.midtones));
              v += curve.highlights * v * (1 - v);
              v = Math.pow(Math.max(0, v), channelGamma[c]!);
            } else if (isClipVignetteEffect(effect)) {
              const radius = effect.radius ?? 0.9;
              const inner = Math.max(0, radius - effect.softness);
              const distance = Math.hypot((x + 0.5) / width * 2 - 1, (y + 0.5) / height * 2 - 1);
              v *= 1 - effect.amount * smooth((distance - inner) / (Math.max(inner + 0.001, radius) - inner));
            } else if (isClipGrainEffect(effect)) {
              const gx = Math.floor(x / Math.max(1, effect.size ?? 1));
              const gy = Math.floor(y / Math.max(1, effect.size ?? 1));
              const mono = grain(gx, gy, effect.seed ?? 0, 0);
              const colored = grain(gx, gy, effect.seed ?? 0, c + 1);
              v *= 1 + (mono + (colored - mono) * clamp(effect.colorAmount ?? 0)) * clamp(effect.amount);
            }
            rgb[c] = clamp(v);
          }
        }
        for (let c = 0; c < 3; c++) output[i + c] = byte(rgb[c]! * a);
        output[i + 3] = byte(a);
      }
    }
    unpremultiply(output, data);
  }
}

export function applyCpuGaussianBlur(pixels: PixelBuffer, radius: number, contentBounds?: PixelBounds | null): void {
  if (radius < 0.5) return;
  if (pixels.data.length !== pixels.width * pixels.height * 4) {
    unpremultiply(gaussian(premultiply(pixels.data), pixels.width, pixels.height, radius), pixels.data);
    return;
  }
  const bounds = contentBounds === undefined ? alphaBounds(pixels) : contentBounds;
  if (!bounds) {
    pixels.data.fill(0);
    return;
  }
  if (coversSurface(bounds, pixels)) {
    unpremultiply(gaussian(premultiply(pixels.data), pixels.width, pixels.height, radius), pixels.data);
    return;
  }
  const taps = Math.floor(Math.min(radius, 20));
  const support = Math.round(taps * Math.max(1, radius / 20));
  const expanded = {
    x0: Math.max(0, bounds.x0 - support),
    y0: Math.max(0, bounds.y0 - support),
    x1: Math.min(pixels.width, bounds.x1 + support),
    y1: Math.min(pixels.height, bounds.y1 + support)
  };
  const region = extractPixels(pixels, expanded);
  pixels.data.fill(0);
  const output = new Uint8ClampedArray(region.data.length);
  unpremultiply(gaussian(premultiply(region.data), region.width, region.height, radius), output);
  writePixels(pixels, expanded, output);
}

/** Aggregate clip and track grades with the same order and bounds as the GPU. */
export function applyCpuColorGrade(pixels: PixelBuffer, effects: readonly ClipEffect[], contentBounds?: PixelBounds | null): void {
  const grade = { brightness: 0, contrast: 1, saturation: 1, hue: 0, temperature: 0, tint: 0, shadows: 0, highlights: 0 };
  let active = false;
  for (const effect of effects) {
    if (!effect.enabled || !isClipColorEffect(effect)) continue;
    active = true;
    grade.brightness += effect.brightness ?? 0;
    grade.contrast *= effect.contrast ?? 1;
    grade.saturation *= effect.saturation ?? 1;
    grade.hue += effect.hue ?? 0;
    grade.temperature += effect.temperature ?? 0;
    grade.tint += effect.tint ?? 0;
    grade.shadows += effect.shadows ?? 0;
    grade.highlights += effect.highlights ?? 0;
  }
  if (!active) return;
  for (const key of ["brightness", "temperature", "tint", "shadows", "highlights"] as const) grade[key] = Math.max(-1, Math.min(1, grade[key]));
  grade.contrast = Math.max(0, Math.min(4, grade.contrast));
  grade.saturation = Math.max(0, Math.min(4, grade.saturation));
  grade.hue = ((grade.hue % 360) + 540) % 360 - 180;
  const validDimensions = pixels.data.length === pixels.width * pixels.height * 4;
  const bounds = validDimensions ? (contentBounds === undefined ? alphaBounds(pixels) : contentBounds) : null;
  if (validDimensions && !bounds) {
    pixels.data.fill(0);
    return;
  }
  const sparseBounds = bounds && !coversSurface(bounds, pixels) ? bounds : null;
  const region = sparseBounds ? extractPixels(pixels, sparseBounds) : pixels;
  const data = premultiply(region.data);
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3]!;
    let rgb = [data[i]!, data[i + 1]!, data[i + 2]!].map((v) => v / Math.max(1, alpha));
    if (Math.abs(grade.brightness) > 0.001) rgb = rgb.map((v) => clamp(v + grade.brightness));
    if (Math.abs(grade.contrast - 1) > 0.001) rgb = rgb.map((v) => clamp((v - 0.5) * grade.contrast + 0.5));
    if (Math.abs(grade.saturation - 1) > 0.001) {
      const luma = rgb[0]! * 0.299 + rgb[1]! * 0.587 + rgb[2]! * 0.114;
      rgb = rgb.map((v) => clamp(luma + (v - luma) * grade.saturation));
    }
    if (Math.abs(grade.hue) > 0.001) {
      const max = Math.max(...rgb);
      const min = Math.min(...rgb);
      const delta = max - min;
      let h = 0;
      const s = delta > 0.00001 ? delta / max : 0;
      if (delta > 0.00001) {
        if (max === rgb[0]) h = (rgb[1]! - rgb[2]!) / delta + (rgb[1]! < rgb[2]! ? 6 : 0);
        else if (max === rgb[1]) h = 2 + (rgb[2]! - rgb[0]!) / delta;
        else h = 4 + (rgb[0]! - rgb[1]!) / delta;
        h /= 6;
      }
      h += grade.hue / 360;
      h = (h - Math.floor(h)) * 6;
      const sector = Math.floor(h);
      const f = h - sector;
      const p = max * (1 - s);
      const q = max * (1 - s * f);
      const t = max * (1 - s * (1 - f));
      rgb = [[max, t, p], [q, max, p], [p, max, t], [p, q, max], [t, p, max], [max, p, q]][sector]!;
    }
    if (Math.abs(grade.temperature) > 0.001) {
      rgb[0] = clamp(rgb[0]! + grade.temperature * 0.2);
      rgb[1] = clamp(rgb[1]! + grade.temperature * (grade.temperature > 0 ? 0.1 : 0.05));
      rgb[2] = clamp(rgb[2]! - grade.temperature * 0.2);
    }
    if (Math.abs(grade.tint) > 0.001) {
      rgb = rgb.map((v, c) => clamp(v + grade.tint * (c === 1 ? -0.2 : 0.1)));
    }
    if (Math.abs(grade.shadows) > 0.001 || Math.abs(grade.highlights) > 0.001) {
      const luma = rgb[0]! * 0.299 + rgb[1]! * 0.587 + rgb[2]! * 0.114;
      const adjustment = grade.shadows * (1 - smooth(luma / 0.33)) * 0.3 + grade.highlights * smooth((luma - 0.66) / 0.34) * 0.3;
      rgb = rgb.map((v) => clamp(v + adjustment));
    }
    for (let c = 0; c < 3; c++) data[i + c] = Math.round(rgb[c]! * alpha);
  }
  unpremultiply(data, region.data);
  if (sparseBounds) {
    pixels.data.fill(0);
    writePixels(pixels, sparseBounds, region.data);
  }
}
