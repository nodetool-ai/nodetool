import * as THREE from "three";

import type { RenderContext3D, RenderPipeline3D } from "../renderer3d/pipeline.js";
import { PARTICLE_INSTANCE_STRIDE_3D, packParticleBatches3D, type ParticleBatch3D, type ParticleBatchShape3D, type ParticleBounds3D } from "./particles3d.js";
import type { GameParticleField } from "./render2d.js";
import { ParticleTransparency3D } from "./transparency3d.js";

/** Pass name in `RenderPipeline3D`. It runs before the scene pass so particles draw with the scene and its post-processing. */
export const GAME_PARTICLE_PASS_3D = "particles";
export const GAME_PARTICLE_PASS_ORDER_3D = -0.5;

/** Renderer state the particle pass reads. Nothing here reaches simulation. */
export interface GameParticlePassHost3D {
  readonly scene: THREE.Scene;
  /** The particles to draw this frame, or null to draw none. */
  particles(): GameParticleField | null;
}

const QUAD_VERTEX = `#include <common>
#include <fog_pars_vertex>
attribute vec3 particlePosition;
attribute vec3 particleVelocity;
attribute vec4 particleColor;
attribute vec4 particleShape;
attribute vec2 particleExtra;
varying vec2 vUv;
varying vec4 vColor;
varying float vSoftness;
varying float vViewDepth;
void main() {
  vUv = uv;
  vColor = particleColor;
  vSoftness = particleExtra.x;
  vec4 mvPosition = viewMatrix * vec4(particlePosition, 1.0);
  float size = particleShape.x;
  vec2 corner = position.xy;
  vec2 offset;
  if (particleExtra.y > 0.5) {
    vec3 viewVelocity = (viewMatrix * vec4(particleVelocity, 0.0)).xyz;
    float planar = length(viewVelocity.xy);
    vec2 along = planar > 1e-5 ? viewVelocity.xy / planar : vec2(0.0, 1.0);
    vec2 across = vec2(along.y, -along.x);
    float stretched = max(size * particleShape.z + length(particleVelocity) * particleShape.w, 1e-4);
    offset = across * corner.x * size + along * corner.y * stretched;
  } else {
    float c = cos(particleShape.y);
    float s = sin(particleShape.y);
    offset = vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y) * size;
  }
  mvPosition.xy += offset;
  vViewDepth = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const QUAD_FRAGMENT = `#include <common>
