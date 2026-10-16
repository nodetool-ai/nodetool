import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { gameDocument3D, gameInputFrame3D, gameParticleEmitter, gameParticles, type GameParticleEmitter, type GameRenderFrame3D } from "@nodetool-ai/protocol";
import { createGameSession3D } from "@nodetool-ai/game-runtime";

import {
  GameParticles3D,
  PARTICLE_INSTANCE_STRIDE_3D,
  ParticleSimulator,
  gameParticleFieldFromSamples3D,
  gameParticleSamples3D,
  packParticleBatches3D,
  srgbToLinear,
  type GameParticleField,
  type ParticleView,
  type ParticleViewer3D
} from "../src/index.js";
import { GAME_PARTICLE_PASS_3D, GameParticlePass3D } from "../src/particles/pass3d.js";
import { RenderPipeline3D, type RenderContext3D } from "../src/renderer3d/pipeline.js";
import type { GamePostProcessor3D } from "../src/renderer3d/passes/post-processing.js";
import { blockoutFrame } from "./fixtures/game3d.js";

const TICK = 1 / 60;
const IDENTITY = [0, 0, 0, 1] as const;
/** At the origin looking down -Z, like a default three.js camera. */
const VIEWER: ParticleViewer3D = { x: 0, y: 0, z: 0, forwardX: 0, forwardY: 0, forwardZ: -1 };

function emitter(value: Record<string, unknown>): GameParticleEmitter {
  return gameParticleEmitter.parse({ id: "fx", ...value });
}

function view(definition: GameParticleEmitter, value: Partial<ParticleView> = {}): ParticleView {
  return { entityId: "torch", emitterId: definition.id, emitter: definition, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    size: 1, rotation: 0, r: 1, g: 1, b: 1, opacity: 1, life: 0, ...value };
}

function field(particles: readonly ParticleView[]): GameParticleField {
  return { forEachParticle: (visit) => particles.forEach((particle) => visit(particle)) };
}

function particle(data: Float32Array, index: number): number[] {
  return [...data.subarray(index * PARTICLE_INSTANCE_STRIDE_3D, (index + 1) * PARTICLE_INSTANCE_STRIDE_3D)];
}

function torchDocument() {
  return gameDocument3D.parse({
    schemaVersion: 3, engineVersion: "2", dimension: "3d", id: "particles3d", revision: "draft", entrySceneId: "scene", tickRate: 60,
    presentation: { aspectRatio: 1, hudWidth: 100, hudHeight: 100 }, inputActions: [], assets: {},
    scenes: [{ id: "scene", name: "Scene", activeCameraId: "camera", entities: [
      { id: "camera", transform3d: {}, camera3d: { projection: { kind: "perspective" } } },
      { id: "torch", transform3d: { position: { x: 1, y: 2, z: 3 } },
        particles: { emitters: [
          { id: "sparks", rate: 30, speed: { min: 1, max: 3 }, shape: { kind: "cone", angle: 30 }, lifetime: 2, blend: "additive",
            render: { kind: "stretched", length: 2 }, softness: 0.5 },
          { id: "burst", playOnStart: false, rate: 0, lifetime: 10, speed: 0, render: { kind: "mesh", shape: "box" } }
        ] },
        behaviors: [{ kind: "script", maxTickMs: 20, source: "({tick}) => ({ state: null, commands: tick === 0 ? [{ kind: 'emitParticles', emitter: 'burst', count: 4 }] : [] })" }] }
    ] }]
  });
}

describe("3D particle emitter schema", () => {
  it("defaults stretch and mesh settings and bounds softness", () => {
    expect(emitter({ render: { kind: "stretched" } }).render).toEqual({ kind: "stretched", length: 1, speedScale: 0.1 });
    expect(emitter({ render: { kind: "mesh", shape: "octahedron" } }).render).toEqual({ kind: "mesh", shape: "octahedron", align: "world" });
    expect(emitter({}).render).toBeUndefined();
    expect(gameParticleEmitter.safeParse({ id: "fx", softness: -1 }).success).toBe(false);
    expect(gameParticleEmitter.safeParse({ id: "fx", render: { kind: "mesh", shape: "teapot" } }).success).toBe(false);
  });
});

