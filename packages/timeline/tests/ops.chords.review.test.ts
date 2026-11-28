import { describe, expect, it } from "vitest";
import {
  chordSymbol,
  COMP_LIBRARY,
  detectChordsFromNotes,
  makeClip,
  makeTrack,
  parseChordChart,
  parseChordSymbol,
  stepNumeral,
  type TimelineChord,
  type TimelineClip,
  type TimelineTrack
} from "../src/index.js";
import { DEFAULT_TEMPO } from "../src/midi/tempo.js";
import {
  applyTimelineOp,
  timelineOpFromToolArgs,
  type TimelineOpName,
  type TimelineOpState
} from "../src/ops/index.js";

const BAR = 3840;

function ctx() {
  let n = 0;
  return { newId: (kind: string) => `${kind}_${++n}` } as never;
}

function midiClip(
  id: string,
  notes: Array<[number, number, number] | [number, number, number, boolean]>,
  extra: Partial<TimelineClip> = {}
) {
  return makeClip({
    id,
    trackId: "keys",
    name: id,
    startMs: 0,
    durationMs: 16000,
    mediaType: "midi",
    notes: notes.map(([pitch, startTick, durationTick, muted], i) => ({
      id: `${id}_n${i}`,
      pitch,
      velocity: 100,
      startTick,
      durationTick,
      ...(muted ? { muted } : {})
    })),
    ...extra
  });
}

function base(over: Partial<TimelineOpState> = {}): TimelineOpState {
  return {
    fps: 30,
    width: 1920,
    height: 1080,
    tracks: [makeTrack({ id: "keys", type: "midi", name: "Keys", index: 0 })],
    clips: [],
    markers: [],
    tempo: { ...DEFAULT_TEMPO },
    playheadMs: 0,
    selectedClipIds: [],
    ...over
  };
}

const chord = (id: string, bar: number, bars: number, root: number, quality: TimelineChord["quality"]): TimelineChord => ({
  id,
  startTick: bar * BAR,
  durationTick: bars * BAR,
  root,
  quality,
  inversion: 0
});
const chordTrack = (chords: TimelineChord[] = []): TimelineTrack =>
  makeTrack({ id: "chords", type: "chord", name: "Chords", index: 1, chords });

async function run(state: TimelineOpState, name: TimelineOpName, args: Record<string, unknown>) {
  return applyTimelineOp(state, timelineOpFromToolArgs(name, args), ctx());
}
const chordsOf = (s: TimelineOpState) => s.tracks.find((t) => t.id === "chords")?.chords ?? [];
const triad = (root: number, at: number, dur: number): Array<[number, number, number]> => [
  [root, at, dur],
  [root + 4, at, dur],
  [root + 7, at, dur]
];

describe("F1 symbol suffix case", () => {
  it("keeps M and m apart", () => {
    for (const s of ["Cm13", "CM11", "CMadd9", "CM7b5"]) expect(parseChordSymbol(s).ok, s).toBe(false);
    const m13 = parseChordSymbol("CM13");
    expect(m13.ok && m13.quality).toBe("maj13");
    for (const s of ["CMaj7", "Cmaj7", "CSUS4", "Cdim", "Cm(Maj7)"]) expect(parseChordSymbol(s).ok, s).toBe(true);
  });
});

describe("F2 repeated bass pitch", () => {
  it("doubles every overlap at the lowest pitch", () => {
    const notes = [
      ...[0, 1, 2, 3].map((i) => ({ pitch: 36, startTick: i * 480, durationTick: 480 })),
      { pitch: 55, startTick: 0, durationTick: BAR },
      { pitch: 59, startTick: 0, durationTick: BAR },
      { pitch: 62, startTick: 0, durationTick: BAR }
    ];
    const one = detectChordsFromNotes(
      [{ pitch: 36, startTick: 0, durationTick: 1920 }, ...notes.slice(4)],
      [{ startTick: 0, endTick: BAR }]
    );
    const split = detectChordsFromNotes(notes, [{ startTick: 0, endTick: BAR }]);
    expect(chordSymbol(split[0])).toBe(chordSymbol(one[0]));
  });
});

