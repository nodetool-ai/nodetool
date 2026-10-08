import { expect, it } from "vitest";
import { blockout } from "./fixtures-game3d.js";
import { prepareGameScripts3D } from "../src/scripts3d.js";
import { scriptSourceKey } from "../src/scripts.js";

it("queries frozen 3D entity centers in document order with source filtering before limits", async () => {
  const document = blockout();
  document.scenes[0].entities[1].behaviors = [{ kind: "script", maxCommands: 8, maxTickMs: 50, source: `input => {
    const before = world.get("first");
    before.velocity.x = 99;
    return { state: {
      ids: world.query({ source: "pick", near: { x: 0, y: 0, z: 0 }, radius: 5, limit: 2 }),
      boundary: world.query({ near: { x: 3, y: 4, z: 0 }, radius: 0 }),
      outside: world.query({ near: { x: 100, y: 100, z: 100 }, radius: 1 }),
      value: world.get("first"), changed: before.velocity.x
    }, commands: [] };
  }` }];
  const key = scriptSourceKey("scene", "player", 0);
  const runner = await prepareGameScripts3D(document);
  const velocity = { x: 1, y: 2, z: 3 };
  const world = [
    { id: "first", source: "pick", position: { x: 3, y: 4, z: 0 }, velocity, grounded: true },
    { id: "skip", source: "other", position: { x: 0, y: 0, z: 0 }, velocity, grounded: false },
    { id: "second", source: "pick", position: { x: -3, y: 0, z: 4 }, velocity, grounded: false },
    { id: "third", source: "pick", position: { x: 0, y: 0, z: 0 }, velocity, grounded: false }
  ];
  try {
    const result = runner.run([{ sourceKey: key, stateKey: key, entityId: "player", source: "player", state: null,
      position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, grounded: false, maxCommands: 8, maxTickMs: 50
    }], { tick: 0, pressed: [], justPressed: [], axes: {}, look: { x: 0, y: 0 }, camera: { yaw: 0, pitch: 0 }, events: [], queries: [], world }, 1);
    expect(result.results[0].state).toEqual({ ids: ["first", "second"], boundary: ["first"], outside: [], value: world[0], changed: 99 });
    expect(velocity.x).toBe(1);
  } finally { runner.dispose(); }
});
