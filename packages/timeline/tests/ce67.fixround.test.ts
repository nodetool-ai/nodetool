import { describe, expect, it } from "vitest";
import {
  makeClip,
  makeTrack,
  type MidiNote,
  type TimelineClip
} from "../src/index.js";
import { applyAutoCrossfade } from "../src/autoCrossfade.js";
import { DEFAULT_TEMPO } from "../src/midi/tempo.js";
import { midiClipNoteEvents } from "../src/midi/events.js";
import { midiClipControllerEvents } from "../src/midi/controllers.js";
import { midiRenderKey } from "../src/midi/cacheKey.js";
import { DEFAULT_MIDI_INSTRUMENT } from "../src/midi/instrument.js";
import { expandMidiLoop } from "../src/clipLoop.js";
import { visibleNotes } from "../src/midi/notes.js";
import {
  applyTimelineOp,
  timelineOpFromToolArgs,
  type TimelineOpState
} from "../src/ops/index.js";

const byId = (clips: readonly TimelineClip[], id: string) =>
  clips.find((c) => c.id === id)!;

const audio = (id: string, startMs: number, durationMs: number, over: Partial<TimelineClip> = {}) =>
  makeClip({ id, trackId: "t1", name: id, startMs, durationMs, mediaType: "audio", ...over });

describe("F3 stored fades keep their room", () => {
  it("does not shrink a stored fade-in on the opposite edge", () => {
    const out = applyAutoCrossfade(
      [audio("a", 0, 1000, { fadeInMs: 998 }), audio("b", 1000, 1000)],
      10
    );
    const a = byId(out, "a");
    expect((a.fadeInMs ?? 0) + (a.fadeOutMs ?? 0)).toBeLessThanOrEqual(1000);
    expect(a.fadeInMs).toBe(998);
  });
});

describe("F4 pair finding", () => {
  it("crossfades a butt joint behind a shorter clip that starts inside the first", () => {
    const out = applyAutoCrossfade(
      [audio("a", 0, 1000), audio("b", 200, 200), audio("c", 1000, 1000)],
      10
    );
    expect(byId(out, "a").fadeOutMs).toBe(5);
    expect(byId(out, "c").fadeInMs).toBe(5);
  });

  it("treats a sub-millisecond overlap as an overlap, not a half-length butt joint", () => {
    const out = applyAutoCrossfade([audio("a", 0, 1000.8), audio("b", 1000, 1000)], 10);
    expect(byId(out, "a").fadeOutMs).toBeCloseTo(0.8);
    expect(byId(out, "b").fadeInShape).toBe("plus3dB");
  });

  it("ignores a gap longer than half a short setting", () => {
    const gap = [audio("a", 0, 1000), audio("b", 1000.9, 1000)];
    expect(applyAutoCrossfade(gap, 0.5)).toBe(gap);
  });

  it("smooths the edges of an overlap longer than the setting", () => {
    const out = applyAutoCrossfade([audio("a", 0, 1020), audio("b", 1000, 1000)], 10);
    expect(byId(out, "a").fadeOutMs).toBe(10);
    expect(byId(out, "b").fadeInMs).toBe(10);
  });
});

// 120 BPM: a beat is 500 ms = 960 ticks.
const note = (id: string, startTick: number, durationTick = 240, pitch = 60): MidiNote => ({
  id,
  pitch,
  velocity: 90,
  startTick,
  durationTick
});
const midi = (id: string, startMs: number, durationMs: number, notes: MidiNote[], over: Partial<TimelineClip> = {}) =>
  makeClip({ id, trackId: "keys", name: id, startMs, durationMs, mediaType: "midi", notes, ...over });
const onTimes = (clip: TimelineClip, offsetMs = 0) =>
  midiClipNoteEvents(clip, 120, Number.NEGATIVE_INFINITY, offsetMs)
    .filter((e) => e.on)
    .map((e) => e.timeMs);

