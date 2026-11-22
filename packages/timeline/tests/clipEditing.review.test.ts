import { describe, expect, it } from "vitest";
import {
  expandMidiLoop,
  makeClip,
  makeTrack,
  rateStretchClips,
  rescaleClipsForTempo,
  resolveOverwrite,
  retimeClipSpeed,
  rippleTrim,
  rollEdit,
  splitClip,
  trimClip,
  unrollLoopedClip,
  type TimelineClip
} from "../src/index.js";
import { DEFAULT_TEMPO } from "../src/midi/tempo.js";
import { MIDI_PPQ } from "../src/midi/ticks.js";
import {
  applyTimelineOp,
  timelineOpFromToolArgs,
  type TimelineOpState
} from "../src/ops/index.js";

const note = (id: string, startTick: number, durationTick: number, extra = {}) => ({
  id,
  pitch: 60,
  velocity: 90,
  startTick,
  durationTick,
  ...extra
});

function ctx() {
  let n = 0;
  return { newId: (kind: string) => `${kind}_${++n}` } as never;
}

function state(clips: TimelineClip[], over: Partial<TimelineOpState> = {}): TimelineOpState {
  return {
    fps: 30,
    width: 1920,
    height: 1080,
    tracks: [
      makeTrack({ id: "keys", type: "midi", name: "Keys", index: 0 }),
      makeTrack({ id: "aud", type: "audio", name: "Aud", index: 1 }),
      makeTrack({ id: "vid", type: "video", name: "Vid", index: 2 })
    ],
    clips,
    markers: [],
    tempo: { ...DEFAULT_TEMPO },
    playheadMs: 0,
    selectedClipIds: [],
    ...over
  };
}

async function run(s: TimelineOpState, tool: string, op: Record<string, unknown>) {
  const out = await applyTimelineOp(s, timelineOpFromToolArgs(tool as never, op), ctx());
  if (out.error) throw new Error(out.error);
  return out;
}

const audio = (over: Partial<TimelineClip> = {}) =>
  makeClip({
    id: "a",
    trackId: "aud",
    name: "a",
    startMs: 0,
    durationMs: 8000,
    mediaType: "audio",
    inPointMs: 0,
    outPointMs: 2000,
    loopLengthMs: 2000,
    currentAssetId: "asset",
    ...over
  });

const midi = (over: Partial<TimelineClip> = {}) =>
  makeClip({
    id: "m",
    trackId: "keys",
    name: "m",
    startMs: 0,
    durationMs: 8000,
    mediaType: "midi",
    loopLengthMs: 2000,
    notes: [note("n", 0, 960)],
    ...over
  });

const ids = () => {
  let i = 0;
  return () => `c${++i}`;
};

describe("F1 split carry point is an integer", () => {
  it("rounds an interpolated controller value", () => {
    const clip = midi({
      loopLengthMs: undefined,
      durationMs: 4000,
      controllers: [
        {
          id: "l",
          kind: "cc",
          cc: 7,
          points: [
            { id: "p0", tick: 0, value: 0 },
            { id: "p1", tick: 960, value: 100 }
          ]
        }
      ]
    } as Partial<TimelineClip>);
    const ms = (320 / MIDI_PPQ) * 500;
    const [, right] = splitClip(clip, ms, { bpm: 120 });
    const carried = right.controllers![0]!.points[0]!;
    expect(carried.tick).toBe(0);
    expect(Number.isInteger(carried.value)).toBe(true);
  });
});

