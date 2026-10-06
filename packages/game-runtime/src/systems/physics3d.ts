import type { GameSystemContext3D } from "./context3d.js";
export function stepPhysics3D(context: GameSystemContext3D): void {
  context.currentSpatial().stepPhysics();
}
