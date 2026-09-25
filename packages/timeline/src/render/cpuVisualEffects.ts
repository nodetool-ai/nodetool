import { GENERATOR_MODES, STYLIZE_MODES, type ClipDropShadowEffect, type ClipEffect } from "../types.js";
import { parseCssColorOrBlack } from "./color.js";
import { parseCubeLut, sampleCubeLut, type CubeLut } from "./cubeLut.js";

export interface PixelBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const fract = (value: number): number => value - Math.floor(value);
const hash = (x: number, y: number): number => {
  let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + 2246822519) >>> 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
  n = (n ^ (n >>> 16)) >>> 0;
  return (n & 0xffffff) / 0xffffff;
};
const smooth = (v: number): number => v * v * (3 - 2 * v);

function noise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(fract(x));
  const fy = smooth(fract(y));
  const a = hash(ix, iy) * (1 - fx) + hash(ix + 1, iy) * fx;
  const b = hash(ix, iy + 1) * (1 - fx) + hash(ix + 1, iy + 1) * fx;
  return a * (1 - fy) + b * fy;
}

function fbm(x: number, y: number): number {
  let sum = 0;
  let amplitude = 0.5;
  for (let i = 0; i < 5; i++) {
    sum += amplitude * noise(x, y);
    x = x * 2.03 + 11.7;
    y = y * 2.03 + 5.3;
    amplitude *= 0.5;
  }
  return sum;
}

function sourceAt(data: Uint8ClampedArray, width: number, height: number, x: number, y: number, channel: number): number {
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = clamp01(x - x0);
  const fy = clamp01(y - y0);
  const at = (px: number, py: number): number => (data[(py * width + px) * 4 + channel] ?? 0) / 255;
  return (at(x0, y0) * (1 - fx) + at(x1, y0) * fx) * (1 - fy)
    + (at(x0, y1) * (1 - fx) + at(x1, y1) * fx) * fy;
}

function spatialSample(data: Uint8ClampedArray, width: number, height: number, x: number, y: number): [number, number, number, number] {
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = clamp01(x - x0);
  const fy = clamp01(y - y0);
  const corners: [number, number, number][] = [
    [x0, y0, (1 - fx) * (1 - fy)],
    [x1, y0, fx * (1 - fy)],
    [x0, y1, (1 - fx) * fy],
    [x1, y1, fx * fy]
  ];
  let alpha = 0;
  const color = [0, 0, 0];
  for (const [px, py, weight] of corners) {
    const index = (py * width + px) * 4;
    const a = (data[index + 3] ?? 0) / 255 * weight;
    alpha += a;
    for (let channel = 0; channel < 3; channel++) {
      color[channel] = (color[channel] ?? 0) + (data[index + channel] ?? 0) / 255 * a;
    }
  }
  return alpha > 0 ? [color[0]! / alpha, color[1]! / alpha, color[2]! / alpha, alpha] : [0, 0, 0, 0];
}

const rgb = (color: string): [number, number, number] => {
  const { r, g, b } = parseCssColorOrBlack(color);
  return [r, g, b];
};

export function isCpuVisualEffect(effect: ClipEffect): boolean {
  return ["pixelate", "posterize", "directionalBlur", "lensDistortion", "stylize", "generator", "lut"].includes(effect.type);
}

const lutCache = new Map<string, CubeLut>();

function cachedLut(cube: string): CubeLut {
  let lut = lutCache.get(cube);
  if (!lut) {
    lut = parseCubeLut(cube);
    lutCache.set(cube, lut);
  }
  return lut;
}

const numeric = (effect: ClipEffect, key: string, fallback: number): number => {
  const value: unknown = Object.getOwnPropertyDescriptor(effect, key)?.value;
  return typeof value === "number" ? value : fallback;
};

const stringValue = (effect: ClipEffect, key: string, fallback: string): string => {
  const value: unknown = Object.getOwnPropertyDescriptor(effect, key)?.value;
  return typeof value === "string" ? value : fallback;
};

