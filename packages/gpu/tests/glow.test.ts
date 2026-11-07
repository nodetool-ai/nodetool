import { describe, expect, it } from "vitest";
import * as d from "typegpu/data";
import { createGPUContextFromDevice } from "../src/context.js";
import { getNodeGPUDevice } from "../src/node.js";
import { createDefaultRegistry, filtersGlowV1 } from "../src/pool.js";
import { createRecipeRunner } from "../src/recipe.js";
import { createLabeledTexture } from "../src/texture.js";

async function render(tint: typeof filtersGlowV1.paramDefaults.tint, alpha = 255): Promise<Uint8Array> {
  const gpu = await getNodeGPUDevice();
  const ctx = createGPUContextFromDevice(gpu);
  const width = 64, height = 32;
  const source = createLabeledTexture(gpu, {width, height, format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST});
  const output = createLabeledTexture(gpu, {width, height, format: "rgba8unorm",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC});
  const readback = gpu.createBuffer({size: width * height * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ});
  try {
    const pixels = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const value = x >= 24 && x < 40 && y >= 8 && y < 24 ? alpha : 0;
        pixels.set([value, value, value, alpha === 255 ? 255 : value], (y * width + x) * 4);
      }
    }
    gpu.queue.writeTexture({texture: source.texture}, pixels, {bytesPerRow: width * 4}, {width, height});
    const encoder = gpu.createCommandEncoder();
    createRecipeRunner().encode({ctx, module: filtersGlowV1, registry: createDefaultRegistry(), encoder,
      inputs: {source}, output, params: {...filtersGlowV1.paramDefaults, tint}});
    encoder.copyTextureToBuffer({texture: output.texture}, {buffer: readback, bytesPerRow: width * 4}, {width, height});
    gpu.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    return new Uint8Array(readback.getMappedRange()).slice();
  } finally {
    readback.destroy(); source.destroy(); output.destroy();
    ctx.uniformRing.dispose(); ctx.scratch.dispose();
  }
}

describe("glow tint on the GPU", () => {
  it("changes halo chroma without recoloring the source", async () => {
    const red = await render(d.vec3f(1, 0, 0));
    const blue = await render(d.vec3f(0, 0, 1));
    const halo = (16 * 64 + 22) * 4;
    expect(red[halo]).toBeGreaterThan(0);
    expect(red[halo + 1]).toBe(0); expect(red[halo + 2]).toBe(0);
    expect(blue[halo + 2]).toBeGreaterThan(0); expect(blue[halo]).toBe(0);
    const center = (16 * 64 + 32) * 4;
    expect([...red.slice(center, center + 4)]).toEqual([255, 255, 255, 255]);
  }, 30_000);

  it("keeps translucent halos premultiplied", async () => {
    const image = await render(d.vec3f(1, 0.25, 0), 128);
    let haloPixels = 0;
    for (let i = 0; i < image.length; i += 4) {
      expect(image[i]).toBeLessThanOrEqual(image[i + 3]);
      expect(image[i + 1]).toBeLessThanOrEqual(image[i + 3]);
      expect(image[i + 2]).toBeLessThanOrEqual(image[i + 3]);
      if (image[i + 3]! > 0 && image[i + 3]! < 128) haloPixels++;
    }
    expect(haloPixels).toBeGreaterThan(0);
  }, 30_000);
});
