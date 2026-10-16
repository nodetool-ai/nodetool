import * as THREE from "three";
import type { GameRenderFrame3D } from "@nodetool-ai/protocol";
export function configureGameEnvironment(scene: THREE.Scene, ambient: THREE.AmbientLight, renderer: THREE.WebGLRenderer, environment: GameRenderFrame3D["environment"]): void {
    scene.background = new THREE.Color(environment.background);
    ambient.color.set(environment.ambient.color);
    ambient.intensity = environment.ambient.intensity;
    const fog = environment.fog;
    scene.fog = !fog ? null : "kind" in fog ? new THREE.FogExp2(fog.color, 0) : new THREE.Fog(fog.color, fog.near, fog.far);
    renderer.shadowMap.enabled = environment.shadows.enabled;
}
