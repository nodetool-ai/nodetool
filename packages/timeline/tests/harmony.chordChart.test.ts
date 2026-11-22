import { describe, expect, it } from "vitest";
import {
  chordChart,
  parseChordChart,
  type TimelineChord,
  type TimelineTempo
} from "../src/index.js";

const tempo: TimelineTempo = {
  bpm: 120,
  offsetMs: 0,
  timeSignature: { beatsPerBar: 4, beatUnit: 4 }
};
const BAR = 3840;
const c = (
  id: string,
  startTick: number,
  endTick: number,
  root: number,
  quality: TimelineChord["quality"]
): TimelineChord => ({
  id,
  startTick,
  durationTick: endTick - startTick,
  root,
  quality,
  inversion: 0
});
const Am = (s: number, e: number) => c("a", s, e, 9, "min");
const F = (s: number, e: number) => c("f", s, e, 5, "maj");
const C = (s: number, e: number) => c("c", s, e, 0, "maj");
const G = (s: number, e: number) => c("g", s, e, 7, "maj");

describe("chordChart", () => {
  it("marks a chord that still sounds with %", () => {
    expect(chordChart([Am(0, 5760), F(5760, 7680)], 0, 7680, tempo)).toBe("| Am | % F |");
    expect(chordChart([Am(0, 7680)], 0, 7680, tempo)).toBe("| Am | % |");
  });
  it("lists the chords that start in a bar and marks empty bars", () => {
    const chords = [Am(0, BAR), F(BAR, 2 * BAR), C(2 * BAR, 2.5 * BAR), G(2.5 * BAR, 3 * BAR)];
    expect(chordChart(chords, 0, 4 * BAR, tempo)).toBe("| Am | F | C G | - |");
  });
  it("reads a range that starts inside the song", () => {
    expect(chordChart([Am(0, 2 * BAR), F(2 * BAR, 3 * BAR)], BAR, 3 * BAR, tempo)).toBe("| % | F |");
  });
  it("uses the time signature for the bar length", () => {
    const waltz: TimelineTempo = { ...tempo, timeSignature: { beatsPerBar: 3, beatUnit: 4 } };
    expect(chordChart([Am(0, 2880), F(2880, 5760)], 0, 5760, waltz)).toBe("| Am | F |");
  });
  it("returns an empty string for an empty range", () => {
    expect(chordChart([], 0, 0, tempo)).toBe("");
  });
});

describe("parseChordChart", () => {
  const parse = (text: string, start = 0) => {
    const r = parseChordChart(text, start, tempo);
    if (!r.ok) throw new Error(r.error);
    return r.chords.map((x) => [x.startTick, x.durationTick, x.root, x.quality]);
  };
  it("splits a bar evenly between its chords", () => {
    expect(parse("Am | F | C G")).toEqual([
      [0, BAR, 9, "min"],
      [BAR, BAR, 5, "maj"],
      [2 * BAR, BAR / 2, 0, "maj"],
      [2.5 * BAR, BAR / 2, 7, "maj"]
    ]);
  });
  it("extends a chord over % and skips -", () => {
    expect(parse("| Am | % |")).toEqual([[0, 2 * BAR, 9, "min"]]);
    expect(parse("| Am | % F |")).toEqual([
      [0, 5760, 9, "min"],
      [5760, 1920, 5, "maj"]
    ]);
    expect(parse("| Am | - | F |")).toEqual([
      [0, BAR, 9, "min"],
      [2 * BAR, BAR, 5, "maj"]
    ]);
  });
  it("starts at the given tick and mints unique ids", () => {
    const r = parseChordChart("Am | F", 2 * BAR, tempo);
    if (!r.ok) throw new Error(r.error);
    expect(r.chords[0].startTick).toBe(2 * BAR);
    expect(new Set(r.chords.map((x) => x.id)).size).toBe(2);
  });
  it("round trips with chordChart", () => {
    const text = "| Am | % F | C G | - | Bb7/D |";
    const r = parseChordChart(text, 0, tempo);
    if (!r.ok) throw new Error(r.error);
    expect(chordChart(r.chords, 0, 5 * BAR, tempo)).toBe("| Am | % F | C G | - | Bb7/D |");
  });
  it("teaches the grammar on a bad symbol", () => {
    const r = parseChordChart("| Am | H7 |", 0, tempo);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/bar 2/);
      expect(r.error).toMatch(/H7/);
      expect(r.error).toMatch(/%/);
    }
  });
  it("refuses a % with no chord before it", () => {
    const r = parseChordChart("| % | Am |", 0, tempo);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/%/);
  });
  it("refuses an empty chart", () => {
    expect(parseChordChart("  | | ", 0, tempo).ok).toBe(false);
  });
});
