import { describe, expect, it } from "vitest";
import {
  applyClipHarmony,
  arpPool,
  chordAtTick,
  chordName,
  chordNotes,
  chordScale,
  chordTrackFor,
  COMP_LIBRARY,
  compLibraryIndex,
  compVoices,
  expandClipHarmony,
  formatCompSteps,
  harmonizeClips,
  HARMONY_ACCENT_VELOCITY,
  HARMONY_PLAIN_VELOCITY,
  keyScale,
  parseCompSteps,
  placeChord,
  progressionChords,
  progressionIndex,
  PROGRESSIONS,
  resolveClipHarmony,
  scaleMask,
  scaleRemap,
  spreadVoicing,
  transposeChords,
  type HarmonyDocument
} from "../src/harmony/index.js";
import { MIDI_PPQ } from "../src/midi/ticks.js";
import type { ClipHarmony, MidiNote, TimelineChord, TimelineClip, TimelineTrack } from "../src/types.js";

const BAR = 4 * MIDI_PPQ;
const S16 = MIDI_PPQ / 4;

const chord = (id: string, startTick: number, durationTick: number, root: number, quality: TimelineChord["quality"], inversion = 0): TimelineChord => ({
  id, startTick, durationTick, root, quality, inversion
});

const chordTrack = (chords: TimelineChord[], id = "chords"): TimelineTrack => ({
  id, name: "Chords", type: "chord", index: 0, visible: true, locked: false, chords
});

/** 120 BPM: one quarter = 500 ms, one bar = 2000 ms. */
const doc = (chords: TimelineChord[], extra: Partial<HarmonyDocument> = {}): HarmonyDocument => ({
  tracks: [chordTrack(chords)],
  tempo: { bpm: 120, offsetMs: 0, timeSignature: { beatsPerBar: 4, beatUnit: 4 } },
  ...extra
});

const clip = (harmony: ClipHarmony | undefined, over: Partial<TimelineClip> = {}): TimelineClip => ({
  id: "c1",
  trackId: "m1",
  name: "Arp",
  startMs: 0,
  durationMs: 2000,
  mediaType: "midi",
  sourceType: "imported",
  status: "draft",
  versions: [],
  locked: false,
  ...(harmony ? { harmony } : {}),
  ...over
} as TimelineClip);

const pitches = (notes: MidiNote[]): number[] => notes.map((n) => n.pitch);
const starts = (notes: MidiNote[]): number[] => notes.map((n) => n.startTick);

describe("chords", () => {
  it("names and voices chords like FableSynth", () => {
    expect(chordName({ root: 9, quality: "min" })).toBe("Am");
    expect(chordName({ root: 10, quality: "m7b5" })).toBe("B♭m7♭5");
    expect(chordNotes({ root: 0, quality: "maj", inversion: 0 }, 48)).toEqual([48, 52, 55]);
    expect(chordNotes({ root: 0, quality: "maj", inversion: 1 }, 48)).toEqual([52, 55, 60]);
    expect(chordNotes({ root: 0, quality: "maj", inversion: 9 }, 48)).toEqual([55, 60, 64]);
    expect(chordNotes({ root: 9, quality: "m7", inversion: 0 }, 48)).toEqual([57, 60, 64, 67]);
  });

  it("places a chord by trimming and splitting what it covers", () => {
    const long = chord("a", 0, 4 * BAR, 0, "maj");
    const placed = placeChord([long], chord("b", BAR, BAR, 7, "maj"));
    expect(placed.map((c) => [c.id, c.startTick, c.durationTick])).toEqual([
      ["a", 0, BAR],
      ["b", BAR, BAR],
      ["a-r", 2 * BAR, 2 * BAR]
    ]);
  });

  it("builds a progression in a key, filling and cutting a length", () => {
    const pop = PROGRESSIONS[0];
    const one = progressionChords(pop, 2);
    expect(one.map(chordName)).toEqual(["D", "A", "Bm", "G"]);
    expect(one.map((c) => c.startTick)).toEqual([0, BAR, 2 * BAR, 3 * BAR]);
    const filled = progressionChords(pop, 0, { startTick: BAR, lengthTicks: 5.5 * BAR, mintId: (i) => `p${i}` });
    expect(filled.map(chordName)).toEqual(["C", "G", "Am", "F", "C", "G"]);
    expect(filled.at(-1)).toMatchObject({ id: "p5", startTick: 6 * BAR, durationTick: BAR / 2 });
    expect(progressionIndex(one, 2)).toBe(0);
    expect(progressionIndex(transposeChords(one, 2, 5), 5)).toBe(0);
    expect(progressionIndex(one, 3)).toBe(-1);
  });

  it("finds the chord under a tick", () => {
    const chords = [chord("a", 0, BAR, 0, "maj"), chord("b", BAR, BAR, 7, "maj")];
    expect(chordAtTick(chords, BAR - 1)?.id).toBe("a");
    expect(chordAtTick(chords, BAR)?.id).toBe("b");
    expect(chordAtTick(chords, 2 * BAR)).toBeUndefined();
  });
});

