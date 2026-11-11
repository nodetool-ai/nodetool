import type { ClipStabilizeEffect, StabilizationMatrix, StabilizationSample, TimelineClip } from "../types.js";
import { clipSourceWindowMs } from "../generatedMatte.js";
import { clipSourceMsAt } from "../timeRemap.js";

export interface CameraPath {timeMs: number; x: number; y: number; angle: number; logScale: number; cut?: boolean}
const identity = (): StabilizationMatrix => [1, 0, 0, 0, 1, 0];

/** Translation uses source-width units on both axes, so portrait rotation stays isotropic. */
export function stabilizationAffine(sample: StabilizationSample, aspect: number, strength: number, zoom: number,
  crop = {left: 0, top: 0, right: 0, bottom: 0}): StabilizationMatrix {
  const w = 1 - crop.left - crop.right, h = 1 - crop.top - crop.bottom;
  const angle = sample.angle * strength, scale = sample.scale ** strength;
  const c = Math.cos(angle) / scale, s = Math.sin(angle) / scale;
  const x = crop.left + w / 2 - .5 - sample.x * strength;
  const y = (crop.top + h / 2 - .5) * aspect - sample.y * strength;
  const centerX = (c * x + s * y + .5 - crop.left) / w;
  const centerY = ((-s * x + c * y) / aspect + .5 - crop.top) / h;
  const a = c / zoom, b = s * h * aspect / (w * zoom);
  const d = -s * w / (h * aspect * zoom), e = c / zoom;
  return [a, b, centerX - (a + b) / 2, d, e, centerY - (d + e) / 2];
}
export function stabilizationZoom(sample: StabilizationSample, aspect: number): number {
  const m = stabilizationAffine(sample, aspect, 1, 1);
  const x = Math.abs((m[0] + m[1]) / 2 + m[2] - .5);
  const y = Math.abs((m[3] + m[4]) / 2 + m[5] - .5);
  if (x >= .5 || y >= .5) { return 10; }
  return Math.min(10, Math.max(1, (Math.abs(m[0]) + Math.abs(m[1])) / (1 - 2 * x),
    (Math.abs(m[3]) + Math.abs(m[4])) / (1 - 2 * y)));
}
export function stabilizationCurve(path: readonly CameraPath[], windowMs: number, aspect: number): {samples: StabilizationSample[]; requiredZoom: number} {
  const samples: StabilizationSample[] = [];
  let requiredZoom = 1;
  for (let begin = 0; begin < path.length;) {
    let end = begin + 1;
    while (end < path.length && !path[end]!.cut) { end++; }
    const count = end - begin, t = new Float64Array(count + 1), tt = new Float64Array(count + 1);
    const sum = new Float64Array((count + 1) * 6), product = new Float64Array((count + 1) * 6);
    for (let i = 0; i < count; i++) {
      const p = path[begin + i]!, time = (p.timeMs - path[begin]!.timeMs) / 1000;
      t[i + 1] = t[i]! + time; tt[i + 1] = tt[i]! + time * time;
      const values = [p.x, p.y, p.angle, p.logScale, Math.exp(p.logScale) * Math.cos(p.angle), Math.exp(p.logScale) * Math.sin(p.angle)];
      for (let c = 0; c < 6; c++) {
        sum[(i + 1) * 6 + c] = sum[i * 6 + c]! + values[c]!;
        product[(i + 1) * 6 + c] = product[i * 6 + c]! + values[c]! * time;
      }
    }
    let left = 0, right = 0;
    for (let i = 0; i < count; i++) {
      const p = path[begin + i]!;
      while (left < i && p.timeMs - path[begin + left]!.timeMs > windowMs / 2) { left++; }
      while (right + 1 < count && path[begin + right + 1]!.timeMs - p.timeMs <= windowMs / 2) { right++; }
      const n = right - left + 1, time = (p.timeMs - path[begin]!.timeMs) / 1000;
      const st = t[right + 1]! - t[left]! - n * time;
      const stt = tt[right + 1]! - tt[left]! - 2 * time * (t[right + 1]! - t[left]!) + n * time * time;
      const denominator = n * stt - st * st;
      const smooth = [p.x, p.y, p.angle, p.logScale, Math.exp(p.logScale) * Math.cos(p.angle), Math.exp(p.logScale) * Math.sin(p.angle)];
      if (denominator > 1e-12) {
        for (let c = 0; c < 6; c++) {
          const y = sum[(right + 1) * 6 + c]! - sum[left * 6 + c]!;
          const ty = product[(right + 1) * 6 + c]! - product[left * 6 + c]! - time * y;
          smooth[c] = (y * stt - st * ty) / denominator;
        }
      }
      const angle = smooth[2]! - p.angle, scale = Math.exp(smooth[3]! - p.logScale);
      // Average relative translations before projecting rotation/scale back to a similarity.
      // This keeps the correction independent of the first frame's coordinate origin.
      const inverseScale = Math.exp(-p.logScale), cosine = Math.cos(p.angle), sine = Math.sin(p.angle);
      const a = inverseScale * (smooth[4]! * cosine + smooth[5]! * sine);
      const b = inverseScale * (smooth[5]! * cosine - smooth[4]! * sine);
      const sample = {timeMs: p.timeMs, x: smooth[0]! - a * p.x + b * p.y,
        y: smooth[1]! - b * p.x - a * p.y, angle, scale};
      for (const key of ["x", "y", "angle"] as const) { if (Math.abs(sample[key]) < 1e-8) { sample[key] = 0; } }
      if (Math.abs(sample.scale - 1) < 1e-8) { sample.scale = 1; }
      requiredZoom = Math.max(requiredZoom, stabilizationZoom(sample, aspect)); samples.push(sample);
    }
    begin = end;
  }
  return {samples, requiredZoom};
}
export function stabilizationAnalysisMatches(clip: TimelineClip & {mediaPath?: string}, effect: ClipStabilizeEffect): boolean {
  const data = effect.analysis;
  if (clip.mediaType !== "video" || data?.version !== 1 || data.kind !== "stabilize" || !data.samples.length || data.samples.length > 18000) { return false; }
  const range = clipSourceWindowMs(clip);
  return data.source.assetId === (clip.currentAssetId ?? "") && data.source.mediaPath === (clip.mediaPath ?? "")
    && data.rangeStartMs <= range.fromMs + 1e-6 && data.rangeEndMs >= range.toMs - 1e-6 && data.windowMs === (effect.windowMs ?? 500);
}
function fits(matrix: StabilizationMatrix): boolean {
  for (const x of [0, 1]) { for (const y of [0, 1]) {
    const u = matrix[0] * x + matrix[1] * y + matrix[2], v = matrix[3] * x + matrix[4] * y + matrix[5];
    if (!Number.isFinite(u + v) || u < -1e-8 || u > 1 + 1e-8 || v < -1e-8 || v > 1 + 1e-8) { return false; }
  } }
  return true;
}
export function stabilizationMatrix(clip: TimelineClip, effect: ClipStabilizeEffect, timelineMs: number): StabilizationMatrix {
  const strength = Math.max(0, Math.min(1, effect.strength ?? 1));
  if (!strength || !stabilizationAnalysisMatches(clip, effect)) { return identity(); }
  const data = effect.analysis!, time = clipSourceMsAt(clip, timelineMs);
  if (time < data.rangeStartMs - 1e-6 || time > data.rangeEndMs + 1e-6) { return identity(); }
  let low = 0, high = data.samples.length;
  while (low < high) { const mid = low + Math.floor((high - low) / 2); if (data.samples[mid]!.timeMs <= time + 1e-6) { low = mid + 1; } else { high = mid; } }
  const sample = data.samples[Math.max(0, low - 1)]!;
  let crop = clip.crop ?? {left: 0, top: 0, right: 0, bottom: 0};
  if (Object.values(crop).some(value => !Number.isFinite(value) || value < 0) || crop.left + crop.right >= 1 - 1e-4 || crop.top + crop.bottom >= 1 - 1e-4) {
    crop = {left: 0, top: 0, right: 0, bottom: 0};
  }
  const zoom = Math.min(Math.max(1, Math.min(1.5, effect.maxZoom ?? 1.1)),
    1 + (data.requiredZoom - 1) * strength / Math.min(1 - crop.left - crop.right, 1 - crop.top - crop.bottom));
  const matrix = (amount: number): StabilizationMatrix => stabilizationAffine(sample, data.height / data.width, amount, zoom, crop);
  const requested = matrix(strength);
  if (fits(requested)) { return requested; }
  let minimum = 0, maximum = strength;
  for (let step = 0; step < 24; step++) { const middle = (minimum + maximum) / 2; if (fits(matrix(middle))) { minimum = middle; } else { maximum = middle; } }
  return matrix(minimum);
}
export function stabilizationNeutral(effect: ClipStabilizeEffect): boolean {
  const matrix = effect._matrix, neutral = identity();
  return !matrix || matrix.every((value, index) => Math.abs(value - neutral[index]!) < 1e-8);
}

