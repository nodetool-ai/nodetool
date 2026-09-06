/**
 * The subtitle import is deterministic (PRD § 9.1, criterion 3): the words and
 * the timings these assertions pin are the ones the review step shows and the
 * ones each take is voiced against, with no model in between.
 *
 * The two fixtures hold the same three cues in the two formats, so the parse
 * has to read them identically.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseSrt } from "../parseSrt";

const fixture = (name: string): string =>
  readFileSync(join(__dirname, "..", "__fixtures__", name), "utf8");

const CUES = [
  "A tide clock has one hand.",
  "It goes round once every twelve hours and twenty-five minutes.",
  "That is one lunar day, near enough."
];

describe("parseSrt", () => {
  it("reads one line per SRT cue, in file order", () => {
    const { lines } = parseSrt(fixture("tide-clock.srt"));
    expect(lines.map((line) => line.text)).toEqual(CUES);
  });

  it("carries each cue's timing as the line's target duration", () => {
    const { lines } = parseSrt(fixture("tide-clock.srt"));
    expect(
      lines.map((line) => ({
        start: line.startMs,
        end: line.endMs,
        duration: line.durationMs
      }))
    ).toEqual([
      { start: 500, end: 3250, duration: 2750 },
      { start: 3250, end: 7000, duration: 3750 },
      { start: 7400, end: 11900, duration: 4500 }
    ]);
  });

  it("casts the whole file under one Narrator", () => {
    expect(parseSrt(fixture("tide-clock.srt")).speakerName).toBe("Narrator");
  });

  it("reads a WebVTT file the same way", () => {
    const vtt = parseSrt(fixture("tide-clock.vtt"));
    const srt = parseSrt(fixture("tide-clock.srt"));
    expect(vtt.lines).toEqual(srt.lines);
  });

  it("skips a VTT's header, NOTE block, identifiers and cue settings", () => {
    const { lines } = parseSrt(fixture("tide-clock.vtt"));
    expect(lines).toHaveLength(3);
    expect(lines[0].text).not.toContain("align:start");
    expect(lines.some((line) => line.text.includes("levels wander"))).toBe(false);
  });

  it("drops a cue with no words and one with no duration", () => {
    // The SRT fixture's fourth cue is both.
    expect(parseSrt(fixture("tide-clock.srt")).lines).toHaveLength(3);
  });

  it("reads the file back as the plain text the idea step shows", () => {
    expect(parseSrt(fixture("tide-clock.srt")).text).toBe(CUES.join("\n"));
  });

  it("refuses a file that holds no cue", () => {
    expect(() => parseSrt("WEBVTT\n\nNOTE nothing to say\n")).toThrow(
      /no cues/i
    );
  });
});
