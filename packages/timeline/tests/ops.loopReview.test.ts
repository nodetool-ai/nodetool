import { describe, expect, it } from "vitest";
import { makeClip, makeTrack, type TimelineClip } from "../src/index.js";
import { DEFAULT_TEMPO } from "../src/midi/tempo.js";
import { expandMidiLoop, unrollLoopedClip } from "../src/clipLoop.js";
import { resolveInsert } from "../src/dropResolve.js";
import {
  applyTimelineOp,
  timelineOpFromToolArgs,
  type TimelineOpState
} from "../src/ops/index.js";

const BPM = 120;

function state(clips: TimelineClip[]): TimelineOpState {
  return {
    fps: 30,
    width: 1920,
    height: 1080,
    tracks: [
      makeTrack({ id: "keys", type: "midi", name: "Keys", index: 0 }),
      makeTrack({ id: "aud", type: "audio", name: "Aud", index: 1 }),
      makeTrack({ id: "aud2", type: "audio", name: "Aud2", index: 2 })
    ],
    clips,
    markers: [],
    tempo: { ...DEFAULT_TEMPO },
    playheadMs: 0,
    selectedClipIds: []
  };
}
async function run(
  s: TimelineOpState,
  tool: string,
  op: Record<string, unknown>,
  extra: Record<string, unknown> = {}
) {
  let n = 0;
  const ctx = { newId: (k: string) => `${k}_${++n}`, ...extra } as never;
  const out = await applyTimelineOp(s, timelineOpFromToolArgs(tool as never, op), ctx);
  if (out.error) throw new Error(out.error);
  return out;
}
const mclip = (over: Partial<TimelineClip> = {}) =>
  makeClip({
    id: "m",
    trackId: "keys",
    name: "m",
    startMs: 0,
    durationMs: 3000,
    mediaType: "midi",
    loopLengthMs: 2000,
    notes: [],
    ...over
  });

describe("F5 partial final repeat", () => {
  it("clips notes and controller points to the clip end", () => {
    const clip = mclip({
      notes: [{ id: "n", pitch: 60, velocity: 90, startTick: 1000, durationTick: 2000 }],
      controllers: [
        { id: "l", kind: "cc", cc: 7, points: [{ id: "p", tick: 3000, value: 50 }] }
      ]
    });
    const out = expandMidiLoop(clip, BPM);
    // clip is 5760 ticks; repeat 1 starts at 3840
    expect(out.notes!.find((n) => n.id === "n~1")!.durationTick).toBe(5760 - 4840);
    expect(out.controllers![0]!.points.every((p) => p.tick < 5760)).toBe(true);
  });
});

describe("F6 / F30 release at repeat end", () => {
  it("releases a pedal held to the last tick", () => {
    const clip = mclip({
      controllers: [
        {
          id: "l",
          kind: "cc",
          cc: 64,
          points: [
            { id: "a", tick: 0, value: 127 },
            { id: "b", tick: 3839, value: 127 }
          ]
        }
      ]
    });
    const pts = expandMidiLoop(clip, BPM).controllers![0]!.points;
    expect(pts.find((p) => p.tick === 3839)!.value).toBe(0);
  });
  it("holds a bend until the last tick instead of gliding", () => {
    const clip = mclip({
      controllers: [{ id: "l", kind: "pitchBend", points: [{ id: "a", tick: 0, value: 4096 }] }]
    });
    const pts = expandMidiLoop(clip, BPM).controllers![0]!.points;
    expect(pts.find((p) => p.tick === 3838)?.value).toBe(4096);
    expect(pts.find((p) => p.tick === 3839)?.value).toBe(0);
  });
});

describe("F28 unroll keeps ramps", () => {
  it("writes a boundary point where the window cuts a ramp", () => {
    const clip = mclip({
      durationMs: 3000,
      loopLengthMs: 1000,
      controllers: [
        {
          id: "l",
          kind: "cc",
          cc: 7,
          points: [
            { id: "a", tick: 0, value: 0 },
            { id: "b", tick: 1920, value: 127 }
          ]
        }
      ]
    });
    const [first] = unrollLoopedClip(clip, BPM, 1000, { newId: () => "x" });
    const last = first!.controllers![0]!.points.at(-1)!;
    expect(last.tick).toBe(1919);
    expect(last.value).toBeGreaterThanOrEqual(126);
  });
});

describe("F8 split keeps the right half's ramp", () => {
  it("interpolates to the window end", async () => {
    const clip = mclip({
      durationMs: 2000,
      loopLengthMs: undefined,
      controllers: [
        {
          id: "l",
          kind: "cc",
          cc: 7,
          points: [
            { id: "a", tick: 0, value: 0 },
            { id: "b", tick: 7680, value: 127 }
          ]
        }
      ]
    });
    const out = await run(state([clip]), "split_clip", { target: "m", atMs: 1000 });
    const right = out.state.clips.find((c) => c.startMs === 1000)!;
    const last = right.controllers![0]!.points.at(-1)!;
    expect(last.tick).toBe(1919);
    expect(last.value).toBeGreaterThanOrEqual(62);
    expect(last.value).toBeLessThanOrEqual(64);
  });
});

