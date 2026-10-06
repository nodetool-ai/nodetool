import type { GameSystemContext3D } from "./context3d.js";
import { gameInputFrame3D } from "@nodetool-ai/protocol";
import { applyCameraLook3D } from "../spatial3d/camera.js";
export function stepInput3D(context: GameSystemContext3D): void {
  context.input = gameInputFrame3D.parse(context.input);
  if (
    context.input.pressed.some((action) => !context.document.inputActions.includes(action)) ||
    context.input.justPressed.some((action) => !context.document.inputActions.includes(action)) ||
    Object.keys(context.input.axes).some((axis) => !context.document.inputAxes.includes(axis))
  ) {
    throw new Error("Unknown 3D input action or axis");
  }
  for (const state of context.states) {
    state.previousTransform = structuredClone(state.transform);
  }
  context.previousCamera = structuredClone(context.camera.transform);
  applyCameraLook3D(context.camera, context.currentCameraEntity(), context.input);
}
