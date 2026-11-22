import { describe, expect, it } from "vitest";
import { chordSymbol, detectChordsFromNotes } from "../src/index.js";

const BAR = 3840;
const bars = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ startTick: i * BAR, endTick: (i + 1) * BAR }));
const whole = (pitch: number, bar = 0, extra: object = {}) => ({
  pitch,
  startTick: bar * BAR,
  durationTick: BAR,
  ...extra
});
const symbols = (notes: ReturnType<typeof whole>[], n: number) =>
  detectChordsFromNotes(notes, bars(n)).map((c) => [chordSymbol(c), c.startTick, c.durationTick]);

describe("detectChordsFromNotes", () => {
  it("names a triad", () => {
    expect(symbols([60, 64, 67].map((p) => whole(p)), 1)).toEqual([["C", 0, BAR]]);
    expect(symbols([69, 72, 76].map((p) => whole(p)), 1)).toEqual([["Am", 0, BAR]]);
  });
  it("names a seventh chord", () => {
    expect(symbols([55, 59, 62, 65].map((p) => whole(p)), 1)).toEqual([["G7", 0, BAR]]);
  });
  it("reads the inversion from the lowest note", () => {
    expect(symbols([52, 55, 72].map((p) => whole(p)), 1)).toEqual([["C/E", 0, BAR]]);
  });
  it("merges equal neighbours", () => {
    const notes = [60, 64, 67].flatMap((p) => [whole(p, 0), whole(p, 1)]);
    expect(symbols(notes, 2)).toEqual([["C", 0, 2 * BAR]]);
  });
  it("holds the previous chord over an empty window", () => {
    expect(symbols([60, 64, 67].map((p) => whole(p, 0)), 2)).toEqual([["C", 0, 2 * BAR]]);
  });
  it("leaves leading empty windows without a chord", () => {
    expect(symbols([60, 64, 67].map((p) => whole(p, 1)), 2)).toEqual([["C", BAR, BAR]]);
  });
  it("skips muted notes", () => {
    const notes = [whole(60), whole(64), whole(67), whole(70, 0, { muted: true })];
    expect(symbols(notes, 1)).toEqual([["C", 0, BAR]]);
  });
  it("follows a progression across windows", () => {
    const notes = [
      ...[57, 60, 64].map((p) => whole(p, 0)),
      ...[53, 57, 60].map((p) => whole(p, 1)),
      ...[48, 52, 55].map((p) => whole(p, 2)),
      ...[55, 59, 62].map((p) => whole(p, 3))
    ];
    expect(symbols(notes, 4).map((x) => x[0])).toEqual(["Am", "F", "C", "G"]);
  });
  it("weighs notes by the ticks they overlap the window", () => {
    // A long C E G with a short passing D: still C.
    const notes = [whole(60), whole(64), whole(67), { pitch: 62, startTick: 0, durationTick: 240 }];
    expect(symbols(notes, 1)).toEqual([["C", 0, BAR]]);
  });
  it("mints ids with the given function", () => {
    const r = detectChordsFromNotes([whole(60), whole(64), whole(67)], bars(1), (i) => `x${i}`);
    expect(r[0].id).toBe("x0");
  });
});