describe("particle velocity in the simulator view", () => {
  it("reports world velocity scaled by speedOverLifetime, rotated for local space", () => {
    const turned = [0, 0, Math.SQRT1_2, Math.SQRT1_2] as const;
    const simulator = new ParticleSimulator({ dimension: "3d" });
    const particles = gameParticles.parse({ emitters: [
      { id: "world", rate: 0, bursts: [{ count: 1 }], shape: { kind: "cone", angle: 0 }, speed: 4, lifetime: 1, speedOverLifetime: [{ t: 0, value: 0.5 }] },
      { id: "local", rate: 0, bursts: [{ count: 1 }], shape: { kind: "cone", angle: 0 }, speed: 2, lifetime: 1, space: "local" }
    ] });
    simulator.sync([{ entityId: "jet", position: { x: 0, y: 0, z: 0 }, rotation: turned, particles }]);
    simulator.step(TICK);
    const seen = new Map<string, ParticleView>();
    simulator.forEachParticle((value) => seen.set(value.emitterId, { ...value }));
    // A quarter turn about Z sends local +Y to world -X.
    expect(seen.get("world")?.vx).toBeCloseTo(-2, 9);
    expect(seen.get("world")?.vy).toBeCloseTo(0, 9);
    expect(seen.get("local")?.vx).toBeCloseTo(-2, 9);
    expect(seen.get("local")?.vy).toBeCloseTo(0, 9);
  });
});

describe("3D particles beside a session", () => {
  it("draw the frame's emitters and emitParticles events identically on every run without touching the snapshot", async () => {
    const document = torchDocument();
    const run = async (): Promise<{ samples: ReturnType<typeof gameParticleSamples3D>; frame: GameRenderFrame3D }> => {
      const session = await createGameSession3D(document, 1);
      const plain = await createGameSession3D(document, 1);
      try {
        const particles = new GameParticles3D(document.tickRate);
        const input = gameInputFrame3D.parse({ pressed: [] });
        for (let tick = 0; tick < 30; tick += 1) {
          const step = session.step(input);
          plain.step(input);
          particles.tick(step.frame, session.takePresentationEvents());
          expect(JSON.stringify(session.snapshot())).toBe(JSON.stringify(plain.snapshot()));
        }
        expect(particles.simulator.countOf("torch", "burst")).toBe(4);
        expect(particles.simulator.countOf("torch", "sparks")).toBeGreaterThan(10);
        return { samples: gameParticleSamples3D(particles), frame: session.frame() };
      } finally {
        session.dispose();
        plain.dispose();
      }
    };
    const first = await run();
    const second = await run();
    expect(second.samples).toEqual(first.samples);
    const packed = packParticleBatches3D(gameParticleFieldFromSamples3D(first.samples, first.frame), VIEWER);
    expect(packed.batches.map((batch) => [batch.key, batch.count])).toEqual([
      ["quad:additive", first.samples.length - 4], ["box:normal:lit", 4]]);
    expect(packed.soft).toBe(true);
    const burst = packed.batches[1]!;
    expect(particle(burst.data, 0).slice(0, 3)).toEqual([1, 2, 3]);
  });

  it("round trips surviving world particles without their emitter in the frame", () => {
    const simulator = new ParticleSimulator({ dimension: "3d" });
    simulator.sync([{ entityId: "gone", position: { x: 0, y: 0, z: 0 }, rotation: IDENTITY,
      particles: gameParticles.parse({ emitters: [{ id: "fx", rate: 0, bursts: [{ count: 1 }], lifetime: 2, space: "world" }] }) }]);
    simulator.step(TICK);
    simulator.sync([]);
    const samples = gameParticleSamples3D(simulator);
    expect(samples).toHaveLength(1);
    const seen: ParticleView[] = [];
    gameParticleFieldFromSamples3D(samples, { ...blockoutFrame(), entities: [] }).forEachParticle(value => seen.push(value));
    expect(seen).toHaveLength(1);
  });

  it("drops samples whose emitter is not in the frame", () => {
    const frame = blockoutFrame();
    frame.entities = [{ ...frame.entities[0]!, particles: gameParticles.parse({ emitters: [{ id: "fx" }] }) }];
    const sample = { entityId: "box", emitterId: "fx", x: 1, y: 2, z: 3, vx: 0, vy: 0, vz: 0, size: 1, rotation: 0, r: 1, g: 1, b: 1, opacity: 1, life: 0.5 };
    const seen: ParticleView[] = [];
    gameParticleFieldFromSamples3D([sample, { ...sample, emitterId: "gone" }, { ...sample, entityId: "gone" }], frame).forEachParticle((value) => seen.push(value));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ ...sample, emitter: { id: "fx" } });
  });
});