describe("F8 split holds no hidden midi content", () => {
  it("does not make a hidden pre-window note audible on the right", () => {
    const clip = midi({
      loopLengthMs: undefined,
      startMs: 0,
      durationMs: 4000,
      inPointMs: 1000,
      notes: [
        note("hidden", 0, 6 * MIDI_PPQ),
        note("seen", 4 * MIDI_PPQ, MIDI_PPQ),
        note("after", 20 * MIDI_PPQ, MIDI_PPQ)
      ]
    });
    const [left, right] = splitClip(clip, 2000, { bpm: 120, crossing: "split" });
    expect(left.notes!.map((n) => n.id)).toEqual(["seen"]);
    expect(right.notes).toEqual([]);
  });

  it("ends a crossing note's pitch ramp at the cut", () => {
    const clip = midi({
      loopLengthMs: undefined,
      durationMs: 4000,
      notes: [
        note("x", 0, 4 * MIDI_PPQ, {
          expression: {
            pitch: [
              { tick: 0, value: 0 },
              { tick: 4 * MIDI_PPQ, value: 4 }
            ]
          }
        })
      ]
    });
    const [left] = splitClip(clip, 1000, { bpm: 120 });
    const pitch = left.notes![0]!.expression!.pitch!;
    expect(pitch[pitch.length - 1]).toEqual({ tick: 2 * MIDI_PPQ, value: 2 });
  });
});

describe("F5 loop boundaries with fractional windows", () => {
  it("does not overlap the next repeat", () => {
    const loopMs = (1000.6 / MIDI_PPQ) * 500;
    const clip = {
      startMs: 0,
      inPointMs: 0,
      durationMs: loopMs * 3,
      loopLengthMs: loopMs,
      notes: [note("a", 0, 5000)]
    };
    const out = expandMidiLoop(clip, 120).notes!;
    expect(out.length).toBe(3);
    for (let i = 0; i + 1 < out.length; i += 1) {
      expect(out[i]!.startTick + out[i]!.durationTick).toBeLessThanOrEqual(out[i + 1]!.startTick);
    }
  });

  it("keeps a note that starts on the last tick of a window", () => {
    const loopMs = (1000.4 / MIDI_PPQ) * 500;
    const clip = {
      startMs: 0,
      inPointMs: 0,
      durationMs: loopMs * 2,
      loopLengthMs: loopMs,
      notes: [note("a", 1000, 5000)]
    };
    const out = expandMidiLoop(clip, 120).notes!;
    expect(out.length).toBeGreaterThanOrEqual(1);
    for (const n of out) expect(n.durationTick).toBeGreaterThanOrEqual(1);
  });

  it("clips note expression to the shortened note", () => {
    const clip = {
      startMs: 0,
      inPointMs: 0,
      durationMs: 4000,
      loopLengthMs: 2000,
      notes: [
        note("a", 3840 - 960, 4 * 960, {
          expression: {
            pitch: [
              { tick: 0, value: 0 },
              { tick: 960, value: 1 },
              { tick: 2880, value: 3 }
            ]
          }
        })
      ]
    };
    const first = expandMidiLoop(clip, 120).notes![0]!;
    expect(first.durationTick).toBe(960);
    for (const p of first.expression!.pitch!) expect(p.tick).toBeLessThanOrEqual(960);
  });
});

describe("F6 loop controllers", () => {
  const lane = (points: Array<[number, number]>, extra = {}) => ({
    id: "lane",
    kind: "cc",
    cc: 7,
    points: points.map(([tick, value], i) => ({ id: `p${i}`, tick, value })),
    ...extra
  });

  it("holds the repeat-end value instead of ramping into the next repeat", () => {
    const clip = {
      startMs: 0,
      inPointMs: 0,
      durationMs: 4000,
      loopLengthMs: 2000,
      notes: [],
      controllers: [lane([[0, 127], [1920, 0]])]
    } as never as Parameters<typeof expandMidiLoop>[0];
    const pts = expandMidiLoop(clip, 120).controllers![0]!.points;
    const before = pts.filter((p) => p.tick < 3840);
    expect(before[before.length - 1]!.value).toBe(0);
    expect(before[before.length - 1]!.tick).toBe(3839);
    expect(pts.find((p) => p.tick === 3840)!.value).toBe(127);
  });

  it("releases sustain at each repeat boundary", () => {
    const clip = {
      startMs: 0,
      inPointMs: 0,
      durationMs: 4000,
      loopLengthMs: 2000,
      notes: [],
      controllers: [lane([[0, 127]], { cc: 64 })]
    } as never as Parameters<typeof expandMidiLoop>[0];
    const pts = expandMidiLoop(clip, 120).controllers![0]!.points;
    const release = pts.find((p) => p.tick === 3839);
    expect(release?.value).toBe(0);
  });

  it("carries the value held before the in-point into each repeat", () => {
    const clip = {
      startMs: 0,
      inPointMs: 1000,
      durationMs: 2000,
      loopLengthMs: 1000,
      notes: [],
      controllers: [lane([[0, 50]])]
    } as never as Parameters<typeof expandMidiLoop>[0];
    const pts = expandMidiLoop(clip, 120).controllers![0]!.points;
    expect(pts.some((p) => p.tick === 1920 && p.value === 50)).toBe(true);
  });
});

