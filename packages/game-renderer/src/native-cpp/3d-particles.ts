// Render-only port of particles/pass3d.ts. Simulation remains in the native C++ session.
import {
  AdditiveBlending,
  Box3,
  BoxGeometry,
  BufferGeometry,
  Camera,
  Color,
  DepthTexture,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InstancedMesh,
  InterleavedBufferAttribute,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NormalBlending,
  OctahedronGeometry,
  OrthographicCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  ShaderMaterial,
  SkinnedMesh,
  Sphere,
  SphereGeometry,
  TetrahedronGeometry,
  Texture,
  UniformsLib,
  UniformsUtils,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer
} from "three";

import type { NativeFrame3D } from "@nodetool-ai/protocol/native-game";
import {
  gameParticleEmitter,
  type GameParticleEmitter
} from "@nodetool-ai/protocol";
import type { ParticleView } from "../particles/simulator.js";
import {
  PARTICLE_INSTANCE_STRIDE_3D,
  packParticleBatches3D,
  type ParticleBatch3D,
  type ParticleBatchShape3D,
  type ParticleBounds3D
} from "../particles/particles3d.js";
import type { GameParticleField } from "../particles/render2d.js";
import { ParticleTransparency3D } from "../particles/transparency3d.js";

/** Pass name in `RenderPipeline3D`. It runs before the scene pass so particles draw with the scene and its post-processing. */
export const GAME_PARTICLE_PASS_3D = "particles";
export const GAME_PARTICLE_PASS_ORDER_3D = -0.5;

/** Renderer state the particle pass reads. Nothing here reaches simulation. */
export interface NativeParticlePassHost3D {
  readonly scene: Scene;
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
function meshGeometry(
  shape: Exclude<ParticleBatchShape3D, "quad">
): BufferGeometry {
  switch (shape) {
    case "box":
      return new BoxGeometry(1, 1, 1);
    case "sphere":
      return new SphereGeometry(0.5, 12, 8);
    case "tetrahedron":
      return new TetrahedronGeometry(0.5);
    case "octahedron":
      return new OctahedronGeometry(0.5);
  }
}

/** Multiplies each mesh particle's alpha by its own opacity, which three's instancing has no attribute for. */
function withInstanceOpacity(
  material: MeshStandardMaterial | MeshBasicMaterial
): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float particleOpacity;\nvarying float vParticleOpacity;"
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvParticleOpacity = particleOpacity;"
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vParticleOpacity;"
      )
      .replace(
        "#include <color_fragment>",
        "#include <color_fragment>\ndiffuseColor.a *= vParticleOpacity;"
      );
  };
  material.customProgramCacheKey = () => "game-particle-opacity";
}

interface QuadDraw {
  readonly kind: "quad";
  /** The prepare call that last used this draw. */
  frame: number;
  readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  readonly buffer: InstancedInterleavedBuffer;
}

interface MeshDraw {
  readonly kind: "mesh";
  frame: number;
  readonly mesh: InstancedMesh<
    BufferGeometry,
    MeshStandardMaterial | MeshBasicMaterial
  >;
  readonly opacity: InstancedBufferAttribute;
}

type Draw = QuadDraw | MeshDraw;

const UP = new Vector3(0, 1, 0);

/**
 * Draws 3D particles: camera-facing and stretched billboards and instanced mesh shapes, one draw call per contiguous
 * compatible run between scene-transparency depths. The pass runs before the scene pass and puts its meshes in the scene, so particles depth
 * test against the scene and take its fog and post-processing. When a billboard has a softness distance, the pass
 * first renders the scene's depth into a texture and the billboard fades out where it nears the geometry behind it.
 */
class NativeParticlePass3D {
  private readonly group = new Group();
  private readonly draws = new Map<string, Draw>();
  private readonly transparency = new ParticleTransparency3D();
  private renderer: WebGLRenderer | null = null;
  private batches: readonly ParticleBatch3D[] = [];
  private readonly quadGeometry = new PlaneGeometry(1, 1);
  /** Depth-only stand-ins for scene materials, so the depth pre-pass keeps each material's cut-outs and skips what never writes depth. */
  private readonly depthMaterials = new Map<Material, MeshBasicMaterial>();
  private readonly depthSeen = new Set<Material>();
  private readonly swapped: Array<[Mesh, Material | Material[]]> = [];
  /** Stands in for meshes that cannot affect a soft fade. Invisible materials are never drawn. */
  private readonly skippedDepth = new MeshBasicMaterial({
    visible: false
  });
  private readonly softBoxes: Box3[] = [];
  private readonly sphere = new Sphere();
  private depthTarget: WebGLRenderTarget | null = null;
  private frame = 0;
  private readonly size = new Vector2();
  private readonly cameraPosition = new Vector3();
  private readonly cameraForward = new Vector3();
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly velocity = new Vector3();
  private readonly scale = new Vector3();
  private readonly turn = new Quaternion();
  private readonly spin = new Quaternion();
  private readonly color = new Color();
  /** Particles drawn in the last frame. */
  drawn = 0;
  depthPasses = 0;

