import { describe, expect, it } from "vitest";
import type { MidiNote } from "../src/types.js";
import {
  GM_DRUM_LANES,
  automaticLanes,
  drawNoteStep,
  drawStep,
  lineSteps,
  scaleValues,
  stepStartTick,
  thinOut,
  valueFromY
} from "../src/midi/stepEditor.js";

function note(id: string, pitch: number, startTick = 0): MidiNote {
  return { id, pitch, startTick, durationTick: 240, velocity: 100 };
}

describe("GM_DRUM_LANES", () => {
  it("lists the sixteen drum lanes in contract order", () => {
    expect(GM_DRUM_LANES.map((l) => `${l.pitch} ${l.name}`)).toEqual([
      "36 Kick",
      "38 Snare",
      "40 Snare 2",
      "37 Side Stick",
      "39 Clap",
      "42 Closed Hi-Hat",
      "44 Pedal Hi-Hat",
      "46 Open Hi-Hat",
      "41 Low Tom",
      "45 Mid Tom",
      "48 High Tom",
      "49 Crash",
      "51 Ride",
      "53 Ride Bell",
      "54 Tambourine",
      "56 Cowbell"
    ]);
  });
});

describe("automaticLanes", () => {
  it("gives note lanes highest first, then controller lanes in list order", () => {
    const notes = [36, 42, 36, 38].map((p, i) => note(`n${i}`, p));
    const lanes = automaticLanes(notes, [
      { id: "L1", kind: "cc", cc: 7, points: [] }
    ]);
    expect(lanes).toEqual([
      { type: "note", pitch: 42 },
      { type: "note", pitch: 38 },
      { type: "note", pitch: 36 },
      { type: "controller", laneId: "L1" }
    ]);
  });
  it("accepts a missing controller list", () => {
    expect(automaticLanes([], undefined)).toEqual([]);
  });
});

describe("valueFromY", () => {
  it("matches the contract vectors", () => {
    expect(valueFromY(0, 100, 0, 127)).toBe(127);
    expect(valueFromY(100, 100, 0, 127)).toBe(0);
    expect(valueFromY(50, 100, 0, 127)).toBe(64);
    const zero = valueFromY(50, 100, -8192, 8191);
    expect(zero).toBe(0);
    expect(Object.is(zero, -0)).toBe(false);
  });
  it("clamps", () => {
    expect(valueFromY(-20, 100, 0, 127)).toBe(127);
    expect(valueFromY(300, 100, 0, 127)).toBe(0);
  });
});

describe("stepStartTick", () => {
  it("matches the contract vectors", () => {
    expect(stepStartTick(500, 240, 0)).toBe(480);
    expect(stepStartTick(500, 240, 100)).toBe(340);
  });
});

describe("drawStep", () => {
  it("adds a point on an empty step", () => {
    const out = drawStep([], 480, 240, 90, () => "new");
    expect(out).toEqual([{ id: "new", tick: 480, value: 90 }]);
  });
  it("sets the first point inside the step and leaves the others", () => {
    const out = drawStep(
      [
        { id: "a", tick: 500, value: 10 },
        { id: "b", tick: 600, value: 20 }
      ],
      480,
      240,
      90,
      () => "new"
    );
    expect(out).toEqual([
      { id: "a", tick: 500, value: 90 },
      { id: "b", tick: 600, value: 20 }
    ]);
  });
  it("sorts the result by tick", () => {
    const out = drawStep(
      [{ id: "a", tick: 900, value: 1 }],
      0,
      240,
      5,
      () => "n"
    );
    expect(out.map((p) => p.id)).toEqual(["n", "a"]);
  });
});

describe("drawNoteStep", () => {
  it("creates a note when the pitch has none in the step", () => {
    const out = drawNoteStep([], 36, 480, 240, 90, 120, () => "n1");
    expect(out).toEqual([
      {
        id: "n1",
        pitch: 36,
        startTick: 480,
        durationTick: 120,
        velocity: 90,
        channel: 0
      }
    ]);
  });
  it("sets the velocity of the first note starting in the step", () => {
    const notes = [note("a", 36, 500), note("b", 36, 490), note("c", 38, 500)];
    const out = drawNoteStep(notes, 36, 480, 240, 33, 120, () => "n");
    expect(out.find((x) => x.id === "b")?.velocity).toBe(33);
    expect(out.find((x) => x.id === "a")?.velocity).toBe(100);
    expect(out.find((x) => x.id === "c")?.velocity).toBe(100);
    expect(out).toHaveLength(3);
  });
  it("clamps velocity to 1..127", () => {
    expect(drawNoteStep([], 36, 0, 240, 0, 120, () => "n")[0].velocity).toBe(1);
    expect(drawNoteStep([], 36, 0, 240, 500, 120, () => "n")[0].velocity).toBe(
      127
    );
  });
});

describe("lineSteps", () => {
  it("matches the contract vectors", () => {
    expect(lineSteps(0, 0, 960, 120, 240, 0)).toEqual([
      { tick: 0, value: 0 },
      { tick: 240, value: 30 },
      { tick: 480, value: 60 },
      { tick: 720, value: 90 },
      { tick: 960, value: 120 }
    ]);
    expect(lineSteps(100, 10, 500, 50, 240, 0)).toEqual([
      { tick: 0, value: 10 },
      { tick: 240, value: 24 },
      { tick: 480, value: 48 }
    ]);
  });
  it("handles a reversed drag and a vertical line", () => {
    expect(lineSteps(960, 120, 0, 0, 240, 0).map((p) => p.value)).toEqual([
      0, 30, 60, 90, 120
    ]);
    expect(lineSteps(500, 10, 500, 70, 240, 0)).toEqual([
      { tick: 480, value: 70 }
    ]);
  });
});

describe("scaleValues", () => {
  it("matches the contract vector", () => {
    expect(scaleValues([20, 60, 100], 50, 0)).toEqual([10, 30, 50]);
  });
});

describe("thinOut", () => {
  it("returns every second id starting with the second", () => {
    expect(thinOut(["a", "b", "c", "d", "e"])).toEqual(["b", "d"]);
  });
});