describe("3D particle batches", () => {
  it("groups by shape, blend and lighting and packs each particle's draw settings", () => {
    const stretched = emitter({ id: "streak", render: { kind: "stretched", length: 3, speedScale: 0.25 }, softness: 0.75, blend: "additive" });
    const aligned = emitter({ id: "debris", render: { kind: "mesh", shape: "tetrahedron", align: "velocity" }, softness: 2 });
    const flat = emitter({ id: "chips", render: { kind: "mesh", shape: "tetrahedron" }, unlit: true });
    const packed = packParticleBatches3D(field([
      view(stretched, { x: 1, y: 2, z: -3, vx: 4, vy: 5, vz: 6, r: 1, g: 0.5, b: 0, opacity: 0.25, size: 2, rotation: 0.5 }),
      view(aligned, { size: 0.5 }),
      view(flat, { size: 0.5 }),
      view(emitter({ id: "plain" }), { size: 0.5 })
    ]), VIEWER);
    expect(packed.batches.map((batch) => [batch.key, batch.shape, batch.blend, batch.lit, batch.count])).toEqual([
      ["quad:additive", "quad", "additive", false, 1],
      ["tetrahedron:normal:lit", "tetrahedron", "normal", true, 1],
      ["tetrahedron:normal:unlit", "tetrahedron", "normal", false, 1],
      ["quad:normal", "quad", "normal", false, 1]
    ]);
    const values = particle(packed.batches[0]!.data, 0);
    expect(values.slice(0, 6)).toEqual([1, 2, -3, 4, 5, 6]);
    expect(values[6]).toBe(1);
    expect(values[7]).toBeCloseTo(srgbToLinear(0.5), 6);
    expect(values.slice(8)).toEqual([0, 0.25, 2, 0.5, 3, 0.25, 0.75, 1]);
    // Softness only applies to billboards. Velocity alignment sets the mode flag of a mesh.
    expect(particle(packed.batches[1]!.data, 0).slice(14)).toEqual([0, 1]);
    expect(particle(packed.batches[2]!.data, 0).slice(14)).toEqual([0, 0]);
    expect(particle(packed.batches[3]!.data, 0).slice(12)).toEqual([0, 0, 0, 0]);
    expect(packed.drawn).toBe(4);
    expect(packed.soft).toBe(true);
  });

  it("converts sRGB particle colour to linear light", () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(1)).toBeCloseTo(1, 12);
    expect(srgbToLinear(0.5)).toBeCloseTo(new THREE.Color().setRGB(0.5, 0.5, 0.5, THREE.SRGBColorSpace).r, 6);
    expect(srgbToLinear(0.04)).toBeCloseTo(0.04 / 12.92, 12);
  });

  it("skips particles with no size or no opacity", () => {
    const definition = emitter({});
    const packed = packParticleBatches3D(field([view(definition, { size: 0 }), view(definition, { opacity: 0 }), view(definition)]), VIEWER);
    expect(packed.drawn).toBe(1);
    expect(packed.soft).toBe(false);
  });

  it("sorts alpha-blended particles farthest first and keeps additive particles in field order", () => {
    const normal = emitter({ id: "smoke" });
    const additive = emitter({ id: "glow", blend: "additive" });
    const depths = [-1, -5, -3, -5];
    const packed = packParticleBatches3D(field([
      ...depths.map((z, index) => view(normal, { z, rotation: index })),
      ...depths.map((z, index) => view(additive, { z, rotation: index }))
    ]), VIEWER);
    const order = (index: number): number[] => Array.from({ length: 4 }, (_, item) => packed.batches[index]!.data[item * PARTICLE_INSTANCE_STRIDE_3D + 11]!);
    // Equal depths keep their field order.
    expect(order(0)).toEqual([1, 3, 2, 0]);
    expect(order(1)).toEqual([0, 1, 2, 3]);
    // The next frame sorts into the batch's spare buffer instead of allocating one.
    const first = packed.batches[0]!;
    const buffers = [first.data, first.spare];
    const again = packParticleBatches3D(field(depths.map((z, index) => view(normal, { z, rotation: index }))), VIEWER, packed.batches);
    expect(again.batches[0]).toBe(first);
    expect(buffers).toContain(again.batches[0]!.data);
    expect(buffers).toContain(again.batches[0]!.spare);
    expect(order(0)).toEqual([1, 3, 2, 0]);
  });

  it("grows a batch past its first capacity and reuses it on the next frame", () => {
    const definition = emitter({ blend: "additive" });
    const many = Array.from({ length: 200 }, (_, index) => view(definition, { x: index }));
    const first = packParticleBatches3D(field(many), VIEWER);
    const batch = first.batches[0]!;
    expect(batch.count).toBe(200);
    expect(batch.data.length).toBeGreaterThanOrEqual(200 * PARTICLE_INSTANCE_STRIDE_3D);
    expect(Array.from({ length: 200 }, (_, index) => batch.data[index * PARTICLE_INSTANCE_STRIDE_3D])).toEqual(many.map((value) => value.x));
    const data = batch.data;
    const second = packParticleBatches3D(field(many.slice(0, 10)), VIEWER, first.batches);
    expect(second.batches[0]).toBe(batch);
    expect(second.batches[0]!.data).toBe(data);
    expect(second.batches[0]!.count).toBe(10);
  });
});

