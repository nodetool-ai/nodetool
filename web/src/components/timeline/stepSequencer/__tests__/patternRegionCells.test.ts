/**
 * F25: the cells a pattern region draws in the tracks area, and the step each
 * row plays, follow the same schedule as playback expansion: region loops,
 * solo and mute, tied followers and rows whose cycles change length.
 */

import { expandPattern, normalizePattern } from "@nodetool-ai/timeline";
import type { StepPattern, StepRow } from "@nodetool-ai/timeline";

import { patternRegionCells, playingSteps } from "../stepSequencerModel";

const pattern = (rows: Array<Partial<StepRow> & Pick<StepRow, "id" | "assignment">>, extra: Partial<StepPattern> = {}): StepPattern =>
  normalizePattern({ lengthSteps: 16, rows: rows as StepRow[], ...extra });

const allOn = (n: number) => Array.from({ length: n }, () => ({ on: true }));

/** Start ticks of the cells that start a note, by row. */
const noteStarts = (p: StepPattern, ctx: { clipLengthTicks: number; loopLengthTicks?: number; phaseTicks?: number }) =>
  patternRegionCells(p, ctx)
    .filter((c) => c.on && !c.tied && !c.muted)
    .map((c) => c.startTick)
    .sort((a, b) => a - b);

describe("patternRegionCells (F25)", () => {
  it("restarts every row at each region loop and marks the repeats", () => {
    const p = pattern([{ id: "a", assignment: { type: "note", pitch: 36 }, lengthSteps: 5, steps: allOn(5) }]);
    // A 3-step loop (720 ticks) in a 2880-tick clip: steps 0,1,2 four times.
    const cells = patternRegionCells(p, { clipLengthTicks: 2880, loopLengthTicks: 720 });
    expect(cells.map((c) => c.stepIndex)).toEqual([0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2]);
    expect(cells.filter((c) => c.repeat).length).toBe(9);
    expect(cells[3]!.startTick).toBe(720);
    const expanded = expandPattern(p, { clipLengthTicks: 2880, loopLengthTicks: 720 });
    expect(noteStarts(p, { clipLengthTicks: 2880, loopLengthTicks: 720 })).toEqual(expanded.notes.map((n) => n.startTick).sort((a, b) => a - b));
  });

  it("mutes rows that solo leaves out", () => {
    const p = pattern([
      { id: "a", assignment: { type: "note", pitch: 36 }, steps: allOn(16), solo: true },
      { id: "b", assignment: { type: "note", pitch: 38 }, steps: allOn(16) },
      { id: "c", assignment: { type: "note", pitch: 42 }, steps: allOn(16), mute: true }
    ]);
    const cells = patternRegionCells(p, { clipLengthTicks: 3840 });
    const mutedRows = new Set(cells.filter((c) => c.muted).map((c) => c.rowId));
    expect([...mutedRows].sort()).toEqual(["b", "c"]);
  });

  it("draws a tied follower of an on step as on", () => {
    const p = pattern([{ id: "a", assignment: { type: "note", pitch: 36 }, steps: [{ on: true }, { tie: true }, { tie: true }, {}, { tie: true }] }]);
    const cells = patternRegionCells(p, { clipLengthTicks: 1200 });
    expect(cells.slice(0, 5).map((c) => [c.on, c.tied])).toEqual([
      [true, false],
      [true, true],
      [true, true],
      [false, false],
      [false, false]
    ]);
  });

  it("follows cycles whose length changes on a random row with step rates", () => {
    const steps = [{ on: true, stepRate: "1/8" as const }, { on: true }, { on: true, stepRate: "1/4" as const }, { on: true }];
    const p = pattern([{ id: "r", assignment: { type: "note", pitch: 60 }, lengthSteps: 4, playback: "random", steps }], { seed: 7 });
    const ctx = { clipLengthTicks: 960 * 16 };
    const expanded = expandPattern(p, ctx);
    expect(noteStarts(p, ctx)).toEqual(expanded.notes.map((n) => n.startTick).sort((a, b) => a - b));
  });

  it("matches expansion with a phase and a loop that does not divide the row cycle", () => {
    const p = pattern([
      { id: "a", assignment: { type: "note", pitch: 36 }, lengthSteps: 5, steps: allOn(5) },
      { id: "w", assignment: { type: "note", pitch: 40 }, lengthSteps: 6, playback: "wander", steps: allOn(6) }
    ], { seed: 3 });
    const ctx = { clipLengthTicks: 7000, loopLengthTicks: 1700 };
    const expanded = expandPattern(p, { ...ctx, patternPhaseTicks: 240 });
    expect(noteStarts(p, { ...ctx, phaseTicks: 240 })).toEqual(expanded.notes.map((n) => n.startTick).sort((a, b) => a - b));
  });
});

describe("playingSteps (F25)", () => {
  it("restarts the playing step at each region loop", () => {
    const p = pattern([{ id: "a", assignment: { type: "note", pitch: 36 }, lengthSteps: 5, steps: allOn(5) }]);
    // 120 BPM: one 1/16 step is 125 ms. A 375 ms loop holds steps 0..2.
    const clip = { startMs: 0, durationMs: 2000, loopLengthMs: 375 };
    expect(playingSteps(p, clip, 120, 375 + 10).get("a")).toBe(0);
    expect(playingSteps(p, clip, 120, 375 + 250 + 10).get("a")).toBe(2);
  });

  it("follows a random row whose cycle length changes", () => {
    const steps = [{ on: true, stepRate: "1/8" as const }, { on: true }, { on: true, stepRate: "1/4" as const }, { on: true }];
    const p = pattern([{ id: "r", assignment: { type: "note", pitch: 60 }, lengthSteps: 4, playback: "random", steps }], { seed: 7 });
    const cells = patternRegionCells(p, { clipLengthTicks: 960 * 16 });
    for (const cell of cells) {
      const ms = ((cell.startTick + 1) / 960) * 500;
      expect(playingSteps(p, { startMs: 0, durationMs: 8000 }, 120, ms).get("r")).toBe(cell.stepIndex);
    }
  });
});
