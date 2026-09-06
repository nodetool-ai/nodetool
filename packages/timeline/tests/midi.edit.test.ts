import { describe, expect, it } from "vitest";
import {
  QUANTIZE_DIVISIONS,
  divisionToTicks,
  quantizeNotes,
  scaleVelocity,
  transposeNotes
} from "../src/midi/edit.js";
import type { MidiNote } from "../src/types.js";

const note = (over: Partial<MidiNote> = {}): MidiNote => ({
  id: "n1",
  pitch: 60,
  velocity: 100,
  startTick: 0,
  durationTick: 960,
  ...over
});

describe("transposeNotes", () => {
  it("moves every note and keeps its id and timing", () => {
    const moved = transposeNotes(
      [note({ id: "a" }), note({ id: "b", pitch: 64, startTick: 480 })],
      7
    );
    expect(moved.map((n) => [n.id, n.pitch, n.startTick])).toEqual([
      ["a", 67, 0],
      ["b", 71, 480]
    ]);
    expect(moved[0]!.velocity).toBe(100);
    expect(moved[0]!.durationTick).toBe(960);
  });

  it("clamps at both ends of the MIDI range", () => {
    expect(transposeNotes([note({ pitch: 125 })], 12)[0]!.pitch).toBe(127);
    expect(transposeNotes([note({ pitch: 2 })], -12)[0]!.pitch).toBe(0);
  });

  it("refuses a fractional transposition", () => {
    expect(() => transposeNotes([note()], 0.5)).toThrow(/whole number/);
  });
});

describe("divisionToTicks", () => {
  it("reads each division at PPQ 960", () => {
    expect(divisionToTicks("1/4")).toBe(960);
    expect(divisionToTicks("1/8")).toBe(480);
    expect(divisionToTicks("1/16")).toBe(240);
    expect(divisionToTicks("1/32")).toBe(120);
    expect(divisionToTicks("1/8T")).toBe(320);
    expect(divisionToTicks("1/16T")).toBe(160);
  });

  it("covers every division the list names", () => {
    for (const division of QUANTIZE_DIVISIONS) {
      expect(divisionToTicks(division)).toBeGreaterThan(0);
    }
  });
});

describe("quantizeNotes", () => {
  it("snaps onsets to the nearest grid line at full strength", () => {
    const snapped = quantizeNotes(
      [
        note({ id: "a", startTick: 250 }),
        // 110 is nearer to 0 than to the sixteenth at 240.
        note({ id: "b", startTick: 110 })
      ],
      { division: "1/16" }
    );
    expect(snapped.map((n) => [n.id, n.startTick])).toEqual([
      ["a", 240],
      ["b", 0]
    ]);
  });

  it("moves half the distance at strength 0.5 and nothing at 0", () => {
    expect(
      quantizeNotes([note({ startTick: 250 })], {
        division: "1/16",
        strength: 0.5
      })[0]!.startTick
    ).toBe(245);
    expect(
      quantizeNotes([note({ startTick: 250 })], {
        division: "1/16",
        strength: 0
      })[0]!.startTick
    ).toBe(250);
  });

  it("keeps ids and leaves lengths alone unless asked", () => {
    const snapped = quantizeNotes(
      [note({ id: "keep", startTick: 250, durationTick: 200 })],
      { division: "1/16" }
    );
    expect(snapped[0]!.id).toBe("keep");
    expect(snapped[0]!.durationTick).toBe(200);
  });

  it("rounds lengths to whole grid steps, never to zero", () => {
    const snapped = quantizeNotes(
      [
        note({ id: "a", startTick: 0, durationTick: 200 }),
        note({ id: "b", startTick: 0, durationTick: 30 })
      ],
      { division: "1/16", target: "start_and_length" }
    );
    expect(snapped.map((n) => n.durationTick)).toEqual([240, 240]);
  });

  it("never moves a note before zero", () => {
    expect(
      quantizeNotes([note({ startTick: 5 })], { division: "1/16" })[0]!.startTick
    ).toBe(0);
  });

  it("refuses a strength outside 0..1", () => {
    expect(() =>
      quantizeNotes([note()], { division: "1/16", strength: 1.5 })
    ).toThrow(/strength/);
  });
});

describe("scaleVelocity", () => {
  it("rounds and clamps into 1..127", () => {
    const scaled = scaleVelocity(
      [
        note({ id: "a", velocity: 100 }),
        note({ id: "b", velocity: 120 }),
        note({ id: "c", velocity: 3 })
      ],
      1.25
    );
    expect(scaled.map((n) => n.velocity)).toEqual([125, 127, 4]);
    expect(scaleVelocity([note({ velocity: 4 })], 0.1)[0]!.velocity).toBe(1);
    expect(scaled.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });

  it("refuses a factor that is not a positive number", () => {
    expect(() => scaleVelocity([note()], 0)).toThrow(/positive/);
  });
});
