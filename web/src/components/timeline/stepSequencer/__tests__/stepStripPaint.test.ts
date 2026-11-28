/** Round 2 visual polish (SQ30, figure p0736): cell contrast, repeat glyph, tie arrow. */

import { normalizePattern } from "@nodetool-ai/timeline";
import type { StepRow } from "@nodetool-ai/timeline";

import { paintStrip, stripPalette } from "../stepStripPaint";

const lum = (hex: string): number => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};
const scheme = { dark: true, paper: "#121212", text: "#eeeeee", playhead: "#ffffff", band: "#161616" };

function recorder() {
  const calls: Array<{ fn: string; args: unknown[]; fill: unknown }> = [];
  const ctx: Record<string, unknown> = { fillStyle: "", strokeStyle: "", lineWidth: 1, globalAlpha: 1, font: "", textBaseline: "alphabetic" };
  for (const fn of ["clearRect", "fillRect", "strokeRect", "beginPath", "moveTo", "lineTo", "closePath", "fill", "stroke", "fillText", "save", "restore", "rect", "clip"])
    ctx[fn] = (...args: unknown[]) => calls.push({ fn, args, fill: ctx.fillStyle });
  ctx.measureText = () => ({ width: 10 });
  return { ctx: ctx as never, calls };
}

const rowOf = (steps: StepRow["steps"]): StepRow =>
  normalizePattern({ lengthSteps: 4, rows: [{ id: "k", assignment: { type: "note", pitch: 36 }, steps } as StepRow] }).rows[0]!;

const paint = (row: StepRow, mode: "tie" | "repeat" | "velocity", showValues = false) => {
  const r = recorder();
  paintStrip(r.ctx, { row, mode, stepWidth: 40, height: 60, palette: stripPalette("#20a0c0", scheme), selected: new Set(), showValues, playStep: undefined, preview: null, font: "10px sans" });
  return r.calls;
};

describe("stepStripPaint round 2", () => {
  it("separates on and off cells clearly, also in subrow value modes", () => {
    const p = stripPalette("#20a0c0", scheme);
    expect(contrast(p.on, p.off)).toBeGreaterThanOrEqual(3);
    expect(contrast(p.on, p.offBar)).toBeGreaterThanOrEqual(2.5);
    expect(contrast(p.valueBg, p.off)).toBeGreaterThanOrEqual(1.8);
  });

  it("draws a tie arrow in every Tie-mode cell (p0736)", () => {
    const calls = paint(rowOf([{ on: true }, {}, {}, {}]), "tie");
    expect(calls.filter((c) => c.fn === "fill")).toHaveLength(4);
  });

  it("draws the repeat glyph on a single-repeat step (p0736)", () => {
    const calls = paint(rowOf([{ on: true }, {}, {}, {}]), "repeat");
    const small = calls.filter((c) => c.fn === "fillRect" && (c.args[2] as number) <= 3 && (c.args[3] as number) <= 3);
    expect(small.length).toBeGreaterThanOrEqual(12);
  });

  it("shows values on every cell when Value Display is on, and none when off", () => {
    expect(paint(rowOf([{ on: true }, {}, {}, {}]), "velocity", true).filter((c) => c.fn === "fillText")).toHaveLength(4);
    expect(paint(rowOf([{ on: true }, {}, {}, {}]), "velocity", false).filter((c) => c.fn === "fillText")).toHaveLength(0);
  });
});
