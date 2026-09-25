import type { TimelineClip, TimelineTempo } from "../types.js";
import { DEFAULT_TEMPO } from "../midi/tempo.js";
import type { ClipAnimation } from "./types.js";

export function beatAnimationDelayMs(animation: ClipAnimation, clip: Pick<TimelineClip, "startMs">, tempo: TimelineTempo = DEFAULT_TEMPO): number {
  const beat = animation.beat;
  if (!beat) return animation.delayMs ?? 0;
  const beatMs = 60_000 / Math.max(1, tempo.bpm);
  const anchor = beat.scope === "clip"
    ? (beat.index - 1) * beatMs
    : tempo.offsetMs + (beat.index - 1) * beatMs - clip.startMs;
  return anchor + (beat.offsetMs ?? 0) + (animation.delayMs ?? 0);
}

export function resolveBeatAnimations(clip: Pick<TimelineClip, "startMs" | "animations">, tempo: TimelineTempo = DEFAULT_TEMPO): ClipAnimation[] | undefined {
  const animations = clip.animations;
  if (!animations?.some((animation) => animation.beat)) return animations;
  return animations.map((animation) => animation.beat
    ? { ...animation, delayMs: beatAnimationDelayMs(animation, clip, tempo) }
    : animation);
}

/** Apply a stagger to named clips in visual order without changing media timing. */
export function staggerClipAnimations(clips: readonly TimelineClip[], clipIds: readonly string[], offsetMs: number): TimelineClip[] {
  const order = new Map(clipIds.map((id, index) => [id, index]));
  return clips.map((clip) => {
    const index = order.get(clip.id);
    if (index === undefined || !clip.animations?.length) return clip;
    return {
      ...clip,
      animations: clip.animations.map((animation) => ({
        ...animation,
        delayMs: (animation.delayMs ?? 0) + index * offsetMs
      }))
    };
  });
}
