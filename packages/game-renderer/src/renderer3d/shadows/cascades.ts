import * as THREE from "three";
import { CSMFrustum } from "three/addons/csm/CSMFrustum.js";
import * as csmShaderModule from "three/addons/csm/CSMShader.js";
import type { GameLight3D, GameShadowCascades3D } from "@nodetool-ai/protocol";
import { removeGameMaterialHook, setGameMaterialHook } from "../material-hooks.js";

type CascadeMaterial = THREE.MeshStandardMaterial | THREE.MeshLambertMaterial | THREE.MeshPhongMaterial | THREE.MeshToonMaterial;

const cascadeDefines = ["USE_CSM", "CSM_CASCADES"] as const;
const up = new THREE.Vector3(0, 1, 0);
const forward = new THREE.Vector3(0, 0, 1);
// @types/three declares CSMShader as an interface, but the module exports the chunk object.
const CSMShader = (csmShaderModule as { readonly CSMShader: { readonly lights_fragment_begin: string; readonly lights_pars_begin: string } }).CSMShader;
const origin = new THREE.Vector3();
/** A cascade whose map would move by more than this share of its width re-renders this frame, regardless of its schedule. */
const CASCADE_DRIFT = 0.05;

/**
 * Whether cascade `index` re-renders its map on frame `frame`. The nearest cascade renders every frame, the second
 * every other frame, and the third and fourth alternate every fourth frame, so at most two cascades render per frame.
 */
export function gameCascadeDue3D(index: number, frame: number): boolean {
  if (index === 0) { return true; }
  if (index === 1) { return frame % 2 === 0; }
  return frame % 4 === (index === 2 ? 1 : 3);
}

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
  private readonly materials = new Set<CascadeMaterial>();
  private readonly uniforms = { CSM_cascades: { value: [] as THREE.Vector2[] }, cameraNear: { value: 0 }, shadowFar: { value: 0 } };
  private breaks: number[] = [];
  private frustumKey = "";
  /** Light-space centre each cascade map was last rendered at, or null before its first render. */
  private placed: (THREE.Vector3 | null)[] = [];
  private readonly direction = new THREE.Vector3();
  // Scratch objects for place(), which runs every frame.
  private readonly scratchDirection = new THREE.Vector3();
  private readonly orientation = new THREE.Matrix4();
  private readonly inverse = new THREE.Matrix4();
  private readonly cameraToLight = new THREE.Matrix4();
  private readonly box = new THREE.Box3();
  private readonly center = new THREE.Vector3();
  private readonly seen = new Set<CascadeMaterial>();
  private frame = 0;
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
      this.placed.fill(null);
    }
    this.place(source, camera);
  }

  detach(): void {
    for (const material of this.materials) { releaseMaterial(material); }
    this.materials.clear();
    this.disposeLights();
    this.group.removeFromParent();
    this.count = 0;
    this.frustumKey = "";
    this.placed = [];
  }

  /**
   * Patches the scene's lit materials for the cascades. The renderer calls it once per frame, after presentation passes
   * create their materials and before the scene pass. `update` does not walk the scene.
   */
  bindMaterials(scene: THREE.Scene): void {
    if (this.count > 0) { this.setupMaterials(scene); }
  }

  private rebuild(count: number): void {
    this.disposeLights();
    for (let index = 0; index < count; index++) {
      const light = new THREE.DirectionalLight();
      light.castShadow = true;
      // place() decides each frame whether this cascade's map re-renders.
      light.shadow.autoUpdate = false;
      light.name = `game-shadow-cascade-${index}`;
      this.group.add(light, light.target);
      this.lights.push(light);
    }
    this.count = count;
    this.frustumKey = "";
    this.placed = this.lights.map(() => null);
    for (const material of this.materials) { releaseMaterial(material); }
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

  /**
   * Centers each cascade's shadow camera on its slice of the view, snapped to the texel grid. Far cascades re-render on
   * a schedule (`gameCascadeDue3D`) and keep their last map and placement in between, unless the light turned or the
   * map would move by more than `CASCADE_DRIFT` of its width, so a cut or a teleport never shows a stale map.
   */
  private place(source: THREE.DirectionalLight, camera: THREE.Camera): void {
    const direction = this.scratchDirection.set(0, 0, -1).applyQuaternion(source.quaternion).normalize();
    if (!direction.equals(this.direction)) { this.direction.copy(direction); this.placed.fill(null); }
    const orientation = this.orientation.lookAt(origin, direction, Math.abs(direction.y) > 0.999 ? forward : up);
    const inverse = this.inverse.copy(orientation).invert();
    const cameraToLight = this.cameraToLight.multiplyMatrices(inverse, camera.matrixWorld);
    const box = this.box;
    const center = this.center;
    const frame = this.frame++;
    for (const [index, frustum] of this.frustums.entries()) {
      const light = this.lights[index];
      if (!light) { continue; }
      const shadowCamera = light.shadow.camera;
      const texelWidth = (shadowCamera.right - shadowCamera.left) / light.shadow.mapSize.x;
      const texelHeight = (shadowCamera.top - shadowCamera.bottom) / light.shadow.mapSize.y;
      frustum.toSpace(cameraToLight, this.lightSpaceFrustum);
      box.makeEmpty();
      for (const vertex of this.lightSpaceFrustum.vertices.near) { box.expandByPoint(vertex); }
      for (const vertex of this.lightSpaceFrustum.vertices.far) { box.expandByPoint(vertex); }
      box.getCenter(center);
      center.z = box.max.z + this.margin;
      center.x = Math.floor(center.x / texelWidth) * texelWidth;
      center.y = Math.floor(center.y / texelHeight) * texelHeight;
      const placed = this.placed[index];
      const drift = (shadowCamera.right - shadowCamera.left) * CASCADE_DRIFT;
      if (placed && light.shadow.map && !gameCascadeDue3D(index, frame) && placed.distanceToSquared(center) <= drift * drift) {
        light.shadow.needsUpdate = false;
        continue;
      }
      this.placed[index] = (placed ?? new THREE.Vector3()).copy(center);
      light.shadow.needsUpdate = true;
      center.applyMatrix4(orientation);
      light.position.copy(center);
      light.target.position.copy(center).add(direction);
      light.updateMatrixWorld();
      light.target.updateMatrixWorld();
    }
  }

  private setupMaterials(scene: THREE.Scene): void {
    const seen = this.seen;
    seen.clear();
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) { return; }
      const materials: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!isCascadeMaterial(material)) { continue; }
        seen.add(material);
        if (this.materials.has(material)) { continue; }
        this.patchMaterial(material);
        this.materials.add(material);
      }
    });
    for (const material of this.materials) {
      if (!seen.has(material)) { releaseMaterial(material); this.materials.delete(material); }
    }
  }

  /** Runs the material's existing compile hook first, then adds the cascade chunk, and keys the program on both. */
  private patchMaterial(material: CascadeMaterial): void {
    material.defines = { ...material.defines, USE_CSM: 1, CSM_CASCADES: this.count };
    setGameMaterialHook(material, "cascades", this.compile, "|game-shadow-cascades");
  }
}
function releaseMaterial(material: CascadeMaterial): void {
  if (material.defines) { for (const name of cascadeDefines) { delete material.defines[name]; } }
  removeGameMaterialHook(material, "cascades");
}
