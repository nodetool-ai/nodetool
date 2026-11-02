import { describe, expect, it } from "vitest";
import { createGPUContextFromDevice } from "../src/context.js";
import { createExecutor } from "../src/executor.js";
import { getNodeGPUDevice } from "../src/node.js";
import { vignetteV1, vignetteV2 } from "../src/pool.js";
import { createLabeledTexture } from "../src/texture.js";

async function render(width: number, height: number, params: Partial<typeof vignetteV2.paramDefaults> = {}, version = 2) {
  const gpu = await getNodeGPUDevice();
  const ctx = createGPUContextFromDevice(gpu);
  const source = createLabeledTexture(gpu, {width, height, format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST});
  const output = createLabeledTexture(gpu, {width, height, format: "rgba8unorm",
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC});
  const readback = gpu.createBuffer({size: width * height * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ});
  try {
    gpu.queue.writeTexture({texture: source.texture}, new Uint8Array(width * height * 4).fill(255), {bytesPerRow: width * 4}, {width, height});
    const encoder = gpu.createCommandEncoder();
    createExecutor().encode({ctx, module: version === 1 ? vignetteV1 : vignetteV2, encoder,
      inputs: {source}, output, params: {...vignetteV2.paramDefaults, intensity: 0.47, ...params},
      dispatch: {kind: "compute", x: Math.ceil(width / 16), y: Math.ceil(height / 16), z: 1}});
    encoder.copyTextureToBuffer({texture: output.texture}, {buffer: readback, bytesPerRow: width * 4}, {width, height});
    gpu.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    return new Uint8Array(readback.getMappedRange()).slice();
  } finally {
    readback.destroy(); source.destroy(); output.destroy();
    ctx.uniformRing.dispose(); ctx.scratch.dispose();
  }
}

describe("vignette geometry on the GPU", () => {
  it("preserves version 1 when shape controls are omitted", async () => {
    expect(await render(128, 64)).toEqual(await render(128, 64, {}, 1));
  }, 30_000);

  it("moves the center and leaves alpha intact", async () => {
    const pixels = await render(64, 32, {centerX: 0.25});
    expect(pixels[(16 * 64 + 16) * 4]).toBe(255);
    expect(pixels[(16 * 64 + 32) * 4]).toBeLessThan(245);
    for (let i = 3; i < pixels.length; i += 4) expect(pixels[i]).toBe(255);
  }, 30_000);

  it.each([[256, 128], [128, 256]])("produces a pixel-space circle on %i×%i", async (width, height) => {
    const pixels = await render(width, height, {roundness: 1});
    const horizontal = pixels[(height / 2 * width + width / 2 + 40) * 4]!;
    const vertical = pixels[((height / 2 + 40) * width + width / 2) * 4]!;
    expect(Math.abs(horizontal - vertical)).toBeLessThanOrEqual(1);
    expect(horizontal).toBeLessThan(240);
  }, 30_000);
});