describe("F6 region quantize follows the tempo grid", () => {
  const q = { grid: "1/4", strength: 100 } as const;

  it("snaps to the timeline beat grid when the clip starts off the beat", () => {
    const clip = midi("m", 250, 2000, [note("n", 0)], { quantize: q });
    // Content tick 0 is at 250 ms: nearest beat is 500 ms (or 0 ms, equal distance).
    expect(onTimes(clip).every((t) => t % 500 === 0)).toBe(true);
  });

  it("snaps to the beat grid after the in-point is trimmed", () => {
    const clip = midi("m", 0, 1500, [note("n", 500)], { quantize: q, inPointMs: 250 });
    expect(onTimes(clip).every((t) => t % 500 === 0)).toBe(true);
  });

  it("honours tempo.offsetMs", () => {
    const clip = midi("m", 0, 2000, [note("n", 960)], { quantize: q });
    expect(onTimes(clip, 100)).toEqual([600]);
  });

  it("keys the render on the grid phase", () => {
    const base = midi("m", 0, 2000, [note("n", 0)], { quantize: q });
    const key = (clip: TimelineClip, gridOffsetMs = 0) =>
      midiRenderKey({ clip, bpm: 120, instrument: DEFAULT_MIDI_INSTRUMENT, sampleRate: 48000, gridOffsetMs });
    expect(key({ ...base, startMs: 250 })).not.toBe(key(base));
    expect(key(base, 100)).not.toBe(key(base));
    expect(key({ ...base, startMs: 500 })).toBe(key(base));
  });
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
    tracks: [makeTrack({ id: "keys", type: "midi", name: "Keys", index: 0 })],
    clips,
    markers: [],
    tempo: { ...DEFAULT_TEMPO },
    playheadMs: 0,
    selectedClipIds: [],
    ...over
  } as TimelineOpState;
}
async function run(s: TimelineOpState, tool: string, op: Record<string, unknown>) {
  const out = await applyTimelineOp(s, timelineOpFromToolArgs(tool as never, op), ctx());
  if (out.error) throw new Error(out.error);
  return { out, s: out.state as TimelineOpState };
}
const sounding = (clips: TimelineClip[]) =>
  clips
    .flatMap((c) => midiClipNoteEvents(c, 120).filter((e) => e.on).map((e) => `${e.pitch}@${e.timeMs}`))
    .sort();

describe("F7 split keeps what sounded", () => {
  const q = { grid: "1/4", strength: 100 } as const;

  it("keeps a note the quantize moves across the cut", async () => {
    const clip = midi("m", 0, 1000, [note("n", 940, 200)], { quantize: q });
    const before = sounding([clip]);
    expect(before).toEqual(["60@500"]);
    const { s } = await run(state([clip]), "split_clip", { target: "m", atMs: 500 });
    expect(sounding(s.clips)).toEqual(before);
  });

  it("keeps the grid of the right half after an off-grid cut", async () => {
    const clip = midi("m", 0, 2000, [note("a", 100), note("b", 1000)], { quantize: q });
    const before = sounding([clip]);
    const { s } = await run(state([clip]), "split_clip", { target: "m", atMs: 62.5 });
    expect(sounding(s.clips)).toEqual(before);
  });
});

describe("F8 unroll keeps what sounded", () => {
  it("plays the same after a looped clip with quantize is split", async () => {
    const clip = midi("m", 0, 2000, [note("a", 940, 200), note("b", 2400, 600)], {
      quantize: { grid: "1/4", strength: 100 },
      inPointMs: 500,
      loopLengthMs: 1000
    });
    const before = sounding([clip]);
    const { s } = await run(state([clip]), "split_clip", { target: "m", atMs: 1500 });
    expect(sounding(s.clips)).toEqual(before);
  });
});

describe("F9 join keeps what sounded", () => {
  const q = { grid: "1/4", strength: 100 } as const;

  it("keeps the grid of a clip that starts off the beat", async () => {
    const a = midi("a", 0, 500, [note("a1", 0)], { quantize: q });
    const b = midi("b", 750, 500, [note("b1", 20)], { quantize: q });
    const before = sounding([a, b]);
    const { s } = await run(state([a, b]), "join_clips", { clips: ["a", "b"] });
    expect(s.clips).toHaveLength(1);
    expect(sounding(s.clips)).toEqual(before);
  });

  it("compares quantize by value, and an inactive one as none", async () => {
    const a = midi("a", 0, 500, [note("a1", 0)], { transpose: 5 });
    const b = midi("b", 500, 500, [note("b1", 0)], {
      transpose: 5,
      quantize: { strength: 0, grid: "1/16" } as never
    });
    const { s } = await run(state([a, b]), "join_clips", { clips: ["a", "b"] });
    const joined = s.clips[0]!;
    expect(joined.transpose).toBe(5);
    expect(joined.notes!.map((n) => n.pitch)).toEqual([60, 60]);
  });
});