interface Recorded {
  readonly calls: string[];
  readonly context: RenderContext3D;
  readonly renderer: { shadowMap: { autoUpdate: boolean }; target: unknown; info: { render: { calls: number; triangles: number } } };
  /** The material each named scene mesh drew with in the depth pre-pass. */
  readonly depthMaterials: Map<string, THREE.Material>;
}

/** A pipeline context whose renderer records the calls the particle pass makes. No WebGL is involved. */
function recordingContext(scene: THREE.Scene, camera: THREE.PerspectiveCamera): Recorded {
  const calls: string[] = [];
  const depthMaterials = new Map<string, THREE.Material>();
  const renderer = {
    shadowMap: { autoUpdate: true },
    info: { render: { calls: 5, triangles: 100 } },
    target: null as unknown,
    getDrawingBufferSize: (size: THREE.Vector2) => size.set(64, 32),
    getRenderTarget() { return this.target; },
    setRenderTarget(target: unknown) { this.target = target; calls.push(target ? "target:depth" : "target:canvas"); },
    clear: () => calls.push("clear"),
    clearDepth: () => calls.push("clearDepth"),
    render(renderedScene: THREE.Scene) {
      if (renderedScene !== scene) { calls.push("hud"); return; }
      const group = renderedScene.getObjectByName("game-particles");
      calls.push(`depth-render background=${renderedScene.background !== null} particles=${group?.visible} shadows=${this.shadowMap.autoUpdate}`);
      renderedScene.traverse((object) => { if (object instanceof THREE.Mesh && object.name && !Array.isArray(object.material)) { depthMaterials.set(object.name, object.material); } });
      // A real renderer counts the pre-pass draws. The pass must take them back out.
      this.info.render.calls += 3;
      this.info.render.triangles += 36;
    }
  };
  const postProcessor = { render: (renderedScene: THREE.Scene) => {
    const group = renderedScene.getObjectByName("game-particles");
    calls.push(`scene particles=${group?.children.length ?? 0}`);
  } } as unknown as GamePostProcessor3D;
  return { calls, renderer, depthMaterials, context: { renderer: renderer as unknown as THREE.WebGLRenderer, scene, camera, hudScene: new THREE.Scene(), hudCamera: new THREE.OrthographicCamera(), postProcessor } };
}

