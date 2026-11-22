/**
 * Automatic crossfade between touching audio clips (CE7, D54).
 *
 * In a music project, audio clips on one track that touch or overlap by less
 * than `autoCrossfadeMs` get a short fade at the cut, so an edit does not
 * click. It is a render-time projection: the stored clips keep their own
 * fades, and a fade the document stores wins over the automatic one. Preview,
 * browser export and server export all read the clips through this function.
 *
 * An overlap of L ms is crossfaded over L ms along the equal-power curve. A
 * butt joint has no overlap to share, so each side takes half the length and
 * the level dips for that instant.
 */

import type { ClipFadeShape } from "./audioFade.js";
import type { TimelineClip } from "./types.js";

/** The project setting default, in ms. */
export const DEFAULT_AUTO_CROSSFADE_MS = 10;

/** Within this many ms (or half the setting, when it is shorter) two edges touch. */
const TOUCH_MS = 1;

/** An overlap below this is float noise, a butt joint. */
const EPS_MS = 1e-6;

/** The crossfade length a document asks for. 0 outside a music project. */
export function autoCrossfadeMsOf(doc: {
  music?: { autoCrossfadeMs?: number };
}): number {
  if (!doc.music) return 0;
  const ms = doc.music.autoCrossfadeMs ?? DEFAULT_AUTO_CROSSFADE_MS;
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
}

const endOf = (c: TimelineClip): number => c.startMs + c.durationMs;

/**
 * `clips` with the automatic fades applied. Returns the same array when
 * nothing changes. Input clips are never modified.
 */
export function applyAutoCrossfade<C extends TimelineClip>(
  clips: readonly C[],
  durationMs: number
): readonly C[] {
  if (!(durationMs > 0)) return clips;
  const byTrack = new Map<string, C[]>();
  for (const clip of clips) {
    if (clip.mediaType !== "audio" || clip.durationMs <= 0) continue;
    const list = byTrack.get(clip.trackId) ?? [];
    list.push(clip);
    byTrack.set(clip.trackId, list);
  }
  // Each clip edge takes the shortest fade any neighbour asks for: a true
  // overlap beats the smoothing a longer layered clip asks for, so the two
  // sides of a cut get one envelope and no later pair is left unmatched.
  type Want = { ms: number; shape: ClipFadeShape };
  const outs = new Map<string, Want>();
  const ins = new Map<string, Want>();
  const want = (map: Map<string, Want>, id: string, ms: number, shape: ClipFadeShape) => {
    if (!(ms > 0)) return;
    const prev = map.get(id);
    if (!prev || ms < prev.ms) map.set(id, { ms, shape });
  };
  // A fade the document stores wins, and so does the room it takes: the two
  // fades of a clip may not sum past its length, or the render shrinks both.
  const room = (c: C, opposite: "fadeInMs" | "fadeOutMs", want: number) =>
    Math.min(want, c.durationMs / 2, Math.max(0, c.durationMs - (c[opposite] ?? 0)));
  for (const list of byTrack.values()) {
    list.sort((a, b) => a.startMs - b.startMs);
    const touch = Math.min(TOUCH_MS, durationMs / 2);
    for (let i = 0; i < list.length; i += 1) {
      const a = list[i]!;
      // Later clips start later, so the overlap only shrinks: stop at a gap.
      for (let j = i + 1; j < list.length; j += 1) {
        const b = list[j]!;
        const overlap = endOf(a) - b.startMs;
        if (overlap < -touch) break;
        let outMs: number;
        let inMs: number;
        let shape: ClipFadeShape;
        if (overlap > durationMs) {
          // A long overlap is layering, but each clip edge inside the other
          // still clicks: smooth the edges over the setting.
          outMs = endOf(a) <= endOf(b) + EPS_MS ? durationMs : 0;
          inMs = durationMs;
          shape = "linear";
        } else if (overlap > EPS_MS) {
          outMs = inMs = overlap;
          shape = "plus3dB";
        } else {
          outMs = inMs = durationMs / 2;
          shape = "linear";
        }
        // A clip inside the other ends inside it too: that edge clicks as well.
        const bEndsInside = endOf(b) < endOf(a) - EPS_MS;
        const bOutMs = bEndsInside ? Math.min(durationMs, overlap > EPS_MS ? overlap : durationMs) : 0;
        want(outs, a.id, room(a, "fadeInMs", outMs), shape);
        want(ins, b.id, room(b, "fadeOutMs", inMs), shape);
        if (bOutMs > 0) {
          want(outs, b.id, room(b, "fadeInMs", bOutMs), bOutMs >= durationMs ? "linear" : shape);
        }
      }
    }
  }
  const patches = new Map<string, Partial<TimelineClip>>();
  const patch = (c: C): Partial<TimelineClip> => {
    let p = patches.get(c.id);
    if (!p) {
      p = {};
      patches.set(c.id, p);
    }
    return p;
  };
  for (const list of byTrack.values()) {
    for (const c of list) {
      const o = outs.get(c.id);
      if (o && !((c.fadeOutMs ?? 0) > 0)) {
        Object.assign(patch(c), { fadeOutMs: o.ms, fadeOutShape: o.shape });
      }
      const n = ins.get(c.id);
      if (n && !((c.fadeInMs ?? 0) > 0)) {
        Object.assign(patch(c), { fadeInMs: n.ms, fadeInShape: n.shape });
      }
    }
  }
  if (patches.size === 0) return clips;
  return clips.map((c) => {
    const p = patches.get(c.id);
    return p ? { ...c, ...p } : c;
  });
}
