/**
 * Premiere's default audio transition (Ctrl+Shift+D): a constant power
 * cross-fade at each edit of the chosen audio clips.
 *
 * Audio has no `transitionIn`, so a cross-fade is two fades that overlap.
 * At a cut where an audio clip runs straight into the next one on its track,
 * the earlier clip is extended under the later one by the fade length (as
 * far as its source allows), it fades out across the overlap and the later
 * one fades in across it, both along the equal-power `plus3dB` curve, so the
 * level holds through the change. An edge with no clip against it fades to
 * or from silence along the same curve. An earlier clip with no source left
 * to extend dips instead: each side takes half the length.
 */

import { sourceRate } from "./sourceRate.js";
import { trimClip } from "./trimClip.js";
import type { TimelineClip } from "./types.js";

/** Within this many ms two edges touch. */
const TOUCH_MS = 1;

const endOf = (c: TimelineClip): number => c.startMs + c.durationMs;

export interface AudioCrossfadeOptions {
  /** Whether the clip may be lengthened under its neighbour. */
  canExtend?: (clip: TimelineClip) => boolean;
  /** The clip's source length in ms, when known. Unknown is not capped. */
  sourceDurationMs?: (clip: TimelineClip) => number | undefined;
}

/** How far `clip`'s tail can be extended before its source runs out. */
function tailHandleMs(
  clip: TimelineClip,
  sourceDurationMs: number | undefined
): number {
  if (sourceDurationMs === undefined) return Number.POSITIVE_INFINITY;
  const rate = sourceRate(clip);
  const outMs = clip.outPointMs ?? (clip.inPointMs ?? 0) + clip.durationMs * rate;
  return Math.max(0, (sourceDurationMs - outMs) / rate);
}

/**
 * Cross-fade every edit of the audio clips in `clipIds`. Returns the same
 * array when nothing changes.
 */
export function applyAudioCrossfades(
  clips: readonly TimelineClip[],
  clipIds: ReadonlySet<string>,
  durationMs: number,
  options: AudioCrossfadeOptions = {}
): readonly TimelineClip[] {
  if (!(durationMs > 0)) return clips;
  const canExtend = options.canExtend ?? (() => true);
  const next = new Map<string, TimelineClip>();
  const current = (c: TimelineClip): TimelineClip => next.get(c.id) ?? c;
  const audio = clips.filter((c) => c.mediaType === "audio");
  const chosen = audio.filter((c) => clipIds.has(c.id));

  // Each cut once, even when both of its clips are chosen.
  const cuts = new Map<string, [TimelineClip, TimelineClip]>();
  const touching = (a: TimelineClip, b: TimelineClip): boolean =>
    a.id !== b.id &&
    a.trackId === b.trackId &&
    Math.abs(endOf(a) - b.startMs) <= TOUCH_MS;
  for (const clip of chosen) {
    const before = audio.find((c) => touching(c, clip));
    const after = audio.find((c) => touching(clip, c));
    if (before) cuts.set(`${before.id}>${clip.id}`, [before, clip]);
    else {
      const span = Math.floor(Math.min(durationMs, clip.durationMs / 2));
      if (span > 0) {
        next.set(clip.id, {
          ...current(clip),
          fadeInMs: span,
          fadeInShape: "plus3dB"
        });
      }
    }
    if (after) cuts.set(`${clip.id}>${after.id}`, [clip, after]);
    else {
      const span = Math.floor(Math.min(durationMs, clip.durationMs / 2));
      if (span > 0) {
        next.set(clip.id, {
          ...current(clip),
          fadeOutMs: span,
          fadeOutShape: "plus3dB"
        });
      }
    }
  }

  for (const [outgoing, incoming] of cuts.values()) {
    const a = current(outgoing);
    const b = current(incoming);
    const handleMs = canExtend(a)
      ? tailHandleMs(a, options.sourceDurationMs?.(a))
      : 0;
    const overlapMs = Math.floor(
      Math.min(durationMs, handleMs, b.durationMs / 2)
    );
    if (overlapMs > 0) {
      let extended: TimelineClip;
      try {
        extended = trimClip(a, "end", overlapMs);
      } catch {
        // A time-remapped clip cannot be trimmed; leave this cut alone.
        continue;
      }
      next.set(a.id, {
        ...extended,
        fadeOutMs: overlapMs,
        fadeOutShape: "plus3dB"
      });
      next.set(b.id, { ...b, fadeInMs: overlapMs, fadeInShape: "plus3dB" });
      continue;
    }
    const halfMs = Math.floor(
      Math.min(durationMs / 2, a.durationMs / 2, b.durationMs / 2)
    );
    if (halfMs <= 0) continue;
    next.set(a.id, { ...a, fadeOutMs: halfMs, fadeOutShape: "plus3dB" });
    next.set(b.id, { ...b, fadeInMs: halfMs, fadeInShape: "plus3dB" });
  }

  if (next.size === 0) return clips;
  return clips.map((c) => next.get(c.id) ?? c);
}