/** Run procedural and spatial effects on the Canvas fallback's pixel buffer. */
export function applyCpuVisualEffects(pixels: PixelBuffer, effects: readonly ClipEffect[]): void {
  const { width, height } = pixels;
  for (const effect of effects) {
    if (!effect.enabled || !isCpuVisualEffect(effect)) continue;
    const input = new Uint8ClampedArray(pixels.data);
    const output = pixels.data;
    const mode = effect.type === "stylize" && typeof effect.mode === "string"
      ? (STYLIZE_MODES as readonly string[]).indexOf(effect.mode)
      : effect.type === "generator" && typeof effect.mode === "string"
        ? (GENERATOR_MODES as readonly string[]).indexOf(effect.mode) + STYLIZE_MODES.length
        : -1;
    const amount = numeric(effect, "amount", effect.type === "stylize" ? 0.5 : 1);
    const scale = Math.max(1, numeric(effect, "scale", 8));
    const angle = numeric(effect, "angle", 0) * Math.PI / 180;
    const time = numeric(effect, "time", 0);
    const seed = numeric(effect, "seed", 0);
    const colorA = rgb(stringValue(effect, "colorA", "#101a33"));
    const colorB = rgb(effect.type === "stylize"
      ? stringValue(effect, "color", "#ffffff")
      : stringValue(effect, "colorB", "#ffb45e"));
    const lut = effect.type === "lut" && typeof effect.cube === "string" ? cachedLut(effect.cube) : undefined;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        const u = (x + 0.5) / width;
        const v = (y + 0.5) / height;
        const qx = u - 0.5;
        const qy = v - 0.5;
        let r = sourceAt(input, width, height, x, y, 0);
        let g = sourceAt(input, width, height, x, y, 1);
        let b = sourceAt(input, width, height, x, y, 2);
        let a = sourceAt(input, width, height, x, y, 3);
        if (lut) {
          const graded = sampleCubeLut(lut, [r, g, b]);
          const mix = clamp01(numeric(effect, "intensity", 1));
          r = r * (1 - mix) + graded[0] * mix;
          g = g * (1 - mix) + graded[1] * mix;
          b = b * (1 - mix) + graded[2] * mix;
        } else if (effect.type === "pixelate") {
          const cell = Math.max(1, typeof effect.cellSize === "number" ? effect.cellSize : 8);
          const sx = (Math.floor((x + 0.5) / cell) + 0.5) * cell - 0.5;
          const sy = (Math.floor((y + 0.5) / cell) + 0.5) * cell - 0.5;
          [r, g, b, a] = spatialSample(input, width, height, sx, sy);
        } else if (effect.type === "posterize") {
          const levels = Math.max(2, Math.min(256, typeof effect.levels === "number" ? effect.levels : 4));
          r = Math.min(1, Math.floor(r * levels) / (levels - 1));
          g = Math.min(1, Math.floor(g * levels) / (levels - 1));
          b = Math.min(1, Math.floor(b * levels) / (levels - 1));
        } else if (effect.type === "directionalBlur" || mode === 1 || mode === 2) {
          let sumR = 0;
          let sumG = 0;
          let sumB = 0;
          let sumA = 0;
          let sumW = 0;
          const radius = effect.type === "directionalBlur" && typeof effect.radius === "number" ? effect.radius : amount * 8;
          const dx = effect.type === "directionalBlur" ? Math.cos(angle) : qx;
          const dy = effect.type === "directionalBlur" ? Math.sin(angle) : qy;
          const gaussian = effect.type === "directionalBlur";
          const taps = gaussian ? Math.floor(Math.min(radius, 20)) : 6;
          for (let tap = -taps; tap <= taps; tap++) {
            const distance = gaussian ? tap * Math.max(1, radius / 20) : tap * radius / 6;
            const theta = mode === 1 ? tap / 6 * radius / Math.max(width, height) : 0;
            const sx = mode === 1 ? (0.5 + qx * Math.cos(theta) - qy * Math.sin(theta)) * width - 0.5 : x + (gaussian ? Math.round(dx * distance) : dx * distance);
            const sy = mode === 1 ? (0.5 + qx * Math.sin(theta) + qy * Math.cos(theta)) * height - 0.5 : y + (gaussian ? Math.round(dy * distance) : dy * distance);
            const weight = gaussian ? Math.exp(-(distance * distance) / (2 * Math.pow(Math.max(0.001, radius / 3), 2))) : 1;
            const sampleA = sourceAt(input, width, height, sx, sy, 3);
            sumR += sourceAt(input, width, height, sx, sy, 0) * sampleA * weight;
            sumG += sourceAt(input, width, height, sx, sy, 1) * sampleA * weight;
            sumB += sourceAt(input, width, height, sx, sy, 2) * sampleA * weight;
            sumA += sampleA * weight;
            sumW += weight;
          }
          r = sumA > 0 ? sumR / sumA : 0;
          g = sumA > 0 ? sumG / sumA : 0;
          b = sumA > 0 ? sumB / sumA : 0;
          a = sumA / Math.max(0.0001, sumW);
        } else if (effect.type === "lensDistortion") {
          const distortion = typeof effect.amount === "number" ? effect.amount : 0.5;
          const cx = qx * 2;
          const cy = qy * 2;
          const radiusSq = cx * cx + cy * cy;
          const factor = radiusSq < 1 ? 1 - distortion * (1 - radiusSq) : 1;
          const su = cx * factor * 0.5 + 0.5;
          const sv = cy * factor * 0.5 + 0.5;
          if (radiusSq < 1 && (su < 0 || su > 1 || sv < 0 || sv > 1)) {
            r = g = b = a = 0;
          } else {
            [r, g, b, a] = spatialSample(input, width, height, su * width - 0.5, sv * height - 0.5);
          }
        } else if (mode === 0) {
          const dx = Math.cos(angle) * amount;
          const dy = Math.sin(angle) * amount;
          r = sourceAt(input, width, height, x + dx, y + dy, 0);
          b = sourceAt(input, width, height, x - dx, y - dy, 2);
        } else if (mode === 3 || mode === 4 || mode === 12) {
          const displacement = mode === 3 || mode === 12
            ? (fbm(u * scale + time, v * scale + seed) - 0.5) * amount * 20
            : (hash(Math.floor(v * scale * 8), Math.floor(time * 24) + seed) - 0.5) * amount * 40;
          [r, g, b, a] = spatialSample(input, width, height, x + displacement, y + (mode === 3 || mode === 12 ? displacement * 0.3 : 0));
        } else if (mode === 5) {
          const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          const cellX = fract((x + 0.5) / scale) - 0.5;
          const cellY = fract((y + 0.5) / scale) - 0.5;
          const radius = Math.sqrt(Math.max(0, 1 - luminance)) * 0.62;
          const edge = clamp01((Math.hypot(cellX, cellY) - (radius - 0.08)) / 0.16);
          const ink = 1 - edge * edge * (3 - 2 * edge);
          r = g = b = 1 - ink;
        } else if (mode === 6) {
          const jitter = (hash(x + seed, y + seed) - 0.5) * amount * 2 / 255;
          r = clamp01(r + jitter);
          g = clamp01(g + jitter);
          b = clamp01(b + jitter);
        } else if (mode === 7 || mode === 8) {
          const beam = Math.pow(Math.max(0, Math.cos((Math.atan2(qy, qx) - angle) * (mode === 7 ? 8 : 2))), 24);
          const falloff = 1 / (1 + Math.hypot(qx, qy * (mode === 8 ? 8 : 1)) * scale);
          const light = clamp01(beam * falloff * amount);
          r += (1 - r) * light * colorB[0];
          g += (1 - g) * light * colorB[1];
          b += (1 - b) * light * colorB[2];
        } else if (mode >= 9 && mode <= 11) {
          const reach = scale;
          const shifted = sourceAt(input, width, height, x + Math.cos(angle) * reach, y + Math.sin(angle) * reach, 3);
          const around = Math.min(
            sourceAt(input, width, height, x + reach, y, 3),
            sourceAt(input, width, height, x - reach, y, 3),
            sourceAt(input, width, height, x, y + reach, 3),
            sourceAt(input, width, height, x, y - reach, 3)
          );
          const edge = clamp01((a - (mode === 10 ? around : shifted)) * amount);
          if (mode === 9) {
            r = r * (1 - edge) + colorB[0] * edge;
            g = g * (1 - edge) + colorB[1] * edge;
            b = b * (1 - edge) + colorB[2] * edge;
          } else {
            r += (1 - r) * edge * colorB[0];
            g += (1 - g) * edge * colorB[1];
            b += (1 - b) * edge * colorB[2];
          }
        } else if (mode === 13) {
          let field = u;
          if (time < 0.5) {
            const dx = Math.cos(angle);
            const dy = Math.sin(angle);
            field = Math.abs(dy) > 0.5 ? (dy > 0 ? 1 - v : v) : (dx > 0 ? 1 - u : u);
          } else if (time < 1.5) {
            field = Math.hypot(qx, qy) / Math.SQRT1_2;
          } else {
            field = clamp01(fbm(u * scale + seed, v * scale + seed));
          }
          const feather = Math.max(0.001, numeric(effect, "softness", 0.1));
          const edge = amount * (1 + feather);
          const t = clamp01((field - (edge - feather)) / feather);
          a *= 1 - smooth(t);
        } else if (mode === 14) {
          const cx = 0.5 + Math.sin(time * Math.PI * 2 + seed) * 0.3;
          const light = Math.exp(-Math.hypot(u - cx, v - 0.3) * scale * 3) * amount;
          r += (1 - r) * light * colorB[0];
          g += (1 - g) * light * colorB[1];
          b += (1 - b) * light * colorB[2];
        } else if (mode >= STYLIZE_MODES.length) {
          let value = 0;
          if (mode === 15) value = hash(Math.floor(x / scale) + seed, Math.floor(y / scale) + Math.floor(time * 24));
          else if (mode === 16) value = fbm(u * scale + time, v * scale + seed);
          else if (mode === 17) value = fract(Math.atan2(qy, qx) / (2 * Math.PI) + angle / (2 * Math.PI) + 1);
          else if (mode === 18) value = 0.5 + 0.25 * Math.sin(u * scale + time) + 0.25 * Math.cos(v * scale * 0.7 - time);
          else if (mode === 19) value = fbm(u * scale + time * 0.3, v * scale - time * 0.2);
          else if (mode === 20) {
            const cellX = Math.floor(u * scale);
            const cellY = Math.floor(v * scale);
            const localX = fract(u * scale);
            const localY = fract(v * scale);
            const centerX = hash(cellX + seed, cellY + seed);
            const centerY = fract(hash(cellX + seed + 17, cellY + seed + 17) + time * (0.1 + centerX * 0.2));
            value = Math.pow(1 - clamp01(Math.hypot(localX - centerX, localY - centerY) / 0.15), 2);
          } else if (mode === 21) value = Math.exp(-Math.hypot(u - 0.5 - Math.sin(time * 0.7 + seed) * 0.6, v - 0.2) * scale * 0.5);
          else {
            const gx = fract(u * scale);
            const gy = fract(v * scale);
            value = Math.min(gx, gy, 1 - gx, 1 - gy) < 0.04 ? 1 : 0;
          }
          const t = clamp01(value * amount);
          r = colorA[0] * (1 - t) + colorB[0] * t;
          g = colorA[1] * (1 - t) + colorB[1] * t;
          b = colorA[2] * (1 - t) + colorB[2] * t;
          a = 1;
        }
        output[index] = Math.round(clamp01(r) * 255);
        output[index + 1] = Math.round(clamp01(g) * 255);
        output[index + 2] = Math.round(clamp01(b) * 255);
        output[index + 3] = Math.round(clamp01(a) * 255);
      }
    }
  }
}

