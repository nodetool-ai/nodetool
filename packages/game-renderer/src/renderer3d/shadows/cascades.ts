import * as THREE from "three";
import { CSMFrustum } from "three/addons/csm/CSMFrustum.js";
import * as csmShaderModule from "three/addons/csm/CSMShader.js";
import type { GameLight3D, GameShadowCascades3D } from "@nodetool-ai/protocol";

type CascadeMaterial = THREE.MeshStandardMaterial | THREE.MeshLambertMaterial | THREE.MeshPhongMaterial | THREE.MeshToonMaterial;

const cascadeDefines = ["USE_CSM", "CSM_CASCADES"] as const;
const up = new THREE.Vector3(0, 1, 0);
// @types/three declares CSMShader as an interface, but the module exports the chunk object.
const CSMShader = (csmShaderModule as { readonly CSMShader: { readonly lights_fragment_begin: string; readonly lights_pars_begin: string } }).CSMShader;
const origin = new THREE.Vector3();

/** Splits [near, far] into `count` ranges, blending even and logarithmic splits by `lambda`. Returns each split's end as a fraction of far. */
export function gameCascadeBreaks3D(count: number, near: number, far: number, lambda: number): number[] {
  const breaks: number[] = [];
  for (let index = 1; index < count; index++) {
    const uniform = (near + (far - near) * index / count) / far;
    const logarithmic = (near * (far / near) ** (index / count)) / far;
    breaks.push(uniform + (logarithmic - uniform) * lambda);
  }
  breaks.push(1);
  return breaks;
}

export function resizeGameShadowMap(shadow: THREE.LightShadow, size: number): void {
  if (shadow.mapSize.x === size && shadow.mapSize.y === size) { return; }
  shadow.mapSize.set(size, size);
  shadow.map?.depthTexture?.dispose();
  shadow.map?.dispose();
  shadow.map = null;
}

function isCascadeMaterial(material: THREE.Material): material is CascadeMaterial {
  return material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshLambertMaterial ||
    material instanceof THREE.MeshPhongMaterial || material instanceof THREE.MeshToonMaterial;
}

/**
 * Cascaded shadow maps for one directional light, after three's CSM addon. Each cascade is a
 * shadow-casting directional light that covers one depth range of the view. Materials receive the
 * cascade lighting chunk through their own onBeforeCompile, after any hook they already had, so three's
 * global shader chunks stay unchanged.
 */
export class GameCascadedShadows3D {
  private readonly group = new THREE.Group();
  private readonly lights: THREE.DirectionalLight[] = [];
  private readonly mainFrustum = new CSMFrustum({ webGL: true });
  private readonly frustums: CSMFrustum[] = [];
  private readonly lightSpaceFrustum = new CSMFrustum({ webGL: true });
  /** Each patched material with the hooks it had before, restored on release. */
  private readonly materials = new Map<CascadeMaterial, MaterialHooks>();
  private readonly uniforms = { CSM_cascades: { value: [] as THREE.Vector2[] }, cameraNear: { value: 0 }, shadowFar: { value: 0 } };
  private breaks: number[] = [];
  private frustumKey = "";
  private count = 0;
  private margin = 0;
  private readonly compile = (shader: THREE.WebGLProgramParametersWithUniforms): void => {
    Object.assign(shader.uniforms, this.uniforms);
    for (const stage of ["vertexShader", "fragmentShader"] as const) {
      shader[stage] = shader[stage].replace("#include <lights_pars_begin>", CSMShader.lights_pars_begin)
        .replace("#include <lights_fragment_begin>", CSMShader.lights_fragment_begin);
    }
  };

  constructor() { this.group.name = "game-shadow-cascades"; }

  update(scene: THREE.Scene, source: THREE.DirectionalLight, definition: Extract<GameLight3D, { kind: "directional" }>,
    settings: GameShadowCascades3D, mapSize: number, camera: THREE.Camera): void {
    if (this.count !== settings.count) { this.rebuild(settings.count); }
    if (this.group.parent !== scene) {
      scene.add(this.group);
      // Cascade lights must lead the directional shadow array, so the group renders before every other light.
      scene.children.splice(scene.children.indexOf(this.group), 1);
      scene.children.unshift(this.group);
    }
    this.margin = Math.max(100, settings.maxDistance);
    for (const light of this.lights) {
      light.color.copy(source.color);
      light.intensity = source.intensity;
      resizeGameShadowMap(light.shadow, mapSize);
      light.shadow.bias = definition.shadowBias ?? 0;
      light.shadow.normalBias = definition.shadowNormalBias ?? 0;
      light.shadow.camera.near = 1;
      light.shadow.camera.far = this.margin + settings.maxDistance * 4;
    }
    const projection = camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera ? camera : undefined;
    const near = projection?.near ?? 0.1;
    const far = Math.min(projection?.far ?? settings.maxDistance, settings.maxDistance);
    const key = `${camera.projectionMatrix.elements.join(",")}|${settings.split}|${settings.maxDistance}|${mapSize}`;
    if (key !== this.frustumKey) {
      this.frustumKey = key;
      this.breaks = gameCascadeBreaks3D(settings.count, near, far, settings.split);
      this.mainFrustum.setFromProjectionMatrix(camera.projectionMatrix, settings.maxDistance);
      this.mainFrustum.split(this.breaks, this.frustums);
      this.updateShadowBounds(mapSize);
      this.uniforms.cameraNear.value = near;
      this.uniforms.shadowFar.value = far;
      this.uniforms.CSM_cascades.value = this.breaks.map((end, index) => new THREE.Vector2(this.breaks[index - 1] ?? 0, end));
    }
    this.place(source, camera);
    this.setupMaterials(scene);
  }

