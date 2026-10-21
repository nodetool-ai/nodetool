import * as THREE from "three";
import type { GameRenderFrame3D } from "@nodetool-ai/protocol";

/**
 * Applies the frame environment. The fog object and background colour are updated in place, because three
 * resolves every fogged material's program again whenever `scene.fog` is a different object.
 */
export function configureGameEnvironment(scene: THREE.Scene, ambient: THREE.AmbientLight, renderer: THREE.WebGLRenderer, environment: GameRenderFrame3D["environment"]): void {
    if (scene.background instanceof THREE.Color) { scene.background.set(environment.background); }
    else { scene.background = new THREE.Color(environment.background); }
    scene.backgroundIntensity = 1;
    scene.backgroundRotation.set(0, 0, 0);
    ambient.color.set(environment.ambient.color);
    ambient.intensity = environment.ambient.intensity;
    const fog = environment.fog;
    if (!fog) { scene.fog = null; }
    else if ("kind" in fog) {
        if (scene.fog instanceof THREE.FogExp2) { scene.fog.color.set(fog.color); scene.fog.density = 0; }
        else { scene.fog = new THREE.FogExp2(fog.color, 0); }
    } else if (scene.fog instanceof THREE.Fog) {
        scene.fog.color.set(fog.color); scene.fog.near = fog.near; scene.fog.far = fog.far;
    } else { scene.fog = new THREE.Fog(fog.color, fog.near, fog.far); }
    renderer.shadowMap.enabled = environment.shadows.enabled;
}