describe("F7 unroll", () => {
  it("clips notes at the repeat end and ends a partial audio copy at its length", () => {
    const m = midi({
      durationMs: 5000,
      notes: [note("long", 3 * 960, 3 * 960), note("beyond", 5 * 960, 960)]
    });
    const copies = unrollLoopedClip(m, 120, 2000, { newId: ids() });
    expect(copies[0]!.notes!.map((n) => [n.id, n.durationTick])).toEqual([["long", 960]]);
    const ac = unrollLoopedClip(audio({ durationMs: 5000 }), 120, 2000, { newId: ids() });
    expect(ac[2]!.durationMs).toBe(1000);
    expect(ac[2]!.outPointMs).toBe(1000);
  });

  it("gives copies one boundary fade and unique animation ids", () => {
    const a = audio({
      durationMs: 4000,
      fadeInMs: 100,
      fadeOutMs: 100,
      animations: [{ id: "an", role: "emphasis", preset: "fade", durationMs: 200 } as never]
    });
    const [c0, c1] = unrollLoopedClip(a, 120, 2000, { newId: ids() });
    expect(c0!.fadeInMs).toBe(100);
    expect(c0!.fadeOutMs).toBeUndefined();
    expect(c1!.fadeInMs).toBeUndefined();
    expect(c1!.fadeOutMs).toBe(100);
    expect(c1!.animations![0]!.id).not.toBe("an");
  });
});

describe("F9 drops over a looped clip", () => {
  it("unrolls the victim before cutting it", () => {
    const victim = midi({ id: "v", startMs: 0, durationMs: 8000 });
    const mover = makeClip({
      id: "mv",
      trackId: "keys",
      name: "mv",
      startMs: 3000,
      durationMs: 1000,
      mediaType: "midi",
      notes: []
    });
    const out = resolveOverwrite([victim, mover], new Set(["mv"]), { bpm: 90 });
    for (const c of out) expect(c.loopLengthMs).toBeUndefined();
    expect(out.filter((c) => c.id !== "mv").length).toBeGreaterThan(2);
  });
});

describe("F10 split of a looped linked partner", () => {
  it("unrolls the looped partner before cutting it", async () => {
    const v = makeClip({
      id: "v",
      trackId: "vid",
      name: "v",
      startMs: 0,
      durationMs: 8000,
      mediaType: "video",
      linkId: "L",
      inPointMs: 0,
      outPointMs: 8000
    });
    const a = audio({ linkId: "L" });
    const out = await run(state([v, a]), "split_clip", { target: "v", atMs: 3000 });
    for (const c of out.state.clips) expect(c.loopLengthMs).toBeUndefined();
  });
});

describe("F11 rate and tempo changes scale the loop window", () => {
  it("retimeClipSpeed", () => {
    const [c] = retimeClipSpeed([audio()], new Set(["a"]), 2);
    expect(c!.durationMs).toBe(4000);
    expect(c!.loopLengthMs).toBe(1000);
  });
  it("rescaleClipsForTempo", () => {
    const tracks = [makeTrack({ id: "keys", type: "midi", name: "K", index: 0 })];
    const [c] = rescaleClipsForTempo(
      [midi()],
      tracks,
      { ...DEFAULT_TEMPO, bpm: 120 },
      { ...DEFAULT_TEMPO, bpm: 60 }
    );
    expect(c!.durationMs).toBe(16000);
    expect(c!.loopLengthMs).toBe(4000);
  });
  it("rateStretchClips", () => {
    const out = rateStretchClips([audio()], new Set(["a"]), "a", "end", 4000);
    expect(out[0]!.durationMs).toBe(4000);
    expect(out[0]!.loopLengthMs).toBe(1000);
  });
});