describe("scales", () => {
  it("fits a key scale and chord scales", () => {
    const amPop = progressionChords(PROGRESSIONS[10], 9); // i–VI–III–VII in A
    expect(keyScale(amPop, 9)).toBe("minor");
    expect(chordScale({ root: 7, quality: "dom7" }, scaleMask(0, "major"))).toBe("mixolydian");
    // C♯ → C (tie goes down), F♯ → G when G is a chord tone.
    const cMajor = scaleMask(0, "major");
    expect(scaleRemap(cMajor)[1]).toBe(-1);
    expect(scaleRemap(cMajor, 1 << 7)[6]).toBe(1);
  });
});

describe("comp patterns", () => {
  it("round-trips the step grammar", () => {
    const steps = "BC> - . U L M T C> . . . . . . . -";
    const p = parseCompSteps(steps);
    expect(formatCompSteps(p.comp, p.ties, p.accents)).toBe(steps);
  });

  it("spreads voicings and picks voices", () => {
    expect(spreadVoicing([60, 64, 67, 71], "drop2")).toEqual([55, 60, 64, 71]);
    expect(spreadVoicing([60, 64, 67, 71], "open")).toEqual([60, 67, 76, 83]);
    expect(compVoices(1 | 8, [60, 64, 67], 48)).toEqual([48, 67]);
  });

  it("ships the library with every entry recognised", () => {
    expect(COMP_LIBRARY.length).toBeGreaterThan(200);
    const e = COMP_LIBRARY[7];
    expect(compLibraryIndex(e)).toBe(7);
  });

  it("builds arp pools for every order", () => {
    expect(arpPool("up", 1, [64, 60, 67])).toEqual([60, 64, 67]);
    expect(arpPool("down", 2, [60, 64])).toEqual([76, 72, 64, 60]);
    expect(arpPool("updown", 1, [60, 64, 67, 72])).toEqual([60, 64, 67, 72, 67, 64]);
    expect(arpPool("played", 1, [67, 60, 64])).toEqual([67, 60, 64]);
  });
});