  detach(): void {
    for (const [material, hooks] of this.materials) { releaseMaterial(material, hooks); }
    this.materials.clear();
    this.disposeLights();
    this.group.removeFromParent();
    this.count = 0;
    this.frustumKey = "";
  }

  private rebuild(count: number): void {
    this.disposeLights();
    for (let index = 0; index < count; index++) {
      const light = new THREE.DirectionalLight();
      light.castShadow = true;
      light.name = `game-shadow-cascade-${index}`;
      this.group.add(light, light.target);
      this.lights.push(light);
    }
    this.count = count;
    this.frustumKey = "";
    for (const [material, hooks] of this.materials) { releaseMaterial(material, hooks); }
    this.materials.clear();
  }

  private disposeLights(): void {
    for (const light of this.lights) {
      light.target.removeFromParent();
      light.removeFromParent();
      light.shadow.map?.depthTexture?.dispose();
      light.dispose();
    }
    this.lights.length = 0;
  }

  private updateShadowBounds(mapSize: number): void {
    for (const [index, frustum] of this.frustums.entries()) {
      const light = this.lights[index];
      if (!light) { continue; }
      const nearVertices = frustum.vertices.near;
      const farVertices = frustum.vertices.far;
      const first = farVertices[0];
      const diagonal = first.distanceTo(farVertices[2]) > first.distanceTo(nearVertices[2]) ? farVertices[2] : nearVertices[2];
      // Round the extent to whole texels so the map does not shimmer as the camera moves.
      const width = Math.ceil(first.distanceTo(diagonal) / 2 * mapSize) / mapSize * 2;
      Object.assign(light.shadow.camera, { left: -width / 2, right: width / 2, top: width / 2, bottom: -width / 2 });
      light.shadow.camera.updateProjectionMatrix();
    }
  }

  /** Centers each cascade's shadow camera on its slice of the view, snapped to the texel grid. */
  private place(source: THREE.DirectionalLight, camera: THREE.Camera): void {
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(source.quaternion).normalize();
    const orientation = new THREE.Matrix4().lookAt(origin, direction, Math.abs(direction.y) > 0.999 ? new THREE.Vector3(0, 0, 1) : up);
    const inverse = orientation.clone().invert();
    const cameraToLight = new THREE.Matrix4().multiplyMatrices(inverse, camera.matrixWorld);
    const box = new THREE.Box3();
    const center = new THREE.Vector3();
    for (const [index, frustum] of this.frustums.entries()) {
      const light = this.lights[index];
      if (!light) { continue; }
      const shadowCamera = light.shadow.camera;
      const texelWidth = (shadowCamera.right - shadowCamera.left) / light.shadow.mapSize.x;
      const texelHeight = (shadowCamera.top - shadowCamera.bottom) / light.shadow.mapSize.y;
      frustum.toSpace(cameraToLight, this.lightSpaceFrustum);
      box.makeEmpty();
      for (const vertex of [...this.lightSpaceFrustum.vertices.near, ...this.lightSpaceFrustum.vertices.far]) { box.expandByPoint(vertex); }
      box.getCenter(center);
      center.z = box.max.z + this.margin;
      center.x = Math.floor(center.x / texelWidth) * texelWidth;
      center.y = Math.floor(center.y / texelHeight) * texelHeight;
      center.applyMatrix4(orientation);
      light.position.copy(center);
      light.target.position.copy(center).add(direction);
      light.updateMatrixWorld();
      light.target.updateMatrixWorld();
    }
  }

  private setupMaterials(scene: THREE.Scene): void {
    const seen = new Set<CascadeMaterial>();
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) { return; }
      const materials: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!isCascadeMaterial(material)) { continue; }
        seen.add(material);
        if (this.materials.has(material)) { continue; }
        this.materials.set(material, this.patchMaterial(material));
      }
    });
    for (const [material, hooks] of this.materials) {
      if (!seen.has(material)) { releaseMaterial(material, hooks); this.materials.delete(material); }
    }
  }

  /** Runs the material's existing compile hook first, then adds the cascade chunk, and keys the program on both. */
  private patchMaterial(material: CascadeMaterial): MaterialHooks {
    const hooks: MaterialHooks = {
      onBeforeCompile: Object.hasOwn(material, "onBeforeCompile") ? material.onBeforeCompile : undefined,
      customProgramCacheKey: Object.hasOwn(material, "customProgramCacheKey") ? material.customProgramCacheKey : undefined
    };
    const previousCompile = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey;
    material.defines = { ...material.defines, USE_CSM: 1, CSM_CASCADES: this.count };
    material.onBeforeCompile = (shader, renderer) => {
      previousCompile.call(material, shader, renderer);
      this.compile(shader);
    };
    material.customProgramCacheKey = () => `${previousKey.call(material)}|game-shadow-cascades`;
    material.needsUpdate = true;
    return hooks;
  }
}

interface MaterialHooks {
  readonly onBeforeCompile?: THREE.Material["onBeforeCompile"];
  readonly customProgramCacheKey?: THREE.Material["customProgramCacheKey"];
}

function releaseMaterial(material: CascadeMaterial, hooks: MaterialHooks): void {
  if (material.defines) { for (const name of cascadeDefines) { delete material.defines[name]; } }
  // Own properties return to their previous values. Otherwise the prototype's hooks show through again.
  if (hooks.onBeforeCompile) { material.onBeforeCompile = hooks.onBeforeCompile; }
  else { Reflect.deleteProperty(material, "onBeforeCompile"); }
  if (hooks.customProgramCacheKey) { material.customProgramCacheKey = hooks.customProgramCacheKey; }
  else { Reflect.deleteProperty(material, "customProgramCacheKey"); }
  material.needsUpdate = true;
}
