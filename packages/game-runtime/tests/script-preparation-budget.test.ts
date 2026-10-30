import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuickJSContext } from "quickjs-emscripten-core";
import { gameDocument, type GameDocument } from "@nodetool-ai/protocol";
import { createTopDownRoomGame } from "../src/sample.js";
import { prepareGameScripts } from "../src/scripts.js";

function fixture(source: string): GameDocument {
  const base = createTopDownRoomGame("a".repeat(32));
  return gameDocument.parse({
    ...base,
    scenes: base.scenes.map((scene) => ({
      ...scene,
      entities: scene.entities.map((entity) => ({
        ...entity,
        behaviors: entity.id === "player"
          ? [{ kind: "script", source, maxCommands: 8, maxTickMs: 20 }]
          : []
      }))
    }))
  });
}

/** Advance wall time only while the host initializes a fresh, empty realm. */
function pauseTrustedBootstrap(source: string) {
  const realNow = performance.now.bind(performance);
  const original = QuickJSContext.prototype.evalCode;
  let offset = 0;
  let bootstraps = 0;
  let sourceEvaluations = 0;
  vi.spyOn(performance, "now").mockImplementation(() => realNow() + offset);
  vi.spyOn(QuickJSContext.prototype, "evalCode").mockImplementation(function (
    this: QuickJSContext,
    ...args: Parameters<QuickJSContext["evalCode"]>
  ) {
    if (args[1] === "game-transport.js") {
      bootstraps += 1;
      offset += 101;
    }
    if (args[1] === "game-script.js" && args[0].includes(source)) { sourceEvaluations += 1; }
    return original.apply(this, args);
  });
  return {
    realNow,
    bootstraps: () => bootstraps,
    sourceEvaluations: () => sourceEvaluations
  };
}

beforeEach(() => { vi.stubEnv("NODETOOL_GAME_SCRIPT_BUDGET_SCALE", "1"); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("game script preparation budget", () => {
  it.each([
    ["initializer", "(() => { return input => ({ state: input.state, commands: [] }); })()", 1],
    ["reusable function", "({ state }) => { const next = (state || 0) + 1; return { state: next, commands: [] }; }", 2]
  ] as const)("excludes trusted bootstrap pauses when preparing a %s", async (_name, source, expectedBootstraps) => {
    const pause = pauseTrustedBootstrap(source);
    const runner = await prepareGameScripts(fixture(source));
    try {
      expect(pause.bootstraps()).toBeGreaterThanOrEqual(expectedBootstraps);
      expect(pause.sourceEvaluations()).toBeGreaterThanOrEqual(expectedBootstraps);
    } finally { runner.dispose(); }
  });

  it("still interrupts an infinite user initializer after a trusted bootstrap pause", async () => {
    const source = "(() => { while (true) {} })()";
    const pause = pauseTrustedBootstrap(source);
    const started = pause.realNow();
    await expect(prepareGameScripts(fixture(source))).rejects.toThrow(/interrupted/);
    expect(pause.bootstraps()).toBeGreaterThan(0);
    expect(pause.sourceEvaluations()).toBeGreaterThan(0);
    expect(pause.realNow() - started).toBeLessThan(1000);
  });
});
