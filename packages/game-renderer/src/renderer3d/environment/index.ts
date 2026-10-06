import * as THREE from "three";
import type { GameRenderFrame3D } from "@nodetool-ai/protocol";
export function configureGameEnvironment(scene: THREE.Scene, ambient: THREE.AmbientLight, renderer: THREE.WebGLRenderer, environment: GameRenderFrame3D["environment"]): void {
    scene.background = new THREE.Color(environment.background);
    ambient.color.set(environment.ambient.color);
    ambient.intensity = environment.ambient.intensity;
    scene.fog = environment.fog ? new THREE.Fog(environment.fog.color, environment.fog.near, environment.fog.far) : null;
    renderer.shadowMap.enabled = environment.shadows.enabled;
}
