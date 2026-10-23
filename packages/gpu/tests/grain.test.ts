import { describe, expect, it } from "vitest";
import { createGPUContextFromDevice } from "../src/context.js";
import { createExecutor } from "../src/executor.js";
import { getNodeGPUDevice } from "../src/node.js";
import { createDefaultRegistry, filtersGrainV1, filtersGrainV2 } from "../src/pool.js";
import { createLabeledTexture } from "../src/texture.js";

const SIZE = 512;
type Params = typeof filtersGrainV2.paramDefaults;

async function render(version: 1 | 2, params: Partial<Params> = {}, value = 128, alpha = 255): Promise<Uint8Array> {
  const gpu = await getNodeGPUDevice();
  const ctx = createGPUContextFromDevice(gpu);
  const source = createLabeledTexture(gpu, {
    width: SIZE, height: SIZE, format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    meta: { colorSpace: "srgb", alpha: "premultiplied" }
  });
  const output = createLabeledTexture(gpu, {
    width: SIZE, height: SIZE, format: "rgba8unorm",
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC,
    meta: { colorSpace: "srgb", alpha: "premultiplied" }
  });
  const input = new Uint8Array(SIZE * SIZE * 4);
  for (let i = 0; i < input.length; i += 4) {
    input.set([value, value, value, alpha], i);
  }
  gpu.queue.writeTexture({ texture: source.texture }, input, { bytesPerRow: SIZE * 4 }, { width: SIZE, height: SIZE });
  const encoder = gpu.createCommandEncoder();
  createExecutor().encode({
    ctx, module: version === 1 ? filtersGrainV1 : filtersGrainV2, encoder,
    inputs: { source }, output,
    params: { ...filtersGrainV2.paramDefaults, amount: 0.5, seed: 7, ...params },
    dispatch: { kind: "compute", x: SIZE / 16, y: SIZE / 16, z: 1 }
  });
  const readback = gpu.createBuffer({ size: input.length, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  encoder.copyTextureToBuffer({ texture: output.texture }, { buffer: readback, bytesPerRow: SIZE * 4 }, { width: SIZE, height: SIZE });
  gpu.queue.submit([encoder.finish()]);
  try {
    await readback.mapAsync(GPUMapMode.READ);
    return new Uint8Array(readback.getMappedRange()).slice();
  } finally {
    readback.destroy();
    source.destroy();
    output.destroy();
    ctx.uniformRing.dispose();
    ctx.scratch.dispose();
  }
}

function horizontalPhaseRatio(pixels: Uint8Array): number {
  const sums = new Array<number>(8).fill(0);
  const counts = new Array<number>(8).fill(0);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE - 1; x++) {
      const index = (y * SIZE + x) * 4;
      sums[x % 8]! += Math.abs(pixels[index]! - pixels[index + 4]!);
      counts[x % 8]!++;
    }
  }
  const means = sums.map((sum, i) => sum / counts[i]!);
  return Math.max(...means) / Math.min(...means);
}

// A lattice of isolated blobs periodically concentrates edge energy, even
// when rotating the lattice hides that pattern from row/column comparisons.
function edgeEnergyModulation(pixels: Uint8Array, size: number, angle: number): number {
  const radians = angle * Math.PI / 180;
  let real = 0;
  let imaginary = 0;
  let total = 0;
  for (let y = 0; y < SIZE - 1; y++) {
    for (let x = 0; x < SIZE - 1; x++) {
      const index = (y * SIZE + x) * 4;
      const dx = pixels[index + 4]! - pixels[index]!;
      const dy = pixels[index + SIZE * 4]! - pixels[index]!;
      const energy = dx * dx + dy * dy;
      const phase = 2 * Math.PI * (x * Math.cos(radians) + y * Math.sin(radians)) / size;
      real += energy * Math.cos(phase);
      imaginary += energy * Math.sin(phase);
      total += energy;
    }
  }
  return 2 * Math.hypot(real, imaginary) / total;
}

// Cases render on a software Vulkan rasterizer in CI, and the first one also
// compiles the grain shaders, so vitest's 5s default is too short there.
const GPU_TEST_TIMEOUT_MS = 30_000;

