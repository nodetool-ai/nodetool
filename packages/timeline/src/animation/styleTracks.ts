import type { ClipEffect, ClipMask, ClipShapeStyle, ClipTextStyle, ShapeFill, TimelineClip } from "../types.js";
import { parseCssColor } from "../render/color.js";
import type { CompiledAnimation } from "./compile.js";
import { ease } from "./easing.js";
import { animationProgressAt } from "./sample.js";
import type { AnimationStyleTrack } from "./types.js";

export interface ResolvedAnimatedStyles {
  shapeStyle?: ClipShapeStyle;
  textStyle?: ClipTextStyle;
  effects?: ClipEffect[];
  clipMask?: ClipMask;
  borderRadius?: number;
}

const SHAPE_NUMBERS = new Set(["cornerRadius", "strokeWidthPx", "x", "y", "width", "height", "x2", "y2", "innerRadius"]);
const TEXT_NUMBERS = new Set(["fontSizePx", "letterSpacingPx", "fontWeight", "lineHeight"]);
const MASK_NUMBERS = new Set(["x", "y", "width", "height", "featherPx", "radiusPx"]);
const COLOR_TARGETS = new Set(["shape.fill", "shape.stroke", "text.color"]);
const PATH_TARGETS = new Set(["shape.d", "mask.d"]);
const GLYPH_TARGETS = new Map([["glyph.color", "string"], ["glyph.blurPx", "number"], ["glyph.trackingPx", "number"]]);
const STYLIZE_COLOR_MODES = new Set(["lightRays", "lensFlare", "innerShadow", "innerGlow", "edgeHighlight", "lightLeakOverlay"]);

