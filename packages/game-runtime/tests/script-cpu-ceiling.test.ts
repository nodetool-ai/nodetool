import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gameDocument } from "@nodetool-ai/protocol";
import { createTopDownRoomGame } from "../src/sample.js";
import { prepareGameScripts, scriptSourceKey } from "../src/scripts.js";

async function fixture() {
  let cpu = 0;
  const document = createTopDownRoomGame("cpu-ceiling");
  const entity = document.scenes[0].entities.find((item) => item.id === "player");
  if (!entity) { throw new Error("Missing player"); }
  entity.behaviors = [{ kind: "script", source: "input => ({state:input.state,commands:[]})", maxTickMs: 20, maxCommands: 8 }];
  const runner = await prepareGameScripts(gameDocument.parse(document), { callClock: { kind: "thread-cpu", now: () => cpu } });
  const sourceKey = scriptSourceKey("room", "player", 0);
  const call = { sourceKey, stateKey: sourceKey, entityId: "player", source: "player", state: null,
    x: 0, y: 0, velocityX: 0, velocityY: 0, touching: { down: false, up: false, left: false, right: false }, maxCommands: 8, maxTickMs: 50 };
  return { runner, call, setCpu: (value: number) => { cpu = value; } };
}

// These tests check the real limits, so they undo the suite-wide scale in vitest.config.ts.
beforeEach(() => { vi.stubEnv("NODETOOL_GAME_SCRIPT_BUDGET_SCALE", "1"); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("host-owned script CPU ceiling", () => {
  it.each([{ requested: 50, elapsed: 21, ceiling: 20 }, { requested: Number.NaN, elapsed: 21, ceiling: 20 }, { requested: 5, elapsed: 6, ceiling: 5 }])(
    "caps a requested $requested ms call at $ceiling ms without widening tighter limits", async ({ requested, elapsed, ceiling }) => {
      const { runner, call, setCpu } = await fixture();
      let wall = 0;
      let serializations = 0;
      const clock = vi.spyOn(performance, "now").mockImplementation(() => wall);
      try {
        const input = { tick: 3, pressed: [], justPressed: [], world: [], events: [{ toJSON: () => {
          if (++serializations === 2) { wall = elapsed; setCpu(elapsed); }
          return "event";
        } }] };
        expect(() => runner.run([{ ...call, maxTickMs: requested }], input, 1)).toThrow(new RegExp(`interrupted.*call ${ceiling} ms.*player.*tick 3`, "i"));
      } finally { clock.mockRestore(); runner.dispose(); }
    }
  );

  it("does not charge wall-only waiting to a thread-CPU call", async () => {
    const { runner, call } = await fixture();
    let wall = 0;
    let serializations = 0;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => wall);
    try {
      const result = runner.run([{ ...call, maxTickMs: 20 }], { tick: 3, pressed: [], justPressed: [], world: [], events: [{ toJSON: () => {
        if (++serializations === 2) { wall = 25; }
        return "event";
      } }] }, 1);
      expect(result.results).toHaveLength(1);
    } finally { clock.mockRestore(); runner.dispose(); }
  });

  it("still charges input preparation to the unchanged 50 ms wall batch limit", async () => {
    const { runner, call } = await fixture();
    runner.run([{ ...call, maxTickMs: 20 }], { tick: 2, pressed: [], justPressed: [], events: [], world: [] }, 1);
    let wall = 0;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => wall);
    try {
      expect(() => runner.run([{ ...call, maxTickMs: 20 }], { tick: 3, pressed: [], justPressed: [], world: [], events: [{ toJSON: () => {
        wall = 51;
        return "event";
      } }] }, 1)).toThrow(/interrupted.*batch.*50 ms.*tick 3/i);
    } finally { clock.mockRestore(); runner.dispose(); }
  });
});
