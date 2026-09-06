/**
 * The bars ruler and the grid it snaps to.
 *
 * The ruler paints on a canvas jsdom cannot give it, so the tick list is a
 * pure function and this is where it is checked: 120 BPM in 4/4 is a 2000 ms
 * bar and a 500 ms beat, which makes every expectation below arithmetic
 * anyone can redo by hand.
 */
import { describe, it, expect } from "@jest/globals";
import type { TimelineTempo } from "@nodetool-ai/timeline";
import {
  computeBarRulerTicks,
  tempoGridIntervalMs,
  visibleTempoGrid
} from "../tempoGrid";

const TEMPO_120: TimelineTempo = {
  bpm: 120,
  offsetMs: 0,
  timeSignature: { beatsPerBar: 4, beatUnit: 4 }
};

describe("tempoGridIntervalMs", () => {
  it("reads a bar, a beat and a note value at 120 BPM 4/4", () => {
    expect(tempoGridIntervalMs(TEMPO_120, "bar")).toBe(2000);
    expect(tempoGridIntervalMs(TEMPO_120, "beat")).toBe(500);
    expect(tempoGridIntervalMs(TEMPO_120, "1/16")).toBe(125);
  });

  it("halves the beat in 6/8, where a beat is an eighth", () => {
    const sixEight: TimelineTempo = {
      bpm: 120,
      offsetMs: 0,
      timeSignature: { beatsPerBar: 6, beatUnit: 8 }
    };
    expect(tempoGridIntervalMs(sixEight, "beat")).toBe(250);
    // A note value is the note value, whatever the signature says.
    expect(tempoGridIntervalMs(sixEight, "1/16")).toBe(125);
  });
});

describe("visibleTempoGrid", () => {
  it("returns the beat lines inside the range, both ends included", () => {
    expect(
      visibleTempoGrid({
        tempo: TEMPO_120,
        division: "beat",
        fromMs: 0,
        toMs: 2000
      })
    ).toEqual([0, 500, 1000, 1500, 2000]);
  });

  it("clamps a range the division would overfill instead of throwing", () => {
    // A 1/32 grid is 62.5 ms; an hour of it is ~57 600 lines, past the 2048
    // cap `tempoGridMs` refuses.
    const lines = visibleTempoGrid({
      tempo: TEMPO_120,
      division: "1/32",
      fromMs: 0,
      toMs: 3_600_000
    });
    expect(lines).toHaveLength(2048);
    expect(lines[0]).toBe(0);
  });

  it("is empty for a range that ends before it starts", () => {
    expect(
      visibleTempoGrid({
        tempo: TEMPO_120,
        division: "bar",
        fromMs: 4000,
        toMs: 1000
      })
    ).toEqual([]);
  });
});

describe("computeBarRulerTicks", () => {
  it("labels every bar and draws the beats between them when zoomed in", () => {
    // 10 ms/px: a bar is 200px and a beat 50px, so both fit comfortably.
    const ticks = computeBarRulerTicks({
      tempo: TEMPO_120,
      msPerPx: 10,
      fromMs: 0,
      toMs: 4000
    });

    expect(
      ticks.filter((t) => t.kind === "bar").map((t) => [t.timeMs, t.label])
    ).toEqual([
      [0, "1"],
      [2000, "2"],
      [4000, "3"]
    ]);
    expect(
      ticks.filter((t) => t.kind === "beat").map((t) => t.timeMs)
    ).toEqual([500, 1000, 1500, 2500, 3000, 3500]);
  });

  it("drops the beat ticks once they would crowd together", () => {
    // 100 ms/px puts a beat 5px from the next — below the 8px minimum.
    const ticks = computeBarRulerTicks({
      tempo: TEMPO_120,
      msPerPx: 100,
      fromMs: 0,
      toMs: 8000
    });
    expect(ticks.every((t) => t.kind === "bar")).toBe(true);
    expect(ticks.map((t) => t.timeMs)).toEqual([0, 2000, 4000, 6000, 8000]);
  });

  it("labels every other bar when one bar is too narrow for two numbers", () => {
    // 60 ms/px: a bar is 33px, so labels go on every second bar (67px).
    const ticks = computeBarRulerTicks({
      tempo: TEMPO_120,
      msPerPx: 60,
      fromMs: 0,
      toMs: 8000
    });
    expect(ticks.map((t) => t.label)).toEqual([
      "1",
      undefined,
      "3",
      undefined,
      "5"
    ]);
  });

  it("counts bars from the tempo offset", () => {
    const offset: TimelineTempo = { ...TEMPO_120, offsetMs: 1000 };
    const ticks = computeBarRulerTicks({
      tempo: offset,
      msPerPx: 10,
      fromMs: 0,
      toMs: 5000
    });
    expect(
      ticks.filter((t) => t.kind === "bar").map((t) => [t.timeMs, t.label])
    ).toEqual([
      [1000, "1"],
      [3000, "2"],
      [5000, "3"]
    ]);
  });
});
