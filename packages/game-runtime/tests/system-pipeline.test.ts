import { expect, it, vi } from "vitest";
import { GameSystemPipeline, gameSystem } from "../src/systems/pipeline.js";

it("runs registered systems in order and never reads a clock without timing", () => {
  const order: string[] = [];
  const clock = vi.spyOn(performance, "now").mockImplementation(() => {
    throw new Error("Unexpected timing overhead");
  });
  try {
    const stages = [
      "input",
      "scripts",
      "character",
      "physics",
      "contacts",
      "gameplay",
      "animation",
      "presentation"
    ];
    const pipeline = new GameSystemPipeline(
      stages.map((name) =>
        gameSystem(name, () => {
          order.push(name);
        })
      )
    );
    pipeline.init({}, {});
    pipeline.step({});
    expect(order).toEqual(stages);
    for (const system of pipeline.systems) {
      expect(system.snapshot()).toBeNull();
      system.restore(null);
    }
  } finally {
    clock.mockRestore();
  }
});
it("records one timing for each system only when enabled", () => {
  let now = 0;
  const pipeline = new GameSystemPipeline([
    gameSystem("input", () => {}),
    gameSystem("physics", () => {})
  ]);
  expect(pipeline.stepTimed({}, () => now++)).toEqual({
    totalMs: 5,
    systems: [
      { system: "input", durationMs: 1 },
      { system: "physics", durationMs: 1 }
    ]
  });
});
it("restores captured state through a system's snapshot lifecycle", async () => {
  const { statefulGameSystem } = await import("../src/systems/pipeline.js");
  let counter = 0;
  const system = statefulGameSystem(
    "scripts",
    () => {
      counter++;
    },
    () => ({ counter }),
    (saved) => {
      counter = saved.counter;
    }
  );
  const pipeline = new GameSystemPipeline([system]);
  pipeline.init({}, {});
  pipeline.step({});
  const saved = pipeline.snapshot();
  pipeline.step({});
  expect(counter).toBe(2);
  pipeline.restore(saved);
  pipeline.step({});
  expect(counter).toBe(2);
  expect(pipeline.snapshot()).toEqual({ scripts: { counter: 2 } });
});
