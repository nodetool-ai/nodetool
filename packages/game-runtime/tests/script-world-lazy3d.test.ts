import { expect, it } from "vitest";
import { gameDocument3D } from "@nodetool-ai/protocol";
import { createGameSession3D } from "../src/session3d.js";
import { blockout } from "./fixtures-game3d.js";

/** A scene with one controller script and `count` plain tagged entities. */
function crowd(count: number, source: string, props?: Record<string, string>) {
  const document = blockout();
  const scene = document.scenes[0];
  scene.entities[1].behaviors = [{ kind: "script", maxCommands: 8, maxTickMs: 20, source }];
  const entities = Array.from({ length: count }, (_, index) => ({ id: `prop-${index}`, tags: ["prop"], props,
    transform3d: { position: { x: index % 40, y: 0, z: Math.floor(index / 40) } } }));
  return gameDocument3D.parse({ ...document, scenes: [{ ...scene, entities: [...scene.entities, ...entities] }] });
}

const input = { pressed: [], justPressed: [], axes: {}, look: { x: 0, y: 0 } };

it("runs a script beside 2000 entities when the script never reads the world", async () => {
  // About 350 entities used to exceed the 64 KiB script input, because every tick serialized the whole world.
  const session = await createGameSession3D(crowd(2000, "input => ({ state: (input.state || 0) + 1, commands: [] })"), 1);
  try {
    for (let tick = 0; tick < 3; tick++) { session.step(input); }
    expect(session.snapshot().scriptState['["scene","player",0]']).toBe(3);
  } finally { session.dispose(); }
});

it("hands a script every world entry when it reads input.world", async () => {
  const session = await createGameSession3D(crowd(1000, "input => ({ state: { count: input.world.length, last: input.world[input.world.length - 1].id }, commands: [] })"), 1);
  try {
    session.step(input);
    expect(session.snapshot().scriptState['["scene","player",0]']).toEqual({ count: 1002, last: "prop-999" });
  } finally { session.dispose(); }
});

it("applies the 1 MiB world limit only when a script reads the world", async () => {
  const props = { label: "x".repeat(400) };
  const quiet = await createGameSession3D(crowd(3000, "input => ({ state: null, commands: [] })", props), 1);
  try { expect(() => quiet.step(input)).not.toThrow(); } finally { quiet.dispose(); }
  const reader = await createGameSession3D(crowd(3000, "input => ({ state: input.world.length, commands: [] })", props), 1);
  try { expect(() => reader.step(input)).toThrow(/Game script world exceeds 1 MiB \(\d+ bytes, 3002 entities, tick 0\)/); }
  finally { reader.dispose(); }
});