  constructor(private readonly host: NativeParticlePassHost3D) {
    this.group.name = "game-particles";
    host.scene.add(this.group);
  }

  /** Bytes of the scene depth target soft particles read. It stays allocated once made, until the pass is disposed. */
  get targetBytes(): number {
    return this.depthTarget
      ? this.depthTarget.width * this.depthTarget.height * 8
      : 0;
  }

  dispose(): void {
    this.renderer?.setTransparentSort(null);
    this.renderer = null;
    this.transparency.clear();
    for (const draw of this.draws.values()) {
      this.release(draw);
    }
    this.draws.clear();
    this.group.removeFromParent();
    this.quadGeometry.dispose();
    for (const material of this.depthMaterials.values()) {
      material.dispose();
    }
    this.depthMaterials.clear();
    this.skippedDepth.dispose();
    this.depthTarget?.dispose();
    this.depthTarget = null;
  }

  prepare(renderer: WebGLRenderer, scene: Scene, camera: Camera): void {
    const interpolation = 1;
    if (this.renderer !== renderer) {
      this.renderer?.setTransparentSort(null);
      this.renderer = renderer;
      renderer.setTransparentSort(this.transparency.compare);
    }
    this.transparency.clear();
    if (this.group.parent !== scene) {
      scene.add(this.group);
    }
    const field = this.host.particles();
    camera.getWorldPosition(this.cameraPosition);
    camera.getWorldDirection(this.cameraForward);
    const packed = field
      ? packParticleBatches3D(
          field,
          {
            x: this.cameraPosition.x,
            y: this.cameraPosition.y,
            z: this.cameraPosition.z,
            forwardX: this.cameraForward.x,
            forwardY: this.cameraForward.y,
            forwardZ: this.cameraForward.z
          },
          this.batches,
          interpolation,
          () => this.transparency.depths(scene, camera, this.group)
        )
      : { batches: [], drawn: 0, soft: false, softBounds: [] };
    this.batches = packed.batches;
    this.drawn = packed.drawn;
    this.frame += 1;
    for (const [order, batch] of packed.batches.entries()) {
      if (batch.shape === "quad") {
        this.updateQuads(batch);
      } else {
        this.updateMeshes(batch, batch.shape);
      }
      const draw = this.draws.get(batch.key);
      if (!draw) {
        throw new Error(`Particle run ${batch.key} was not prepared`);
      }
      this.transparency.add(draw.mesh, batch.depth, order, camera);
    }
    for (const [key, draw] of this.draws) {
      if (draw.frame !== this.frame) {
        this.release(draw);
        this.draws.delete(key);
      }
    }
    const depth = packed.soft
      ? this.renderDepth(renderer, scene, camera, packed.softBounds)
      : null;
    for (const draw of this.draws.values()) {
      if (draw.kind !== "quad") {
        continue;
      }
      const uniforms = draw.mesh.material.uniforms;
      uniforms["softDepth"].value = depth ? 1 : 0;
      uniforms["sceneDepth"].value = depth;
      uniforms["depthResolution"].value.copy(this.size);
      uniforms["cameraNear"].value =
        "near" in camera && typeof camera.near === "number" ? camera.near : 0.1;
      uniforms["cameraFar"].value =
        "far" in camera && typeof camera.far === "number" ? camera.far : 1000;
      uniforms["orthographicCamera"].value =
        camera instanceof OrthographicCamera ? 1 : 0;
    }
  }

