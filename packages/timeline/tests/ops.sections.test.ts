import { describe, expect, it } from "vitest";
import { makeClip, makeTrack, type TimelineClip } from "../src/index.js";
import { DEFAULT_TEMPO } from "../src/midi/tempo.js";
import {
  applyTimelineOp,
  timelineOpFromToolArgs,
  type TimelineOpState
} from "../src/ops/index.js";

function ctx() {
  let n = 0;
  return { newId: (kind: string) => `${kind}_${++n}` } as never;
}

// 120 BPM 4/4: one bar is 2000 ms.
function state(clips: TimelineClip[], over: Partial<TimelineOpState> = {}): TimelineOpState {
  return {
    fps: 30,
    width: 1920,
    height: 1080,
    tracks: [
      makeTrack({ id: "keys", type: "midi", name: "Keys", index: 0 }),
      makeTrack({ id: "aud", type: "audio", name: "Aud", index: 1 }),
      makeTrack({ id: "chd", type: "chord", name: "Chords", index: 2 })
    ],
    clips,
    markers: [],
    tempo: { ...DEFAULT_TEMPO },
    playheadMs: 0,
    selectedClipIds: [],
    ...over
  };
}

const midi = (over: Partial<TimelineClip> = {}) =>
  makeClip({
    id: "m",
    trackId: "keys",
    name: "m",
    startMs: 0,
    durationMs: 8000,
    mediaType: "midi",
    notes: [
      { id: "n1", pitch: 60, velocity: 90, startTick: 0, durationTick: 480 },
      { id: "n2", pitch: 62, velocity: 90, startTick: 7680, durationTick: 480 }
    ],
    ...over
  });
const audio = (over: Partial<TimelineClip> = {}) =>
  makeClip({
    id: "a",
    trackId: "aud",
    name: "a",
    startMs: 4000,
    durationMs: 2000,
    mediaType: "audio",
    ...over
  });

async function run(s: TimelineOpState, tool: string, op: Record<string, unknown>) {
  const out = await applyTimelineOp(s, timelineOpFromToolArgs(tool as never, op), ctx());
  if (out.error) throw new Error(out.error);
  return out;
}
const byTrack = (s: TimelineOpState, id: string) =>
  s.clips.filter((c) => c.trackId === id).sort((a, b) => a.startMs - b.startMs);

describe("insert_time", () => {
  it("splits a crossing clip and shifts later content on all tracks", async () => {
    const out = await run(state([midi(), audio()]), "insert_time", { atBar: 3, bars: 1 });
    const keys = byTrack(out.state, "keys");
    expect(keys.map((c) => [c.startMs, c.durationMs])).toEqual([
      [0, 4000],
      [6000, 4000]
    ]);
    // the right half keeps only the notes at or after the cut, re-based
    expect(keys[1]!.notes!.map((n) => n.startTick)).toEqual([0]);
    expect(byTrack(out.state, "aud")[0]!.startMs).toBe(6000);
  });

  it("moves markers, chords and automation points", async () => {
    const s = state([audio()], {
      markers: [
        { id: "k1", timeMs: 1000, label: "a" },
        { id: "k2", timeMs: 5000, label: "b" }
      ]
    });
    s.tracks[2]!.chords = [
      { id: "c1", startTick: 0, durationTick: 3840, root: 0, quality: "major", inversion: 0 },
      { id: "c2", startTick: 3840, durationTick: 3840, root: 5, quality: "major", inversion: 0 }
    ];
    s.tracks[1]!.automation = [
      {
        id: "l",
        target: { kind: "mixer", param: "volumeDb" },
        points: [
          { timeMs: 1000, value: 0 },
          { timeMs: 5000, value: -6 }
        ]
      }
    ];
    const out = await run(s, "insert_time", { atMs: 2000, ms: 2000 });
    expect(out.state.markers.map((m) => m.timeMs)).toEqual([1000, 7000]);
    expect(out.state.tracks[2]!.chords!.map((c) => c.startTick)).toEqual([0, 7680]);
    expect(out.state.tracks[1]!.automation![0]!.points.map((p) => p.timeMs)).toEqual([1000, 7000]);
  });

  it("with trackIds changes only those tracks", async () => {
    const s = state([midi(), audio()], { markers: [{ id: "k", timeMs: 5000, label: "b" }] });
    const out = await run(s, "insert_time", { atBar: 1, bars: 1, trackIds: ["aud"] });
    expect(byTrack(out.state, "aud")[0]!.startMs).toBe(6000);
    expect(byTrack(out.state, "keys")[0]!.startMs).toBe(0);
    expect(out.state.markers[0]!.timeMs).toBe(5000);
  });

  it("moves a locked clip with the inserted time", async () => {
    const out = await run(state([audio({ locked: true })]), "insert_time", { atBar: 1, bars: 1 });
    expect(out.state.clips[0]!.startMs).toBe(6000);
  });

  it("refuses both bar and ms forms", async () => {
    await expect(
      run(state([audio()]), "insert_time", { atBar: 1, atMs: 0, bars: 1 })
    ).rejects.toThrow();
    await expect(run(state([audio()]), "insert_time", { atBar: 1 })).rejects.toThrow(/bars|ms/);
  });
});

