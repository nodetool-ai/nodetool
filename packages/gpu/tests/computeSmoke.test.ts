import { describe, it, expect } from "vitest";
import { createExecutor } from "../src/executor.js";
import { createGPUContextFromDevice } from "../src/context.js";
import { createLabeledTexture } from "../src/texture.js";
import { colorGradeV1 } from "../src/shaders/color/grade/v1/module.js";
import { createNodeGPUDevice } from "../src/node.js";

/**
 * End-to-end proof of the Phase 2 compute arm: TypeGPU schema → storage-texture
 * bind group → WGSL resolution → Executor compute dispatch → labeled output.
 * Runs `color.grade` with neutral params (an identity pass) against a 4×4
 * texture and asserts a byte-exact copy.
 *
 * Requires a real `GPUDevice`; skips when none can be acquired (the contract
 * code is still typechecked and unit-tested without a GPU).
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

describe.skipIf(!device)("color.grade compute (GPU)", () => {
  it("copies a 4×4 texture byte-for-byte with neutral params", async () => {
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
      label: "grade-source",
      width,
      height,
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      meta: { colorSpace: "srgb", alpha: "premultiplied" }
    });
    gpuDevice.queue.writeTexture(
      { texture: source.texture },
      pixels,
      { bytesPerRow: width * 4, rowsPerImage: height },
      { width, height }
    );

    const output = createLabeledTexture(gpuDevice, {
      label: "grade-output",
      width,
      height,
      format: "rgba8unorm",
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC
    });

    const encoder = gpuDevice.createCommandEncoder();
    executor.encode({
      ctx,
      module: colorGradeV1,
      encoder,
      inputs: { source },
      output,
      params: colorGradeV1.paramDefaults,
      dispatch: {
        kind: "compute",
        x: Math.ceil(width / 16),
        y: Math.ceil(height / 16),
        z: 1
      }
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
      for (let col = 0; col < width * 4; col++) {
        expect(mapped[row * bytesPerRow + col]).toBe(pixels[row * width * 4 + col]);
      }
    }
    readback.unmap();
    readback.destroy();
    ctx.scratch.dispose();
  });
});
