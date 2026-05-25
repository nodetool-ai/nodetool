import { describe, it, expect } from "vitest";
import { createExecutor } from "../src/executor.js";
import { createGPUContextFromDevice } from "../src/context.js";
import { createLabeledTexture } from "../src/texture.js";
import { colorInvertV1 } from "../src/shaders/color/invert/v1/module.js";
import { createNodeGPUDevice } from "../src/node.js";

/**
 * Phase 3 mask-slot semantics: when a module declares an optional `mask` input
 * and the host doesn't bind one, the executor supplies a 1×1 white texture so
 * the WGSL samples coverage = 1 everywhere. With `color.invert@1` at
 * `amount = 1` and no mask, the output is `1 - source`; with a black mask, it
 * stays the source (coverage = 0).
 *
 * Requires a real `GPUDevice`; skips otherwise.
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

describe.skipIf(!device)("mask slot (unbound → default white)", () => {
  it("inverts every pixel when no mask is bound (coverage = 1)", async () => {
    const gpuDevice = device as GPUDevice;
    const ctx = createGPUContextFromDevice(gpuDevice);
    const executor = createExecutor();

    const width = 4;
    const height = 4;
    const pixels = new Uint8Array(width * height * 4);
    // RGB filled with deterministic bytes; alpha forced opaque so the input
    // is trivially valid premultiplied (rgb <= a). `color.invert` now operates
    // on the un-premultiplied straight color and re-premultiplies on store —
    // mixing a sub-opaque alpha with arbitrary RGB would not survive that
    // round trip, but the executor's "unbound mask → default white" behavior
    // (the actual subject of this test) is independent of the alpha channel.
    for (let i = 0; i < pixels.length; i++) {
      pixels[i] = i % 4 === 3 ? 255 : (i * 11 + 17) & 0xff;
    }

    const source = createLabeledTexture(gpuDevice, {
      label: "invert-source",
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
      label: "invert-output",
      width,
      height,
      format: "rgba8unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
    });

    const encoder = gpuDevice.createCommandEncoder();
    executor.encode({
      ctx,
      module: colorInvertV1,
      encoder,
      inputs: { source }, // mask omitted on purpose
      output,
      params: { amount: 1 },
      dispatch: { kind: "fragment" }
    });

    const bytesPerRow = 256;
    const readback = gpuDevice.createBuffer({
      size: bytesPerRow * height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });
    encoder.copyTextureToBuffer(
      { texture: output.texture },
      { buffer: readback, bytesPerRow, rowsPerImage: height },
      { width, height }
    );
    gpuDevice.queue.submit([encoder.finish()]);

    await readback.mapAsync(GPUMapMode.READ);
    const mapped = new Uint8Array(readback.getMappedRange());
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const srcIdx = (row * width + col) * 4;
        const dstIdx = row * bytesPerRow + col * 4;
        // RGB inverted, alpha preserved.
        expect(mapped[dstIdx]).toBe(255 - pixels[srcIdx]);
        expect(mapped[dstIdx + 1]).toBe(255 - pixels[srcIdx + 1]);
        expect(mapped[dstIdx + 2]).toBe(255 - pixels[srcIdx + 2]);
        expect(mapped[dstIdx + 3]).toBe(pixels[srcIdx + 3]);
      }
    }
    readback.unmap();
    readback.destroy();
    ctx.scratch.dispose();
  });
});
