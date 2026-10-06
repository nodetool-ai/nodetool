import type { GameSystemContext3D } from "./context3d.js";
export function stepCharacter3D(context: GameSystemContext3D): void {
  context.spatialStep = context
    .currentSpatial()
    .prepareCharacters(context.states, context.input, context.camera.yaw, context.intents, context.posed);
}