describe("F7 unroll animations", () => {
  it("plays the in animation on the first copy and out on the last", () => {
    const anim = (id: string, role: string) => ({ id, role, preset: "fade", durationMs: 100 }) as never;
    const clip = mclip({
      durationMs: 3000,
      loopLengthMs: 1000,
      animations: [anim("i", "in"), anim("o", "out"), anim("e", "emphasis")]
    });
    const copies = unrollLoopedClip(clip, BPM, 1000, { newId: (() => { let n = 0; return () => `c${++n}`; })() });
    const roles = copies.map((c) => (c.animations ?? []).map((a) => a.role));
    expect(roles[0]).toEqual(["in", "emphasis"].concat([]).length ? expect.arrayContaining(["in"]) : []);
    expect(roles[0]).not.toContain("out");
    expect(roles[1]).not.toContain("in");
    expect(roles[1]).not.toContain("out");
    expect(roles[2]).toContain("out");
    expect(roles[2]).not.toContain("in");
  });
});

describe("F10 split reaches the partner of a later repeat", () => {
  const looped = () =>
    makeClip({
      id: "L", trackId: "aud", name: "L", startMs: 0, durationMs: 4000,
      loopLengthMs: 1000, mediaType: "audio", linkId: "lk"
    });
  const partner = (over: Partial<TimelineClip> = {}) =>
    makeClip({
      id: "P", trackId: "aud2", name: "P", startMs: 0, durationMs: 4000,
      mediaType: "audio", linkId: "lk", ...over
    });
  it("refuses a locked partner", async () => {
    await expect(
      run(state([looped(), partner({ locked: true })]), "split_clip", { target: "L", atMs: 2500 })
    ).rejects.toThrow(/locked/);
  });
  it("splits an unlocked partner too", async () => {
    const out = await run(state([looped(), partner()]), "split_clip", { target: "L", atMs: 2500 });
    expect(out.state.clips.filter((c) => c.trackId === "aud2")).toHaveLength(2);
  });
});

describe("F17 known source length", () => {
  const known = { resolveAsset: async () => ({ id: "x", name: "x", contentType: "audio/wav", durationMs: 1500 }) };
  const a = (over: Partial<TimelineClip>) =>
    makeClip({
      id: "A", trackId: "aud", name: "A", startMs: 0, durationMs: 1000,
      mediaType: "audio", sourceType: "imported", currentAssetId: "x",
      inPointMs: 0, outPointMs: 1000, ...over
    });
  it("refuses a loop window beyond the source", async () => {
    await expect(
      run(state([a({})]), "loop_clip", { clip: "A", loopLengthMs: 2000, times: 1 }, known)
    ).rejects.toThrow(/source/i);
  });
  it("refuses removing a loop that would play past the source", async () => {
    await expect(
      run(state([a({ durationMs: 4000, loopLengthMs: 1000 })]), "loop_clip", { clip: "A", loopLengthMs: null }, known)
    ).rejects.toThrow(/source/i);
  });
});

describe("F29 failed snap leaves the document", () => {
  it("keeps a looped clip looped when the head trim throws", async () => {
    const clip = makeClip({
      id: "A", trackId: "aud", name: "A", startMs: 1030, durationMs: 3000,
      loopLengthMs: 1000, mediaType: "audio", sourceType: "imported",
      currentAssetId: "x", inPointMs: 0, outPointMs: 1000
    });
    const out = await run(state([clip]), "snap_to_beats", { targets: ["A"], bpm: 60, tolerance_ms: 100, mode: "start", action: "trim" });
    expect(out.state.clips).toHaveLength(1);
    expect(out.state.clips[0]!.loopLengthMs).toBe(1000);
  });
});

describe("F31 refused insert keeps the original document", () => {
  it("returns the looped clip unrolled never", () => {
    const loop = makeClip({
      id: "S", trackId: "v", name: "S", startMs: 0, durationMs: 4000,
      loopLengthMs: 1000, mediaType: "audio"
    });
    const mover = makeClip({ id: "M", trackId: "v", name: "M", startMs: 3000, durationMs: 1000, mediaType: "audio" });
    const x = makeClip({ id: "X", trackId: "o", name: "X", startMs: 3500, durationMs: 500, mediaType: "audio", linkId: "L" });
    const y = makeClip({ id: "Y", trackId: "o2", name: "Y", startMs: 0, durationMs: 500, mediaType: "audio", linkId: "L" });
    const clips = [loop, mover, x, y];
    const out = resolveInsert(clips, new Set(["M"]), { lockedClipIds: new Set(["Y"]) });
    expect(out.map((c) => c.id)).toEqual(["S", "M", "X", "Y"]);
    expect(out[0]!.loopLengthMs).toBe(1000);
  });
});
