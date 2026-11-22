import { normalizePattern } from "@nodetool-ai/timeline";
import type { StepRow } from "@nodetool-ai/timeline";

import {
  learnTarget,
  marqueeSelection,
  moveSelection,
  playingSteps,
  rampOp,
  rateRampOps,
  sharedDeltaValues,
  stepKey,
  stepValueText,
  tieOp,
  tieSpans,
  valueFromFraction
} from "../stepSequencerModel";

const row = (partial: Partial<StepRow> & Pick<StepRow, "id" | "assignment">): StepRow =>
  normalizePattern({ lengthSteps: 64, rows: [partial as StepRow] }).rows[0]!;

const kick = (steps: StepRow["steps"] = []): StepRow =>
  row({ id: "kick", assignment: { type: "note", pitch: 36 }, lengthSteps: 16, steps });

describe("stepSequencerModel", () => {
  it("merges tied steps into one span (SQ30)", () => {
    const row = kick([{ on: true }, { tie: true }, { tie: true }, {}, { on: true }]);
    expect(tieSpans(row).slice(0, 3)).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 3 },
      { start: 4, end: 4 }
    ]);
  });

  it("limits a shared delta so no step leaves its range (p. 736)", () => {
    const row = kick([{ on: true, velocity: 80 }, { on: true, velocity: 120 }]);
    expect([...sharedDeltaValues(row, [0, 1], "velocity", 20)]).toEqual([
      [0, 87],
      [1, 127]
    ]);
  });

  it("builds a 1-based ramp from 20 to 80 over steps 0..3 (SQ33)", () => {
    expect(rampOp("c", "kick", 0, 3, "velocity", 20, 80, false)).toEqual({
      op: "set_steps",
      clipId: "c",
      row: "kick",
      steps: "1-4",
      ramp: { field: "velocity", from: 20, to: 80 }
    });
  });

  it("ties steps 1..3 into step 0 with a Command-drag from 0 to 3 (D74)", () => {
    expect(tieOp("c", "kick", 3, 0, true)).toEqual({ op: "tie_steps", clipId: "c", row: "kick", from: 1, to: 4, tie: true });
  });

  it("extends the selection with Shift-Right from step 3 (SQ34)", () => {
    const pattern = normalizePattern({ rows: [kick()] });
    const anchor = stepKey("kick", 3);
    const r = moveSelection(pattern, new Set([anchor]), anchor, 1, 0, true);
    expect([...r.selection].sort()).toEqual(["kick:3", "kick:4"]);
  });

  it("shows the value texts of figure p0736", () => {
    const r = row({
      id: "k",
      assignment: { type: "note", pitch: 23 },
      lengthSteps: 4,
      steps: [{ on: true, velocity: 47, gate: 100, chance: 53 }]
    });
    expect(stepValueText(r, 0, "velocity")).toBe("47");
    expect(stepValueText(r, 0, "gate")).toBe("100%");
    expect(stepValueText(r, 0, "note")).toBe("B-1");
    expect(stepValueText(r, 0, "chance")).toBe("53%");
    expect(stepValueText(r, 0, "offset")).toBe("0%");
  });

  it("maps a drag fraction into the mode range", () => {
    const row = kick();
    expect(valueFromFraction(row, "velocity", 1)).toBe(127);
    expect(valueFromFraction(row, "offset", 0)).toBe(-50);
  });

  it("reports the playing step per row", () => {
    const pattern = normalizePattern({ rows: [kick()], stepRate: "1/16" });
    // 120 BPM: one 1/16 step is 125 ms.
    const playing = playingSteps(pattern, { startMs: 1000, durationMs: 2000 }, 120, 1000 + 125 * 5 + 10);
    expect(playing.get("kick")).toBe(5);
    expect(playingSteps(pattern, { startMs: 1000, durationMs: 2000 }, 120, 500).size).toBe(0);
  });

  it("does not merge a tie into an off step (F12)", () => {
    const r = kick([{}, { tie: true }, { on: true }, { tie: true }]);
    expect(tieSpans(r).slice(0, 3)).toEqual([
      { start: 0, end: 0 },
      { start: 1, end: 1 },
      { start: 2, end: 3 }
    ]);
  });

  it("keeps fractional values on device rows in a shared delta (F13)", () => {
    const dev = row({
      id: "dev",
      assignment: { type: "automation", target: { kind: "device", deviceId: "d", param: "cutoff" } } as never,
      lengthSteps: 16,
      steps: [{ on: true, value: 0.2 }, { on: true, value: 0.4 }]
    });
    const out = sharedDeltaValues(dev, [0, 1], "value", 0.25);
    expect(out.get(0)).toBeCloseTo(0.45);
    expect(out.get(1)).toBeCloseTo(0.65);
  });

  it("ramps Step Rate as rate names, not indices (F1)", () => {
    const ops = rateRampOps("clip", kick(), 0, 3, 4, 7);
    const rates = ops.flatMap((o) => Object.values((o as { values: { stepRate: string } }).values));
    expect(rates.every((r) => typeof r === "string")).toBe(true);
    expect(ops.every((o) => !("ramp" in o))).toBe(true);
  });

  it("Shift rate ramps leave off steps off (F54)", () => {
    const ops = rateRampOps("clip", kick(), 0, 3, 4, 7, true);
    const offs = ops.filter((o) => (o as { values: { on?: boolean } }).values.on === false);
    expect(offs).toHaveLength(1);
  });

  it("Learn finds an existing kit row for a pad pitch and adds kit pads on drum tracks (F23)", () => {
    const drum = { type: "drum", baseNote: 36, pads: [{ name: "Kick" }, { name: "Snare" }] } as never;
    const pattern = normalizePattern({ rows: [row({ id: "k", assignment: { type: "kit", pad: 0 }, lengthSteps: 16 })] });
    expect(learnTarget(pattern, drum, 36)).toEqual({ rowId: "k" });
    expect(learnTarget(pattern, drum, 37)).toEqual({ add: { pad: 1 } });
    expect(learnTarget(pattern, undefined, 60)).toEqual({ add: { pitch: 60 } });
  });
});

describe("stepAtX matches painted cells (F47)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { stepAtX, stepX } = require("../stepStripPaint") as typeof import("../stepStripPaint");
  it("resolves the left edge of each painted cell to its own step", () => {
    for (let s = 1; s < 16; s++) expect(stepAtX(stepX(s, 40) + 1, 16, 40)).toBe(s);
  });

  it("selects the rectangle between two corners across rows (F28, p. 749)", () => {
    const snare = row({ id: "snare", assignment: { type: "note", pitch: 38 }, lengthSteps: 16 });
    const hat = row({ id: "hat", assignment: { type: "note", pitch: 42 }, lengthSteps: 2 });
    const pattern = normalizePattern({ rows: [kick(), snare, hat] });
    const r = marqueeSelection(pattern, { rowId: "kick", step: 3 }, { rowId: "hat", step: 1 }, new Set([stepKey("kick", 9)]));
    expect([...r].sort()).toEqual(["hat:1", "kick:1", "kick:2", "kick:3", "kick:9", "snare:1", "snare:2", "snare:3"]);
  });
});
