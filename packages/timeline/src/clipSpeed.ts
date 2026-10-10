/**
 * Retiming a clip by its playback speed.
 *
 * A speed change keeps what the clip shows: the source window stays and the
 * timeline duration scales by `oldRate / newRate`. A grown clip that would
 * run into the next clip on its track is held short of it, and every member
 * of the unit is held by the same amount so linked picture and sound keep a
 * common length.
 */

import { isGroupClip } from "./group.js";
import { sourceRate } from "./sourceRate.js";
import { hasTimeRemap } from "./timeRemap.js";
import { retimeCaption } from "./trimClip.js";
import type { TimelineClip } from "./types.js";

/**
 * Set `speedMultiplier` on every clip in `memberIds` and rescale its
 * duration, returning the new clip list. Throws for a group, a non-positive
 * speed, or a time-remapped member, whose curve the new window would retime.
 */
export function retimeClipSpeed(
  clips: readonly TimelineClip[],
  memberIds: ReadonlySet<string>,
  speedMultiplier: number
): TimelineClip[] {
  if (!Number.isFinite(speedMultiplier) || speedMultiplier <= 0) {
    throw new Error(
      `speedMultiplier must be greater than 0 (got ${speedMultiplier}).`
    );
  }
  const members = clips.filter((c) => memberIds.has(c.id));
  for (const m of members) {
    if (isGroupClip(m)) {
      throw new Error(`"${m.name}" is a group; set speed on its clips.`);
    }
    if (hasTimeRemap(m)) {
      throw new Error(
        `"${m.name}" has a time remap, which a speed change would retime. Clear the remap first.`
      );
    }
  }
  const planned = members.map((m) => {
    const newRate = sourceRate({ ...m, speedMultiplier });
    const targetMs = (m.durationMs * sourceRate(m)) / newRate;
    const nextStartMs = clips.reduce(
      (min, c) =>
        c.trackId === m.trackId && !memberIds.has(c.id) && c.startMs > m.startMs
          ? Math.min(min, c.startMs)
          : min,
      Number.POSITIVE_INFINITY
    );
    const allowedMs = Math.max(m.durationMs, nextStartMs - m.startMs);
    return { m, newRate, targetMs, overflowMs: targetMs - allowedMs };
  });
  const overflowMs = Math.max(0, ...planned.map((p) => p.overflowMs));
  const next = new Map<string, TimelineClip>();
  for (const { m, newRate, targetMs } of planned) {
    const durationMs = Math.max(1, targetMs - overflowMs);
    const retimed: TimelineClip = { ...m, speedMultiplier, durationMs };
    if (overflowMs > 0 && m.outPointMs !== undefined) {
      retimed.outPointMs = (m.inPointMs ?? 0) + durationMs * newRate;
    }
    // Words are timed on the clip's clock, which the new speed stretches by
    // the same factor as the clip.
    if (m.caption) {
      retimed.caption = retimeCaption(m.caption, 0, sourceRate(m) / newRate);
    }
    next.set(m.id, retimed);
  }
  return clips.map((c) => next.get(c.id) ?? c);
}
