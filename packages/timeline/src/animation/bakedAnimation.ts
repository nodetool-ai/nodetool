/**
 * One machine-produced curve written onto a clip.
 *
 * A custom animation can come from a hand edit, a JS body, or something that
 * measured the media — an audio envelope, a tracker. The last kind is the one
 * a caller re-runs: change the sensitivity, bake again, and the clip must end
 * up with one curve rather than a stack of near-identical ones. So the write
 * is not `animate_clip`'s "append or replace everything", it is "replace the
 * animation this same producer put here, and leave everything else alone".
 *
 * `custom.bakedFrom.kind` plus the driven property is the identity that
 * decides it. A hand-edited animation carries no `bakedFrom`, so it never
 * matches and is never overwritten by a re-bake — the rule that keeps a curve
 * someone tuned by hand from disappearing when the bake behind it is repeated.
 *
 * The curve is source-anchored (`timeBase: "source"`): it names absolute
 * milliseconds in the clip's media, so a trim or a split re-slices it
 * (`sourceCurves.ts`) rather than stretching motion that was measured against
 * the footage. `normalizeCustomCurves` is the gate here as everywhere else.
 *
 * Pure — no document, DOM, GPU or store — so the ops module, the headless
 * bridge and any host that holds clips all read one implementation.
 */

import {
  CUSTOM_ANIMATION_PRESET_ID,
  normalizeCustomCurves,
  resolveCustomMask
} from "./custom.js";
import type {
  AnimationRole,
  ClipAnimation,
  CustomClipAnimation
} from "./types.js";

/** `bakedFrom.kind` the audio bake stamps, so a re-bake finds its own curve. */
export const AUDIO_BAKED_ANIMATION_KIND = "audio";

/** Provenance stored on the animation: what produced it, and from what. */
export type BakedAnimationProvenance = NonNullable<
  CustomClipAnimation["bakedFrom"]
>;

/** One point of a baked curve, placed in the media's own clock. */
export interface BakedKeyframeInput {
  sourceMs: number;
  value: number;
  easing?: string;
}

/** What a producer hands the writer: one curve plus where it came from. */
export interface BakedAnimationInput {
  /** An {@link import("./types.js").AnimatedProperty}; the gate checks it. */
  property: string;
  keyframes: readonly BakedKeyframeInput[];
  /** Only `"source"`. A clip-normalized curve is what `animate_clip` writes. */
  timeBase?: string;
  bakedFrom: BakedAnimationProvenance;
  /** Default `"emphasis"` — the role whose window is the clip itself. */
  role?: AnimationRole;
  /** Default the clip's own duration, so the window is the whole clip. */
  durationMs?: number;
  /** Default 0. */
  delayMs?: number;
  easing?: string;
  params?: Record<string, number | string | boolean>;
  /** `{direction, softness}`; required when the curve drives `wipeProgress`. */
  mask?: unknown;
  /** Default true. False appends beside an existing bake instead. */
  replace?: boolean;
}

/** The clip fields the writer reads. Structural, so it needs no document. */
export interface BakedAnimationTarget {
  durationMs: number;
  animations?: ClipAnimation[];
}

export interface BakedAnimationOutcome {
  /** The clip's new animation list, in document order. */
  animations: ClipAnimation[];
  animation: ClipAnimation;
  animationId: string;
  /** True when an earlier bake of the same kind and property was overwritten. */
  replaced: boolean;
}

/**
 * Index of the animation an earlier bake of `kind` left driving `property`,
 * or -1. Exported because a caller reporting "this replaced something" wants
 * the same answer the write uses.
 */
export function findBakedAnimationIndex(
  animations: readonly ClipAnimation[] | undefined,
  kind: string,
  property: string
): number {
  if (!animations) return -1;
  return animations.findIndex(
    (animation) =>
      animation.preset === CUSTOM_ANIMATION_PRESET_ID &&
      animation.custom?.bakedFrom?.kind === kind &&
      animation.custom.curves.some((curve) => curve.property === property)
  );
}

/**
 * Build the animation `set_baked_animation` writes, and the list it belongs
 * in. Throws with the gate's own message on a curve that would render nothing.
 *
 * `bakedAt` is deliberately not stamped: `bakedFrom` is this path's
 * provenance, and a wall-clock field would make two hosts running the same
 * bake produce two different documents.
 */
export function buildBakedAnimation(
  clip: BakedAnimationTarget,
  input: BakedAnimationInput,
  newAnimationId: () => string
): BakedAnimationOutcome {
  const timeBase = input.timeBase ?? "source";
  if (timeBase !== "source") {
    throw new Error(
      `set_baked_animation writes a source-anchored curve; timeBase is ` +
        `${JSON.stringify(input.timeBase)}. A curve normalized over the ` +
        "clip's window is what animate_clip takes."
    );
  }
  const kind = input.bakedFrom?.kind;
  if (typeof kind !== "string" || kind.trim() === "") {
    throw new Error(
      "set_baked_animation needs `bakedFrom.kind` — it is what a re-bake " +
        "matches to replace its own curve instead of stacking another one."
    );
  }

  const normalized = normalizeCustomCurves(
    [{ property: input.property, keyframes: input.keyframes }],
    "source"
  );
  if (!normalized.ok) throw new Error(normalized.error);
  const curves = normalized.curves;

  const mask = resolveCustomMask(curves, input.mask);
  if (!mask.ok) throw new Error(mask.error);

  const animations = [...(clip.animations ?? [])];
  const existingIndex = findBakedAnimationIndex(
    animations,
    kind,
    input.property
  );
  const replace = input.replace !== false;
  const replaced = replace && existingIndex >= 0;

  const custom: CustomClipAnimation = {
    timeBase: "source",
    curves,
    bakedFrom: { ...input.bakedFrom, kind }
  };
  if (mask.mask) custom.mask = mask.mask;

  const animation: ClipAnimation = {
    id: replaced ? animations[existingIndex]!.id : newAnimationId(),
    role: input.role ?? "emphasis",
    preset: CUSTOM_ANIMATION_PRESET_ID,
    durationMs: input.durationMs ?? clip.durationMs,
    delayMs: input.delayMs ?? 0,
    easing: input.easing,
    params: input.params,
    custom
  };

  if (replaced) {
    animations[existingIndex] = animation;
  } else {
    animations.push(animation);
  }

  return { animations, animation, animationId: animation.id, replaced };
}
