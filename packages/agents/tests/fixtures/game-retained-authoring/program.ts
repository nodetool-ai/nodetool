import { gameAuthoringProgram, type GameAuthoringProgram } from "@nodetool-ai/protocol";
import { createTopDownRoomGame } from "@nodetool-ai/game-runtime";

export function retainedRoomProgram(): GameAuthoringProgram {
  return gameAuthoringProgram.parse({
    seed: 19,
    inputs: { template: createTopDownRoomGame("a".repeat(32)), playerSpeed: 3, enemySpeed: 1, layout: [
      { id: "gem", x: 2, y: 0 }, { id: "gem-deleted", x: -2, y: 2 }
    ] },
    source: `
const document = inputs.template;
const scene = document.scenes[0];
const gem = scene.entities.find((entity) => entity.id === "gem");
scene.entities = scene.entities.filter((entity) => entity.id !== "gem");
const playerSpeed = builder.parameter("playerSpeed", { type: "number", default: 3, min: 1, max: 8 });
const enemySpeed = builder.parameter("enemySpeed", { type: "number", default: 1, min: 0.1, max: 4 });
scene.entities.find((entity) => entity.id === "player").behaviors[0].speed = playerSpeed;
const collectible = builder.prefab("collectible", gem);
for (const item of inputs.layout) {
  builder.instance(scene, item.id, collectible, { transform2d: { x: item.x, y: item.y } });
}
const enemy = builder.prefab("enemy", {
  transform2d: { x: 0, y: 2 },
  sprite: { assetId: "wall", width: 0.5, height: 0.5, layer: 1 },
  body2d: { type: "kinematic" },
  collider2d: { width: 0.5, height: 0.5 },
  behaviors: [{ kind: "patrol", speed: enemySpeed, distance: 1, axis: "x" }]
});
builder.instance(scene, "enemy-left", enemy);
builder.instance(scene, "enemy-right", enemy, { transform2d: { x: 3, y: 2 } });
return document;
`
  });
}

export const RETAINED_ROOM_ROUTE = Array.from({ length: 80 }, () => ({ pressed: ["right"], justPressed: [] }));
