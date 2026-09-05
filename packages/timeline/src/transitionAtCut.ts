/**
 * Transitions on a cut.
 *
 * The document keeps a transition on the incoming clip (`transitionIn`), and
 * the renderer cross-fades that clip in over the window while whatever sits
 * under it on the same track keeps playing. On a hard cut nothing sits under
 * it, so a dissolve needs the outgoing clip to keep going for the length of
 * the transition: that is what Premiere and Final Cut do with the outgoing
 * clip's handle. `applyTransitionAtCut` extends the abutting predecessor by
 * the transition length and sets the incoming clip's `transitionIn`, in one
 * step, so a default-transition key or a context-menu item produces a real
 * dissolve. A predecessor that cannot grow (time-remapped) is left alone and
 * the incoming clip fades from transparent instead.
 */

import { trimClip } from "./trimClip.js";
import type { ClipTransition, TimelineClip } from "./types.js";

export const DEFAULT_TRANSITION_MS = 500;

const clipEndMs = (c: TimelineClip): number => c.startMs + c.durationMs;

/**
 * The clip on `clip`'s track that ends at (±1 ms) or already overlaps its
 * start: the one a transition into `clip` plays over.
 */
export function transitionPredecessor(
  clips: readonly TimelineClip[],
  clip: TimelineClip
): TimelineClip | undefined {
  let best: TimelineClip | undefined;
  for (const c of clips) {
    if (c.id === clip.id || c.trackId !== clip.trackId) continue;
    if (c.startMs >= clip.startMs) continue;
    const end = clipEndMs(c);
    if (end < clip.startMs - 1) continue;
    if (!best || end > clipEndMs(best)) best = c;
  }
  return best;
}

/** Longest transition `clip` can carry: no more than itself or its predecessor. */
export function maxTransitionMs(
  clips: readonly TimelineClip[],
  clip: TimelineClip
): number {
  const prev = transitionPredecessor(clips, clip);
  return prev ? Math.min(clip.durationMs, prev.durationMs) : clip.durationMs;
}

/**
 * Give `clipId` a transition of `durationMs`, extending an abutting
 * predecessor under it so the two overlap for that long. A predecessor that
 * already overlaps is grown only by what the transition still lacks. The
 * transition type is kept when the clip already has one, else `type`.
 */
export function applyTransitionAtCut(
  clips: readonly TimelineClip[],
  clipId: string,
  durationMs: number,
  type: ClipTransition["type"] = "crossfade"
): TimelineClip[] {
  const clip = clips.find((c) => c.id === clipId);
  if (!clip) throw new Error(`applyTransitionAtCut: clip ${clipId} not found`);
  const wanted = Math.max(0, Math.min(durationMs, maxTransitionMs(clips, clip)));
  const prev = transitionPredecessor(clips, clip);

  let grownPrev: TimelineClip | undefined;
  if (prev && wanted > 0) {
    const overlap = clipEndMs(prev) - clip.startMs;
    const missing = wanted - Math.max(0, overlap);
    if (missing > 0) {
      try {
        grownPrev = trimClip(prev, "end", missing);
      } catch {
        // The predecessor cannot grow; the incoming clip fades in on its own.
      }
    }
  }

  const existing = clip.transitionIn;
  const transitionIn: ClipTransition =
    existing && existing.durationMs > 0
      ? { ...existing, durationMs: wanted }
      : ({ type, durationMs: wanted } as ClipTransition);

  return clips.map((c) => {
    if (c.id === clipId) return { ...c, transitionIn };
    if (grownPrev && c.id === grownPrev.id) return grownPrev;
    return c;
  });
}

/** Drop `clipId`'s transition; the predecessor keeps whatever length it has. */
export function removeTransitionAtCut(
  clips: readonly TimelineClip[],
  clipId: string
): TimelineClip[] {
  return clips.map((c) => {
    if (c.id !== clipId || c.transitionIn === undefined) return c;
    const { transitionIn: _dropped, ...rest } = c;
    return rest;
  });
}