describe("F3 fractional clip shift", () => {
  const offsetMs = 10000;
  const startMs = offsetMs + 8000 / 3;
  const tempo = { ...DEFAULT_TEMPO, bpm: 90, offsetMs };
  const clip = () => midiClip("m", triad(60, 0, BAR), { startMs, durationMs: 8000 / 3 });
  it("transposes beat 1 of the bar the clip starts on", async () => {
    const out = await run(base({ tempo, clips: [clip()] }), "transpose_chords", {
      semitones: 2, startBar: 2, endBar: 2, includeNotes: true
    });
    expect(out.error).toBeUndefined();
    expect(out.result.transposedNoteCount).toBe(3);
    const other = await run(base({ tempo, clips: [clip()] }), "transpose_chords", {
      semitones: 2, startBar: 1, endBar: 1, includeNotes: true
    });
    expect(other.result.transposedNoteCount).toBe(0);
  });
  it("sees no phantom overlap in the silent bar", async () => {
    const out = await run(base({ tempo, clips: [clip()] }), "detect_chords", { clipIds: ["m"], startBar: 1, write: false });
    expect(out.result.chart).toBe("| - | C |");
  });
});

describe("F4 hidden notes of a trimmed clip", () => {
  const right = () =>
    midiClip(
      "right",
      [0, 1, 2, 3].flatMap((b) => triad(60, b * BAR, BAR)),
      { startMs: 4000, inPointMs: 4000, durationMs: 4000 }
    );
  it("transpose leaves hidden notes alone", async () => {
    const out = await run(base({ clips: [right()] }), "transpose_chords", {
      semitones: 2, startBar: 1, endBar: 2, includeNotes: true
    });
    expect(out.result.transposedNoteCount).toBe(0);
    expect(out.result.noteClipIds).toEqual([]);
  });
  it("fit leaves hidden notes alone", async () => {
    const s = base({ clips: [right()], tracks: [...base().tracks, chordTrack([chord("a", 0, 2, 2, "maj")])] });
    const out = await run(s, "fit_notes_to_chords", { clipIds: ["right"], mode: "chord-tones" });
    expect(out.result.movedNoteCount).toBe(0);
    expect(out.state.clips[0].notes).toEqual(s.clips[0].notes);
  });
});

describe("F5 zero length chords", () => {
  it("refuses a barsPerChord that rounds to zero", async () => {
    const s = base({ tracks: [...base().tracks, chordTrack([chord("a", 0, 4, 0, "maj")])] });
    const out = await run(s, "apply_progression", { progression: "I-V-vi-IV", startBar: 2, barsPerChord: 0.0001 });
    expect(out.error).toMatch(/barsPerChord/);
    expect(out.state.tracks.find((t) => t.id === "chords")!.chords).toHaveLength(1);
  });
});

describe("F6 detect clamps to the clip", () => {
  it("does not run past the clip end", async () => {
    const notes: Array<[number, number, number] | [number, number, number, boolean]> = [
      ...triad(57, 0, BAR),
      ...triad(53, BAR, 7680),
      [70, BAR, 7680 * 4, true]
    ];
    const s = base({
      tracks: [...base().tracks, chordTrack([chord("z", 4, 1, 7, "maj")])],
      clips: [midiClip("m", notes, { durationMs: 4000 })]
    });
    const out = await run(s, "detect_chords", { clipIds: ["m"] });
    expect(out.result.range).toEqual({ startBar: 1, endBar: 2 });
    expect(chordsOf(out.state).some((c) => c.id === "z")).toBe(true);
  });
});

describe("F7 preset follows chords", () => {
  it("resets input to chords", async () => {
    const s = base({ clips: [midiClip("m", [], { harmony: { style: "arp", input: "notes" } })] });
    const out = await run(s, "set_clip_harmony", { clipId: "m", preset: COMP_LIBRARY[0].name });
    expect(out.error).toBeUndefined();
    expect(out.state.clips[0].harmony?.input).toBe("chords");
    expect(out.state.clips[0].harmony?.style).toBe("comp");
  });
});

