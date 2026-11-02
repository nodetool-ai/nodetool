import type { ClipDeflickerEffect, ClipEffect, TimelineClip } from "../types.js";
import { stabilizationMatrix } from "./stabilization.js";
import { isClipDenoiseEffect, isClipDeflickerEffect, isClipStabilizeEffect } from "../types.js";
import { clipSourceWindowMs } from "../generatedMatte.js";
import { clipSourceMsAt } from "../timeRemap.js";

type AnalysisClip = TimelineClip & { mediaPath?: string };
export interface LuminanceSample { timeMs: number; logLuma: number; cut?: boolean }

/** A symmetric local fit preserves linear log-exposure ramps. Monotone fades bypass it. */
export function deflickerCurve(samples: readonly LuminanceSample[], windowMs: number, limit: number): {timeMs: number; stops: number}[] {
  const out: {timeMs: number; stops: number}[] = [];
  for (let begin = 0; begin < samples.length;) {
    let end = begin + 1;
    while (end < samples.length && !samples[end]!.cut) { end++; }
    const count = end - begin;
    const t = new Float64Array(count + 1), tt = new Float64Array(count + 1);
    const y = new Float64Array(count + 1), ty = new Float64Array(count + 1);
    const positive = new Int32Array(count + 1), negative = new Int32Array(count + 1);
    for (let i = 0; i < count; i++) {
      const sample = samples[begin + i]!;
      const seconds = (sample.timeMs - samples[begin]!.timeMs) / 1000;
      t[i + 1] = t[i]! + seconds; tt[i + 1] = tt[i]! + seconds * seconds;
      y[i + 1] = y[i]! + sample.logLuma; ty[i + 1] = ty[i]! + seconds * sample.logLuma;
      const delta = i ? sample.logLuma - samples[begin + i - 1]!.logLuma : 0;
      positive[i + 1] = positive[i]! + Number(delta > .005);
      negative[i + 1] = negative[i]! + Number(delta < -.005);
    }
    let left = 0, right = 0;
    for (let i = 0; i < count; i++) {
      const sample = samples[begin + i]!;
      while (left < i && sample.timeMs - samples[begin + left]!.timeMs > windowMs / 2) { left++; }
      while (right + 1 < count && samples[begin + right + 1]!.timeMs - sample.timeMs <= windowMs / 2) { right++; }
      const n = right - left + 1, x = (sample.timeMs - samples[begin]!.timeMs) / 1000;
      const st = t[right + 1]! - t[left]! - n * x;
      const stt = tt[right + 1]! - tt[left]! - 2 * x * (t[right + 1]! - t[left]!) + n * x * x;
      const sy = y[right + 1]! - y[left]!, sty = ty[right + 1]! - ty[left]! - x * sy;
      const determinant = n * stt - st * st;
      const fade = positive[right + 1] === positive[left + 1] || negative[right + 1] === negative[left + 1];
      const stops = !fade && sample.logLuma > -9 && determinant > 1e-12
        ? Math.max(-limit, Math.min(limit, (sy * stt - st * sty) / determinant - sample.logLuma)) : 0;
      out.push({timeMs: sample.timeMs, stops});
    }
    begin = end;
  }
  return out;
}

export function deflickerAnalysisMatches(clip: AnalysisClip, effect: ClipDeflickerEffect): boolean {
  const data = effect.analysis;
  if (clip.mediaType !== "video" || !data || data.version !== 1 || !data.samples.length || data.samples.length > 18000) { return false; }
  const range = clipSourceWindowMs(clip);
  return data.source.assetId === (clip.currentAssetId ?? "") && data.source.mediaPath === (clip.mediaPath ?? "")
    && data.rangeStartMs <= range.fromMs + 1e-6 && data.rangeEndMs >= range.toMs - 1e-6
    && data.windowMs === (effect.windowMs ?? 500) && data.maxCorrection === (effect.maxCorrection ?? 1);
}

export function deflickerStops(clip: AnalysisClip, effect: ClipDeflickerEffect, timelineMs: number): number {
  if (!deflickerAnalysisMatches(clip, effect)) { return 0; }
  const data = effect.analysis!, time = clipSourceMsAt(clip, timelineMs);
  if (time < data.rangeStartMs - 1e-6 || time > data.rangeEndMs + 1e-6) { return 0; }
  let low = 0, high = data.samples.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (data.samples[middle]!.timeMs <= time + 1e-6) { low = middle + 1; } else { high = middle; }
  }
  const stops = data.samples[Math.max(0, low - 1)]!.stops;
  const limit = Math.max(0, Math.min(3, effect.maxCorrection ?? 1));
  return Number.isFinite(stops) ? Math.max(-limit, Math.min(limit, stops)) * Math.max(0, Math.min(1, effect.strength ?? 1)) : 0;
}

/** Resolve persisted source samples before either the GPU or CPU effect chain runs. */
export function resolveAnalysisEffects(clip: AnalysisClip, effects: ClipEffect[] | undefined, timelineMs: number): ClipEffect[] | undefined {
  if (!effects?.some(effect => isClipDeflickerEffect(effect) || isClipStabilizeEffect(effect) || isClipDenoiseEffect(effect))) { return effects; }
  return effects.map(effect => isClipDeflickerEffect(effect)
    ? {id: effect.id, type: "exposure", enabled: effect.enabled, exposure: deflickerStops(clip, effect, timelineMs)}
    : isClipStabilizeEffect(effect) ? {id: effect.id, type: "stabilize", enabled: effect.enabled, _matrix: stabilizationMatrix(clip, effect, timelineMs)} : isClipDenoiseEffect(effect) && clip.mediaType !== "video" ? {...effect, temporalStrength: 0} : effect);
}