#include <packing>
#include <fog_pars_fragment>
uniform sampler2D sceneDepth;
uniform vec2 depthResolution;
uniform float cameraNear;
uniform float cameraFar;
uniform float softDepth;
uniform float orthographicCamera;
varying vec2 vUv;
varying vec4 vColor;
varying float vSoftness;
varying float vViewDepth;
void main() {
  float falloff = clamp(1.0 - length(vUv - 0.5) * 2.0, 0.0, 1.0);
  float alpha = vColor.a * falloff * falloff * (3.0 - 2.0 * falloff);
  if (softDepth > 0.5 && vSoftness > 0.0) {
    float depth = texture2D(sceneDepth, gl_FragCoord.xy / depthResolution).x;
    float sceneViewZ = orthographicCamera > 0.5 ? orthographicDepthToViewZ(depth, cameraNear, cameraFar) : perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
    alpha *= clamp((-sceneViewZ - vViewDepth) / vSoftness, 0.0, 1.0);
  }
  if (alpha <= 0.0) { discard; }
  gl_FragColor = vec4(vColor.rgb, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** Unit-sized geometry for each mesh particle shape: one unit across, centred on the particle. */
function meshGeometry(shape: Exclude<ParticleBatchShape3D, "quad">): THREE.BufferGeometry {
  switch (shape) {
    case "box": return new THREE.BoxGeometry(1, 1, 1);
    case "sphere": return new THREE.SphereGeometry(0.5, 12, 8);
    case "tetrahedron": return new THREE.TetrahedronGeometry(0.5);
    case "octahedron": return new THREE.OctahedronGeometry(0.5);
  }
}

/** Multiplies each mesh particle's alpha by its own opacity, which three's instancing has no attribute for. */
function withInstanceOpacity(material: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float particleOpacity;\nvarying float vParticleOpacity;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvParticleOpacity = particleOpacity;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vParticleOpacity;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= vParticleOpacity;");
  };
  material.customProgramCacheKey = () => "game-particle-opacity";
}

interface QuadDraw {
  readonly kind: "quad";
  /** The prepare call that last used this draw. */
  frame: number;
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  readonly buffer: THREE.InstancedInterleavedBuffer;
}

interface MeshDraw {
  readonly kind: "mesh";
  frame: number;
  readonly mesh: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial | THREE.MeshBasicMaterial>;
  readonly opacity: THREE.InstancedBufferAttribute;
}

type Draw = QuadDraw | MeshDraw;

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Draws 3D particles: camera-facing and stretched billboards and instanced mesh shapes, one draw call per contiguous
 * compatible run between scene-transparency depths. The pass runs before the scene pass and puts its meshes in the scene, so particles depth
 * test against the scene and take its fog and post-processing. When a billboard has a softness distance, the pass
 * first renders the scene's depth into a texture and the billboard fades out where it nears the geometry behind it.
 */
export class GameParticlePass3D {
  private readonly group = new THREE.Group();
  private readonly draws = new Map<string, Draw>();
  private readonly transparency = new ParticleTransparency3D();
  private renderer: THREE.WebGLRenderer | null = null;
  private batches: readonly ParticleBatch3D[] = [];
  private readonly quadGeometry = new THREE.PlaneGeometry(1, 1);
  /** Depth-only stand-ins for scene materials, so the depth pre-pass keeps each material's cut-outs and skips what never writes depth. */
  private readonly depthMaterials = new Map<THREE.Material, THREE.MeshBasicMaterial>();
  private readonly depthSeen = new Set<THREE.Material>();
  private readonly swapped: Array<[THREE.Mesh, THREE.Material | THREE.Material[]]> = [];
  /** Stands in for meshes that cannot affect a soft fade. Invisible materials are never drawn. */
  private readonly skippedDepth = new THREE.MeshBasicMaterial({ visible: false });
  private readonly softBoxes: THREE.Box3[] = [];
  private readonly sphere = new THREE.Sphere();
  private depthTarget: THREE.WebGLRenderTarget | null = null;
  private frame = 0;
  private readonly size = new THREE.Vector2();
  private readonly cameraPosition = new THREE.Vector3();
  private readonly cameraForward = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly turn = new THREE.Quaternion();
  private readonly spin = new THREE.Quaternion();
  private readonly color = new THREE.Color();
  /** Particles drawn in the last frame. */
  drawn = 0;

  constructor(pipeline: RenderPipeline3D, private readonly host: GameParticlePassHost3D) {
    this.group.name = "game-particles";
    host.scene.add(this.group);
    pipeline.register({ name: GAME_PARTICLE_PASS_3D, order: GAME_PARTICLE_PASS_ORDER_3D, render: (context) => this.prepare(context) });
  }

  /** Bytes of the scene depth target soft particles read. It stays allocated once made, until the pass is disposed. */
  get targetBytes(): number {
    return this.depthTarget ? this.depthTarget.width * this.depthTarget.height * 8 : 0;
  }

  dispose(): void {
    this.renderer?.setTransparentSort(null);
    this.renderer = null;
    this.transparency.clear();
    for (const draw of this.draws.values()) { this.release(draw); }
    this.draws.clear();
    this.group.removeFromParent();
    this.quadGeometry.dispose();
    for (const material of this.depthMaterials.values()) { material.dispose(); }
    this.depthMaterials.clear();
    this.skippedDepth.dispose();
    this.depthTarget?.dispose();
    this.depthTarget = null;
  }

  private prepare({ renderer, scene, camera, interpolation = 1 }: RenderContext3D): void {
    if (this.renderer !== renderer) {
      this.renderer?.setTransparentSort(null);
      this.renderer = renderer;
      renderer.setTransparentSort(this.transparency.compare);
    }
    this.transparency.clear();
    if (this.group.parent !== scene) { scene.add(this.group); }
    const field = this.host.particles();
    camera.getWorldPosition(this.cameraPosition);
    camera.getWorldDirection(this.cameraForward);
    const packed = field
      ? packParticleBatches3D(field, { x: this.cameraPosition.x, y: this.cameraPosition.y, z: this.cameraPosition.z,
        forwardX: this.cameraForward.x, forwardY: this.cameraForward.y, forwardZ: this.cameraForward.z }, this.batches, interpolation,
      () => this.transparency.depths(scene, camera, this.group))
      : { batches: [], drawn: 0, soft: false, softBounds: [] };
    this.batches = packed.batches;
    this.drawn = packed.drawn;
    this.frame += 1;
    for (const [order, batch] of packed.batches.entries()) {
      if (batch.shape === "quad") { this.updateQuads(batch); } else { this.updateMeshes(batch, batch.shape); }
      const draw = this.draws.get(batch.key);
      if (!draw) { throw new Error(`Particle run ${batch.key} was not prepared`); }
      this.transparency.add(draw.mesh, batch.depth, order, camera);
    }
    for (const [key, draw] of this.draws) {
      if (draw.frame !== this.frame) { this.release(draw); this.draws.delete(key); }
    }
    const depth = packed.soft ? this.renderDepth(renderer, scene, camera, packed.softBounds) : null;
    for (const draw of this.draws.values()) {
      if (draw.kind !== "quad") { continue; }
      const uniforms = draw.mesh.material.uniforms;
      uniforms["softDepth"]!.value = depth ? 1 : 0;
      uniforms["sceneDepth"]!.value = depth;
      uniforms["depthResolution"]!.value.copy(this.size);
      uniforms["cameraNear"]!.value = "near" in camera && typeof camera.near === "number" ? camera.near : 0.1;
      uniforms["cameraFar"]!.value = "far" in camera && typeof camera.far === "number" ? camera.far : 1000;
      uniforms["orthographicCamera"]!.value = camera instanceof THREE.OrthographicCamera ? 1 : 0;
    }
  }

  /**
   * Renders the scene's depth without particles into a texture, keeping every renderer and scene setting it changes.
   * Each mesh draws with a depth-only copy of its material, so alpha-tested cut-outs keep their holes, and transparent
   * or non-depth-writing materials are skipped as they write no depth in the scene pass either. Plain meshes whose bounds
   * miss every box in `bounds` are skipped too, as they cannot change a soft fade. Its submitted work remains in the
   * renderer counters so frame stats and budgets include this pass.
   */
  private renderDepth(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, bounds: readonly ParticleBounds3D[]): THREE.DepthTexture {
    const size = renderer.getDrawingBufferSize(this.size);
    if (!this.depthTarget) {
      this.depthTarget = new THREE.WebGLRenderTarget(size.x, size.y, { depthBuffer: true, depthTexture: new THREE.DepthTexture(size.x, size.y) });
    } else if (this.depthTarget.width !== size.x || this.depthTarget.height !== size.y) {
      this.depthTarget.setSize(size.x, size.y);
    }
    const target = renderer.getRenderTarget();
    const background = scene.background;
    const shadowUpdate = renderer.shadowMap.autoUpdate;
    try {
      // The scene pass renders this frame's shadow maps. Depth needs none.
      renderer.shadowMap.autoUpdate = false;
      this.group.visible = false;
      scene.background = null;
      this.swapDepthMaterials(scene, bounds);
      renderer.setRenderTarget(this.depthTarget);
      renderer.clear();
      renderer.render(scene, camera);
    } finally {
      for (const [mesh, material] of this.swapped) { mesh.material = material; }
      this.swapped.length = 0;
      renderer.shadowMap.autoUpdate = shadowUpdate;
      this.group.visible = true;
      scene.background = background;
      renderer.setRenderTarget(target);
    }
    const depth = this.depthTarget.depthTexture;
    if (!depth) { throw new Error("Particle depth target has no depth texture"); }
    return depth;
  }

  private swapDepthMaterials(scene: THREE.Scene, bounds: readonly ParticleBounds3D[]): void {
    this.depthSeen.clear();
    this.softBoxes.length = 0;
    for (const box of bounds) { this.softBoxes.push(new THREE.Box3(new THREE.Vector3().copy(box.min), new THREE.Vector3().copy(box.max))); }
    scene.traverse((object) => {
      if (object === this.group || !(object instanceof THREE.Mesh)) { return; }
      const material: THREE.Material | THREE.Material[] = object.material;
      this.swapped.push([object, material]);
      if (this.outsideSoftBounds(object)) {
        // Swapping the material, not hiding the mesh, keeps any child meshes inside the bounds in the pass.
        for (const entry of Array.isArray(material) ? material : [material]) { this.depthSeen.add(entry); }
        object.material = this.skippedDepth;
        return;
      }
      object.material = Array.isArray(material) ? material.map((entry) => this.depthVariant(entry)) : this.depthVariant(material);
    });
    for (const [material, variant] of this.depthMaterials) {
      if (!this.depthSeen.has(material)) { variant.dispose(); this.depthMaterials.delete(material); }
    }
  }

  /** Plain meshes only: instanced, skinned and unculled meshes can draw outside their geometry's bounds. */
  private outsideSoftBounds(mesh: THREE.Mesh): boolean {
    if (mesh instanceof THREE.InstancedMesh || mesh instanceof THREE.SkinnedMesh || !mesh.frustumCulled) { return false; }
    const geometry = mesh.geometry;
    if (!geometry.boundingSphere) { geometry.computeBoundingSphere(); }
    if (!geometry.boundingSphere) { return false; }
    this.sphere.copy(geometry.boundingSphere).applyMatrix4(mesh.matrixWorld);
    return !this.softBoxes.some((box) => box.intersectsSphere(this.sphere));
  }

  private depthVariant(material: THREE.Material): THREE.MeshBasicMaterial {
    this.depthSeen.add(material);
    let variant = this.depthMaterials.get(material);
    if (!variant) {
      variant = new THREE.MeshBasicMaterial({ colorWrite: false });
      this.depthMaterials.set(material, variant);
    }
    variant.visible = material.visible && material.depthWrite && !material.transparent;
    variant.side = material.side;
    variant.alphaTest = material.alphaTest;
    variant.opacity = material.opacity;
    const vertexColors = "vertexColors" in material && material.vertexColors === true;
    if (variant.vertexColors !== vertexColors) { variant.vertexColors = vertexColors; variant.needsUpdate = true; }
    variant.map = "map" in material && material.map instanceof THREE.Texture ? material.map : null;
    variant.alphaMap = "alphaMap" in material && material.alphaMap instanceof THREE.Texture ? material.alphaMap : null;
    return variant;
  }

  private updateQuads(batch: ParticleBatch3D): void {
    let draw = this.draws.get(batch.key);
    if (draw?.kind === "quad" && draw.buffer.array.length !== batch.data.length) {
      this.release(draw); this.draws.delete(batch.key); draw = undefined;
    }
    if (!draw) {
      draw = this.createQuads(batch);
      this.draws.set(batch.key, draw);
    }
    if (draw.kind !== "quad") { return; }
    draw.frame = this.frame;
    (draw.buffer.array as Float32Array).set(batch.data.subarray(0, batch.count * PARTICLE_INSTANCE_STRIDE_3D));
    draw.buffer.needsUpdate = true;
    draw.mesh.geometry.instanceCount = batch.count;
  }

  private createQuads(batch: ParticleBatch3D): QuadDraw {
    const buffer = new THREE.InstancedInterleavedBuffer(new Float32Array(batch.data.length), PARTICLE_INSTANCE_STRIDE_3D);
    buffer.setUsage(THREE.DynamicDrawUsage);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = this.quadGeometry.index?.clone() ?? null;
    geometry.setAttribute("position", this.quadGeometry.getAttribute("position").clone());
    geometry.setAttribute("uv", this.quadGeometry.getAttribute("uv").clone());
    geometry.setAttribute("particlePosition", new THREE.InterleavedBufferAttribute(buffer, 3, 0));
    geometry.setAttribute("particleVelocity", new THREE.InterleavedBufferAttribute(buffer, 3, 3));
    geometry.setAttribute("particleColor", new THREE.InterleavedBufferAttribute(buffer, 4, 6));
    geometry.setAttribute("particleShape", new THREE.InterleavedBufferAttribute(buffer, 4, 10));
    geometry.setAttribute("particleExtra", new THREE.InterleavedBufferAttribute(buffer, 2, 14));
    const material = new THREE.ShaderMaterial({
      name: "GameParticleShader3D",
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        sceneDepth: { value: null }, depthResolution: { value: new THREE.Vector2(1, 1) }, cameraNear: { value: 0.1 },
        cameraFar: { value: 1000 }, softDepth: { value: 0 }, orthographicCamera: { value: 0 }
      }]),
      vertexShader: QUAD_VERTEX,
      fragmentShader: QUAD_FRAGMENT,
      transparent: true,
      depthWrite: false,
      fog: true,
      side: THREE.DoubleSide,
      blending: batch.blend === "additive" ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    const mesh = new THREE.Mesh(geometry, material);
    // Particle positions live in instance attributes, so the quad's own bounds say nothing about where it draws.
    mesh.frustumCulled = false;
    mesh.name = `particles:${batch.key}`;
    this.group.add(mesh);
    return { kind: "quad", frame: this.frame, mesh, buffer };
  }

  private updateMeshes(batch: ParticleBatch3D, shape: Exclude<ParticleBatchShape3D, "quad">): void {
    let draw = this.draws.get(batch.key);
    const capacity = batch.data.length / PARTICLE_INSTANCE_STRIDE_3D;
    if (draw?.kind === "mesh" && draw.mesh.instanceMatrix.count !== capacity) {
      this.release(draw); this.draws.delete(batch.key); draw = undefined;
    }
    if (!draw) {
      draw = this.createMeshes(batch, shape);
      this.draws.set(batch.key, draw);
    }
    if (draw.kind !== "mesh") { return; }
    draw.frame = this.frame;
    const data = batch.data;
    const opacity = draw.opacity.array as Float32Array;
    for (let index = 0; index < batch.count; index += 1) {
      const base = index * PARTICLE_INSTANCE_STRIDE_3D;
      this.position.set(data[base]!, data[base + 1]!, data[base + 2]!);
      this.spin.setFromAxisAngle(UP, data[base + 11]!);
      this.velocity.set(data[base + 3]!, data[base + 4]!, data[base + 5]!);
      const speed = this.velocity.length();
      if (data[base + 15]! > 0.5 && speed > 1e-6) {
        this.turn.setFromUnitVectors(UP, this.velocity.divideScalar(speed)).multiply(this.spin);
      } else {
        this.turn.copy(this.spin);
      }
      const size = data[base + 10]!;
      this.scale.set(size, size, size);
      draw.mesh.setMatrixAt(index, this.matrix.compose(this.position, this.turn, this.scale));
      draw.mesh.setColorAt(index, this.color.setRGB(data[base + 6]!, data[base + 7]!, data[base + 8]!));
      opacity[index] = data[base + 9]!;
    }
    draw.mesh.count = batch.count;
    draw.mesh.boundingSphere = null;
    draw.mesh.instanceMatrix.needsUpdate = true;
    if (draw.mesh.instanceColor) { draw.mesh.instanceColor.needsUpdate = true; }
    draw.opacity.needsUpdate = true;
  }

  private createMeshes(batch: ParticleBatch3D, shape: Exclude<ParticleBatchShape3D, "quad">): MeshDraw {
    const capacity = batch.data.length / PARTICLE_INSTANCE_STRIDE_3D;
    const geometry = meshGeometry(shape);
    const opacity = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    opacity.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("particleOpacity", opacity);
    const options = { transparent: true, depthWrite: false,
      blending: batch.blend === "additive" ? THREE.AdditiveBlending : THREE.NormalBlending };
    const material = batch.lit ? new THREE.MeshStandardMaterial({ ...options, roughness: 0.8, metalness: 0 }) : new THREE.MeshBasicMaterial(options);
    withInstanceOpacity(material);
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, this.color.setRGB(1, 1, 1));
    mesh.frustumCulled = false;
    mesh.name = `particles:${batch.key}`;
    this.group.add(mesh);
    return { kind: "mesh", frame: this.frame, mesh, opacity };
  }

  private release(draw: Draw): void {
    draw.mesh.removeFromParent();
    if (draw.kind === "mesh") { draw.mesh.dispose(); }
    draw.mesh.geometry.dispose();
    draw.mesh.material.dispose();
  }
}
