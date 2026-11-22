import type { MidiNote } from "@nodetool-ai/timeline";

import { lengthText, resizeNoteStarts, semitoneText } from "../pianoRollTools";

const note = (id: string, startTick: number, durationTick: number): MidiNote => ({
  id,
  pitch: 60,
  velocity: 100,
  startTick,
  durationTick
});

describe("resizeNoteStarts", () => {
  it("moves the start of the chosen notes and keeps their ends", () => {
    const next = resizeNoteStarts([note("a", 480, 480), note("b", 0, 480)], ["a"], -240, 1);
    expect(next[0]).toMatchObject({ startTick: 240, durationTick: 720 });
    expect(next[1]).toMatchObject({ startTick: 0, durationTick: 480 });
  });

  it("keeps the minimum length and never starts before tick 0", () => {
    expect(resizeNoteStarts([note("a", 480, 480)], ["a"], 900, 120)[0]).toMatchObject({
      startTick: 840,
      durationTick: 120
    });
    expect(resizeNoteStarts([note("a", 100, 480)], ["a"], -500, 1)[0]).toMatchObject({
      startTick: 0,
      durationTick: 580
    });
  });
});

describe("help tag text", () => {
  it("signs semitone changes and splits a length into beats, sixteenths and ticks", () => {
    expect(semitoneText(3)).toBe("+3");
    expect(semitoneText(-2)).toBe("−2");
    expect(semitoneText(0)).toBe("0");
    expect(lengthText(960 + 480 + 7)).toBe("1 2 7");
  });
});
