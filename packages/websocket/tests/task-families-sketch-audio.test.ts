/**
 * The sketch and audio families must hold the same contract as the others:
 * for many seeds the reference solution passes every check, an untouched
 * world fails at least one, and no world exposes a tool the chat dispatcher
 * would route to the server instead of the bridge.
 */
import { describe, it, expect } from "vitest";
import { listCapabilitySpecs } from "@nodetool-ai/agents";
import { generateTasks } from "../src/finetune/task-families.js";
import { SKETCH_AUDIO_FAMILIES } from "../src/finetune/families/sketch-audio.js";

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

describe.each(SKETCH_AUDIO_FAMILIES.map((family) => [family.id, family] as const))("%s", (_id, family) => {
  it("is solvable with the tool contracts", async () => {
    for (const seed of SEEDS) {
      const outcomes = await family.solveAndGrade(seed, true);
      const failed = outcomes.filter((o) => !o.passed).map((o) => o.name);
      expect({ seed, failed }).toEqual({ seed, failed: [] });
    }
  }, 120_000);

  it("fails an untouched world", async () => {
    for (const seed of SEEDS) {
      const outcomes = await family.solveAndGrade(seed, false);
      expect({ seed, anyFailed: outcomes.some((o) => !o.passed) }).toEqual({ seed, anyFailed: true });
    }
  }, 120_000);

  it("exposes no tool a server capability owns", async () => {
    const server = new Set(listCapabilitySpecs().map((spec) => spec.name));
    const world = await family.draw(1, "probe").job.start();
    expect(world.tools.length).toBeGreaterThan(0);
    expect(world.tools.map((t) => t.name).filter((name) => server.has(name))).toEqual([]);
  });
});

describe("sketch and audio task set", () => {
  it("is deterministic and has no duplicate requests", () => {
    const a = generateTasks(SKETCH_AUDIO_FAMILIES, 30);
    const b = generateTasks(SKETCH_AUDIO_FAMILIES, 30);
    expect(a.map((t) => t.objective)).toEqual(b.map((t) => t.objective));
    expect(new Set(a.map((t) => t.objective)).size).toBe(a.length);
    expect(a.length).toBe(SKETCH_AUDIO_FAMILIES.length * 30);
    expect(a[0]?.id).toBe("gen/sketch-compose/000");
  });
});
