import type {
  ClipBlurEffect,
  ClipChromaKeyEffect,
  ClipColorEffect,
  ClipEffect,
  ClipSharpenEffect,
  ClipVignetteEffect,
  TrackEffect
} from "../types.js";

/**
 * A track's video effects in the clip vocabulary, so a renderer reads one
 * effect chain rather than two.
 *
 * `TrackEffect`'s five video kinds and `ClipEffect` describe the same shader
 * steps under different field names (`keyColor`/`color`,
 * `intensity`/`amount`). Both spellings are on the wire — a saved document
 * carries whichever scope it was authored in, and `packages/protocol`'s
 * `trackEffect` union still pins the track one — so the conversion happens
 * here, at the door of the renderer, and everything past it addresses effects
 * one way.
 *
 * The audio kinds have no picture and drop out. `enabled` rides along
 * untouched: callers that report an effect (`unsupportedEffectTypes`) and
 * callers that apply one filter on it themselves.
 *
 * Results are memoized on the array identity a track holds until its effects
 * are edited, which is the premise the Canvas 2D filter cache already runs on:
 * a track sitting still converts once, not once per layer per frame.
 */
export function trackEffectsAsClipEffects(
  effects: readonly TrackEffect[] | undefined
): readonly ClipEffect[] {
  if (!effects || effects.length === 0) return NONE;
  const hit = cache.get(effects);
  if (hit) return hit;
  const converted: ClipEffect[] = [];
  for (const effect of effects) {
    const clip = asClipEffect(effect);
    if (clip) converted.push(clip);
  }
  const result = converted.length > 0 ? converted : NONE;
  cache.set(effects, result);
  return result;
}

const NONE: readonly ClipEffect[] = Object.freeze([]);
const cache = new WeakMap<readonly TrackEffect[], readonly ClipEffect[]>();

function asClipEffect(effect: TrackEffect): ClipEffect | null {
  switch (effect.type) {
    case "colorCorrection":
      return {
        id: effect.id,
        type: "color",
        enabled: effect.enabled,
        brightness: effect.brightness,
        contrast: effect.contrast,
        saturation: effect.saturation,
        hue: effect.hue,
        temperature: effect.temperature,
        tint: effect.tint,
        shadows: effect.shadows,
        highlights: effect.highlights
      } satisfies ClipColorEffect;
    case "videoBlur":
      return {
        id: effect.id,
        type: "blur",
        enabled: effect.enabled,
        radius: effect.radius
      } satisfies ClipBlurEffect;
    case "sharpen":
      return {
        id: effect.id,
        type: "sharpen",
        enabled: effect.enabled,
        amount: effect.amount,
        threshold: effect.threshold
      } satisfies ClipSharpenEffect;
    case "vignette":
      return {
        id: effect.id,
        type: "vignette",
        enabled: effect.enabled,
        amount: effect.intensity,
        radius: effect.radius,
        softness: effect.softness
      } satisfies ClipVignetteEffect;
    case "chromaKey":
      return {
        id: effect.id,
        type: "chromaKey",
        enabled: effect.enabled,
        color: effect.keyColor,
        tolerance: effect.tolerance,
        softness: effect.softness,
        spill: effect.spill
      } satisfies ClipChromaKeyEffect;
    default:
      return null;
  }
}
