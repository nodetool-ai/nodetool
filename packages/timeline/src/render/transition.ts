/**
 * transition — what a cut between two clips looks like at a point in time.
 *
 * A transition is authored on the **incoming** clip (`transitionIn`) and
 * resolved for both sides (D5): {@link resolveTransition} finds the outgoing
 * partner beneath it on the same track and answers a record per role. Every
 * render surface reads those records rather than re-deriving the cut, so a
 * push in the preview is the same push in the export.
 *
 * The records are pure data — an opacity, a scale, a frame-relative offset, a
 * wipe mask, a full-frame solid — because the two compositors express drawing
 * differently and only the *values* can be shared. A type this build cannot
 * read falls back to a cross-fade rather than throwing (I2), which is what
 * lets a document from a newer build still play.
 */

import type { AnimationSampleMask, WipeDirection } from "../animation/index.js";
import { ease } from "../animation/index.js";
import type { ClipEffect, ClipTransform, TimelineClip } from "../types.js";
import { IDENTITY_TRANSFORM } from "./transform.js";

/** Transition types this build draws. Anything else falls back (I2). */
export const TRANSITION_TYPES = [
  "crossfade",
  "dipToColor",
  "wipe",
  "push",
  "slide",
  "zoom",
  "whip",
  "zoomBlur",
  "glitch",
  "gradientWipe",
  "iris",
  "lightLeak"
] as const;

export type TransitionType = (typeof TRANSITION_TYPES)[number];

/** Which side of the cut a layer is on. */
export type TransitionRole = "in" | "out";

/**
 * Directions a transition can run in. Same set and same meaning as the wipe
 * animation's: the edge the reveal — or the incoming clip — starts from.
 */
export const TRANSITION_DIRECTIONS: readonly WipeDirection[] = [
  "left",
  "right",
  "up",
  "down"
];

/**
 * Narrow a document's transition `type` to one this build draws, or `null` for
 * one it does not — which the resolver treats as a cross-fade and the validator
 * reports as `unknown_transition`.
 */
export function parseTransitionType(type: string): TransitionType | null {
  return (TRANSITION_TYPES as readonly string[]).includes(type)
    ? (type as TransitionType)
    : null;
}

/** The same narrowing for a transition's `direction`. */
export function parseTransitionDirection(
  direction: string
): WipeDirection | null {
  return (TRANSITION_DIRECTIONS as readonly string[]).includes(direction)
    ? (direction as WipeDirection)
    : null;
}

/**
 * The edge the incoming clip enters from, as a unit vector in frame space
 * (x right, y down) — the same vocabulary the wipe mask uses, where `"left"`
 * means the reveal starts at the left edge. Both clips of a `push` travel
 * along `-d`.
 */
const DIRECTION_VECTOR: Record<WipeDirection, { x: number; y: number }> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 }
};

/** Direction a transition falls back to when the document names none we read. */
const DEFAULT_DIRECTION: WipeDirection = "left";

/** Colour a `dipToColor` falls back to when the document names none we read. */
const DEFAULT_DIP_COLOR = "#000000";

/** How far past its resting size a `zoom` pushes the outgoing clip. */
const ZOOM_OUT_END_SCALE = 1.25;
/** The size a `zoom` brings the incoming clip in from. */
const ZOOM_IN_START_SCALE = 0.8;

/** What one layer of a cut draws with, for its role. */
export interface ResolvedTransition {
  type: TransitionType;
  role: TransitionRole;
  /**
   * The eased position through the cut. 0 is the frame the cut starts on, 1
   * the frame it completes. Not clamped after easing, so a `spring` overshoot
   * reaches the geometry; every opacity derived from it is clamped.
   */
  progress: number;
  /** Multiplies the layer's own opacity. Always within [0, 1]. */
  opacity: number;
  /** Multiplies the layer's own scale. Absent means unscaled. */
  scale?: number;
  /**
   * Translation as a fraction of the frame — 1 is a whole frame width or
   * height. A compositor multiplies by the reference resolution, which is
   * where `transform.position` lives. Absent means unmoved.
   */
  offset?: { x: number; y: number };
  /** Feathered reveal for the incoming layer of a `wipe`. */
  mask?: AnimationSampleMask;
  /**
   * A full-frame solid drawn immediately beneath this layer. `dipToColor`
   * only, and only on the incoming role, so it is drawn once per cut.
   */
  solid?: { color: string; opacity: number };
  /** Transient treatment that peaks in the middle of the cut. */
  effect?: ClipEffect;
  /** Radial reveal from the centre, with normalized feather width. */
  iris?: { progress: number; softness: number };
}

