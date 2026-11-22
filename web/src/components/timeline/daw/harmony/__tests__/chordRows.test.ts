import { MIDI_PPQ, resolveTempo } from "@nodetool-ai/timeline";
import type { TimelineChord } from "@nodetool-ai/timeline";

import {
  chordNumeral,
  chordStripCells,
  diatonicChords,
  followsChordTrack,
  keyShort,
  withBoundaryAt,
  withChordChoice
} from "../chordRows";

const BAR = MIDI_PPQ * 4;
const chord = (id: string, startBar: number, bars: number, root = 0): TimelineChord => ({
  id,
  startTick: startBar * BAR,
  durationTick: bars * BAR,
  root,
  quality: "maj",
  inversion: 0
});

describe("diatonicChords", () => {
  it("lists the seven triads of C major with the vii as diminished", () => {
    const chords = diatonicChords({ tonic: "C", mode: "major" }, false);
    expect(chords.map((c) => `${c.root}:${c.quality}`)).toEqual([
      "0:maj", "2:min", "4:min", "5:maj", "7:maj", "9:min", "11:dim"
    ]);
  });

  it("lists the sevenths of A minor", () => {
    const chords = diatonicChords({ tonic: "A", mode: "minor" }, true);
    expect(chords.map((c) => `${c.root}:${c.quality}`)).toEqual([
      "9:m7", "11:m7b5", "0:maj7", "2:m7", "4:m7", "5:maj7", "7:dom7"
    ]);
  });

  it("reads no key as C major", () => {
    expect(diatonicChords(undefined, false)[0]).toEqual({ root: 0, quality: "maj" });
  });
});

describe("keyShort", () => {
  it("writes the key like the Signature row", () => {
    expect(keyShort({ tonic: "A", mode: "minor" })).toBe("Am");
    expect(keyShort({ tonic: "C", mode: "major" })).toBe("C");
    expect(keyShort(undefined)).toBe("");
  });
});

describe("followsChordTrack", () => {
  it("is true for a comp on chords or a scale on chords", () => {
    expect(followsChordTrack({ style: "comp", input: "chords" })).toBe(true);
    expect(followsChordTrack({ style: "off", input: "notes", scale: "chords" })).toBe(true);
  });
  it("is false for notes input, scale on the key and no harmony", () => {
    expect(followsChordTrack({ style: "arp", input: "notes" })).toBe(false);
    expect(followsChordTrack({ style: "off", input: "notes", scale: "key" })).toBe(false);
    expect(followsChordTrack(undefined)).toBe(false);
  });
});

describe("withChordChoice", () => {
  it("changes root and quality and keeps the place", () => {
    const out = withChordChoice([chord("a", 0, 1), chord("b", 1, 1)], "b", { root: 9, quality: "min" });
    expect(out[1]).toMatchObject({ id: "b", startTick: BAR, durationTick: BAR, root: 9, quality: "min", inversion: 0 });
    expect(out[0].root).toBe(0);
  });
});

describe("withBoundaryAt", () => {
  const beat = MIDI_PPQ;
  it("moves the change between two touching chords, snapped to the beat", () => {
    const out = withBoundaryAt([chord("a", 0, 1), chord("b", 1, 1)], "b", BAR + beat * 2 + 100, beat);
    expect(out.map((c) => [c.id, c.startTick, c.durationTick])).toEqual([
      ["a", 0, BAR + beat * 2],
      ["b", BAR + beat * 2, BAR - beat * 2]
    ]);
  });
  it("keeps one beat of each chord", () => {
    const out = withBoundaryAt([chord("a", 0, 1), chord("b", 1, 1)], "b", 0, beat);
    expect(out[0].durationTick).toBe(beat);
    expect(out[1].startTick).toBe(beat);
  });
  it("leaves the chords alone when the line does not move", () => {
    const before = [chord("a", 0, 1), chord("b", 1, 1)];
    expect(withBoundaryAt(before, "b", BAR, beat)).toEqual(before);
  });
});

describe("chordStripCells", () => {
  it("clips each chord to the clip and places it from the clip start", () => {
    const tempo = resolveTempo({ tempo: { bpm: 120, offsetMs: 0, timeSignature: { beatsPerBar: 4, beatUnit: 4 } } });
    // 120 bpm: a bar is 2000 ms. The clip covers 1000..5000 ms at 10 ms per px.
    const cells = chordStripCells(
      [chord("a", 0, 1), chord("b", 1, 1), chord("c", 2, 1), chord("d", 3, 1)],
      { startMs: 1000, durationMs: 4000 },
      tempo,
      10
    );
    expect(cells.map((c) => [c.id, c.leftPx, c.widthPx])).toEqual([
      ["a", 0, 100],
      ["b", 100, 200],
      ["c", 300, 100]
    ]);
  });
  it("makes no cell without chords", () => {
    const tempo = resolveTempo({});
    expect(chordStripCells([], { startMs: 0, durationMs: 1000 }, tempo, 10)).toEqual([]);
  });
});

describe("chordNumeral", () => {
  it("names a chord by its step in the key, lower case for minor", () => {
    expect(chordNumeral({ root: 9, quality: "min" }, { tonic: "C", mode: "major" })).toBe("vi");
    expect(chordNumeral({ root: 7, quality: "dom7" }, { tonic: "C", mode: "major" })).toBe("V7");
    expect(chordNumeral({ root: 0, quality: "maj" }, { tonic: "G", mode: "major" })).toBe("IV");
  });
});