describe("F13 slip a looped audio clip", () => {
  it("keeps the out-point one loop window after the in-point", async () => {
    const out = await run(state([audio()]), "trim_clip", { target: "a", inPointMs: 500 });
    expect(out.state.clips[0]!.outPointMs).toBe(2500);
  });
});

describe("F16 detect_chords reads loop repeats", () => {
  it("finds chords in every repeat", async () => {
    const clip = midi({
      durationMs: 8000,
      loopLengthMs: 2000,
      notes: [
        note("a", 0, 3840, { pitch: 60 }),
        note("b", 0, 3840, { pitch: 64 }),
        note("c", 0, 3840, { pitch: 67 })
      ]
    });
    const out = await run(state([clip]), "detect_chords", { clipIds: ["m"], write: false });
    expect((out.result as { range: { endBar: number } }).range.endBar).toBeGreaterThanOrEqual(4);
  });
});

describe("F18 start trim of a looped clip", () => {
  it("drops a dormant loop when the clip no longer exceeds the window", () => {
    const next = trimClip(audio({ durationMs: 4000 }), "start", -2500);
    expect(next.durationMs).toBe(1500);
    expect(next.loopLengthMs).toBeUndefined();
  });

  it("snap_to_beats trim unrolls a looped clip", async () => {
    const clip = midi({ startMs: 40, durationMs: 4000, inPointMs: 100 });
    const out = await run(state([clip]), "snap_to_beats", { targets: ["m"], bpm: 120, action: "trim", mode: "start" });
    expect(out.state.clips.length).toBeGreaterThan(1);
    for (const c of out.state.clips) expect(c.loopLengthMs).toBeUndefined();
  });
});

describe("F19 duplicate_clip refuses a negative later copy", () => {
  it("throws before writing", async () => {
    const clip = midi({ startMs: 8000, durationMs: 2000, loopLengthMs: undefined });
    await expect(
      run(state([clip]), "duplicate_clip", { target: "m", atBar: 4, gapMs: -5000, count: 4 })
    ).rejects.toThrow();
  });
});

describe("F22 loop and time remap", () => {
  it("refuses to loop a time-remapped clip", async () => {
    const a = audio({
      durationMs: 2000,
      loopLengthMs: undefined,
      timeRemap: { keyframes: [{ t: 0, sourceMs: 0 }, { t: 1, sourceMs: 1000 }] } as never
    });
    await expect(run(state([a]), "loop_clip", { clip: "a", times: 3 })).rejects.toThrow(/remap/i);
  });
});

describe("F26 get_state counts repeats", () => {
  it("audibleNoteCount includes looped notes", async () => {
    const out = await run(state([midi()]), "get_state", {});
    expect(JSON.stringify(out.result)).toContain('"audibleNoteCount":4');
  });
});

describe("known gap: ripple and roll start trims unroll", () => {
  it("rippleTrim start", () => {
    const out = rippleTrim([audio()], "a", "start", -500, { bpm: 120 });
    for (const c of out) expect(c.loopLengthMs).toBeUndefined();
    expect(out.length).toBeGreaterThan(1);
  });
  it("rollEdit start", () => {
    const left = makeClip({
      id: "l",
      trackId: "aud",
      name: "l",
      startMs: 0,
      durationMs: 1000,
      mediaType: "audio",
      inPointMs: 5000,
      outPointMs: 6000
    });
    const right = audio({ startMs: 1000 });
    const out = rollEdit([left, right], "a", "start", 500, { bpm: 120 });
    for (const c of out) expect(c.loopLengthMs).toBeUndefined();
    expect(out.length).toBeGreaterThan(2);
  });
  it("rateStretchClips start keeps the loop in step with the stretch", () => {
    const out = rateStretchClips([audio({ startMs: 4000 })], new Set(["a"]), "a", "start", 4000);
    expect(out[0]!.startMs).toBe(8000);
    expect(out[0]!.durationMs).toBe(4000);
    expect(out[0]!.loopLengthMs).toBe(1000);
  });
});