/** Both sides of one cut, and the clip the outgoing record belongs to. */
export interface ResolvedTransitionPair {
  incoming: ResolvedTransition;
  /** Absent when nothing on the track overlaps the incoming clip's head. */
  outgoing?: ResolvedTransition;
  /** The clip `outgoing` describes. Present exactly when `outgoing` is. */
  outgoingClip?: TimelineClip;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * The clip a cut plays against, and how far it reaches past the incoming
 * clip's start.
 *
 * The partner is the same-track clip that begins earlier and still covers the
 * incoming clip's first frame; when several do, the one reaching furthest in
 * wins. `overlapMs` measures that same clip, so the auto cross-fade's duration
 * and its partner always describe one overlap. `overlapMs` is 0 with no
 * partner, and never exceeds the incoming clip's own duration.
 *
 * `sameTrackClips` must already be filtered to clip's track.
 */
function headOverlap(
  clip: TimelineClip,
  sameTrackClips: readonly TimelineClip[]
): { partner?: TimelineClip; overlapMs: number } {
  let partner: TimelineClip | undefined;
  let furthestEnd = clip.startMs;
  for (const prev of sameTrackClips) {
    if (prev === clip || prev.startMs >= clip.startMs) continue;
    const prevEnd = prev.startMs + prev.durationMs;
    if (prevEnd <= clip.startMs) continue; // no overlap
    if (partner === undefined || prevEnd > furthestEnd) {
      partner = prev;
      furthestEnd = prevEnd;
    }
  }
  const overlapMs = Math.min(furthestEnd - clip.startMs, clip.durationMs);
  return partner ? { partner, overlapMs } : { overlapMs: 0 };
}

/**
 * Resolve the cut `clip` opens with at `currentTimeMs`, for both roles.
 *
 * `null` means nothing is in flight: no transition, a hard cut
 * (`durationMs <= 0`), an auto cross-fade with nothing to dissolve against, or
 * a window the playhead has already passed. Callers treat that as an opacity
 * multiplier of 1 and no records.
 *
 * Behaviour with no `transitionIn` is the auto cross-fade over whatever the
 * clip's head overlaps, which is what a document written before transitions
 * were addressable relies on and stays the default.
 *
 * `sameTrackClips` must already be filtered to clip's track.
 */
export function resolveTransition(
  clip: TimelineClip,
  sameTrackClips: readonly TimelineClip[],
  currentTimeMs: number
): ResolvedTransitionPair | null {
  const authored = clip.transitionIn;
  const { partner, overlapMs } = headOverlap(clip, sameTrackClips);
  let durationMs: number;
  if (authored) {
    if (authored.durationMs <= 0) return null; // explicit hard cut
    durationMs = authored.durationMs;
  } else {
    durationMs = overlapMs;
    if (durationMs <= 0) return null; // auto, but nothing to cross-fade with
  }

  const intoClip = currentTimeMs - clip.startMs;
  if (intoClip >= durationMs) return null; // the cut is over

  const raw = clamp01(intoClip / durationMs);
  const progress = authored?.easing ? ease(authored.easing, raw) : raw;
  // An unreadable type still cuts — as a cross-fade, the one every document
  // already understands.
  const type = authored
    ? (parseTransitionType(authored.type) ?? "crossfade")
    : "crossfade";

  const pair: ResolvedTransitionPair = {
    incoming: incomingRecord(type, progress, authored)
  };
  if (partner) {
    pair.outgoing = outgoingRecord(type, progress, authored);
    pair.outgoingClip = partner;
  }
  return pair;
}

/** The solid's alpha at `p`: 0 at both ends, opaque at the midpoint. */
const dipAlpha = (p: number): number => clamp01(1 - Math.abs(2 * p - 1));

/**
 * The direction a transition names, narrowed, or the fallback.
 *
 * The `typeof` guard is not belt-and-braces: `type` is a plain string on the
 * wire (I2), so a document from a newer build can hand any value to a key one
 * of our types happens to share the name of. Same for {@link solidColorOf} and
 * {@link softnessOf} below.
 */
function directionOf(transition: TimelineClip["transitionIn"]): WipeDirection {
  if (!transition || !("direction" in transition)) return DEFAULT_DIRECTION;
  const { direction } = transition;
  if (typeof direction !== "string") return DEFAULT_DIRECTION;
  return parseTransitionDirection(direction) ?? DEFAULT_DIRECTION;
}

/** The colour a `dipToColor` dips through, or black. */
function solidColorOf(transition: TimelineClip["transitionIn"]): string {
  if (!transition || !("color" in transition)) return DEFAULT_DIP_COLOR;
  const { color } = transition;
  return typeof color === "string" ? color : DEFAULT_DIP_COLOR;
}

/** The feather width a `wipe` names, or a hard edge. */
function softnessOf(transition: TimelineClip["transitionIn"]): number {
  if (!transition || !("softness" in transition)) return 0;
  const { softness } = transition;
  return typeof softness === "number" ? softness : 0;
}

function numericOf(transition: TimelineClip["transitionIn"], key: "blur" | "amount" | "scale" | "seed", fallback: number): number {
  const value: unknown = transition ? Object.getOwnPropertyDescriptor(transition, key)?.value : undefined;
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function gradientMapOf(transition: TimelineClip["transitionIn"]): number {
  const value: unknown = transition ? Object.getOwnPropertyDescriptor(transition, "map")?.value : undefined;
  return value === "radial" ? 1 : value === "noise" ? 2 : 0;
}

function directionAngle(direction: WipeDirection): number {
  switch (direction) {
    case "left": return 180;
    case "right": return 0;
    case "up": return 270;
    case "down": return 90;
  }
}

function cutEffect(type: TransitionType, progress: number, transition: TimelineClip["transitionIn"]): ClipEffect | undefined {
  const envelope = Math.sin(Math.PI * clamp01(progress));
  if (type === "whip") {
    return { id: "transition-whip", type: "directionalBlur", enabled: true, radius: numericOf(transition, "blur", 24) * envelope, angle: directionAngle(directionOf(transition)) };
  }
  if (type === "zoomBlur") {
    return { id: "transition-zoom-blur", type: "stylize", enabled: true, mode: "zoomBlur", amount: numericOf(transition, "blur", 24) * envelope, scale: 8 };
  }
  if (type === "glitch") {
    return { id: "transition-glitch", type: "stylize", enabled: true, mode: "glitch", amount: numericOf(transition, "amount", 1) * envelope, time: progress, seed: 7 };
  }
  if (type === "gradientWipe") {
    return { id: "transition-gradient-wipe", type: "stylize", enabled: true, mode: "gradientWipe", amount: clamp01(progress), angle: directionAngle(directionOf(transition)), time: gradientMapOf(transition), scale: numericOf(transition, "scale", 6), seed: numericOf(transition, "seed", 0), softness: softnessOf(transition) || 0.1 };
  }
  if (type === "lightLeak") {
    return { id: "transition-light-leak", type: "stylize", enabled: true, mode: "lightLeakOverlay", amount: envelope * 0.9, scale: numericOf(transition, "scale", 4), seed: numericOf(transition, "seed", 0), time: progress, color: solidColorOf(transition) === DEFAULT_DIP_COLOR ? "#ff9f43" : solidColorOf(transition) };
  }
  return undefined;
}

function scaled(
  direction: WipeDirection,
  amount: number
): { x: number; y: number } {
  const d = DIRECTION_VECTOR[direction];
  return { x: d.x * amount, y: d.y * amount };
}

function incomingRecord(
  type: TransitionType,
  progress: number,
  transition: TimelineClip["transitionIn"]
): ResolvedTransition {
  const base = { type, role: "in" as const, progress };
  switch (type) {
    case "dipToColor":
      return {
        ...base,
        // The incoming clip is held back until the solid is on its way out, so
        // the midpoint frame is the colour and nothing else.
        opacity: clamp01(2 * progress - 1),
        solid: {
          color: solidColorOf(transition),
          opacity: dipAlpha(progress)
        }
      };
    case "wipe":
      return {
        ...base,
        // The reveal carries the whole cut; fading it too would show the
        // outgoing clip through the revealed half.
        opacity: 1,
        mask: {
          direction: directionOf(transition),
          progress: clamp01(progress),
          softness: softnessOf(transition)
        }
      };
    case "gradientWipe":
      return { ...base, opacity: 1, effect: cutEffect(type, progress, transition) };
    case "push":
    case "slide":
    case "whip":
      return {
        ...base,
        opacity: 1,
        offset: scaled(directionOf(transition), 1 - progress),
        effect: cutEffect(type, progress, transition)
      };
    case "zoom":
    case "zoomBlur":
      return {
        ...base,
        opacity: clamp01(progress),
        scale: ZOOM_IN_START_SCALE + (1 - ZOOM_IN_START_SCALE) * progress,
        effect: cutEffect(type, progress, transition)
      };
    case "glitch":
      return { ...base, opacity: clamp01(progress), effect: cutEffect(type, progress, transition) };
    case "iris":
      return { ...base, opacity: 1, iris: { progress: clamp01(progress), softness: softnessOf(transition) } };
    case "lightLeak":
      return { ...base, opacity: clamp01(progress), effect: cutEffect(type, progress, transition) };
    case "crossfade":
      return { ...base, opacity: clamp01(progress) };
  }
}

function outgoingRecord(
  type: TransitionType,
  progress: number,
  transition: TimelineClip["transitionIn"]
): ResolvedTransition {
  const base = { type, role: "out" as const, progress };
  switch (type) {
    case "dipToColor":
      return { ...base, opacity: clamp01(1 - 2 * progress) };
    case "push":
    case "whip":
      // The one type that moves both: the outgoing clip leaves along the same
      // axis the incoming arrives on, so the two travel as one picture.
      return {
        ...base,
        opacity: 1,
        offset: scaled(directionOf(transition), -progress),
        effect: cutEffect(type, progress, transition)
      };
    case "zoom":
    case "zoomBlur":
      return {
        ...base,
        opacity: 1,
        scale: 1 + (ZOOM_OUT_END_SCALE - 1) * progress,
        effect: cutEffect(type, progress, transition)
      };
    case "glitch":
      return { ...base, opacity: 1, effect: cutEffect(type, progress, transition) };
    case "lightLeak":
      return { ...base, opacity: 1, effect: cutEffect(type, progress, transition) };
    case "crossfade":
    case "wipe":
    case "gradientWipe":
    case "iris":
    case "slide":
      // The outgoing clip sits still at full strength and the incoming one
      // covers it. Fading it as well would bleed the black ground through the
      // middle of the dissolve.
      return { ...base, opacity: 1 };
  }
}

/**
 * The transform a layer draws with once its transition's geometry is folded in.
 * Returns `transform` itself when the record moves and scales nothing, so a
 * cross-fade or a wipe allocates nothing.
 *
 * `refWidth`/`refHeight` are the reference resolution — the space
 * `transform.position` is authored in — so an offset of 1 is one frame.
 */
export function transitionTransform(
  transform: ClipTransform | undefined,
  transition: ResolvedTransition | undefined,
  refWidth: number,
  refHeight: number
): ClipTransform | undefined {
  if (!transition) return transform;
  const { offset, scale } = transition;
  if (!offset && scale === undefined) return transform;
  const base = transform ?? IDENTITY_TRANSFORM;
  return {
    position: {
      x: base.position.x + (offset ? offset.x * refWidth : 0),
      y: base.position.y + (offset ? offset.y * refHeight : 0)
    },
    scale: {
      x: base.scale.x * (scale ?? 1),
      y: base.scale.y * (scale ?? 1)
    },
    rotation: base.rotation,
    rotationX: base.rotationX,
    rotationY: base.rotationY,
    perspective: base.perspective,
    anchor: base.anchor
  };
}
