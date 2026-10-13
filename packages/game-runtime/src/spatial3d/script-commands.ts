import type { GameScriptCommand3D } from "@nodetool-ai/protocol";
import type { EntityState3D } from "./state.js";
import type { SpatialWorld3D } from "./world.js";

export function applySpatialScriptCommand3D(
  spatial: SpatialWorld3D,
  state: EntityState3D,
  command: GameScriptCommand3D
): command is Extract<GameScriptCommand3D, { kind: "impulse" | "addForce" | "addTorque" | "addForceAtPoint" }> {
  if (command.kind === "impulse") {
    spatial.impulse(state, command.impulse);
    return true;
  }
  switch (command.kind) {
    case "addForce": spatial.addForce(state, command.force); return true;
    case "addTorque": spatial.addTorque(state, command.torque); return true;
    case "addForceAtPoint": spatial.addForceAtPoint(state, command.force, command.point); return true;
    default: return false;
  }
}
