import { expect, it } from "vitest";
import { createGPUContextFromDevice } from "../src/context.js";
import { createRecipeRunner } from "../src/recipe.js";
import { getNodeGPUDevice } from "../src/node.js";
import { createDefaultRegistry, sharpenGaussianV1 } from "../src/pool.js";
import { createLabeledTexture } from "../src/texture.js";

async function render(radius: number, alpha = 255, amount = 1) {
  const gpu = await getNodeGPUDevice(), ctx = createGPUContextFromDevice(gpu);
  const width = 64, height = 16, data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const value = Math.round((x < 32 ? 100 : 160) * alpha / 255);
    data.set([value, value, value, alpha], (y * width + x) * 4);
  }
  const source = createLabeledTexture(gpu, {width, height, format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST});
  const output = createLabeledTexture(gpu, {width, height, format: "rgba8unorm",
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC});
  const readback = gpu.createBuffer({size: data.length, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ});
  try {
    gpu.queue.writeTexture({texture: source.texture}, data, {bytesPerRow: width * 4}, {width, height});
    const encoder = gpu.createCommandEncoder();
    createRecipeRunner().encode({ctx, module: sharpenGaussianV1, encoder, inputs: {source}, output,
      params: {amount, threshold: 0, radius}, registry: createDefaultRegistry()});
    encoder.copyTextureToBuffer({texture: output.texture}, {buffer: readback, bytesPerRow: width * 4}, {width, height});
    gpu.queue.submit([encoder.finish()]); await readback.mapAsync(GPUMapMode.READ);
    return {original: data, pixels: new Uint8Array(readback.getMappedRange()).slice()};
  } finally {
    readback.destroy(); source.destroy(); output.destroy(); ctx.uniformRing.dispose(); ctx.scratch.dispose();
  }
}

it("widens the Gaussian sharpening halo as radius grows", async () => {
  const narrow = await render(2), wide = await render(8);
  expect(narrow.pixels[(8 * 64 + 35) * 4]).toBe(160);
  expect(wide.pixels[(8 * 64 + 35) * 4]).toBeGreaterThan(160);
  expect(wide.pixels[(8 * 64 + 28) * 4]).toBeLessThan(100);
}, 30_000);
it("preserves alpha and the neutral amount", async () => {
  const {pixels} = await render(8, 128);
  for (let i = 0; i < pixels.length; i += 4) {
    expect(pixels[i + 3]).toBe(128); expect(pixels[i]).toBeLessThanOrEqual(128);
  }
  const neutral = await render(8, 255, 0);
  expect(neutral.pixels).toEqual(neutral.original);
}, 30_000);