  /**
   * Renders the scene's depth without particles into a texture, keeping every renderer and scene setting it changes.
   * Each mesh draws with a depth-only copy of its material, so alpha-tested cut-outs keep their holes, and transparent
   * or non-depth-writing materials are skipped as they write no depth in the scene pass either. Plain meshes whose bounds
   * miss every box in `bounds` are skipped too, as they cannot change a soft fade. Its submitted work remains in the
   * renderer counters so frame stats and budgets include this pass.
   */
  private renderDepth(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
    bounds: readonly ParticleBounds3D[]
  ): DepthTexture {
    this.depthPasses++;
    const size = renderer.getDrawingBufferSize(this.size);
    if (!this.depthTarget) {
      this.depthTarget = new WebGLRenderTarget(size.x, size.y, {
        depthBuffer: true,
        depthTexture: new DepthTexture(size.x, size.y)
      });
    } else if (
      this.depthTarget.width !== size.x ||
      this.depthTarget.height !== size.y
    ) {
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
      for (const [mesh, material] of this.swapped) {
        mesh.material = material;
      }
      this.swapped.length = 0;
      renderer.shadowMap.autoUpdate = shadowUpdate;
      this.group.visible = true;
      scene.background = background;
      renderer.setRenderTarget(target);
    }
    const depth = this.depthTarget.depthTexture;
    if (!depth) {
      throw new Error("Particle depth target has no depth texture");
    }
    return depth;
  }

  private swapDepthMaterials(
    scene: Scene,
    bounds: readonly ParticleBounds3D[]
  ): void {
    this.depthSeen.clear();
    this.softBoxes.length = 0;
    for (const box of bounds) {
      this.softBoxes.push(
        new Box3(new Vector3().copy(box.min), new Vector3().copy(box.max))
      );
    }
    scene.traverse((object) => {
      if (object === this.group || !(object instanceof Mesh)) {
        return;
      }
      const material: Material | Material[] = object.material;
      this.swapped.push([object, material]);
      if (this.outsideSoftBounds(object)) {
        // Swapping the material, not hiding the mesh, keeps any child meshes inside the bounds in the pass.
        for (const entry of Array.isArray(material) ? material : [material]) {
          this.depthSeen.add(entry);
        }
        object.material = this.skippedDepth;
        return;
      }
      object.material = Array.isArray(material)
        ? material.map((entry) => this.depthVariant(entry))
        : this.depthVariant(material);
    });
    for (const [material, variant] of this.depthMaterials) {
      if (!this.depthSeen.has(material)) {
        variant.dispose();
        this.depthMaterials.delete(material);
      }
    }
  }

  /** Plain meshes only: instanced, skinned and unculled meshes can draw outside their geometry's bounds. */
  private outsideSoftBounds(mesh: Mesh): boolean {
    if (
      mesh instanceof InstancedMesh ||
      mesh instanceof SkinnedMesh ||
      !mesh.frustumCulled
    ) {
      return false;
    }
    const geometry = mesh.geometry;
    if (!geometry.boundingSphere) {
      geometry.computeBoundingSphere();
    }
    if (!geometry.boundingSphere) {
      return false;
    }
    this.sphere.copy(geometry.boundingSphere).applyMatrix4(mesh.matrixWorld);
    return !this.softBoxes.some((box) => box.intersectsSphere(this.sphere));
  }

  private depthVariant(material: Material): MeshBasicMaterial {
    this.depthSeen.add(material);
    let variant = this.depthMaterials.get(material);
    if (!variant) {
      variant = new MeshBasicMaterial({ colorWrite: false });
      this.depthMaterials.set(material, variant);
    }
    variant.visible =
      material.visible && material.depthWrite && !material.transparent;
    variant.side = material.side;
    variant.alphaTest = material.alphaTest;
    variant.opacity = material.opacity;
    const vertexColors =
      "vertexColors" in material && material.vertexColors === true;
    if (variant.vertexColors !== vertexColors) {
      variant.vertexColors = vertexColors;
      variant.needsUpdate = true;
    }
    variant.map =
      "map" in material && material.map instanceof Texture
        ? material.map
        : null;
    variant.alphaMap =
      "alphaMap" in material && material.alphaMap instanceof Texture
        ? material.alphaMap
        : null;
    return variant;
  }

  private updateQuads(batch: ParticleBatch3D): void {
    let draw = this.draws.get(batch.key);
    if (
      draw?.kind === "quad" &&
      draw.buffer.array.length !== batch.data.length
    ) {
      this.release(draw);
      this.draws.delete(batch.key);
      draw = undefined;
    }
    if (!draw) {
      draw = this.createQuads(batch);
      this.draws.set(batch.key, draw);
    }
    if (draw.kind !== "quad") {
      return;
    }
    draw.frame = this.frame;
    draw.buffer.array.set(
      batch.data.subarray(0, batch.count * PARTICLE_INSTANCE_STRIDE_3D)
    );
    draw.buffer.needsUpdate = true;
    draw.mesh.geometry.instanceCount = batch.count;
  }

