import { describe, it, expect } from "vitest";
import { createExecutor } from "../src/executor.js";
import { createGPUContextFromDevice } from "../src/context.js";
import { createLabeledTexture } from "../src/texture.js";
import { passthroughV1 } from "../src/shaders/_canary/passthrough/v1/module.js";
import { createNodeGPUDevice } from "../src/node.js";

/**
 * End-to-end proof of the Phase 1 chain: TypeGPU schema → bind group → WGSL
 * resolution → Executor → labeled output. Runs the canary against a 4×4
 * texture and asserts a byte-exact copy.
 *
 * Requires a real `GPUDevice` (browser `navigator.gpu` or the Node Dawn
 * `webgpu` package). Neither is guaranteed in CI, so the suite skips when no
 * device can be acquired — the contract code above is still typechecked and
 * unit-tested without a GPU.
 */
async function tryGetDevice(): Promise<GPUDevice | null> {
  const nav = (globalThis as { navigator?: { gpu?: GPU } }).navigator;
  if (nav?.gpu) {
    const adapter = await nav.gpu.requestAdapter();
    return (await adapter?.requestDevice()) ?? null;
  }
  // Use the production Node/Dawn acquisition path so the WebGPU flag globals
  // (GPUShaderStage, GPUTextureUsage, …) get installed before typegpu and the
  // executor reference them.
  try {
    return await createNodeGPUDevice();
  } catch {
    return null;
  }
}

const device = await tryGetDevice();

describe.skipIf(!device)("canary passthrough (GPU)", () => {
  it("copies a 4×4 texture byte-for-byte", async () => {
    const gpuDevice = device as GPUDevice;
    const ctx = createGPUContextFromDevice(gpuDevice);
    const executor = createExecutor();

    const width = 4;
    const height = 4;
    const pixels = new Uint8Array(width * height * 4);
    for (let i = 0; i < pixels.length; i++) {
      pixels[i] = (i * 7 + 13) & 0xff;
    }

    const source = createLabeledTexture(gpuDevice, {
      label: "canary-source",
      width,
      height,
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT
    });
    gpuDevice.queue.writeTexture(
      { texture: source.texture },
      pixels,
      { bytesPerRow: width * 4, rowsPerImage: height },
      { width, height }
    );

    const output = createLabeledTexture(gpuDevice, {
      label: "canary-output",
      width,
      height,
      format: "rgba8unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
    });

    const encoder = gpuDevice.createCommandEncoder();
    executor.encode({
      ctx,
      module: passthroughV1,
      encoder,
      inputs: { source },
      output,
      params: passthroughV1.paramDefaults,
      dispatch: { kind: "fragment" }
    });

    const bytesPerRow = 256; // 256-byte row alignment for copyTextureToBuffer
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
      for (let col = 0; col < width * 4; col++) {
        expect(mapped[row * bytesPerRow + col]).toBe(pixels[row * width * 4 + col]);
      }
    }
    readback.unmap();
    readback.destroy();
    ctx.scratch.dispose();
  });
});