function cubic(distance: number): number {
  const x = Math.abs(distance);
  return x <= 1 ? 1.5 * x ** 3 - 2.5 * x ** 2 + 1 : x < 2 ? -.5 * x ** 3 + 2.5 * x ** 2 - 4 * x + 2 : 0;
}
/** Catmull–Rom reconstruction over premultiplied pixels, with clamped source edges. */
export function stabilizeImage(source: Uint8ClampedArray, target: Uint8ClampedArray, width: number, height: number, matrix: StabilizationMatrix): void {
  for (let y = 0; y < height; y++) { for (let x = 0; x < width; x++) {
    const u = (x + .5) / width, v = (y + .5) / height;
    const sx = (matrix[0] * u + matrix[1] * v + matrix[2]) * width - .5;
    const sy = (matrix[3] * u + matrix[4] * v + matrix[5]) * height - .5;
    const ix = Math.floor(sx), iy = Math.floor(sy), result = [0, 0, 0, 0];
    for (let dy = -1; dy <= 2; dy++) { for (let dx = -1; dx <= 2; dx++) {
      const at = (Math.max(0, Math.min(height - 1, iy + dy)) * width + Math.max(0, Math.min(width - 1, ix + dx))) * 4;
      const weight = cubic(sx - ix - dx) * cubic(sy - iy - dy);
      for (let c = 0; c < 4; c++) { result[c]! += source[at + c]! * weight; }
    } }
    const at = (y * width + x) * 4, alpha = Math.round(Math.max(0, Math.min(255, result[3]!)));
    target[at + 3] = alpha;
    for (let c = 0; c < 3; c++) { target[at + c] = Math.round(Math.max(0, Math.min(alpha, result[c]!))); }
  } }
}
