import * as THREE from "three";
import type { GameLight3D, GameRenderFrame3D } from "@nodetool-ai/protocol";
import { applyTransform } from "../scene-sync.js";
import { configureDirectionalShadow } from "../shadows/index.js";
export function syncGameLights(scene: THREE.Scene, lights: Map<string, THREE.Light>, frame: GameRenderFrame3D): void {
  const present = new Set(frame.lights.map((entry) => entry.entityId));
  for (const [id, light] of lights) {
    if (!present.has(id)) { removeGameLight(light); lights.delete(id); }
  }
  for (const entry of frame.lights) {
    let light = lights.get(entry.entityId);
    if (!light || light.userData.gameLightKind !== entry.light.kind) {
      if (light) { removeGameLight(light); }
      light = makeGameLight(scene, entry.light);
      light.userData.gameLightKind = entry.light.kind;
      lights.set(entry.entityId, light);
      scene.add(light);
    }
    applyTransform(light, entry.transform);
    light.color.set(entry.light.color);
    light.intensity = entry.light.intensity;
    if (light instanceof THREE.DirectionalLight && entry.light.kind === "directional") {
      configureDirectionalShadow(light, entry.light, frame.environment);
    }
    if ((light instanceof THREE.PointLight || light instanceof THREE.SpotLight) && entry.light.kind !== "directional") { light.distance = entry.light.range; light.decay = entry.light.decay; }
    if (light instanceof THREE.SpotLight && entry.light.kind === "spot") { light.angle = entry.light.angle; light.penumbra = entry.light.penumbra; }
    if (light instanceof THREE.DirectionalLight || light instanceof THREE.SpotLight) {
      light.target.position.set(0, 0, -1).applyQuaternion(light.quaternion).add(light.position);
      light.target.updateMatrixWorld(true);
    }
  }
}
export function makeGameLight(scene: THREE.Scene, definition: GameLight3D): THREE.Light {
  if (definition.kind === "directional") { const light = new THREE.DirectionalLight(); scene.add(light.target); return light; }
  if (definition.kind === "point") { return new THREE.PointLight(); }
  const light = new THREE.SpotLight();
  scene.add(light.target);
  return light;
}
export function removeGameLight(light: THREE.Light): void {
  if (light instanceof THREE.DirectionalLight || light instanceof THREE.SpotLight) { light.target.removeFromParent(); light.shadow.dispose(); }
  light.removeFromParent();
  light.dispose();
}
