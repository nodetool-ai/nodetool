import * as THREE from "three";

import type { RenderContext3D, RenderPipeline3D } from "../renderer3d/pipeline.js";
import { PARTICLE_INSTANCE_STRIDE_3D, packParticleBatches3D, type ParticleBatch3D, type ParticleBatchShape3D } from "./particles3d.js";
import type { GameParticleField } from "./render2d.js";

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
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  readonly buffer: THREE.InstancedInterleavedBuffer;
}

interface MeshDraw {
  readonly kind: "mesh";
  readonly mesh: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial | THREE.MeshBasicMaterial>;
  readonly opacity: THREE.InstancedBufferAttribute;
}

type Draw = QuadDraw | MeshDraw;

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Draws 3D particles: camera-facing and stretched billboards and instanced mesh shapes, one draw call per batch of
 * shape, blend and lighting. The pass runs before the scene pass and puts its meshes in the scene, so particles depth
 * test against the scene and take its fog and post-processing. When a billboard has a softness distance, the pass
 * first renders the scene's depth into a texture and the billboard fades out where it nears the geometry behind it.
 */
export class GameParticlePass3D {
  private readonly group = new THREE.Group();
  private readonly draws = new Map<string, Draw>();
  private batches: readonly ParticleBatch3D[] = [];
  private readonly quadGeometry = new THREE.PlaneGeometry(1, 1);
  private readonly depthMaterial = new THREE.MeshBasicMaterial({ colorWrite: false });
  private depthTarget: THREE.WebGLRenderTarget | null = null;
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

  /** Bytes of the scene depth target soft particles read, or 0 when no particle is soft. */
  get targetBytes(): number {
    return this.depthTarget ? this.depthTarget.width * this.depthTarget.height * 8 : 0;
  }

  dispose(): void {
    for (const draw of this.draws.values()) { this.release(draw); }
    this.draws.clear();
    this.group.removeFromParent();
    this.quadGeometry.dispose();
    this.depthMaterial.dispose();
    this.depthTarget?.dispose();
    this.depthTarget = null;
  }

  private prepare({ renderer, scene, camera }: RenderContext3D): void {
    if (this.group.parent !== scene) { scene.add(this.group); }
    const field = this.host.particles();
    camera.getWorldPosition(this.cameraPosition);
    camera.getWorldDirection(this.cameraForward);
    const packed = field
      ? packParticleBatches3D(field, { x: this.cameraPosition.x, y: this.cameraPosition.y, z: this.cameraPosition.z,
        forwardX: this.cameraForward.x, forwardY: this.cameraForward.y, forwardZ: this.cameraForward.z }, this.batches)
      : { batches: [], drawn: 0, soft: false };
    this.batches = packed.batches;
    this.drawn = packed.drawn;
    const used = new Set<string>();
    for (const batch of packed.batches) {
      used.add(batch.key);
      if (batch.shape === "quad") { this.updateQuads(batch); } else { this.updateMeshes(batch, batch.shape); }
    }
    for (const [key, draw] of this.draws) {
      if (!used.has(key)) { this.release(draw); this.draws.delete(key); }
    }
    const depth = packed.soft ? this.renderDepth(renderer, scene, camera) : null;
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
    if (!packed.soft && this.depthTarget) { this.depthTarget.dispose(); this.depthTarget = null; }
  }

  /** Renders the scene without particles into a depth texture, keeping every renderer setting it changes. */
  private renderDepth(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): THREE.DepthTexture {
    const size = renderer.getDrawingBufferSize(this.size);
    if (!this.depthTarget) {
      this.depthTarget = new THREE.WebGLRenderTarget(size.x, size.y, { depthBuffer: true, depthTexture: new THREE.DepthTexture(size.x, size.y) });
    } else if (this.depthTarget.width !== size.x || this.depthTarget.height !== size.y) {
      this.depthTarget.setSize(size.x, size.y);
    }
    const target = renderer.getRenderTarget();
    const background = scene.background;
    const override = scene.overrideMaterial;
    const shadowUpdate = renderer.shadowMap.autoUpdate;
    try {
      // The scene pass renders this frame's shadow maps. Depth needs none.
      renderer.shadowMap.autoUpdate = false;
      this.group.visible = false;
      scene.background = null;
      scene.overrideMaterial = this.depthMaterial;
      renderer.setRenderTarget(this.depthTarget);
      renderer.clear();
      renderer.render(scene, camera);
    } finally {
      renderer.shadowMap.autoUpdate = shadowUpdate;
      this.group.visible = true;
      scene.background = background;
      scene.overrideMaterial = override;
      renderer.setRenderTarget(target);
    }
    const depth = this.depthTarget.depthTexture;
    if (!depth) { throw new Error("Particle depth target has no depth texture"); }
    return depth;
  }

  private updateQuads(batch: ParticleBatch3D): void {
    let draw = this.draws.get(batch.key);
    if (draw?.kind === "quad" && draw.buffer.array.length < batch.data.length) { this.release(draw); this.draws.delete(batch.key); draw = undefined; }
    if (!draw) {
      draw = this.createQuads(batch);
      this.draws.set(batch.key, draw);
    }
    if (draw.kind !== "quad") { return; }
    (draw.buffer.array as Float32Array).set(batch.data.subarray(0, batch.count * PARTICLE_INSTANCE_STRIDE_3D));
    draw.buffer.needsUpdate = true;
    draw.mesh.geometry.instanceCount = batch.count;
  }

  private createQuads(batch: ParticleBatch3D): QuadDraw {
    const buffer = new THREE.InstancedInterleavedBuffer(new Float32Array(batch.data.length), PARTICLE_INSTANCE_STRIDE_3D);
    buffer.setUsage(THREE.DynamicDrawUsage);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = this.quadGeometry.index;
    geometry.setAttribute("position", this.quadGeometry.getAttribute("position"));
    geometry.setAttribute("uv", this.quadGeometry.getAttribute("uv"));
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
    return { kind: "quad", mesh, buffer };
  }

  private updateMeshes(batch: ParticleBatch3D, shape: Exclude<ParticleBatchShape3D, "quad">): void {
    let draw = this.draws.get(batch.key);
    if (draw?.kind === "mesh" && draw.mesh.instanceMatrix.count < batch.count) { this.release(draw); this.draws.delete(batch.key); draw = undefined; }
    if (!draw) {
      draw = this.createMeshes(batch, shape);
      this.draws.set(batch.key, draw);
    }
    if (draw.kind !== "mesh") { return; }
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
    const options = { transparent: true, depthWrite: batch.blend === "normal",
      blending: batch.blend === "additive" ? THREE.AdditiveBlending : THREE.NormalBlending };
    const material = batch.lit ? new THREE.MeshStandardMaterial({ ...options, roughness: 0.8, metalness: 0 }) : new THREE.MeshBasicMaterial(options);
    withInstanceOpacity(material);
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, this.color.setRGB(1, 1, 1));
    mesh.frustumCulled = false;
    mesh.name = `particles:${batch.key}`;
    this.group.add(mesh);
    return { kind: "mesh", mesh, opacity };
  }

  private release(draw: Draw): void {
    draw.mesh.removeFromParent();
    if (draw.kind === "quad") {
      // The index, position and uv attributes belong to the shared quad geometry, which the pass disposes once.
      draw.mesh.geometry.index = null;
      draw.mesh.geometry.deleteAttribute("position");
      draw.mesh.geometry.deleteAttribute("uv");
    } else {
      draw.mesh.dispose();
    }
    draw.mesh.geometry.dispose();
    draw.mesh.material.dispose();
  }
}