describe("F10 quantize never silences a shown note", () => {
  it("keeps a pickup that would round up to the clip end", () => {
    const clip = midi("m", 0, 2000, [note("p", 3600)], {
      quantize: { grid: "1/4", strength: 100 }
    });
    const heard = visibleNotes(expandMidiLoop(clip, 120), 120);
    expect(heard).toHaveLength(1);
  });
});

describe("F12 set_clip_params respects locks", () => {
  it("refuses region parameters on a locked clip", async () => {
    const clip = midi("m", 0, 1000, [note("n", 0)], { locked: true });
    await expect(
      run(state([clip]), "set_clip_params", { target: "m", transpose: 12 })
    ).rejects.toThrow(/lock/i);
  });
});

describe("F14 polyphonic pressure follows transpose", () => {
  it("moves the lane pitch with the notes", () => {
    const clip = midi("m", 0, 1000, [note("n", 0)], {
      transpose: 7,
      controllers: [
        { id: "l", kind: "polyPressure", pitch: 60, points: [{ id: "p", tick: 0, value: 50 }] }
      ]
    });
    const events = midiClipControllerEvents(clip, 120);
    const pressure = events.filter((e) => e.kind === "polyPressure");
    expect(pressure.length).toBeGreaterThan(0);
    expect(pressure.every((e) => e.pitch === 67)).toBe(true);
  });
});

describe("F16 note events and quantize overlaps", () => {
  it("emits no note-off before its note-on when the onset rounds onto the clip end", () => {
    // Tick 1000 at 120 BPM is 520.8333333333334 ms. The window ends a hair
    // after it, but on a large clip start both sums round to one double.
    const clip = midi("m", 20159.428571428572, 520.8333333333335, [note("n", 1000)]);
    const events = midiClipNoteEvents(clip, 120);
    const ons = events.filter((e) => e.on).length;
    const offs = events.filter((e) => !e.on).length;
    expect(offs).toBe(ons);
    for (const off of events.filter((e) => !e.on)) {
      expect(events.some((e) => e.on && e.pitch === off.pitch && e.timeMs < off.timeMs)).toBe(true);
    }
  });

  it("does not let a quantized neighbour cut a same-pitch note short", () => {
    const clip = midi("m", 0, 2000, [note("a", 0, 300), note("b", 305, 240)], {
      quantize: { grid: "1/16", strength: 100 }
    });
    const events = midiClipNoteEvents(clip, 120);
    const first = events.find((e) => !e.on)!;
    const secondOn = events.filter((e) => e.on)[1]!;
    expect(first.timeMs).toBeLessThanOrEqual(secondOn.timeMs);
  });
});

describe("F17 fit_notes_to_chords reads transposed pitches", () => {
  it("fits what is heard and stores the pitch the clip transposes from", async () => {
    // Stored C# (61) plays as D# (63) with transpose +2. D# is outside the
    // C major chord, so the fit must move the heard note to a chord tone.
    const clip = midi("m", 0, 2000, [note("n", 0, 480, 61)], { transpose: 2 });
    const chordTrack = makeTrack({
      id: "chords",
      type: "chord",
      name: "Chords",
      index: 1,
      chords: [
        { id: "a", startTick: 0, durationTick: 3840, root: 0, quality: "maj", inversion: 0 }
      ]
    });
    const s = state([clip]);
    s.tracks = [...s.tracks, chordTrack];
    const { s: after } = await run(s, "fit_notes_to_chords", {
      clipIds: ["m"],
      mode: "chord-tones"
    });
    const stored = after.clips[0]!.notes![0]!;
    expect([0, 4, 7]).toContain((stored.pitch + 2) % 12);
  });
});

describe("F2 get_state carries the music marker", () => {
  it("shows music and the crossfade length", async () => {
    const s = state([], { music: { autoCrossfadeMs: 12 } } as never);
    const { out } = await run(s, "get_state", {});
    expect((out.result as Record<string, unknown>).music).toEqual({ autoCrossfadeMs: 12 });
    expect((out.result as Record<string, unknown>).autoCrossfadeMs).toBe(12);
  });
});
