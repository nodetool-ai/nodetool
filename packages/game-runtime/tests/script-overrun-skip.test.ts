import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gameDocument, type GameDocument } from "@nodetool-ai/protocol";
import { createScriptedGameSession, createTopDownRoomGame } from "../src/index.js";
import { wallScriptCallClock } from "../src/script-clock.js";
import { prepareGameScripts, scriptSourceKey, type GameScriptCall, type GameScriptInput } from "../src/scripts.js";

// The looper overruns its call budget on tick 0 only. The worker always finishes. The overrun happens in the first batch,
// whose larger batch allowance keeps the 20 ms call budget, not the wall-clock batch budget, the one that runs out.
const SOURCES = {
  persistent: "(input) => { if (input.tick === 0) { while (true) {} } return { state: (input.state || 0) + 1, commands: [] }; }",
  reusable: "({ tick, state }) => { if (tick === 0) { while (true) {} } return { state: (state || 0) + 1, commands: [] }; }",
  fresh: "(() => ({ tick, state }) => { if (tick === 0) { while (true) {} } return { state: (state || 0) + 1, commands: [] }; })()"
};
const WORKER = "(input) => ({ state: { seen: input.tick, roll: input.random() }, commands: [{ kind: \"setVelocity\", x: 1, y: 0 }] })";

function fixture(looper: string): GameDocument {
  const base = createTopDownRoomGame("a".repeat(32));
  return gameDocument.parse({ ...base, scenes: base.scenes.map((scene) => ({ ...scene, entities: [
    ...scene.entities.map((entity) => ({ ...entity, behaviors: [] })),
    { id: "looper", transform2d: { x: 0, y: 0 }, behaviors: [{ kind: "script", source: looper, maxTickMs: 20, maxCommands: 8 }] },
    { id: "worker", transform2d: { x: 1, y: 0 }, behaviors: [{ kind: "script", source: WORKER, maxTickMs: 20, maxCommands: 8 }] }
  ] })) });
}

function callOf(entityId: string, state: GameScriptCall["state"]): GameScriptCall {
  const key = scriptSourceKey("room", entityId, 0);
  return { sourceKey: key, stateKey: key, entityId, source: entityId, state, x: 0, y: 0, velocityX: 0, velocityY: 0,
    touching: { down: false, up: false, left: false, right: false }, maxTickMs: 20, maxCommands: 8 };
}

function input(tick: number): GameScriptInput {
  return { tick, pressed: [], justPressed: [], events: [], world: [] };
}