describe("expandClipHarmony", () => {
  const cThenG = [chord("c", 0, BAR / 2, 0, "maj"), chord("g", BAR / 2, BAR / 2, 7, "maj")];

  it("returns written notes when harmony is absent or off", () => {
    const notes: MidiNote[] = [{ id: "n", pitch: 61, velocity: 100, startTick: 0, durationTick: 480 }];
    expect(expandClipHarmony(clip(undefined, { notes }), doc(cThenG))).toBe(notes);
    expect(expandClipHarmony(clip({ style: "off", input: "chords" }, { notes }), doc(cThenG))).toBe(notes);
  });

  it("arpeggiates the chord track at 1/16, restarting on each chord change", () => {
    const notes = expandClipHarmony(clip({ style: "arp", input: "chords" }), doc(cThenG));
    expect(notes).toHaveLength(16);
    // C3 = 48: C E G C E G C E | G B D G B D G B
    expect(pitches(notes)).toEqual([48, 52, 55, 48, 52, 55, 48, 52, 55, 59, 62, 55, 59, 62, 55, 59]);
    expect(starts(notes)).toEqual(Array.from({ length: 16 }, (_, i) => i * S16));
    expect(notes.every((n) => n.durationTick === Math.round(S16 * 0.65))).toBe(true);
    expect(notes.map((n) => n.velocity)).toEqual(
      Array.from({ length: 16 }, (_, i) => (i % 4 === 0 ? HARMONY_ACCENT_VELOCITY : HARMONY_PLAIN_VELOCITY))
    );
  });

  it("applies hits, gate, rate, octaves and order", () => {
    const hits = Array.from({ length: 16 }, (_, i) => i % 2 === 0);
    const notes = expandClipHarmony(
      clip({ style: "arp", input: "chords", rate: 0.5, gate: 0.5, octaves: 2, order: "down", hits }),
      doc([chord("c", 0, BAR, 0, "maj")])
    );
    // 8 eighth steps over one bar, odd ones resting: steps 0, 2, 4, 6.
    expect(starts(notes)).toEqual([0, 960, 1920, 2880]);
    // Pool down over two octaves: 67 64 60 55 52 48; steps 0, 2, 4, 6 read indices 0, 2, 4, 0.
    expect(pitches(notes)).toEqual([67, 60, 52, 67]);
    expect(notes.every((n) => n.durationTick === 240)).toBe(true);
  });

  it("rests where the chord track is empty", () => {
    const notes = expandClipHarmony(clip({ style: "arp", input: "chords" }), doc([chord("c", BAR / 4, BAR / 4, 0, "maj")]));
    expect(starts(notes)).toEqual([4, 5, 6, 7].map((i) => i * S16));
  });

  it("stays on the document grid when the clip starts mid-bar or is trimmed", () => {
    const d = doc([chord("c", 0, 2 * BAR, 0, "maj")]);
    // Clip starts at beat 2 (500 ms): its first step is document step 4 (lane 4, accented, pattern index 4).
    const late = expandClipHarmony(clip({ style: "arp", input: "chords" }, { startMs: 500, durationMs: 500 }), d);
    expect(pitches(late)).toEqual([52, 55, 48, 52]);
    expect(starts(late)).toEqual([0, 240, 480, 720]);
    expect(late[0].velocity).toBe(HARMONY_ACCENT_VELOCITY);
    // Same document position reached through a trimmed window: content ticks shift by the in point.
    const trimmed = expandClipHarmony(
      clip({ style: "arp", input: "chords" }, { startMs: 500, inPointMs: 500, durationMs: 500 }),
      d
    );
    expect(pitches(trimmed)).toEqual([52, 55, 48, 52]);
    expect(starts(trimmed)).toEqual([960, 1200, 1440, 1680]);
  });

  it("follows the tempo offset", () => {
    const d = doc([chord("c", 0, BAR, 0, "maj")], {
      tempo: { bpm: 120, offsetMs: 125, timeSignature: { beatsPerBar: 4, beatUnit: 4 } }
    });
    const notes = expandClipHarmony(clip({ style: "arp", input: "chords" }, { durationMs: 500 }), d);
    // Steps sit at 125 ms + k * 125 ms; the clip window [0, 500) holds document steps -1..2.
    // Step -1 has no chord. Content tick of document step 0 is 240.
    expect(starts(notes)).toEqual([240, 480, 720]);
    expect(pitches(notes)).toEqual([48, 52, 55]);
  });

  it("is deterministic under RANDOM and changes with the seed", () => {
    const d = doc([chord("c", 0, BAR, 0, "maj7")]);
    const a = expandClipHarmony(clip({ style: "arp", input: "chords", order: "random", seed: 3 }), d);
    const b = expandClipHarmony(clip({ style: "arp", input: "chords", order: "random", seed: 3 }), d);
    const c = expandClipHarmony(clip({ style: "arp", input: "chords", order: "random", seed: 4 }), d);
    expect(pitches(a)).toEqual(pitches(b));
    expect(pitches(a)).not.toEqual(pitches(c));
    expect(new Set(pitches(a)).size).toBeGreaterThan(1);
    expect(pitches(a).every((p) => [48, 52, 55, 59].includes(p))).toBe(true);
  });

  it("arpeggiates the clip's own held notes with input notes", () => {
    const notes: MidiNote[] = [
      { id: "a", pitch: 60, velocity: 100, startTick: 0, durationTick: BAR / 2 },
      { id: "b", pitch: 64, velocity: 100, startTick: 0, durationTick: BAR / 2 },
      { id: "c", pitch: 69, velocity: 100, startTick: BAR / 2, durationTick: BAR / 2 },
      { id: "d", pitch: 65, velocity: 100, startTick: BAR / 2, durationTick: BAR / 2 }
    ];
    const out = expandClipHarmony(clip({ style: "arp", input: "notes" }, { notes }), doc([]));
    expect(pitches(out)).toEqual([60, 64, 60, 64, 60, 64, 60, 64, 65, 69, 65, 69, 65, 69, 65, 69]);
  });

  it("comps the chord track with ties holding and chord changes re-striking", () => {
    const p = parseCompSteps("BC> - - - - - - - - - - - - - - -");
    const out = expandClipHarmony(
      clip({ style: "comp", input: "chords", comp: p.comp, ties: p.ties, accents: p.accents, gate: 0.5 }),
      doc(cThenG)
    );
    // C: bass C2 + C3 E3 G3 struck at 0, held 8 steps; G re-strikes at step 8 though the step is tied.
    expect(out.map((n) => [n.pitch, n.startTick, n.durationTick, n.velocity])).toEqual([
      [36, 0, 7.5 * S16, 127],
      [48, 0, 7.5 * S16, 127],
      [52, 0, 7.5 * S16, 127],
      [55, 0, 7.5 * S16, 127],
      [43, 8 * S16, 7.5 * S16, 91],
      [55, 8 * S16, 7.5 * S16, 91],
      [59, 8 * S16, 7.5 * S16, 91],
      [62, 8 * S16, 7.5 * S16, 91]
    ]);
  });

  it("strums comp voicings in the stroke direction", () => {
    const p = parseCompSteps("C . . . . . . . . . . . . . . .");
    const make = (strumDirection: "up" | "down") =>
      expandClipHarmony(
        clip({ style: "comp", input: "chords", ...p, gate: 0.8, strumMs: 10, strumDirection }),
        doc([chord("c", 0, BAR, 0, "maj")])
      );
    // 10 ms at 120 BPM = 19.2 ticks between strings.
    const up = make("up");
    expect(up.map((n) => [n.pitch, n.startTick])).toEqual([[48, 0], [52, 19], [55, 38]]);
    expect(up.map((n) => n.durationTick)).toEqual([192, 173, 154]);
    const down = make("down");
    expect(down.map((n) => [n.pitch, n.startTick])).toEqual([[55, 0], [52, 19], [48, 38]]);
  });

  it("snaps written notes to the key scale and to each chord's scale", () => {
    const notes: MidiNote[] = [
      { id: "a", pitch: 61, velocity: 100, startTick: 0, durationTick: 480 },
      { id: "b", pitch: 66, velocity: 100, startTick: BAR, durationTick: 480 }
    ];
    const chords = [chord("c", 0, BAR, 0, "maj"), chord("d", BAR, BAR, 2, "min")];
    const key = expandClipHarmony(clip({ style: "off", input: "notes", scale: "key", scaleType: "major", scaleKey: 0 }, { notes, durationMs: 4000 }), doc(chords));
    expect(pitches(key)).toEqual([60, 65]);
    const perChord = expandClipHarmony(clip({ style: "off", input: "notes", scale: "chords", scaleType: "major", scaleKey: 0 }, { notes, durationMs: 4000 }), doc(chords));
    // Over Dm the chord scale is D dorian (in C major): F♯ moves to F, a chord tone.
    expect(pitches(perChord)).toEqual([60, 65]);
    expect(perChord[1]).toMatchObject({ id: "b", startTick: BAR });
  });

  it("picks the named chord track, else the first one", () => {
    const t1 = chordTrack([chord("c", 0, BAR, 0, "maj")], "t1");
    const t2 = chordTrack([chord("a", 0, BAR, 9, "min")], "t2");
    expect(chordTrackFor({}, [t1, t2])?.id).toBe("t1");
    expect(chordTrackFor({ chordTrackId: "t2" }, [t1, t2])?.id).toBe("t2");
    expect(chordTrackFor({ chordTrackId: "gone" }, [t1, t2])?.id).toBe("t1");
    const out = expandClipHarmony(clip({ style: "arp", input: "chords", chordTrackId: "t2" }, { durationMs: 250 }), { tracks: [t1, t2] });
    expect(pitches(out)).toEqual([57, 60]);
  });

  it("defaults every field", () => {
    const r = resolveClipHarmony({ style: "comp", input: "chords", hits: [false] });
    expect(r.hits).toHaveLength(16);
    expect(r.hits[0]).toBe(false);
    expect(r.hits[1]).toBe(true);
    expect(r.rate).toBe(0.25);
    expect(r.octave).toBe(3);
  });
});

describe("applyClipHarmony", () => {
  it("keeps unharmonised clips by reference and memoises expansions", () => {
    const plain = clip(undefined);
    const chords = [chord("c", 0, BAR, 0, "maj")];
    const d = doc(chords);
    expect(applyClipHarmony(plain, d)).toBe(plain);
    const arp = clip({ style: "arp", input: "chords" });
    const first = applyClipHarmony(arp, d);
    expect(first.notes).toHaveLength(16);
    expect(applyClipHarmony(arp, d)).toBe(first);
    expect(harmonizeClips([plain, arp], d)).toEqual([plain, first]);
  });

  it("re-expands when the chords change", () => {
    const arp = clip({ style: "arp", input: "chords" });
    const before = applyClipHarmony(arp, doc([chord("c", 0, BAR, 0, "maj")]));
    const after = applyClipHarmony(arp, doc([chord("c", 0, BAR, 9, "min")]));
    expect(after).not.toBe(before);
    expect(pitches(after.notes ?? []).slice(0, 3)).toEqual([57, 60, 64]);
  });
});
