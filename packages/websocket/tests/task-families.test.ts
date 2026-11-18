/**
 * A generated task is only training material if it can be done with the tool
 * contracts and its checks tell done from not done. For every family and
 * many seeds, the reference solution must pass every check and an untouched
 * world must fail at least one.
 */
import { describe, it, expect } from "vitest";
import { TASK_FAMILIES, generateTasks, svgElement } from "../src/finetune/task-families.js";

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

describe.each(TASK_FAMILIES.map((family) => [family.id, family] as const))("%s", (_id, family) => {
  it("is solvable with the tool contracts", async () => {
    for (const seed of SEEDS) {
      const outcomes = await family.solveAndGrade(seed, true);
      const failed = outcomes.filter((o) => !o.passed).map((o) => o.name);
      expect({ seed, failed }).toEqual({ seed, failed: [] });
    }
  });

  it("fails an untouched world", async () => {
    for (const seed of SEEDS) {
      const outcomes = await family.solveAndGrade(seed, false);
      expect({ seed, anyFailed: outcomes.some((o) => !o.passed) }).toEqual({ seed, anyFailed: true });
    }
  });
});

describe("generated task set", () => {
  it("is deterministic and has no duplicate requests", () => {
    const a = generateTasks(TASK_FAMILIES, 30);
    const b = generateTasks(TASK_FAMILIES, 30);
    expect(a.map((t) => t.objective)).toEqual(b.map((t) => t.objective));
    expect(new Set(a.map((t) => t.objective)).size).toBe(a.length);
    expect(a[0]?.id).toBe("gen/model3d-build/000");
  });
});

describe("svg attribute reader", () => {
  it("reads attributes and style declarations by id", () => {
    const markup = `<svg><rect id='a' width="10" style="fill: #ff0000; stroke:none"/></svg>`;
    expect(svgElement(markup, "a")).toEqual({
      tag: "rect",
      attrs: { id: "a", width: "10", style: "fill: #ff0000; stroke:none", fill: "#ff0000", stroke: "none" }
    });
    expect(svgElement(markup, "b")).toBeNull();
  });
});