describe("delete_time", () => {
  it("removes the range, trims crossing clips and closes the gap", async () => {
    const out = await run(state([midi(), audio()]), "delete_time", { fromBar: 2, toBar: 3 });
    const keys = byTrack(out.state, "keys");
    expect(keys.map((c) => [c.startMs, c.durationMs])).toEqual([
      [0, 2000],
      [2000, 4000]
    ]);
    expect(byTrack(out.state, "aud")[0]!.startMs).toBe(2000);
  });

  it("removes a clip inside the range", async () => {
    const out = await run(state([audio()]), "delete_time", { fromMs: 4000, toMs: 6000 });
    expect(out.state.clips).toHaveLength(0);
  });

  it("refuses when it would cut or remove a locked clip and names it", async () => {
    await expect(
      run(state([audio({ locked: true, name: "Vox" })]), "delete_time", { fromMs: 4500, toMs: 5000 })
    ).rejects.toThrow(/Vox/);
    await expect(
      run(state([audio({ locked: true, name: "Vox" })]), "delete_time", { fromMs: 0, toMs: 8000 })
    ).rejects.toThrow(/Vox/);
  });

  it("shifts a locked clip after the range", async () => {
    const out = await run(state([audio({ locked: true })]), "delete_time", { fromMs: 0, toMs: 2000 });
    expect(out.state.clips[0]!.startMs).toBe(2000);
  });

  it("trims chords and moves markers", async () => {
    const s = state([], { markers: [{ id: "k", timeMs: 5000, label: "b" }] });
    s.tracks[2]!.chords = [
      { id: "c1", startTick: 0, durationTick: 3840, root: 0, quality: "major", inversion: 0 },
      { id: "c2", startTick: 3840, durationTick: 3840, root: 5, quality: "major", inversion: 0 }
    ];
    const out = await run(s, "delete_time", { fromMs: 1000, toMs: 3000 });
    expect(out.state.markers[0]!.timeMs).toBe(3000);
    expect(out.state.tracks[2]!.chords!.map((c) => [c.startTick, c.durationTick])).toEqual([
      [0, 1920],
      [1920, 1920]
    ]);
  });

  it("rejects an empty or reversed range", async () => {
    await expect(run(state([]), "delete_time", { fromBar: 3, toBar: 3 })).rejects.toThrow();
  });
});

describe("duplicate_range", () => {
  it("copies the section right after it and shifts later content", async () => {
    const out = await run(state([audio({ startMs: 2000 }), audio({ id: "b", startMs: 6000 })]),
      "duplicate_range", { fromBar: 2, toBar: 3 });
    const aud = byTrack(out.state, "aud");
    expect(aud.map((c) => [c.startMs, c.durationMs])).toEqual([
      [2000, 2000],
      [4000, 2000],
      [8000, 2000]
    ]);
    expect(new Set(aud.map((c) => c.id)).size).toBe(3);
  });

  it("clips copies to the range", async () => {
    const out = await run(state([midi()]), "duplicate_range", { fromBar: 2, toBar: 3 });
    const keys = byTrack(out.state, "keys");
    // original 0..8000 is split at 4000 by the insert; copy of 2000..4000 sits at 4000..6000
    const copy = keys.find((c) => c.startMs === 4000 && c.durationMs === 2000);
    expect(copy).toBeDefined();
    expect(copy!.locked).toBeFalsy();
    expect(keys.at(-1)!.startMs + keys.at(-1)!.durationMs).toBe(10000);
  });

  it("copies markers and chords inside the range", async () => {
    const s = state([], { markers: [{ id: "k", timeMs: 2500, label: "x" }] });
    s.tracks[2]!.chords = [
      { id: "c1", startTick: 3840, durationTick: 1920, root: 0, quality: "major", inversion: 0 }
    ];
    const out = await run(s, "duplicate_range", { fromBar: 2, toBar: 3 });
    expect(out.state.markers.map((m) => m.timeMs).sort((a, b) => a - b)).toEqual([2500, 4500]);
    expect(out.state.tracks[2]!.chords!.map((c) => c.startTick)).toEqual([3840, 7680]);
  });
});
