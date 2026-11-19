/**
 * Storyboard and script families: for many seeds, the reference solution
 * passes every check and an untouched document fails at least one. Their
 * tools must also stay clear of server capability names, or the chat
 * harness skips every task.
 */
import { describe, it, expect } from "vitest";
import { listCapabilitySpecs } from "@nodetool-ai/agents";
import { generateTasks } from "../src/finetune/task-families.js";
import { STORYBOARD_SCRIPT_FAMILIES } from "../src/finetune/families/storyboard-script.js";

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

describe.each(STORYBOARD_SCRIPT_FAMILIES.map((family) => [family.id, family] as const))("%s", (_id, family) => {
  it("is solvable with the tool contracts", async () => {
    for (const seed of SEEDS) {
      const outcomes = await family.solveAndGrade(seed, true);
      const failed = outcomes.filter((o) => !o.passed).map((o) => o.name);
      expect({ seed, failed }).toEqual({ seed, failed: [] });
    }
  });

  it("fails an untouched document", async () => {
    for (const seed of SEEDS) {
      const outcomes = await family.solveAndGrade(seed, false);
      expect({ seed, anyFailed: outcomes.some((o) => !o.passed) }).toEqual({ seed, anyFailed: true });
    }
  });
});

describe("storyboard and script task set", () => {
  it("is deterministic and has no duplicate requests", () => {
    const a = generateTasks(STORYBOARD_SCRIPT_FAMILIES, 30);
    const b = generateTasks(STORYBOARD_SCRIPT_FAMILIES, 30);
    expect(a.map((t) => t.objective)).toEqual(b.map((t) => t.objective));
    expect(new Set(a.map((t) => t.objective)).size).toBe(a.length);
    expect(a.length).toBe(30 * STORYBOARD_SCRIPT_FAMILIES.length);
  });

  it("uses no tool a server capability owns", async () => {
    const server = new Set(listCapabilitySpecs().map((spec) => spec.name));
    const jobs = generateTasks(STORYBOARD_SCRIPT_FAMILIES, 1);
    expect(jobs.length).toBeGreaterThan(0);
    for (const job of jobs) {
      const world = await job.start();
      expect(world.tools.length).toBeGreaterThan(0);
      expect(world.tools.map((t) => t.name).filter((name) => server.has(name))).toEqual([]);
    }
  });
});