// These tests check the real limits, so they undo the suite-wide scale in vitest.config.ts.
beforeEach(() => { vi.stubEnv("NODETOOL_GAME_SCRIPT_BUDGET_SCALE", "1"); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("script overruns with skip", () => {
  for (const [flavor, source] of Object.entries(SOURCES)) {
    it(`skips a ${flavor} call past its call budget and keeps running`, async () => {
      const runner = await prepareGameScripts(fixture(source), { overrun: "skip" });
      try {
        const started = performance.now();
        const skipped = runner.run([callOf("looper", null), callOf("worker", null)], input(0), 7);
        expect(performance.now() - started).toBeLessThan(1000);
        // The looper keeps its state and issues nothing. The worker still runs.
        expect(skipped.results[0]).toEqual({ entityId: "looper", state: null, commands: [] });
        expect(skipped.results[1]).toMatchObject({ entityId: "worker", state: { seen: 0 }, commands: [{ kind: "setVelocity", x: 1, y: 0 }] });
        expect(skipped.logs).toEqual([{ tick: 0, entityId: "looper", level: "warning",
          message: `Game script ${callOf("looper", null).sourceKey} for looper skipped at tick 0: call 20 ms budget exceeded` }]);
        // The interrupted realm is gone, so the next tick runs the looper from its committed state.
        const next = runner.run([callOf("looper", null), callOf("worker", skipped.results[1].state)], input(1), skipped.rngState);
        expect(next.results[0]).toEqual({ entityId: "looper", state: 1, commands: [] });
        expect(next.results[1]).toMatchObject({ entityId: "worker", state: { seen: 1 } });
        expect(next.logs).toBeUndefined();
      } finally { runner.dispose(); }
    });
  }

  it("draws the same random numbers for the other calls as a tick without the overrunning call", async () => {
    const skipping = await prepareGameScripts(fixture(SOURCES.persistent), { overrun: "skip" });
    const alone = await prepareGameScripts(fixture(SOURCES.persistent));
    try {
      const withSkip = skipping.run([callOf("looper", null), callOf("worker", null)], input(0), 11);
      const without = alone.run([callOf("worker", null)], input(0), 11);
      expect(withSkip.results[1].state).toEqual(without.results[0].state);
      expect(withSkip.rngState).toBe(without.rngState);
    } finally { skipping.dispose(); alone.dispose(); }
  });

  it("skips the remaining calls once the batch runs past its budget", async () => {
    // This test drives performance.now, so it measures calls on the wall clock that browsers use.
    const runner = await prepareGameScripts(fixture(SOURCES.persistent), { overrun: "skip", callClock: wallScriptCallClock });
    try {
      // The first batch has a larger allowance, so the 50 ms budget applies from the second.
      runner.run([callOf("worker", null)], input(0), 1);
      let clock = 0;
      vi.spyOn(performance, "now").mockImplementation(() => clock);
      const originalStringify = JSON.stringify;
      vi.spyOn(JSON, "stringify").mockImplementation(function (this: JSON, ...args: Parameters<typeof JSON.stringify>) {
        // The host stalls past the batch deadline while it serializes the looper's call, after the first worker finished.
        if (typeof args[0] === "object" && args[0] !== null && (args[0] as { entityId?: unknown }).entityId === "looper") { clock = 51; }
        return originalStringify.apply(this, args);
      });
      const batch = runner.run([callOf("worker", null), callOf("looper", 2), callOf("worker", null)], input(3), 1);
      expect(batch.results).toHaveLength(3);
      expect(batch.results[0]).toMatchObject({ entityId: "worker", state: { seen: 3 } });
      expect(batch.results.slice(1)).toEqual([{ entityId: "looper", state: 2, commands: [] }, { entityId: "worker", state: null, commands: [] }]);
      expect(batch.logs).toEqual([
        { tick: 3, entityId: "looper", level: "warning",
          message: `Game script ${callOf("looper", null).sourceKey} for looper skipped at tick 3: batch 50 ms at tick 3 budget exceeded` },
        { tick: 3, level: "warning", message: "1 game script call skipped at tick 3: batch 50 ms at tick 3 budget exceeded" }
      ]);
    } finally { runner.dispose(); }
  });

  it("still fails the batch by default", async () => {
    const runner = await prepareGameScripts(fixture(SOURCES.persistent));
    try {
      expect(() => runner.run([callOf("looper", null)], input(0), 1)).toThrow(/looper at tick 0 failed: Game script interrupted: call 20 ms/);
    } finally { runner.dispose(); }
  });

  it("keeps a session with scriptOverrun skip playing through an overrun", async () => {
    const game = fixture("({ tick, state }) => { if (tick === 0) { while (true) {} } return { state: tick, commands: [] }; }");
    const session = await createScriptedGameSession(game, 1, undefined, undefined, { scriptOverrun: "skip" });
    try {
      const steps = [0, 1, 2, 3].map(() => session.step({ pressed: [] }));
      expect(steps.map((step) => step.tick)).toEqual([1, 2, 3, 4]);
      expect(steps.flatMap((step) => step.scriptLogs ?? []).map((line) => `${line.tick} ${line.entityId} ${line.level}`)).toEqual(["0 looper warning"]);
    } finally { session.dispose(); }
  });
});
