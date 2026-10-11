import { updateVisualHierarchy3D } from "./hierarchy3d.js";
import type { GameSystemContext3D } from "./context3d.js";
import { resolveCamera3D } from "../spatial3d/camera.js";
import { finalizeSimulation3D } from "./gameplay3d.js";
import { stepAnimationGraphs3D } from "./animation-graph3d.js";
export function stepAnimation3D(context: GameSystemContext3D): void {
  stepAnimationGraphs3D(context.document, context.states, context.tick + 1);
  updateVisualHierarchy3D(context.states);
  resolveCamera3D(context.camera, context.currentCameraEntity(), context.states, context.currentSpatial());
  if (context.queues.transitionTo) {
    context.previousCamera = structuredClone(context.camera.transform);
  }
  finalizeSimulation3D(context);
}
