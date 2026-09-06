/**
 * How long each animation in a document runs.
 *
 * A glTF animation has no declared duration: it ends when its last keyframe
 * does, and that time is the maximum of every sampler's input accessor. The
 * accessor already carries that number — `max[0]` is required on an animation
 * sampler input — so the duration is read from the JSON without touching the
 * buffer.
 *
 * The timeline's bake needs this to wrap or clamp a clip's model time
 * (design §D6): `loop` on wraps at the duration, off holds the last frame.
 */

import type { GltfJson } from "./gltf.js";

/** One animation's name (empty when the document left it unnamed) and length. */
export interface Model3DAnimationDuration {
  name: string;
  durationSec: number;
}

interface AnimationSampler {
  input?: number;
}

/** The last keyframe time of one sampler input accessor, or 0. */
function samplerEndSec(gltf: GltfJson, sampler: unknown): number {
  const input = (sampler as AnimationSampler | null)?.input;
  if (typeof input !== "number") return 0;
  const accessor = gltf.accessors?.[input];
  const max = accessor?.max?.[0];
  return typeof max === "number" && Number.isFinite(max) && max > 0 ? max : 0;
}

/**
 * Every animation in the document, in document order, with the time its last
 * keyframe lands on. An animation whose accessors declare no `max` reads as
 * zero-length rather than being dropped: the name still has to be selectable.
 */
export function animationDurations(
  gltf: GltfJson
): Model3DAnimationDuration[] {
  return (gltf.animations ?? []).map((animation) => ({
    name: typeof animation["name"] === "string" ? animation["name"] : "",
    durationSec: (animation.samplers ?? []).reduce<number>(
      (longest, sampler) => Math.max(longest, samplerEndSec(gltf, sampler)),
      0
    )
  }));
}
