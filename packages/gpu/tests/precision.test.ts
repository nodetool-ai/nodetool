import { expect, it } from "vitest";
import { createGPUContextFromDevice } from "../src/context.js";
import { getNodeGPUDevice } from "../src/node.js";
import { colorLevelsV1, createDefaultRegistry } from "../src/pool.js";
import { createRecipeRunner, defineRecipe } from "../src/recipe.js";
import { createLabeledTexture } from "../src/texture.js";

it("bounds precision loss through two inverse GPU Levels passes", async () => {
  const gpu = await getNodeGPUDevice();
  const ctx = createGPUContextFromDevice(gpu);
  const width = 256, height = 1;
  const source = createLabeledTexture(gpu, {width, height, format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST});
  const output = createLabeledTexture(gpu, {width, height, format: "rgba8unorm",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC});
  const readback = gpu.createBuffer({size: width * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ});
  try {
    const pixels = new Uint8Array(width * 4);
    for (let x = 0; x < width; x++) pixels.set([x, x, x, 255], x * 4);
    gpu.queue.writeTexture({texture: source.texture}, pixels, {bytesPerRow: width * 4}, {width, height});
    const levels = (gamma: number) => ({...colorLevelsV1.paramDefaults, rGamma: gamma, gGamma: gamma, bGamma: gamma});
    const recipe = defineRecipe({id: "test.inverse-levels", version: 1, surface: "internal", category: "color",
      paramDefaults: {}, io: colorLevelsV1.io, recipe: {
        intermediates: {graded: {format: "rgba8unorm", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING}},
        passes: [
          {op: {id: "color.levels", version: 1}, in: {source: "source"}, out: {kind: "intermediate", name: "graded"}, params: levels(0.5)},
          {op: {id: "color.levels", version: 1}, in: {source: {kind: "intermediate", name: "graded"}}, out: "output", params: levels(2)}
        ]
      }});
    const encoder = gpu.createCommandEncoder();
    createRecipeRunner().encode({ctx, module: recipe, registry: createDefaultRegistry(), encoder, inputs: {source}, output, params: {}});
    encoder.copyTextureToBuffer({texture: output.texture}, {buffer: readback, bytesPerRow: width * 4}, {width, height});
    gpu.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const result = new Uint8Array(readback.getMappedRange());
    const values = Array.from({length: width}, (_, x) => result[x * 4]!);
    const distinct = new Set(values).size;
    const maximumError = Math.max(...values.map((value, x) => Math.abs(value - x)));
    // RGBA8 remains the production floor. The FP16 proof is in precisionBenefit.test.ts.
    expect(distinct).toBeGreaterThanOrEqual(192);
    expect(maximumError).toBeLessThanOrEqual(11);
    expect(values.every((value, x) => x === 0 || value >= values[x - 1]!)).toBe(true);
  } finally {
    readback.destroy(); source.destroy(); output.destroy();
    ctx.uniformRing.dispose(); ctx.scratch.dispose();
  }
}, 30_000);
