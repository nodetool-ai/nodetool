/**
 * Randomized differential: the same random clip arrays and edits through the
 * TypeScript operations (packages/timeline/src) and the native port
 * (native-ops.ts). Results must be deep-equal once fresh ids are renamed in
 * order of appearance; a thrown error must be thrown by both, with the same
 * message.
 */
import { describe, expect, it } from "vitest";
import * as ts from "../../../../packages/timeline/src/index.ts";
import * as native from "./native-ops.ts";
import { checkIds, inputIds, normalize } from "./normalize.ts";

const CASES = Number(process.env.NT_DIFF_CASES ?? 300);

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function makeClips(r: () => number) {
  const tracks = ["t1", "t2", "t3"];
  const n = 2 + Math.floor(r() * 9);
  const clips: any[] = [];
  for (let i = 0; i < n; i++) {
    const startMs = Math.round(r() * 20) * 250 + (r() < 0.15 ? 0.5 : 0);
    const durationMs = 100 + Math.round(r() * 12) * 250;
    const c: any = {
      id: `c${i}`,
      trackId: tracks[Math.floor(r() * tracks.length)],
      name: `clip ${i}`,
      startMs,
      durationMs,
      mediaType: r() < 0.2 ? "image" : r() < 0.5 ? "audio" : "video",
      sourceType: "imported",
      status: "generated",
      versions: [],
      custom: { untouched: i }
    };
    if (r() < 0.7) c.inPointMs = Math.round(r() * 8) * 125;
    if (r() < 0.5) c.outPointMs = (c.inPointMs ?? 0) + durationMs + Math.round(r() * 4) * 125;
    if (r() < 0.2) c.speedMultiplier = r() < 0.5 ? 2 : 0.5;
    if (r() < 0.1) c.speedBaked = true;
    if (r() < 0.2) c.fadeInMs = 200;
    if (r() < 0.2) {
      c.fadeOutMs = 300;
      c.fadeOutShape = "sCurve";
    }
    if (r() < 0.15) c.transitionIn = { type: "crossfade", durationMs: 300 };
    if (r() < 0.15) {
      c.caption = {
        style: "basic",
        words: [
          { text: "a", startMs: 0, endMs: 200 },
          { text: "b", startMs: durationMs / 2, endMs: durationMs / 2 + 100 }
        ]
      };
    }
    if (r() < 0.15) {
      c.animations = [
        { id: `a${i}`, role: r() < 0.5 ? "in" : "loop", preset: "fade", durationMs: 200, delayMs: 100 }
      ];
    }
    if (r() < 0.1) c.locked = true;
    // Cuts: a clip that starts where the previous one ends, on its track.
    if (i > 0 && r() < 0.4) {
      c.trackId = clips[i - 1].trackId;
      c.startMs = clips[i - 1].startMs + clips[i - 1].durationMs;
    }
    clips.push(c);
  }
  // Link a few pairs (a video and its audio share the start).
  for (let i = 0; i + 1 < clips.length; i += 3) {
    if (r() < 0.4) {
      clips[i].linkId = `L${i}`;
      clips[i + 1].linkId = `L${i}`;
      clips[i + 1].startMs = clips[i].startMs;
    }
  }
  return clips;
}

function pick<T>(r: () => number, xs: T[]): T {
  return xs[Math.floor(r() * xs.length)];
}