export function applyCpuIris(pixels: PixelBuffer, progress: number, softness: number): void {
  const { width, height, data } = pixels;
  const feather = Math.max(0.0001, softness);
  const edge = progress * (Math.SQRT2 + feather);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const radius = Math.hypot(((x + 0.5) / width - 0.5) * 2, ((y + 0.5) / height - 0.5) * 2);
      const t = clamp01((radius - (edge - feather)) / feather);
      const coverage = progress <= 0 ? 0 : 1 - t * t * (3 - 2 * t);
      const alphaIndex = (y * width + x) * 4 + 3;
      data[alphaIndex] = Math.round((data[alphaIndex] ?? 0) * coverage);
    }
  }
}

/** Composite any number of blurred silhouette shadows behind one source. */
export function applyCpuDropShadows(pixels: PixelBuffer, shadows: readonly ClipDropShadowEffect[]): void {
  const { width, height, data } = pixels;
  const original = new Uint8ClampedArray(data);
  const accumulated = new Float32Array(width * height * 4);
  for (const shadow of shadows) {
    const alpha = new Float32Array(width * height);
    const dx = Math.round(shadow.offsetX);
    const dy = Math.round(shadow.offsetY);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const sx = x - dx;
        const sy = y - dy;
        if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
          alpha[y * width + x] = (original[(sy * width + sx) * 4 + 3] ?? 0) / 255;
        }
      }
    }
    const radius = Math.min(20, Math.floor(Math.max(0, shadow.blur)));
    const sigma = Math.max(0.001, shadow.blur / 3);
    let blurred = alpha;
    if (radius > 0) {
      const horizontal = new Float32Array(alpha.length);
      blurred = new Float32Array(alpha.length);
      for (let axis = 0; axis < 2; axis++) {
        const source = axis === 0 ? alpha : horizontal;
        const target = axis === 0 ? horizontal : blurred;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            let total = 0;
            let weight = 0;
            for (let offset = -radius; offset <= radius; offset++) {
              const w = Math.exp(-(offset * offset) / (2 * sigma * sigma));
              const sx = Math.max(0, Math.min(width - 1, x + (axis === 0 ? offset : 0)));
              const sy = Math.max(0, Math.min(height - 1, y + (axis === 1 ? offset : 0)));
              total += (source[sy * width + sx] ?? 0) * w;
              weight += w;
            }
            target[y * width + x] = total / weight;
          }
        }
      }
    }
    const { r, g, b, a } = parseCssColorOrBlack(shadow.color);
    const opacity = clamp01((shadow.opacity ?? 1) * a);
    for (let pixel = 0; pixel < alpha.length; pixel++) {
      const sa = (blurred[pixel] ?? 0) * opacity;
      const index = pixel * 4;
      const da = accumulated[index + 3] ?? 0;
      accumulated[index] = r * sa + (accumulated[index] ?? 0) * (1 - sa);
      accumulated[index + 1] = g * sa + (accumulated[index + 1] ?? 0) * (1 - sa);
      accumulated[index + 2] = b * sa + (accumulated[index + 2] ?? 0) * (1 - sa);
      accumulated[index + 3] = sa + da * (1 - sa);
    }
  }
  for (let pixel = 0; pixel < width * height; pixel++) {
    const index = pixel * 4;
    const sa = (original[index + 3] ?? 0) / 255;
    const da = accumulated[index + 3] ?? 0;
    const outA = sa + da * (1 - sa);
    data[index] = outA > 0 ? Math.round(((original[index] ?? 0) / 255 * sa + (accumulated[index] ?? 0) * (1 - sa)) / outA * 255) : 0;
    data[index + 1] = outA > 0 ? Math.round(((original[index + 1] ?? 0) / 255 * sa + (accumulated[index + 1] ?? 0) * (1 - sa)) / outA * 255) : 0;
    data[index + 2] = outA > 0 ? Math.round(((original[index + 2] ?? 0) / 255 * sa + (accumulated[index + 2] ?? 0) * (1 - sa)) / outA * 255) : 0;
    data[index + 3] = Math.round(outA * 255);
  }
}