describe("F8 document key mode", () => {
  it("keeps E in C major over Csus4", async () => {
    const s = base({
      tempo: { ...DEFAULT_TEMPO, key: { tonic: "C", mode: "major" } },
      tracks: [...base().tracks, chordTrack([chord("a", 0, 1, 0, "sus4")])],
      clips: [midiClip("m", [[64, 0, 480]])]
    });
    const out = await run(s, "fit_notes_to_chords", { clipIds: ["m"], mode: "scale" });
    expect(out.state.clips[0].notes![0].pitch).toBe(64);
  });
});

describe("F9 detect returns written ids", () => {
  it("matches the track ids", async () => {
    const s = base({ clips: [midiClip("m", [...triad(60, 0, BAR), ...triad(57, BAR, BAR)])] });
    const out = await run(s, "detect_chords", { clipIds: ["m"] });
    const ids = out.state.tracks.find((t) => t.type === "chord")!.chords!.map((c) => c.id).sort();
    const returned = (out.result.chords as Array<{ id: string }>).map((c) => c.id).sort();
    expect(returned).toEqual(ids);
  });
});

describe("F10 progression mode note", () => {
  const warn = async (progression: string, key: string) =>
    (await run(base(), "apply_progression", { progression, key })).result.note;
  it("reads the tonic chord, not the first chord", async () => {
    expect(await warn("ii-V-I", "C major")).toBeUndefined();
    expect(await warn("iihdim-V7b9-i", "A minor")).toBeUndefined();
    expect(await warn("vi-IV-I-V", "A minor")).toMatch(/major/);
    expect(await warn("i-VI-III-VII", "C major")).toMatch(/minor/);
  });
});

describe("F11 written range", () => {
  it("ends on a bar of at least startBar", async () => {
    const out = await run(base(), "set_chords", { startBar: 3, chords: [{ symbol: "Am", beats: 2 }] });
    expect(out.result.written).toEqual({ startBar: 3, endBar: 3 });
  });
});

describe("F13 detect start bar", () => {
  it("keeps chords before the first note", async () => {
    const s = base({
      tracks: [
        ...base().tracks,
        chordTrack([chord("a", 0, 1, 9, "min"), chord("b", 1, 1, 5, "maj"), chord("c", 2, 1, 0, "maj"), chord("d", 3, 1, 7, "maj")])
      ],
      clips: [midiClip("m", triad(60, 0, 7680), { startMs: 8000, durationMs: 4000 })]
    });
    const out = await run(s, "detect_chords", { clipIds: ["m"] });
    expect(out.result.range).toEqual({ startBar: 5, endBar: 6 });
    expect(chordsOf(out.state).slice(0, 4).map((c) => c.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("F15 transpose splits crossing chords", () => {
  it("moves only the part inside the range", async () => {
    const s = base({ tracks: [...base().tracks, chordTrack([chord("a", 0, 4, 0, "maj")])] });
    const out = await run(s, "transpose_chords", { semitones: 2, startBar: 2, endBar: 3 });
    expect(chordsOf(out.state).map((c) => `${chordSymbol(c)}@${c.startTick / BAR}+${c.durationTick / BAR}`)).toEqual([
      "C@0+1", "D@1+2", "C@3+1"
    ]);
  });
});

describe("F16 strict chord items", () => {
  it("refuses a misspelled length key", async () => {
    await expect(run(base(), "set_chords", { chords: [{ symbol: "Am", bar: 2 }] })).rejects.toThrow(/bar/);
  });
});

describe("F18 chart slot", () => {
  it("refuses a slot with no ticks", () => {
    const text = `| ${Array.from({ length: 61 }, () => "C").join(" ")} |`;
    const out = parseChordChart(text, 0, { timeSignature: { beatsPerBar: 1, beatUnit: 64 } });
    expect(out.ok).toBe(false);
  });
});

describe("F19 power chord numeral", () => {
  it("writes the 5", () => {
    expect(stepNumeral(0, "five")).toBe("I5");
  });
});

describe("F20 fit checks clips first", () => {
  it("fails on a missing clip with no chords", async () => {
    const out = await run(base(), "fit_notes_to_chords", { clipIds: ["nonexistent"] });
    expect(out.error).toBeDefined();
  });
});