function run(f: () => unknown): { ok: unknown } | { error: string } {
  try {
    return { ok: f() };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

function lockOptions(r: () => number, clips: any[]) {
  return {
    lockedTrackIds: new Set(r() < 0.3 ? ["t3"] : []),
    lockedClipIds: new Set(clips.filter((c) => c.locked).map((c) => c.id)),
    followLinks: r() < 0.8
  };
}

const OPS: Record<string, (r: () => number, clips: any[]) => [string, (m: any) => unknown]> = {
  trimClip: (r, clips) => {
    const c = pick(r, clips);
    const edge = r() < 0.5 ? "start" : "end";
    const delta = Math.round((r() - 0.5) * 16) * 125;
    const max = r() < 0.5 ? (c.outPointMs ?? 0) + Math.round(r() * 4) * 125 : undefined;
    return ["trimClip", (m) => m.trimClip(c, edge, delta, max)];
  },
  splitClip: (r, clips) => {
    const c = pick(r, clips);
    const at = c.startMs + (r() < 0.1 ? 0 : Math.round(r() * c.durationMs));
    return ["splitClip", (m) => m.splitClip(c, at)];
  },
  rippleTrim: (r, clips) => {
    const c = pick(r, clips);
    const edge = r() < 0.5 ? "start" : "end";
    const delta = Math.round((r() - 0.5) * 16) * 125;
    const o = lockOptions(r, clips);
    return ["rippleTrim", (m) => m.rippleTrim(clips, c.id, edge, delta, o)];
  },
  rollEdit: (r, clips) => {
    const edge = r() < 0.5 ? "start" : "end";
    // Mostly a clip that has a cut on that edge; sometimes any clip.
    const withCut = clips.filter((c) => ts.findRollNeighbour(clips, c, edge));
    const c = withCut.length > 0 && r() < 0.85 ? pick(r, withCut) : pick(r, clips);
    const delta = Math.round((r() - 0.5) * 8) * 125;
    const o = { followLinks: r() < 0.8 };
    return ["rollEdit", (m) => m.rollEdit(clips, c.id, edge, delta, o)];
  },
  rippleDelete: (r, clips) => {
    const ids = new Set(clips.filter(() => r() < 0.3).map((c) => c.id));
    const o = lockOptions(r, clips);
    return ["rippleDelete", (m) => m.rippleDelete(clips, ids, o)];
  },
  closeGap: (r, clips) => {
    const track = pick(r, ["t1", "t2", "t3"]);
    const at = Math.round(r() * 30) * 250;
    const o = lockOptions(r, clips);
    return ["closeGap", (m) => m.closeGap(clips, track, at, o)];
  },
  shiftClipsFrom: (r, clips) => {
    const from = Math.round(r() * 20) * 250;
    const delta = Math.round((r() - 0.5) * 16) * 250;
    const exclude = new Set(clips.filter(() => r() < 0.2).map((c) => c.id));
    const o = lockOptions(r, clips);
    return ["shiftClipsFrom", (m) => m.shiftClipsFrom(clips, from, delta, exclude, o)];
  },
  resolveDrop: (r, clips) => {
    const moved = new Set(clips.filter(() => r() < 0.25).map((c) => c.id));
    const mode = pick(r, ["overwrite", "insert", "overlap"]);
    const o = lockOptions(r, clips);
    return ["resolveDrop", (m) => m.resolveDrop(clips, moved, mode, o)];
  },
  resolveSnap: (r, clips) => {
    const t = Math.round(r() * 6000);
    const cands = ts.buildSnapPoints({ clips, playheadMs: 1234, tickIntervalMs: 1000, maxTimeMs: 6000 });
    const mpp = pick(r, [1, 5, 10, 40]);
    return ["resolveSnap", (m) => m.resolveSnap(t, cands, 8, mpp)];
  }
};

describe("native edit operations against the TypeScript ones", () => {
  for (const name of Object.keys(OPS)) {
    it(`${name}: ${CASES} random cases agree`, () => {
      const r = rng(name.length * 7919 + 17);
      let compared = 0;
      let errors = 0;
      for (let i = 0; i < CASES; i++) {
        const clips = makeClips(r);
        const known = inputIds(clips);
        const [label, apply] = OPS[name](r, clips);
        const expected = run(() => apply(ts));
        const actual = run(() => apply(native));
        const context = `${label} case ${i}: ${JSON.stringify(clips)}`;
        if ("error" in expected) {
          errors += 1;
          expect(actual, context).toEqual(expected);
        } else {
          expect("error" in actual ? actual : normalize(actual.ok, known), context).toEqual(
            normalize(expected.ok, known)
          );
          if (!("error" in actual)) expect(checkIds(actual.ok, clips), context).toEqual([]);
        }
        compared += 1;
      }
      expect(compared).toBe(CASES);
      console.log(`${name}: ${compared} cases, ${errors} expected errors`);
    });
  }
});