  private createQuads(batch: ParticleBatch3D): QuadDraw {
    const buffer = new InstancedInterleavedBuffer(
      new Float32Array(batch.data.length),
      PARTICLE_INSTANCE_STRIDE_3D
    );
    buffer.setUsage(DynamicDrawUsage);
    const geometry = new InstancedBufferGeometry();
    geometry.index = this.quadGeometry.index?.clone() ?? null;
    geometry.setAttribute(
      "position",
      this.quadGeometry.getAttribute("position").clone()
    );
    geometry.setAttribute("uv", this.quadGeometry.getAttribute("uv").clone());
    geometry.setAttribute(
      "particlePosition",
      new InterleavedBufferAttribute(buffer, 3, 0)
    );
    geometry.setAttribute(
      "particleVelocity",
      new InterleavedBufferAttribute(buffer, 3, 3)
    );
    geometry.setAttribute(
      "particleColor",
      new InterleavedBufferAttribute(buffer, 4, 6)
    );
    geometry.setAttribute(
      "particleShape",
      new InterleavedBufferAttribute(buffer, 4, 10)
    );
    geometry.setAttribute(
      "particleExtra",
      new InterleavedBufferAttribute(buffer, 2, 14)
    );
    const material = new ShaderMaterial({
      name: "GameParticleShader3D",
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        {
          sceneDepth: { value: null },
          depthResolution: { value: new Vector2(1, 1) },
          cameraNear: { value: 0.1 },
          cameraFar: { value: 1000 },
          softDepth: { value: 0 },
          orthographicCamera: { value: 0 }
        }
      ]),
      vertexShader: QUAD_VERTEX,
      fragmentShader: QUAD_FRAGMENT,
      transparent: true,
      depthWrite: false,
      fog: true,
      side: DoubleSide,
      blending: batch.blend === "additive" ? AdditiveBlending : NormalBlending
    });
    const mesh = new Mesh(geometry, material);
    // Particle positions live in instance attributes, so the quad's own bounds say nothing about where it draws.
    mesh.frustumCulled = false;
    mesh.name = `particles:${batch.key}`;
    this.group.add(mesh);
    return { kind: "quad", frame: this.frame, mesh, buffer };
  }

  private updateMeshes(
    batch: ParticleBatch3D,
    shape: Exclude<ParticleBatchShape3D, "quad">
  ): void {
    let draw = this.draws.get(batch.key);
    const capacity = batch.data.length / PARTICLE_INSTANCE_STRIDE_3D;
    if (draw?.kind === "mesh" && draw.mesh.instanceMatrix.count !== capacity) {
      this.release(draw);
      this.draws.delete(batch.key);
      draw = undefined;
    }
    if (!draw) {
      draw = this.createMeshes(batch, shape);
      this.draws.set(batch.key, draw);
    }
    if (draw.kind !== "mesh") {
      return;
    }
    draw.frame = this.frame;
    const data = batch.data;
    const opacity = draw.opacity.array;
    for (let index = 0; index < batch.count; index += 1) {
      const base = index * PARTICLE_INSTANCE_STRIDE_3D;
      this.position.set(data[base], data[base + 1], data[base + 2]);
      this.spin.setFromAxisAngle(UP, data[base + 11]);
      this.velocity.set(data[base + 3], data[base + 4], data[base + 5]);
      const speed = this.velocity.length();
      if (data[base + 15] > 0.5 && speed > 1e-6) {
        this.turn
          .setFromUnitVectors(UP, this.velocity.divideScalar(speed))
          .multiply(this.spin);
      } else {
        this.turn.copy(this.spin);
      }
      const size = data[base + 10];
      this.scale.set(size, size, size);
      draw.mesh.setMatrixAt(
        index,
        this.matrix.compose(this.position, this.turn, this.scale)
      );
      draw.mesh.setColorAt(
        index,
        this.color.setRGB(data[base + 6], data[base + 7], data[base + 8])
      );
      opacity[index] = data[base + 9];
    }
    draw.mesh.count = batch.count;
    draw.mesh.boundingSphere = null;
    draw.mesh.instanceMatrix.needsUpdate = true;
    if (draw.mesh.instanceColor) {
      draw.mesh.instanceColor.needsUpdate = true;
    }
    draw.opacity.needsUpdate = true;
  }

  private createMeshes(
    batch: ParticleBatch3D,
    shape: Exclude<ParticleBatchShape3D, "quad">
  ): MeshDraw {
    const capacity = batch.data.length / PARTICLE_INSTANCE_STRIDE_3D;
    const geometry = meshGeometry(shape);
    const opacity = new InstancedBufferAttribute(new Float32Array(capacity), 1);
    opacity.setUsage(DynamicDrawUsage);
    geometry.setAttribute("particleOpacity", opacity);
    const options = {
      transparent: true,
      depthWrite: false,
      blending: batch.blend === "additive" ? AdditiveBlending : NormalBlending
    };
    const material = batch.lit
      ? new MeshStandardMaterial({
          ...options,
          roughness: 0.8,
          metalness: 0
        })
      : new MeshBasicMaterial(options);
    withInstanceOpacity(material);
    const mesh = new InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.setColorAt(0, this.color.setRGB(1, 1, 1));
    mesh.frustumCulled = false;
    mesh.name = `particles:${batch.key}`;
    this.group.add(mesh);
    return { kind: "mesh", frame: this.frame, mesh, opacity };
  }

  private release(draw: Draw): void {
    draw.mesh.removeFromParent();
    if (draw.kind === "mesh") {
      draw.mesh.dispose();
    }
    draw.mesh.geometry.dispose();
    draw.mesh.material.dispose();
  }
}

