import * as THREE from "three";
import type { GameLight3D, GameRenderFrame3D } from "@nodetool-ai/protocol";
export function configureDirectionalShadow(light: THREE.DirectionalLight, definition: Extract<GameLight3D, { kind: "directional" }>, environment: GameRenderFrame3D["environment"]): void {
  light.castShadow = environment.shadows.enabled && definition.castShadow;
  light.shadow.mapSize.set(environment.shadows.mapSize, environment.shadows.mapSize);
  const extent = environment.shadows.extent;
  Object.assign(light.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 0.1, far: extent * 4 });
  light.shadow.camera.updateProjectionMatrix();
}
