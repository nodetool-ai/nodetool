import { describe, expect, it } from "vitest";
import { gameDocument } from "@nodetool-ai/protocol";
import { createTopDownRoomGame } from "../src/sample.js";
import { prepareGameScripts, scriptSourceKey, type GameScriptCall } from "../src/scripts.js";
import { prepareGameScripts3D } from "../src/scripts3d.js";
import { blockout } from "./fixtures-game3d.js";

function fixture(source: string) {
  const base = createTopDownRoomGame("a".repeat(32));
  return gameDocument.parse({ ...base, scenes: [{ ...base.scenes[0], entities: [{
    id: "worker", transform2d: { x: 0, y: 0 }, behaviors: [{ kind: "script", source, maxTickMs: 20, maxCommands: 8 }]
  }] }] });
}

function call(state: GameScriptCall["state"] = null, lifecycle?: GameScriptCall["lifecycle"]): GameScriptCall {
  const key = scriptSourceKey("room", "worker", 0);
  return { sourceKey: key, stateKey: key, entityId: "worker", source: "worker", state,
    x: 0, y: 0, velocityX: 0, velocityY: 0, touching: { down: false, up: false, left: false, right: false },
    maxTickMs: 20, maxCommands: 8, ...(lifecycle ? { lifecycle } : {}) };
}

const input = { tick: 0, pressed: [], justPressed: [], events: [{ kind: "trigger", event: "go" }], world: [] };
const asynchronous = [
  "async input => ({state:1})", "function* (input) { yield {state:1}; }", "async function* (input) { yield {state:1}; }",
  "({async onStart() {}})", "({*onUpdate() { yield {}; }})", "({async *onEvent() { yield {}; }})",
  "({onStart(){after(1,'later');}, async later(){}})", "({onUpdate(){}, *later(){yield {};}})"
];

describe("synchronous script lifecycle", () => {
  it.each(asynchronous)("rejects asynchronous or generator source during 2D and 3D preparation: %s", async (source) => {
    await expect(prepareGameScripts(fixture(source)).then((runner) => { runner.dispose(); })).rejects.toThrow(/synchronous|async|generator/i);
    const document = blockout();
    document.scenes[0].entities[1].behaviors = [{ kind: "script", source, maxTickMs: 20, maxCommands: 8 }];
    await expect(prepareGameScripts3D(document).then((runner) => { runner.dispose(); })).rejects.toThrow(/synchronous|async|generator/i);
  });

  it.each(["Promise.resolve({state:1})", "({then(){}})", "({next(){return {done:true};}})"])(
    "rejects deferred function results: %s", async (result) => {
      const runner = await prepareGameScripts(fixture(`input => ${result}`));
      try { expect(() => runner.run([call()], input, 1)).toThrow(/synchronous|promise|iterator/i); }
      finally { runner.dispose(); }
    });

  it.each(["onStart", "onUpdate", "onEvent", "onDestroy", "later"])("rejects deferred %s results at actual dispatch", async (hook) => {
    const source = hook === "later" ? "({onStart(){after(1,'later');}, later(){return Promise.resolve({state:1});}})"
      : `({${hook}(){return Promise.resolve({state:1});}})`;
    const runner = await prepareGameScripts(fixture(source));
    try {
      if (hook === "later") {
        const first = runner.run([call()], input, 1);
        expect(() => runner.run([call(first.results[0].state)], { ...input, tick: 1 }, first.rngState)).toThrow(/synchronous|promise|iterator/i);
      } else {
        expect(() => runner.run([call(null, hook === "onDestroy" ? { destroy: true } : hook === "onEvent" ? { events: [0] } : undefined)], input, 1))
          .toThrow(/synchronous|promise|iterator/i);
      }
    } finally { runner.dispose(); }
  });

  it("keeps ordinary synchronous hooks and named timers usable", async () => {
    const runner = await prepareGameScripts(fixture("({onStart(){after(1,'later');return {state:1};},later(input){return {state:input.state+1};}})"));
    try {
      const first = runner.run([call()], input, 1);
      const second = runner.run([call(first.results[0].state)], { ...input, tick: 1 }, first.rngState);
      expect(second.results[0].state).toEqual({ $lifecycle: 1, state: 2, timers: [] });
    } finally { runner.dispose(); }
  });
});