function numericEffectField(effect: ClipEffect, field: string): number | undefined {
  for (const [name, value] of Object.entries(effect)) {
    if (name === field && typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function colorEffectField(effect: ClipEffect, field: string): string | undefined {
  const supported = effect.type === "generator" ? field === "colorA" || field === "colorB"
    : (effect.type === "stylize" && typeof effect.mode === "string" && STYLIZE_COLOR_MODES.has(effect.mode)) ||
      effect.type === "dropShadow" || effect.type === "chromaKey"
      ? field === "color"
      : false;
  if (!supported) return undefined;
  for (const [name, value] of Object.entries(effect)) {
    if (name === field && typeof value === "string") return value;
  }
  return undefined;
}

/** Errors that would make a style curve invisible or morph unpredictably. */
export function validateAnimationStyleTracks(
  clip: Pick<TimelineClip, "shapeStyle" | "textStyle" | "effects" | "mask" | "borderRadius">,
  tracks: readonly AnimationStyleTrack[]
): string[] {
  const errors: string[] = [];
  for (const track of tracks) {
    const parts = track.target.split(".");
    let expected: "number" | "string" | null = null;
    if (GLYPH_TARGETS.has(track.target)) expected = GLYPH_TARGETS.get(track.target) === "string" ? "string" : "number";
    else if (COLOR_TARGETS.has(track.target) || PATH_TARGETS.has(track.target)) expected = "string";
    else if (track.target === "clip.borderRadius") expected = "number";
    else if (parts.length === 2 && (
      (parts[0] === "shape" && SHAPE_NUMBERS.has(parts[1])) ||
      (parts[0] === "text" && TEXT_NUMBERS.has(parts[1])) ||
      (parts[0] === "mask" && MASK_NUMBERS.has(parts[1]))
    )) expected = "number";
    else if (parts.length === 3 && parts[0] === "effect" &&
             clip.effects?.some((effect) => effect.id === parts[1] && numericEffectField(effect, parts[2]) !== undefined)) expected = "number";
    else if (parts.length === 3 && parts[0] === "effect" &&
             clip.effects?.some((effect) => effect.id === parts[1] && colorEffectField(effect, parts[2]) !== undefined)) expected = "string";
    else if ((parts[0] === "shape" && (parts[1] === "fill" || parts[1] === "fillStyle")) ||
             (parts[0] === "text" && parts[1] === "fill")) {
      if (parts.length === 3 && parts[2] === "angle") expected = "number";
      if (parts.length === 5 && parts[2] === "stops" && /^\d+$/.test(parts[3])) {
        expected = parts[4] === "color" ? "string" : parts[4] === "offset" ? "number" : null;
      }
    }
    if (expected === null) {
      errors.push(`Unknown style target "${track.target}"`);
      continue;
    }
    if (parts[0] === "glyph" && !clip.textStyle ||
        parts[0] === "shape" && !clip.shapeStyle ||
        parts[0] === "text" && !clip.textStyle ||
        parts[0] === "mask" && !clip.mask) {
      errors.push(`Style target "${track.target}" has no matching clip style`);
      continue;
    }
    if (track.target === "shape.d" && clip.shapeStyle?.kind !== "path" ||
        track.target === "mask.d" && clip.mask?.kind !== "path" ||
        track.target === "mask.radiusPx" && clip.mask?.kind !== "rect" ||
        track.target === "shape.fill" && clip.shapeStyle?.fillStyle !== undefined ||
        track.target === "text.color" && clip.textStyle?.fill !== undefined) {
      errors.push(`Style target "${track.target}" is hidden by this clip's geometry or fill`);
      continue;
    }
    if (parts.length >= 3 && ((parts[0] === "shape" && (parts[1] === "fill" || parts[1] === "fillStyle")) ||
        (parts[0] === "text" && parts[1] === "fill"))) {
      const shapeFill = parts[0] === "shape" && clip.shapeStyle
        ? parts[1] === "fillStyle" ? clip.shapeStyle.fillStyle : clip.shapeStyle.fill
        : undefined;
      const fill = parts[0] === "text" ? clip.textStyle?.fill : shapeFill;
      const gradient = typeof fill === "string" ? undefined : fill;
      const valid = parts[2] === "angle"
        ? gradient?.type === "linear"
        : gradient?.type !== "solid" && gradient?.stops[Number(parts[3])] !== undefined;
      if (!valid) {
        errors.push(`Style target "${track.target}" has no matching gradient field`);
        continue;
      }
    }
    if (track.keyframes.length < 2 || track.keyframes.some((frame, index) =>
      typeof frame.value !== expected || !Number.isFinite(frame.t) ||
      frame.t < 0 || frame.t > 1 || (index > 0 && frame.t < track.keyframes[index - 1].t)
    )) {
      errors.push(`Style target "${track.target}" has invalid keyframes`);
      continue;
    }
    if (expected === "string" && !PATH_TARGETS.has(track.target)) {
      if (track.keyframes.some((frame) => typeof frame.value === "string" && parseCssColor(frame.value) === null)) {
        errors.push(`Style target "${track.target}" has an unsupported CSS color`);
      }
    }
    if (PATH_TARGETS.has(track.target)) {
      for (let index = 1; index < track.keyframes.length; index++) {
        const previous = track.keyframes[index - 1].value;
        const next = track.keyframes[index].value;
        if (typeof previous === "string" && typeof next === "string" && !morphCompatiblePath(previous, next, 0.5)) {
          errors.push(`Style target "${track.target}" needs paths with matching commands and point counts`);
          break;
        }
      }
    }
  }
  return errors;
}

export function glyphTracksNeedStagger(tracks: readonly AnimationStyleTrack[], stagger: { unit: string } | undefined): boolean {
  return tracks.some((track) => track.target.startsWith("glyph.")) && stagger === undefined;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function lerpColor(a: string, b: string, t: number): string {
  const from = parseCssColor(a);
  const to = parseCssColor(b);
  if (!from || !to) return t < 1 ? a : b;
  const channels = (["r", "g", "b", "a"] as const).map((channel) =>
    Math.max(0, Math.min(255, Math.round((from[channel] + (to[channel] - from[channel]) * t) * 255)))
      .toString(16).padStart(2, "0")
  );
  return `#${channels.join("")}`;
}

const PATH_TOKEN = /[a-zA-Z]|[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?/g;

/** Interpolates paths only when command letters and numeric arity match. */
export function morphCompatiblePath(a: string, b: string, t: number): string | null {
  const left = a.match(PATH_TOKEN);
  const right = b.match(PATH_TOKEN);
  if (!left || !right || left.length !== right.length) return null;
  const output: string[] = [];
  for (let i = 0; i < left.length; i++) {
    const from = left[i];
    const to = right[i];
    if (/^[a-zA-Z]$/.test(from)) {
      if (from !== to || from.toLowerCase() === "a") return null;
      output.push(from);
      continue;
    }
    const start = Number(from);
    const end = Number(to);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    output.push(String(start + (end - start) * t));
  }
  return output.join(" ");
}

export function styleTrackValue(track: AnimationStyleTrack, t: number): number | string | undefined {
  const frames = track.keyframes;
  if (frames.length === 0) return undefined;
  if (t <= frames[0].t) return frames[0].value;
  for (let i = 1; i < frames.length; i++) {
    const end = frames[i];
    if (t > end.t) continue;
    const start = frames[i - 1];
    const progress = end.t === start.t ? 1 : ease(end.easing ?? "linear", clamp01((t - start.t) / (end.t - start.t)));
    if (typeof start.value === "number" && typeof end.value === "number") {
      return start.value + (end.value - start.value) * progress;
    }
    if (typeof start.value === "string" && typeof end.value === "string") {
      if (track.target.endsWith(".d")) {
        return morphCompatiblePath(start.value, end.value, progress) ?? (progress < 1 ? start.value : end.value);
      }
      return lerpColor(start.value, end.value, progress);
    }
    return progress < 1 ? start.value : end.value;
  }
  return frames[frames.length - 1].value;
}

function updateFill(fill: ShapeFill | undefined, parts: string[], value: number | string): ShapeFill | undefined {
  if (!fill) return undefined;
  if (parts.length === 1 && parts[0] === "angle" && fill.type === "linear" && typeof value === "number") {
    return { ...fill, angle: value };
  }
  if (parts.length === 3 && parts[0] === "stops" && /^\d+$/.test(parts[1]) && fill.type !== "solid") {
    const index = Number(parts[1]);
    const stop = fill.stops[index];
    if (!stop) return undefined;
    const field = parts[2];
    if (field === "offset" && typeof value === "number") {
      const stops = [...fill.stops];
      stops[index] = { ...stop, offset: clamp01(value) };
      return { ...fill, stops };
    }
    if (field === "color" && typeof value === "string") {
      const stops = [...fill.stops];
      stops[index] = { ...stop, color: value };
      return { ...fill, stops };
    }
  }
  return undefined;
}

function applyTrack(result: ResolvedAnimatedStyles, target: string, value: number | string): void {
  const parts = target.split(".");
  if (parts.length === 2 && COLOR_TARGETS.has(target) && typeof value === "string") {
    if (parts[0] === "shape" && result.shapeStyle) result.shapeStyle = { ...result.shapeStyle, [parts[1]]: value };
    if (parts[0] === "text" && result.textStyle) result.textStyle = { ...result.textStyle, color: value };
    return;
  }
  if (parts.length === 2 && PATH_TARGETS.has(target) && typeof value === "string") {
    if (parts[0] === "shape" && result.shapeStyle?.kind === "path") result.shapeStyle = { ...result.shapeStyle, d: value };
    if (parts[0] === "mask" && result.clipMask?.kind === "path") result.clipMask = { ...result.clipMask, d: value };
    return;
  }
  if (parts.length === 2 && typeof value === "number") {
    const field = parts[1];
    if (target === "clip.borderRadius") result.borderRadius = Math.max(0, value);
    if (parts[0] === "shape" && SHAPE_NUMBERS.has(field) && result.shapeStyle) result.shapeStyle = { ...result.shapeStyle, [field]: value };
    if (parts[0] === "text" && TEXT_NUMBERS.has(field) && result.textStyle) result.textStyle = { ...result.textStyle, [field]: value };
    if (parts[0] === "mask" && MASK_NUMBERS.has(field) && result.clipMask) result.clipMask = { ...result.clipMask, [field]: value };
    return;
  }
  if (parts.length >= 3 && parts[0] === "shape" && (parts[1] === "fillStyle" || parts[1] === "fill") && result.shapeStyle) {
    const source = parts[1] === "fillStyle" ? result.shapeStyle.fillStyle : result.shapeStyle.fill;
    const fill = typeof source === "string" ? { type: "solid" as const, color: source } : source;
    const updated = updateFill(fill, parts.slice(2), value);
    if (updated) result.shapeStyle = { ...result.shapeStyle, [parts[1]]: updated };
    return;
  }
  if (parts.length >= 3 && parts[0] === "text" && parts[1] === "fill" && result.textStyle) {
    const fill = updateFill(result.textStyle.fill, parts.slice(2), value);
    if (fill) result.textStyle = { ...result.textStyle, fill };
    return;
  }
  if (parts.length === 3 && parts[0] === "effect" && result.effects) {
    const index = result.effects.findIndex((effect) => effect.id === parts[1]);
    if (index < 0) return;
    const effect = result.effects[index];
    if (typeof value === "number" ? numericEffectField(effect, parts[2]) === undefined
      : colorEffectField(effect, parts[2]) === undefined) return;
    const effects = [...result.effects];
    effects[index] = Object.assign({}, effect, { [parts[2]]: value });
    result.effects = effects;
  }
}

/** Evaluates authored style tracks alongside the normal motion sample. */
export function resolveAnimatedStyleTracks(
  clip: Pick<TimelineClip, "animations" | "shapeStyle" | "textStyle" | "effects" | "mask" | "borderRadius">,
  compiled: readonly CompiledAnimation[],
  localMs: number
): ResolvedAnimatedStyles {
  const result: ResolvedAnimatedStyles = {
    shapeStyle: clip.shapeStyle,
    textStyle: clip.textStyle,
    effects: clip.effects,
    clipMask: clip.mask,
    borderRadius: clip.borderRadius
  };
  if (!clip.animations) return result;
  const byId = new Map(compiled.map((animation) => [animation.id, animation]));
  for (const animation of clip.animations) {
    if (animation.enabled === false || !animation.styleTracks) continue;
    const compiledAnimation = byId.get(animation.id);
    if (!compiledAnimation) continue;
    const windowProgress = animationProgressAt(compiledAnimation, localMs);
    const progress = windowProgress ?? (!compiledAnimation.loop && localMs > compiledAnimation.windowEndMs ? 1 : null);
    if (progress === null) continue;
    for (const track of animation.styleTracks) {
      const value = styleTrackValue(track, progress);
      if (value !== undefined) applyTrack(result, track.target, value);
    }
  }
  return result;
}

/** Dynamic text content for a number ticker or deterministic decode. */
export function resolveAnimatedTextContent(
  clip: Pick<TimelineClip, "animations" | "textStyle">,
  compiled: readonly CompiledAnimation[],
  localMs: number
): string | undefined {
  const source = clip.textStyle?.text;
  if (source === undefined || !clip.animations) return source;
  const byId = new Map(compiled.map((animation) => [animation.id, animation]));
  let result = source;
  for (const animation of clip.animations) {
    if (animation.enabled === false || !animation.textAnimator) continue;
    const compiledAnimation = byId.get(animation.id);
    if (!compiledAnimation) continue;
    const windowProgress = animationProgressAt(compiledAnimation, localMs);
    const progress = windowProgress ?? (!compiledAnimation.loop && localMs > compiledAnimation.windowEndMs ? 1 : null);
    if (progress === null) continue;
    const eased = clamp01(ease(animation.easing ?? "linear", progress));
    const animator = animation.textAnimator;
    if (animator.kind === "ticker") {
      const decimals = Math.max(0, Math.min(6, animator.decimals ?? 0));
      const number = animator.from + (animator.to - animator.from) * eased;
      const formatted = number.toFixed(decimals);
      const padded = formatted.padStart(animator.padTo ?? 0, "0");
      const dot = padded.indexOf(".");
      const integer = dot < 0 ? padded : padded.slice(0, dot);
      const fraction = dot < 0 ? "" : padded.slice(dot);
      const separator = animator.groupSeparator;
      const grouped = separator
        ? integer.replace(/\B(?=(\d{3})+(?!\d))/g, () => separator) + fraction
        : padded;
      result = `${animator.prefix ?? ""}${grouped}${animator.suffix ?? ""}`;
      continue;
    }
    const chars = Array.from(source);
    const charset = Array.from(animator.charset ?? "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
    const decoded = Math.floor(eased * chars.length);
    const frame = Math.floor(localMs / 33);
    result = chars.map((char, index) => {
      if (index < decoded || eased >= 1 || /\s/.test(char)) return char;
      const random = Math.abs(Math.sin((animator.seed ?? 0) * 127.1 + index * 311.7 + frame * 74.7) * 43758.5453);
      return charset[Math.floor((random - Math.floor(random)) * charset.length)] ?? char;
    }).join("");
  }
  return result;
}
