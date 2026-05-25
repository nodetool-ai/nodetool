import { describe, it, expect } from "vitest";
import { createRecipeRunner } from "../src/recipe.js";
import { createGPUContextFromDevice } from "../src/context.js";
import { createLabeledTexture } from "../src/texture.js";
import { createDefaultRegistry } from "../src/pool.js";
import { filtersGlowV1 } from "../src/shaders/filters/glow/v1/module.js";
import { filtersBlurSeparableV1 } from "../src/shaders/filters/blur/separable/v1/module.js";
import { createNodeGPUDevice } from "../src/node.js";

/**
 * End-to-end proof of the Phase 3 `RecipeRunner`: walks the four-pass
 * `filters.glow` DAG (threshold → blurH → blurV → mixer.add) against a real
 * device, releasing scratch intermediates on return. Output is not checked
 * pixel-by-pixel — that's left to per-module unit tests — only that no
 * exceptions fire and the output texture's `contentVersion` got bumped (i.e.
 * the final pass wrote into it).
 *
 * Requires a `GPUDevice`; skips otherwise.
 */
async function tryGetDevice(): Promise<GPUDevice | null> {
  const nav = (globalThis as { navigator?: { gpu?: GPU } }).navigator;
  if (nav?.gpu) {
    const adapter = await nav.gpu.requestAdapter();
    return (await adapter?.requestDevice()) ?? null;
  }
  try {
    return await createNodeGPUDevice();
  } catch {
    return null;
  }
}

const device = await tryGetDevice();

describe.skipIf(!device)("filters.glow recipe end-to-end", () => {
  it("walks four passes and writes the output texture", async () => {
    const gpuDevice = device as GPUDevice;
    const ctx = createGPUContextFromDevice(gpuDevice);
    const runner = createRecipeRunner();
    const registry = createDefaultRegistry();

    const width = 16;
    const height = 16;
    const pixels = new Uint8Array(width * height * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 250;
      pixels[i + 1] = 250;
      pixels[i + 2] = 250;
      pixels[i + 3] = 255;
    }

    const source = createLabeledTexture(gpuDevice, {
      label: "glow-source",
      width,
      height,
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    gpuDevice.queue.writeTexture(
      { texture: source.texture },
      pixels,
      { bytesPerRow: width * 4, rowsPerImage: height },
      { width, height }
    );

    const output = createLabeledTexture(gpuDevice, {
      label: "glow-output",
      width,
      height,
      format: "rgba8unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
    });

    const encoder = gpuDevice.createCommandEncoder({ label: "glow-encoder" });
    runner.encode({
      ctx,
      module: filtersGlowV1,
      encoder,
      inputs: { source },
      output,
      params: filtersGlowV1.paramDefaults,
      registry
    });
    gpuDevice.queue.submit([encoder.finish()]);

    // Final pass (mixer.add) writes into `output` — contentVersion must bump.
    expect(output.contentVersion).toBeGreaterThan(0);

    ctx.scratch.dispose();
  });
});

describe.skipIf(!device)("filters.blur.gaussianSeparable recipe end-to-end", () => {
  it("walks the two-pass H/V blur and writes the output texture", async () => {
    const gpuDevice = device as GPUDevice;
    const ctx = createGPUContextFromDevice(gpuDevice);
    const runner = createRecipeRunner();
    const registry = createDefaultRegistry();

    const width = 16;
    const height = 16;
    const pixels = new Uint8Array(width * height * 4);
    // Single hot pixel in the centre — after a separable blur every neighbour
    // should pick up some energy, so the output's contentVersion must bump.
    const ci = (height / 2) * width * 4 + (width / 2) * 4;
    pixels[ci] = 255;
    pixels[ci + 1] = 255;
    pixels[ci + 2] = 255;
    pixels[ci + 3] = 255;

    const source = createLabeledTexture(gpuDevice, {
      label: "blur-source",
      width,
      height,
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    gpuDevice.queue.writeTexture(
      { texture: source.texture },
      pixels,
      { bytesPerRow: width * 4, rowsPerImage: height },
      { width, height }
    );

    const output = createLabeledTexture(gpuDevice, {
      label: "blur-output",
      width,
      height,
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC
    });

    const encoder = gpuDevice.createCommandEncoder({ label: "blur-encoder" });
    runner.encode({
      ctx,
      module: filtersBlurSeparableV1,
      encoder,
      inputs: { source },
      output,
      params: { radius: 4, sigma: 0 },
      registry
    });
    gpuDevice.queue.submit([encoder.finish()]);

    expect(output.contentVersion).toBeGreaterThan(0);

    ctx.scratch.dispose();
  });
});
