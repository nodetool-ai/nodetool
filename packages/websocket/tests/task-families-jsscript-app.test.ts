/**
 * JS script and app task families: for many seeds, the reference solution
 * passes every check and an untouched world fails one. A repair task's bug
 * must be real (its saved tests fail before the fix), and no family may use
 * a tool name the chat dispatcher routes to the server.
 */
import { describe, it, expect } from "vitest";
import { listCapabilitySpecs } from "@nodetool-ai/agents";
import { generateTasks } from "../src/finetune/task-families.js";
import { JSSCRIPT_APP_FAMILIES } from "../src/finetune/families/jsscript-app.js";

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

describe.each(JSSCRIPT_APP_FAMILIES.map((family) => [family.id, family] as const))("%s", (_id, family) => {
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
});

describe("jsscript families", () => {
  it("grade behaviour: an untouched script fails a behaviour check", async () => {
    for (const family of JSSCRIPT_APP_FAMILIES.filter((f) => f.id.startsWith("jsscript-"))) {
      for (const seed of SEEDS) {
        const outcomes = await family.solveAndGrade(seed, false);
        const behaviour = outcomes.filter((o) => o.name.includes(" for "));
        expect({ family: family.id, seed, anyFailed: behaviour.length > 0 && behaviour.some((o) => !o.passed) }).toEqual({
          family: family.id,
          seed,
          anyFailed: true
        });
      }
    }
  }, 120_000);

  it("repair tasks start with saved tests that really fail", async () => {
    const fix = JSSCRIPT_APP_FAMILIES.find((f) => f.id === "jsscript-fix")!;
    let repairs = 0;
    for (const seed of SEEDS) {
      const { objective, job } = fix.draw(seed, "x");
      if (!objective.includes("saved tests fail")) continue;
      repairs++;
      const world = await job.start();
      const report = (await world.tools.find((t) => t.name === "ui_jsscript_test")!.execute({})) as { ok: boolean; failed: number };
      expect({ seed, ok: report.ok }).toEqual({ seed, ok: false });
    }
    expect(repairs).toBeGreaterThan(5);
  }, 120_000);
});

describe("generated jsscript and app tasks", () => {
  it("use no tool name a server capability owns", async () => {
    const server = new Set(listCapabilitySpecs().map((spec) => spec.name));
    const names = new Set<string>();
    for (const family of JSSCRIPT_APP_FAMILIES) {
      const world = await family.draw(1, "x").job.start();
      for (const tool of world.tools) names.add(tool.name);
    }
    expect(names.size).toBeGreaterThan(10);
    expect([...names].filter((name) => server.has(name))).toEqual([]);
  });

  it("are deterministic and have no duplicate requests", () => {
    const a = generateTasks(JSSCRIPT_APP_FAMILIES, 30);
    const b = generateTasks(JSSCRIPT_APP_FAMILIES, 30);
    expect(a.map((t) => t.objective)).toEqual(b.map((t) => t.objective));
    expect(new Set(a.map((t) => t.objective)).size).toBe(a.length);
    expect(a.length).toBe(30 * JSSCRIPT_APP_FAMILIES.length);
  });
});
