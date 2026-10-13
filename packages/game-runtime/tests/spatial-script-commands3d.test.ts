import { expect, it } from "vitest";
import { gameEntity3D, gameScene3D } from "@nodetool-ai/protocol";
import { applySpatialScriptCommand3D } from "../src/spatial3d/script-commands.js";
import type { EntityState3D } from "../src/spatial3d/state.js";
import { prepareRapier3D, SpatialWorld3D } from "../src/spatial3d/world.js";

it("leaves nonphysics script commands for the caller without changing physics", async () => {
  const definition = gameEntity3D.parse({ id: "visual", transform3d: {} });
  const state: EntityState3D = {
    definition, definitionId: definition.id, spawnTick: 0, active: true,
    transform: structuredClone(definition.transform3d), localTransform: structuredClone(definition.transform3d),
    previousTransform: structuredClone(definition.transform3d), velocity: { x: 0, y: 0, z: 0 },
    angularVelocity: { x: 0, y: 0, z: 0 }
  };
  const scene = gameScene3D.parse({ id: "room", name: "Room", activeCameraId: "camera", entities: [] });
  const spatial = new SpatialWorld3D(await prepareRapier3D(), scene, [state], new Map());
  try {
    const before = spatial.snapshot();
    expect(applySpatialScriptCommand3D(spatial, state, { kind: "emit", event: "ping" })).toBe(false);
    expect(spatial.snapshot()).toEqual(before);
  } finally { spatial.dispose(); }
});
