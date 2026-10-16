import { describe, expect, it } from "vitest";
import { gameInputFrame3D, gameSnapshot3D } from "@nodetool-ai/protocol";
import { createGameSession3D, hashGameSnapshot3D } from "../src/open-session.js";
import { digestGame3D } from "../src/spatial3d/digest.js";
import { blockout } from "./fixtures-game3d.js";

describe("guest-observable snapshot script state order", () => {
  it("distinguishes states whose key order changes the next actual QuickJS output", async () => {
    const document = blockout();
    const entity = document.scenes[0].entities[1];
    if (!entity) { throw new Error("Blockout has no script entity"); }
    entity.behaviors = [{ kind: "script", maxTickMs: 20, maxCommands: 4,
      source: "(input) => { const state = input.state || {a:1,b:2}; return {state,commands:[{kind:'emit',event:Object.keys(state)[0]}]}; }" }];
    const input = gameInputFrame3D.parse({ pressed: [] });
    const original = await createGameSession3D(document, 1);
    try {
      for (let tick = 0; tick < 60; tick++) { original.step(input); }
      const first = gameSnapshot3D.parse(JSON.parse(JSON.stringify(original.snapshot())));
      const second = gameSnapshot3D.parse(JSON.parse(JSON.stringify(first)));
      const key = Object.keys(first.scriptState)[0];
      if (!key) { throw new Error("Actual QuickJS produced no script state"); }
      expect(first.scriptState[key]).toEqual({ a: 1, b: 2 });
      second.scriptState[key] = { b: 2, a: 1 };
      const left = await createGameSession3D(document, 1, first);
      const right = await createGameSession3D(document, 1, second);
      try {
        const leftEvents = left.step(input).events;
        const rightEvents = right.step(input).events;
        expect(leftEvents).toContainEqual(expect.objectContaining({ kind: "trigger", event: "a" }));
        expect(rightEvents).toContainEqual(expect.objectContaining({ kind: "trigger", event: "b" }));
        expect(leftEvents).not.toEqual(rightEvents);
        expect(await hashGameSnapshot3D(first)).toBe(await digestGame3D(first));
        expect(await hashGameSnapshot3D(first)).not.toBe(await hashGameSnapshot3D(second));
        expect(await hashGameSnapshot3D(first)).toBe(await hashGameSnapshot3D(gameSnapshot3D.parse(JSON.parse(JSON.stringify(first)))));
      } finally { left.dispose(); right.dispose(); }
    } finally { original.dispose(); }
  });
});
