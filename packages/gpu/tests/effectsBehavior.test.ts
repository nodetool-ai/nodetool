import { describe, it, expect, beforeAll } from "vitest";
import { createExecutor, type Executor } from "../src/executor.js";
import { createGPUContextFromDevice, type GPUContext } from "../src/context.js";
import { createLabeledTexture } from "../src/texture.js";
import type { ShaderModule } from "../src/module.js";
import {
  colorGradeV1,
  blurGaussianV1,
  sharpenUnsharpMaskV1,
  vignetteV1,
  chromaKeyV1
} from "../src/shaders/index.js";
import { createNodeGPUDevice } from "../src/node.js";
import type { AnyWgslStruct, Infer } from "typegpu/data";
import * as d from "typegpu/data";

/**
 * Per-effect behavior on a real (CPU/SwiftShader or hardware) device. The
 * canary/computeSmoke suites prove the pipeline runs and an identity pass is
 * byte-exact; these assert each migrated effect actually does what it should
 * with non-neutral params — the check that would catch a broken WGSL body, a
 * mis-packed uniform field, or a swapped channel. Skips with no device.
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

/** Fill a width×height RGBA8 buffer from a per-pixel function. */
function makePixels(
  width: number,
  height: number,
  fn: (x: number, y: number) => [number, number, number, number]
): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = fn(x, y);
      const i = (y * width + x) * 4;
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = a;
    }
  }
  return pixels;
}

describe.skipIf(!device)("timeline effect behavior (GPU)", () => {
  let gpu: GPUDevice;
  let ctx: GPUContext;
  let executor: Executor;

  beforeAll(() => {
    gpu = device as GPUDevice;
    ctx = createGPUContextFromDevice(gpu);
    executor = createExecutor();
  });

  /** Run one compute module and read back the result as tightly-packed RGBA8. */
  async function run<Schema extends AnyWgslStruct>(
    module: ShaderModule<Schema>,
    params: Infer<Schema>,
    width: number,
    height: number,
    pixels: Uint8Array
  ): Promise<{ at: (x: number, y: number) => [number, number, number, number] }> {
    const source = createLabeledTexture(gpu, {
      label: "behavior-source",
      width,
      height,
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    gpu.queue.writeTexture(
      { texture: source.texture },
      pixels,
      { bytesPerRow: width * 4, rowsPerImage: height },
      { width, height }
    );
    const output = createLabeledTexture(gpu, {
      label: "behavior-output",
      width,
      height,
      format: "rgba8unorm",
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC
    });

    const encoder = gpu.createCommandEncoder();
    executor.encode({
      ctx,
      module,
      encoder,
      inputs: { source },
      output,
      params,
      dispatch: {
        kind: "compute",
        x: Math.ceil(width / 16),
        y: Math.ceil(height / 16),
        z: 1
      }
    });

    const bytesPerRow = 256;
    const readback = gpu.createBuffer({
      size: bytesPerRow * height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });
    encoder.copyTextureToBuffer(
      { texture: output.texture },
      { buffer: readback, bytesPerRow, rowsPerImage: height },
      { width, height }
    );
    gpu.queue.submit([encoder.finish()]);

    await readback.mapAsync(GPUMapMode.READ);
    const mapped = new Uint8Array(readback.getMappedRange()).slice();
    readback.unmap();
    readback.destroy();
    source.destroy();
    output.destroy();

    return {
      at: (x, y) => {
        const i = y * bytesPerRow + x * 4;
        return [mapped[i], mapped[i + 1], mapped[i + 2], mapped[i + 3]];
      }
    };
  }

  it("color.grade brightness raises every channel", async () => {
    // Gray 64 + brightness 0.5 → (64/255 + 0.5) * 255 ≈ 191.
    const out = await run(
      colorGradeV1,
      { ...colorGradeV1.paramDefaults, brightness: 0.5 },
      4,
      4,
      makePixels(4, 4, () => [64, 64, 64, 255])
    );
    const [r, g, b, a] = out.at(2, 2);
    expect(r).toBeGreaterThanOrEqual(186);
    expect(r).toBeLessThanOrEqual(196);
    expect(g).toBe(r);
    expect(b).toBe(r);
    expect(a).toBe(255);
  });

  it("color.grade saturation 0 desaturates to luma", async () => {
    // Pure red → luma 0.299·255 ≈ 76 on all channels.
    const out = await run(
      colorGradeV1,
      { ...colorGradeV1.paramDefaults, saturation: 0 },
      4,
      4,
      makePixels(4, 4, () => [255, 0, 0, 255])
    );
    const [r, g, b] = out.at(2, 2);
    expect(r).toBeGreaterThanOrEqual(72);
    expect(r).toBeLessThanOrEqual(80);
    expect(Math.abs(r - g)).toBeLessThanOrEqual(1);
    expect(Math.abs(r - b)).toBeLessThanOrEqual(1);
  });

  it("filters.vignette darkens the corners and spares the center", async () => {
    const out = await run(
      vignetteV1,
      { intensity: 1, radius: 0.5, softness: 0.25 },
      16,
      16,
      makePixels(16, 16, () => [255, 255, 255, 255])
    );
    expect(out.at(8, 8)[0]).toBeGreaterThanOrEqual(250); // center untouched
    expect(out.at(0, 0)[0]).toBeLessThanOrEqual(5); // corner fully dimmed
  });

  it("filters.blur.gaussian spreads energy along its direction only", async () => {
    // Single bright texel at the center; horizontal pass (direction (1,0)).
    const out = await run(
      blurGaussianV1,
      { radius: 3, sigma: 1, direction: d.vec2f(1, 0) },
      16,
      16,
      makePixels(16, 16, (x, y) =>
        x === 8 && y === 8 ? [255, 255, 255, 255] : [0, 0, 0, 0]
      )
    );
    expect(out.at(8, 8)[0]).toBeLessThan(255); // center energy spread out
    expect(out.at(9, 8)[0]).toBeGreaterThan(0); // horizontal neighbor gains
    expect(out.at(8, 9)[0]).toBe(0); // vertical neighbor untouched (H-only)
  });

  it("filters.sharpen.unsharpMask enhances an edge and leaves flats alone", async () => {
    // Left columns 100, right columns 160 → vertical edge at x=4.
    const out = await run(
      sharpenUnsharpMaskV1,
      { amount: 1, threshold: 0 },
      8,
      8,
      makePixels(8, 8, (x) => {
        const v = x < 4 ? 100 : 160;
        return [v, v, v, 255];
      })
    );
    expect(out.at(4, 4)[0]).toBeGreaterThan(160); // bright side of edge brighter
    expect(out.at(3, 4)[0]).toBeLessThan(100); // dark side darker
    expect(out.at(0, 4)[0]).toBe(100); // flat region unchanged
  });

  it("keyer.chromaKey zeroes alpha on the key color, keeps others", async () => {
    const rgb = (hex: [number, number, number]) =>
      d.vec3f(hex[0] / 255, hex[1] / 255, hex[2] / 255);
    const out = await run(
      chromaKeyV1,
      { keyColor: rgb([0, 255, 0]), tolerance: 0.1, softness: 0.1, spill: 0 },
      2,
      1,
      makePixels(2, 1, (x) =>
        x === 0 ? [0, 255, 0, 255] : [255, 0, 0, 255]
      )
    );
    expect(out.at(0, 0)[3]).toBe(0); // green keyed out
    expect(out.at(1, 0)[3]).toBe(255); // red preserved
  });
});