describe("3D particle render pass", () => {
  it("runs before the scene pass and builds one draw per batch inside the scene", async () => {
    const pipeline = new RenderPipeline3D();
    const scene = new THREE.Scene();
    let current: GameParticleField | null = field([
      view(emitter({ blend: "additive" }), { z: -2 }),
      view(emitter({ blend: "additive" }), { z: -3 }),
      view(emitter({ render: { kind: "mesh", shape: "box", align: "velocity" }, unlit: true }), { x: 1, y: 2, z: -4, vx: 3, size: 2, opacity: 0.5 })
    ]);
    const pass = new GameParticlePass3D(pipeline, { scene, particles: () => current });
    expect(() => pipeline.register({ name: GAME_PARTICLE_PASS_3D, order: 0, render: () => undefined })).toThrow("already registered");
    const camera = new THREE.PerspectiveCamera();
    const recorded = recordingContext(scene, camera);
    await pipeline.render(recorded.context);
    // No softness: no depth pre-pass, and the particle meshes are in the scene when the scene pass draws.
    expect(recorded.calls).toEqual(["scene particles=2", "clearDepth", "hud"]);
    expect(pass.drawn).toBe(3);
    expect(pass.targetBytes).toBe(0);
    const group = scene.getObjectByName("game-particles");
    const quads = group?.children.find((child) => child.name === "particles:quad:additive") as THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
    expect(quads.geometry.instanceCount).toBe(2);
    expect(quads.frustumCulled).toBe(false);
    expect(quads.material.blending).toBe(THREE.AdditiveBlending);
    expect(quads.material.depthWrite).toBe(false);
    expect(quads.material.uniforms["softDepth"]?.value).toBe(0);
    const boxes = group?.children.find((child) => child.name === "particles:box:normal:unlit") as THREE.InstancedMesh;
    expect(boxes.count).toBe(1);
    expect(boxes.material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(boxes.geometry.getAttribute("particleOpacity").getX(0)).toBe(0.5);
    const matrix = new THREE.Matrix4();
    boxes.getMatrixAt(0, matrix);
    const position = new THREE.Vector3(); const rotation = new THREE.Quaternion(); const scale = new THREE.Vector3();
    matrix.decompose(position, rotation, scale);
    expect(position.toArray()).toEqual([1, 2, -4]);
    expect(scale.x).toBeCloseTo(2, 6);
    // Velocity alignment turns the mesh's +Y onto the particle's +X travel.
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation);
    expect(up.x).toBeCloseTo(1, 6);
    boxes.computeBoundingSphere();
    current = field([view(emitter({ render: { kind: "mesh", shape: "box" }, unlit: true }), { z: -20 })]);
    await pipeline.render(recorded.context);
    if (boxes.boundingSphere === null) { boxes.computeBoundingSphere(); }
    expect(boxes.boundingSphere?.center.z).toBeCloseTo(-20);
    // A frame without particles releases every draw.
    current = null;
    await pipeline.render(recorded.context);
    expect(group?.children).toHaveLength(0);
    expect(pass.drawn).toBe(0);
    pass.dispose();
    expect(scene.getObjectByName("game-particles")).toBeUndefined();
  });

  it("keeps static quad buffers owned by the rendered geometries through disposal", async () => {
    const pipeline = new RenderPipeline3D();
    const scene = new THREE.Scene();
    const particles = field([view(emitter({ blend: "normal" })), view(emitter({ blend: "additive" }))]);
    const pass = new GameParticlePass3D(pipeline, { scene, particles: () => particles });
    await pipeline.render(recordingContext(scene, new THREE.PerspectiveCamera()).context);
    const geometries: THREE.BufferGeometry[] = [];
    scene.traverse(object => { if (object instanceof THREE.Mesh) { geometries.push(object.geometry); } });
    expect(geometries).toHaveLength(2);
    expect(geometries[0]!.getAttribute("position")).not.toBe(geometries[1]!.getAttribute("position"));
    const disposed: boolean[] = [];
    for (const geometry of geometries) {
      geometry.addEventListener("dispose", () => disposed.push(geometry.index !== null && geometry.hasAttribute("position") && geometry.hasAttribute("uv")));
    }
    pass.dispose();
    expect(disposed).toEqual([true, true]);
  });

  it("renders scene depth for soft billboards and restores every renderer and scene setting it changed", async () => {
    const pipeline = new RenderPipeline3D();
    const scene = new THREE.Scene();
    const background = new THREE.Color("#203040");
    scene.background = background;
    const box = new THREE.BoxGeometry();
    const solid = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });
    const cutout = new THREE.Texture();
    // An alpha-tested cut-out whose opacity is below its cutoff draws nothing in the scene pass.
    const masked = new THREE.MeshStandardMaterial({ alphaTest: 0.5, opacity: 0.2, map: cutout, vertexColors: true });
    const glass = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.5 });
    for (const [name, material] of [["solid", solid], ["masked", masked], ["glass", glass]] as const) {
      const mesh = new THREE.Mesh(box, material);
      mesh.name = name;
      scene.add(mesh);
    }
    let particles: GameParticleField = field([view(emitter({ softness: 0.5 }), { z: -2 })]);
    const pass = new GameParticlePass3D(pipeline, { scene, particles: () => particles });
    const camera = new THREE.PerspectiveCamera(60, 2, 0.25, 40);
    const recorded = recordingContext(scene, camera);
    await pipeline.render(recorded.context);
    expect(recorded.calls).toEqual(["target:depth", "clear", "depth-render background=false particles=false shadows=false",
      "target:canvas", "scene particles=1", "clearDepth", "hud"]);
    expect(recorded.renderer.info.render).toEqual({ calls: 5, triangles: 100 });
    const depth = (name: string): THREE.MeshBasicMaterial => {
      const material = recorded.depthMaterials.get(name);
      if (!(material instanceof THREE.MeshBasicMaterial)) { throw new Error(`${name} drew without a depth material`); }
      return material;
    };
    expect(depth("solid")).toMatchObject({ colorWrite: false, visible: true, side: THREE.DoubleSide, alphaTest: 0 });
    expect(depth("masked")).toMatchObject({ colorWrite: false, visible: true, alphaTest: 0.5, opacity: 0.2, map: cutout, vertexColors: true });
    expect(depth("glass").visible).toBe(false);
    for (const [name, material] of [["solid", solid], ["masked", masked], ["glass", glass]] as const) {
      expect((scene.getObjectByName(name) as THREE.Mesh).material).toBe(material);
    }
    expect(scene.background).toBe(background);
    expect(recorded.renderer.shadowMap.autoUpdate).toBe(true);
    expect(scene.getObjectByName("game-particles")?.visible).toBe(true);
    const quads = scene.getObjectByName("particles:quad:normal") as THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
    const uniforms = quads.material.uniforms;
    expect(uniforms["softDepth"]?.value).toBe(1);
    expect(uniforms["sceneDepth"]?.value).toBeInstanceOf(THREE.DepthTexture);
    const resolution: unknown = uniforms["depthResolution"]?.value;
    expect(resolution instanceof THREE.Vector2 ? resolution.toArray() : null).toEqual([64, 32]);
    expect([uniforms["cameraNear"]?.value, uniforms["cameraFar"]?.value, uniforms["orthographicCamera"]?.value]).toEqual([0.25, 40, 0]);
    expect(pass.targetBytes).toBe(64 * 32 * 8);
    // A frame without soft particles keeps the depth target for the next one.
    particles = field([view(emitter({}), { z: -2 })]);
    await pipeline.render(recorded.context);
    expect(pass.targetBytes).toBe(64 * 32 * 8);
    pass.dispose();
    expect(pass.targetBytes).toBe(0);
  });
});