/** Draws committed native samples. It never emits, integrates, or advances particle age. */
export class NativeParticles3D {
  private samples: NativeFrame3D["particles"] = [];
  private readonly emitters = new Map<
    string,
    Map<string, GameParticleEmitter[]>
  >();
  private readonly seen = new Set<GameParticleEmitter>();
  private readonly pass: NativeParticlePass3D;
  private readonly view: ParticleView = {
    entityId: "",
    emitterId: "",
    emitter: gameParticleEmitter.parse({ id: "native-presentation" }),
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    size: 0,
    rotation: 0,
    r: 0,
    g: 0,
    b: 0,
    opacity: 0,
    life: 0
  };
  private readonly field: GameParticleField = {
    forEachParticle: (visit) => {
      for (const sample of this.samples) {
        let entity = this.emitters.get(sample.entityId);
        if (!entity) {
          entity = new Map();
          this.emitters.set(sample.entityId, entity);
        }
        let styles = entity.get(sample.emitterId);
        if (!styles) {
          styles = [];
          entity.set(sample.emitterId, styles);
        }
        let emitter: GameParticleEmitter | undefined;
        for (const candidate of styles) {
          const a = candidate.render,
            b = sample.render;
          if (
            a &&
            candidate.blend === sample.blend &&
            candidate.unlit === sample.unlit &&
            candidate.softness === sample.softness &&
            a.kind === b.kind &&
            (a.kind !== "stretched" ||
              b.kind !== "stretched" ||
              (a.length === b.length && a.speedScale === b.speedScale))
          ) {
            emitter = candidate;
            break;
          }
        }
        if (!emitter) {
          emitter = gameParticleEmitter.parse({
            id: sample.emitterId,
            rate: 0,
            render: sample.render,
            blend: sample.blend,
            unlit: sample.unlit,
            softness: sample.softness
          });
          styles.push(emitter);
        }
        this.seen.add(emitter);
        const value = this.view;
        value.entityId = sample.entityId;
        value.emitterId = sample.emitterId;
        value.emitter = emitter;
        value.x = sample.position[0];
        value.y = sample.position[1];
        value.z = sample.position[2];
        value.vx = sample.velocity[0];
        value.vy = sample.velocity[1];
        value.vz = sample.velocity[2];
        value.size = sample.size;
        value.rotation = sample.rotation;
        value.r = sample.color[0];
        value.g = sample.color[1];
        value.b = sample.color[2];
        value.opacity = sample.opacity;
        value.life = sample.life;
        visit(value);
      }
    }
  };
  constructor(private readonly scene: Scene) {
    this.pass = new NativeParticlePass3D({
      scene,
      particles: () => (this.samples.length ? this.field : null)
    });
  }
  prepare(renderer: WebGLRenderer, camera: Camera, frame: NativeFrame3D): void {
    this.samples = frame.particles;
    this.seen.clear();
    this.pass.prepare(renderer, this.scene, camera);
    for (const [id, emitters] of this.emitters) {
      for (const [emitterId, styles] of emitters) {
        let write = 0;
        for (const style of styles) {
          if (this.seen.has(style)) {
            styles[write++] = style;
          }
        }
        styles.length = write;
        if (!write) {
          emitters.delete(emitterId);
        }
      }
      if (!emitters.size) {
        this.emitters.delete(id);
      }
    }
  }
  get count(): number {
    return this.pass.drawn;
  }
  get targetBytes(): number {
    return this.pass.targetBytes;
  }
  get depthPasses(): number {
    return this.pass.depthPasses;
  }
  dispose(): void {
    this.pass.dispose();
    this.emitters.clear();
    this.samples = [];
  }
}