describe("film grain modules", { timeout: GPU_TEST_TIMEOUT_MS }, () => {
  it("retains fine pixel-scale grain at the default size and amount", async () => {
    const pixels = await render(2, { amount: 0.25, size: 1 });
    let sum = 0;
    let squared = 0;
    let adjacent = 0;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE - 1; x++) {
        const index = (y * SIZE + x) * 4;
        const value = pixels[index]!;
        sum += value;
        squared += value * value;
        adjacent += value * pixels[index + 4]!;
      }
    }
    const count = SIZE * (SIZE - 1);
    const mean = sum / count;
    const variance = squared / count - mean * mean;
    const correlation = (adjacent / count - mean * mean) / variance;
    expect(Math.sqrt(variance)).toBeGreaterThan(3);
    expect(Math.sqrt(variance)).toBeLessThan(8);
    expect(correlation).toBeGreaterThan(-0.1);
    expect(correlation).toBeLessThan(0.25);
  });

  it.each(Array.from({ length: 16 }, (_, index) => index + 1))(
    "avoids periodic rotated blob edges at size %s across the softness range", async (size) => {
      for (const softness of [0, 0.25, 0.5, 0.75, 1]) {
        const pixels = await render(2, { size, roughness: 0, softness });
        // Check both the original lattice period and the compensated kernel's.
        for (const period of [size, size / 1.75]) {
          // An axial period of one pixel aliases to DC, not a spatial pattern.
          const angles = period === 1 ? [-37, 45, 53] : [-37, 0, 45, 53];
          for (const angle of angles) {
            expect(edgeEnergyModulation(pixels, period, angle),
              `edge modulation at ${angle} degrees, period ${period}, softness ${softness}`).toBeLessThan(0.12);
          }
        }
      }
    }
  );

  it.each([0.5, 1])("keeps mixed octaves free of lattice edges at roughness %s", async (roughness) => {
    for (const size of [3.5, 8, 16]) {
      for (const softness of [0, 1]) {
        const pixels = await render(2, { size, roughness, softness, seed: 91 });
        for (const angle of [-37, 45, 53]) {
          expect(edgeEnergyModulation(pixels, size / 1.75, angle)).toBeLessThan(0.12);
        }
        for (const angle of [22.5, 112.5]) {
          expect(edgeEnergyModulation(pixels, size / 3.5, angle)).toBeLessThan(0.12);
        }
      }
    }
  });

  it("retains pinned v1 and resolves v2 as the latest grain", () => {
    const registry = createDefaultRegistry();
    expect(registry.get({ id: "filters.grain", version: 1 })).toBe(filtersGrainV1);
    expect(registry.get({ id: "filters.grain", version: 2 })).toBe(filtersGrainV2);
    expect(registry.get({ id: "filters.grain" })).toBe(filtersGrainV2);
  });

  it("removes the horizontal lattice phase pattern exposed by v1 at size 8", async () => {
    const legacy = await render(1, { size: 8 });
    const current = await render(2, { size: 8 });
    expect(horizontalPhaseRatio(legacy)).toBeGreaterThan(1.5);
    expect(horizontalPhaseRatio(current)).toBeLessThan(1.2);
  });

  it("leaves pure white clean where v1 darkened it", async () => {
    const legacy = await render(1, { amount: 1 }, 255);
    const current = await render(2, { amount: 1 }, 255);
    expect(legacy.some((value) => value < 255)).toBe(true);
    expect(current.every((value) => value === 255)).toBe(true);
  });

  it.each([0, 32, 128, 255])("preserves premultiplied bounds at alpha %i", async (alpha) => {
    const pixels = await render(2, { amount: 1, colorAmount: 1, size: 3.5, softness: 1, roughness: 1 }, Math.round(alpha * 0.4), alpha);
    let maxChannel = 0;
    let alphaChanged = false;
    for (let i = 0; i < pixels.length; i += 4) {
      alphaChanged ||= pixels[i + 3] !== alpha;
      maxChannel = Math.max(maxChannel, pixels[i]!, pixels[i + 1]!, pixels[i + 2]!);
    }
    expect(alphaChanged).toBe(false);
    expect(maxChannel).toBeLessThanOrEqual(alpha);
  });
});
