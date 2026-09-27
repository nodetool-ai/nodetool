import { performance } from "node:perf_hooks";
import { createNodeGPUDevice } from "@nodetool-ai/gpu/node";
import type { GameRenderFrame } from "@nodetool-ai/protocol";
import { AssetCache } from "../src/canvas2d.js";
import { applyLighting } from "../src/lighting.js";
import { WebGPUGameRenderer } from "../src/webgpu.js";

const width = 512;
const height = 288;
const device = await createNodeGPUDevice();
device.pushErrorScope("validation");
const target = device.createTexture({ size: [width, height], format: "rgba8unorm",
  usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
const context = { getCurrentTexture: () => target, unconfigure: () => undefined } as unknown as GPUCanvasContext;
const renderer = new WebGPUGameRenderer({ width, height } as HTMLCanvasElement, device, context, "rgba8unorm",
  new AssetCache(async () => null));
const frame: GameRenderFrame = { tick: 1, width: 16, height: 9, pixelsPerUnit: 32,
  camera: { x: 0, y: 0, zoom: 1 },
  sprites: [{ entityId: "player", assetId: "player", x: 0, y: 0, previousX: 0, previousY: 0,
    rotation: 0, scaleX: 1, scaleY: 1, width: 2, height: 2, layer: 0 }], tiles: [], hud: [] };
const bloom = { kind: "bloom", threshold: 0.7, softness: 0.1, radius: 8, intensity: 1, required: true } as const;
const litFrame: GameRenderFrame = { ...frame, lighting: { ambient: { color: "#202020", intensity: 0.2 },
  points: Array.from({ length: 32 }, (_, index) => ({ x: index % 8 - 4, y: Math.floor(index / 8) - 2,
    color: "#ff8000", intensity: 1, radius: 3, falloff: 2 })) } };

let failure: unknown;
let validationError: GPUError | null = null;
try {
  for (const [name, effects, sample] of [
    ["disabled", [], frame], ["bloom", [bloom], frame], ["eight bloom", Array(8).fill(bloom), frame],
    ["32 point lights", [], litFrame],
  ] as const) {
    renderer.setEffects(effects);
    for (let index = 0; index < 3; index++) {
      await renderer.render(sample, 1);
      await device.queue.onSubmittedWorkDone();
    }
    const samples: number[] = [];
    let targetBytes = 0;
    for (let index = 0; index < 10; index++) {
      const start = performance.now();
      const stats = await renderer.render(sample, 1);
      await device.queue.onSubmittedWorkDone();
      samples.push(performance.now() - start);
      targetBytes = stats.targetBytes;
    }
    samples.sort((left, right) => left - right);
    process.stdout.write(JSON.stringify({ name, viewport: `${width}x${height}`,
      medianMs: samples[5], targetBytes }) + "\n");
  }
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < 3; index += 1) applyLighting(pixels, width, height, litFrame, 1);
  const cpuSamples: number[] = [];
  for (let index = 0; index < 10; index += 1) {
    pixels.fill(255);
    const start = performance.now();
    applyLighting(pixels, width, height, litFrame, 1);
    cpuSamples.push(performance.now() - start);
  }
  cpuSamples.sort((left, right) => left - right);
  process.stdout.write(JSON.stringify({ name: "32 point lights CPU", viewport: `${width}x${height}`,
    medianMs: cpuSamples[5], scratchBytes: width * height * 3 * 4 }) + "\n");
} catch (error) {
  failure = error;
} finally {
  validationError = await device.popErrorScope();
  renderer.dispose();
  target.destroy();
}
if (failure || validationError) {
  process.stderr.write(String(failure ?? validationError) + "\n");
  process.exit(1);
}
process.exit(0);
