import * as THREE from "three";
import { gameParticleEmitter } from "@nodetool-ai/protocol";
import { GameParticlePass3D } from "../../src/particles/pass3d.js";
import type { ParticleView } from "../../src/particles/simulator.js";
import { RenderPipeline3D } from "../../src/renderer3d/pipeline.js";
import { GamePostProcessor3D } from "../../src/renderer3d/passes/post-processing.js";

export async function compareParticleOrder(): Promise<{
  comparisons: { mode: string; reverse: boolean; cameraSide: number; differences: number; referenceLitPixels: number; calls: number }[];
  soft: { calls: number; triangles: number };
  backend: { userAgent: string; renderer: string };
}> {
  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setSize(64, 64);
  renderer.setClearColor(0x000000, 1);
  renderer.info.autoReset = false;
  const postProcessor = new GamePostProcessor3D(renderer);
  // Reference submissions accumulate in the same framebuffer instead of clearing between particles.
  const referencePostProcessor = new class extends GamePostProcessor3D {
    override render(scene: THREE.Scene, camera: THREE.Camera): void { renderer.render(scene, camera); }
  }(renderer);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 30);
  const hudScene = new THREE.Scene();
  const hudCamera = new THREE.OrthographicCamera();
  const read = (): Uint8Array => {
    const bytes = new Uint8Array(64 * 64 * 4);
    const gl = renderer.getContext();
    gl.readPixels(0, 0, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    return bytes;
  };
  const sample = (index: number, mode: string): ParticleView => ({
    entityId: "fx", emitterId: `emitter-${index}`,
    emitter: gameParticleEmitter.parse({ id: `emitter-${index}`, unlit: true,
      ...(index === 1 && mode === "mesh" ? { render: { kind: "mesh", shape: "box" } } : {}),
      blend: index === 1 && mode === "additive" ? "additive" : "normal" }),
    x: 0, y: 0, z: -5 + index * 2, vx: 0, vy: 0, vz: 0, size: 1.5, rotation: 0,
    r: index === 0 ? 1 : 0, g: index === 1 ? 1 : 0, b: index === 2 ? 1 : 0, opacity: 0.5, life: 0
  });
  const comparisons = [];
  try {
    for (const mode of ["mesh", "additive", "billboards"]) {
      for (const reverse of [false, true]) {
        for (const cameraSide of [0, -8]) {
          camera.position.z = cameraSide;
          camera.lookAt(0, 0, -3);
          camera.updateMatrixWorld(true);
          const scene = new THREE.Scene();
          const pipeline = new RenderPipeline3D();
          const samples = [0, 1, 2].map(index => sample(index, mode));
          if (reverse) { samples.reverse(); }
          let current = samples;
          const pass = new GameParticlePass3D(pipeline, { scene, particles: () => ({ forEachParticle: visit => current.forEach(visit) }) });
          const context = { renderer, scene, camera, hudScene, hudCamera, postProcessor };
          try {
            renderer.autoClear = false;
            renderer.clear();
            renderer.info.reset();
            await pipeline.render(context);
            const actual = read();
            const calls = renderer.info.render.calls;
            renderer.clear();
            renderer.autoClear = false;
            const direction = cameraSide === 0 ? -1 : 1;
            const sorted = [...samples].sort((a, b) => (b.z - a.z) * direction);
            // One independently depth-sorted particle per submission, using the real material/shader path.
            // The reference never groups particles, and transparent geometry never occludes later submissions.
            pipeline.register({ name: "reference-depth-write", order: -0.25, render: () => {
              scene.traverse(object => {
                if (object instanceof THREE.Mesh && !Array.isArray(object.material)) { object.material.depthWrite = false; }
              });
            } });
            for (const particle of sorted) {
              current = [particle];
              await pipeline.render({ ...context, postProcessor: referencePostProcessor });
            }
            const reference = read();
            let differences = 0;
            let referenceLitPixels = 0;
            for (let offset = 0; offset < actual.length; offset += 1) {
              if (actual[offset] !== reference[offset]) { differences += 1; }
              if (offset % 4 !== 3 && reference[offset] > 0) { referenceLitPixels += 1; }
            }
            comparisons.push({ mode, reverse, cameraSide, differences, referenceLitPixels, calls });
          } finally { pass.dispose(); }
        }
      }
    }
    renderer.autoClear = false;
    renderer.clear();
    camera.position.set(0, 0, 0);
    camera.lookAt(0, 0, -3);
    camera.updateMatrixWorld(true);
    const scene = new THREE.Scene();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const opaque = new THREE.Mesh(geometry, material);
    opaque.position.z = -4;
    scene.add(opaque);
    const pipeline = new RenderPipeline3D();
    const softParticle = { ...sample(2, "billboards"), emitter: gameParticleEmitter.parse({ id: "soft", softness: 0.5 }) };
    const pass = new GameParticlePass3D(pipeline, { scene, particles: () => ({ forEachParticle: visit => visit(softParticle) }) });
    try {
      renderer.info.reset();
      await pipeline.render({ renderer, scene, camera, hudScene, hudCamera, postProcessor });
      const gl = renderer.getContext();
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      return { comparisons, soft: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles },
        backend: { userAgent: navigator.userAgent, renderer: String(gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER)) } };
    } finally { pass.dispose(); geometry.dispose(); material.dispose(); }
  } finally { referencePostProcessor.dispose(); postProcessor.dispose(); renderer.dispose(); }
}
