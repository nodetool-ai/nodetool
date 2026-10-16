import * as THREE from "three";
import type { GameHeightFog3D as GameHeightFogSettings3D, GameVector3 } from "@nodetool-ai/protocol";
import { removeGameMaterialHook, setGameMaterialHook } from "../material-hooks.js";

/** Analytic segment integral. Using its lower endpoint avoids subtracting two large exponentials. */
export function heightFogOpacity3D(settings: GameHeightFogSettings3D, start: GameVector3, end: GameVector3): number {
  const distance = Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
  const heightDelta = settings.heightFalloff * Math.abs(end.y - start.y);
  const average = heightDelta < 0.001 ? 1 - heightDelta / 2 + heightDelta * heightDelta / 6 : -Math.expm1(-heightDelta) / heightDelta;
  const exponent = Math.max(-60, Math.min(60, -settings.heightFalloff * (Math.min(start.y, end.y) - settings.baseHeight)));
  const opticalDepth = Math.min(80, settings.density * distance * Math.exp(exponent) * average);
  return Math.min(settings.maxOpacity, -Math.expm1(-opticalDepth));
}

const VERTEX_DECLARATIONS = `
uniform mat4 gameHeightFogCameraWorld;
varying vec3 vGameHeightFogPosition;
`;
const FRAGMENT_DECLARATIONS = `
uniform vec3 gameHeightFogOrigin;
uniform vec3 gameHeightFogDirection;
uniform bool gameHeightFogOrthographic;
uniform float gameHeightFogDensity;
uniform float gameHeightFogBase;
uniform float gameHeightFogFalloff;
uniform float gameHeightFogMaxOpacity;
varying vec3 vGameHeightFogPosition;
`;
const FOG_FRAGMENT = `
#ifdef USE_FOG
  vec3 gameFogStart = gameHeightFogOrigin;
  if (gameHeightFogOrthographic) {
    float gameFogDepth = max(0.0, dot(vGameHeightFogPosition - gameHeightFogOrigin, gameHeightFogDirection));
    gameFogStart = vGameHeightFogPosition - gameHeightFogDirection * gameFogDepth;
  }
  float gameFogDistance = length(vGameHeightFogPosition - gameFogStart);
  float gameFogDelta = gameHeightFogFalloff * abs(vGameHeightFogPosition.y - gameFogStart.y);
  float gameFogAverage = gameFogDelta < 0.001
    ? 1.0 - 0.5 * gameFogDelta + gameFogDelta * gameFogDelta / 6.0
    : (1.0 - exp(-min(60.0, gameFogDelta))) / gameFogDelta;
  float gameFogExponent = clamp(-gameHeightFogFalloff * (min(gameFogStart.y, vGameHeightFogPosition.y) - gameHeightFogBase), -60.0, 60.0);
  float gameFogOpticalDepth = min(80.0, gameHeightFogDensity * gameFogDistance * exp(gameFogExponent) * gameFogAverage);
  float gameFogOpacity = min(gameHeightFogMaxOpacity, 1.0 - exp(-gameFogOpticalDepth));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, gameFogOpacity);
#endif
`;

/** Owns reversible shader hooks. Configure after particle material creation and before the scene pass. */
export class GameHeightFog3D {
  private readonly materials = new Set<THREE.Material>();
  private readonly uniforms = {
    gameHeightFogCameraWorld: { value: new THREE.Matrix4() },
    gameHeightFogOrigin: { value: new THREE.Vector3() },
    gameHeightFogDirection: { value: new THREE.Vector3() },
    gameHeightFogOrthographic: { value: false },
    gameHeightFogDensity: { value: 0 }, gameHeightFogBase: { value: 0 },
    gameHeightFogFalloff: { value: 1 }, gameHeightFogMaxOpacity: { value: 1 }
  };

  configure(scene: THREE.Scene, camera: THREE.Camera, settings: GameHeightFogSettings3D | undefined): void {
    if (!settings) { this.dispose(); return; }
    this.uniforms.gameHeightFogCameraWorld.value.copy(camera.matrixWorld);
    camera.getWorldPosition(this.uniforms.gameHeightFogOrigin.value);
    camera.getWorldDirection(this.uniforms.gameHeightFogDirection.value);
    this.uniforms.gameHeightFogOrthographic.value = camera instanceof THREE.OrthographicCamera;
    this.uniforms.gameHeightFogDensity.value = settings.density;
    this.uniforms.gameHeightFogBase.value = settings.baseHeight;
    this.uniforms.gameHeightFogFalloff.value = settings.heightFalloff;
    this.uniforms.gameHeightFogMaxOpacity.value = settings.maxOpacity;
    const present = new Set<THREE.Material>();
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line)) { return; }
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!("fog" in material) || material.fog !== true) { continue; }
        present.add(material);
        if (!this.materials.has(material)) { this.attach(material); }
      }
    });
    for (const material of this.materials) {
      if (!present.has(material)) { this.restore(material); }
    }
  }

  private attach(material: THREE.Material): void {
    this.materials.add(material);
    setGameMaterialHook(material, "heightFog", (shader) => {
      if (!shader.vertexShader.includes("#include <fog_vertex>") || !shader.vertexShader.includes("#include <fog_pars_vertex>")
        || !shader.fragmentShader.includes("#include <fog_fragment>") || !shader.fragmentShader.includes("#include <fog_pars_fragment>")) {
        throw new Error("Height fog requires the game material fog shader hooks");
      }
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader.replace("#include <fog_pars_vertex>", `#include <fog_pars_vertex>${VERTEX_DECLARATIONS}`)
        .replace("#include <fog_vertex>", "#include <fog_vertex>\nvGameHeightFogPosition = (gameHeightFogCameraWorld * mvPosition).xyz;");
      shader.fragmentShader = shader.fragmentShader.replace("#include <fog_pars_fragment>", `#include <fog_pars_fragment>${FRAGMENT_DECLARATIONS}`)
        .replace("#include <fog_fragment>", FOG_FRAGMENT);
    }, ":nodetool-height-fog-1");
  }

  private restore(material: THREE.Material): void {
    removeGameMaterialHook(material, "heightFog");
    this.materials.delete(material);
  }

  dispose(): void {
    for (const material of this.materials) { this.restore(material); }
  }
}
