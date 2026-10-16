import { fixedCameraRotation3D, updateFixedCameraAngles3D } from "../spatial3d/camera.js";
import type { GameSystemContext3D } from "./context3d.js";
export function stepCharacter3D(context: GameSystemContext3D): void {
  const camera = context.currentCameraEntity();
  if (camera.definition.camera3d?.behavior.kind !== "follow") {
    updateFixedCameraAngles3D(context.camera, camera, fixedCameraRotation3D(camera, context.states));
  }
  context.spatialStep = context
    .currentSpatial()
    .prepareCharacters(context.states, context.input, context.camera.yaw, context.intents, context.posed);
}
