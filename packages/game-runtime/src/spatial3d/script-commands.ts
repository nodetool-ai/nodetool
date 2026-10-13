import type { GameScriptCommand3D } from "@nodetool-ai/protocol";
import type { EntityState3D } from "./state.js";
import type { SpatialWorld3D } from "./world.js";

export function applySpatialScriptCommand3D(
  spatial: SpatialWorld3D,
  state: EntityState3D,
  command: GameScriptCommand3D
): command is Extract<GameScriptCommand3D, { kind: "impulse" }> {
  if (command.kind === "impulse") {
    spatial.impulse(state, command.impulse);
    return true;
  }
  return false;
}
