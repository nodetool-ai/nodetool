import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { gameParticleEmitter, gamePrimitive3D } from "@nodetool-ai/protocol";
import { GameParticlePass3D } from "../../src/particles/pass3d.js";
import type { ParticleView } from "../../src/particles/simulator.js";
import { primitiveInstance } from "../../src/renderer3d/assets/instances.js";
import { RenderPipeline3D } from "../../src/renderer3d/pipeline.js";
import { GamePostProcessor3D } from "../../src/renderer3d/passes/post-processing.js";

async function ordinaryPlane(kind: "model" | "primitive"): Promise<THREE.Object3D> {
  if (kind === "primitive") {
    const instance = primitiveInstance(gamePrimitive3D.parse({ kind: "plane", dimensions: { x: 1.5, y: 1, z: 1.5 },
      material: { color: "#ffff00", emissive: "#ffff00", opacity: 0.5, alphaMode: "blend" } }));
    instance.object.rotation.x = Math.PI / 2;
    return instance.object;
  }
  // Exercise real GLB BLEND material loading, including its non-depth-writing policy.
  const geometry = new THREE.PlaneGeometry(1.5, 1.5);
  const material = new THREE.MeshBasicMaterial({ color: 0xffff00, opacity: 0.5, transparent: true, side: THREE.DoubleSide });
  try {
    const glb = await new GLTFExporter().parseAsync(new THREE.Mesh(geometry, material), { binary: true });
    if (!(glb instanceof ArrayBuffer)) { throw new Error("Blend model control did not export binary glTF"); }
    return (await new GLTFLoader().parseAsync(glb, "")).scene;
  } finally { geometry.dispose(); material.dispose(); }
}

export async function compareParticleSceneOrder(): Promise<{
  cases: { kind: string; mode: string; reverse: boolean; cameraSide: number; differences: number; lit: number;
    calls: number; depthWrite: boolean[] }[];
  backend: string;
}> {
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  renderer.setSize(64, 64); renderer.setClearColor(0x000000, 1); renderer.autoClear = false; renderer.info.autoReset = false;
  const postProcessor = new GamePostProcessor3D(renderer);
  const accumulate = new class extends GamePostProcessor3D {
    override render(scene: THREE.Scene, camera: THREE.Camera): void { renderer.render(scene, camera); }
  }(renderer);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 30);
  const hudScene = new THREE.Scene(); const hudCamera = new THREE.OrthographicCamera();
  const read = (): Uint8Array => {
    const gl = renderer.getContext(); const bytes = new Uint8Array(64 * 64 * 4);
    gl.readPixels(0, 0, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, bytes); return bytes;
  };
  const cases = [];
  try {
    for (const kind of ["model", "primitive"] as const) {
      for (const mode of ["mixed", "same-kind"]) {
        for (const reverse of [false, true]) {
          for (const cameraSide of [0, -8]) {
            const scene = new THREE.Scene();
            const plane = await ordinaryPlane(kind); plane.position.z = -2;
            const depthWrite: boolean[] = [];
            plane.traverse(object => {
              if (object instanceof THREE.Mesh) {
                for (const material of Array.isArray(object.material) ? object.material : [object.material]) { depthWrite.push(material.depthWrite); }
              }
            });
            const samples: ParticleView[] = [0, 1, 2].map(index => ({ entityId: "fx", emitterId: `p${index}`,
              emitter: gameParticleEmitter.parse({ id: `p${index}`, unlit: true,
                ...(mode === "mixed" && index === 1 ? { render: { kind: "mesh", shape: "box" } } : {}) }),
              x: 0, y: 0, z: -5 + index * 2, vx: 0, vy: 0, vz: 0, size: 1, rotation: 0,
              r: index === 0 ? 1 : 0, g: index === 1 ? 1 : 0, b: index === 2 ? 1 : 0, opacity: 0.5, life: 0 }));
            if (reverse) { samples.reverse(); scene.add(plane); }
            let current = samples;
            const pipeline = new RenderPipeline3D();
            const pass = new GameParticlePass3D(pipeline, { scene, particles: () => ({ forEachParticle: visit => current.forEach(visit) }) });
            if (!reverse) { scene.add(plane); }
            camera.position.z = cameraSide; camera.lookAt(0, 0, -3); camera.updateMatrixWorld(true);
            const context = { renderer, scene, camera, hudScene, hudCamera, postProcessor };
            try {
              renderer.clear(); renderer.info.reset(); await pipeline.render(context);
              const actual = read(); const calls = renderer.info.render.calls;
              renderer.clear(); renderer.autoClear = false;
              const direction = cameraSide === 0 ? -1 : 1;
              const objects = [...samples.map(particle => ({ z: particle.z, particle })), { z: -2, particle: null }]
                .sort((a, b) => (b.z - a.z) * direction);
              // The independent reference submits each particle and the real scene plane in depth order.
              // It retains the primitive's actual depth-write policy and the GLB's loaded material.
              for (const object of objects) {
                plane.visible = object.particle === null;
                current = object.particle ? [object.particle] : [];
                await pipeline.render({ ...context, postProcessor: accumulate });
              }
              const reference = read(); let differences = 0; let lit = 0;
              for (let index = 0; index < actual.length; index++) {
                if (actual[index] !== reference[index]) { differences++; }
                if (index % 4 !== 3 && reference[index] > 0) { lit++; }
              }
              cases.push({ kind, mode, reverse, cameraSide, differences, lit, calls, depthWrite });
            } finally {
              pass.dispose();
              plane.traverse(object => {
                if (object instanceof THREE.Mesh) {
                  object.geometry.dispose();
                  for (const material of Array.isArray(object.material) ? object.material : [object.material]) { material.dispose(); }
                }
              });
            }
          }
        }
      }
    }
    const gl = renderer.getContext(); const debug = gl.getExtension("WEBGL_debug_renderer_info");
    return { cases, backend: String(gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER)) };
  } finally { accumulate.dispose(); postProcessor.dispose(); renderer.dispose(); }
}
