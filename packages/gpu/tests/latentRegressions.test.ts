import { describe, it, expect, beforeAll } from "vitest";
import { createExecutor, type Executor } from "../src/executor.js";
import { createGPUContextFromDevice, type GPUContext } from "../src/context.js";
import { createLabeledTexture, type LabeledTexture } from "../src/texture.js";
import { createRecipeRunner } from "../src/recipe.js";
import { createDefaultRegistry } from "../src/pool.js";
import type { ShaderModule } from "../src/module.js";
import { filtersBlurSeparableV1 } from "../src/shaders/filters/blur/separable/v1/module.js";
import { sourcesLinearGradientV1 } from "../src/shaders/sources/linearGradient/v1/module.js";
import { colorExposureV1 } from "../src/shaders/color/exposure/v1/module.js";
import { transformDisplaceV1 } from "../src/shaders/transform/displace/v1/module.js";
import { createNodeGPUDevice } from "../src/node.js";
import type { AnyWgslStruct, Infer } from "typegpu/data";
import * as d from "typegpu/data";

/**
 * Pixel-level regression tests for latent bugs found in the 2026-06 audit.
 * Each test renders at non-default params / non-bucket sizes — the
 * configurations the per-module smoke tests don't reach — and asserts actual
 * pixel values. Skips with no device.
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

describe.skipIf(!device)("latent-bug pixel regressions (GPU)", () => {
  let gpu: GPUDevice;
  let ctx: GPUContext;
  let executor: Executor;

  beforeAll(() => {
    gpu = device as GPUDevice;
    ctx = createGPUContextFromDevice(gpu);
    executor = createExecutor();
  });

  function makeSource(
    width: number,
    height: number,
    pixels: Uint8Array,
    label = "regress-source"
  ): LabeledTexture {
    const tex = createLabeledTexture(gpu, {
      label,
      width,
      height,
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      meta: { colorSpace: "linear", alpha: "premultiplied" }
    });
    gpu.queue.writeTexture(
      { texture: tex.texture },
      pixels,
      { bytesPerRow: width * 4, rowsPerImage: height },
      { width, height }
    );
    return tex;
  }

  async function readbackTight(
    texture: GPUTexture,
    width: number,
    height: number
  ): Promise<(x: number, y: number) => [number, number, number, number]> {
    const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
    const buf = gpu.createBuffer({
      size: bytesPerRow * height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });
    const enc = gpu.createCommandEncoder();
    enc.copyTextureToBuffer(
      { texture },
      { buffer: buf, bytesPerRow, rowsPerImage: height },
      { width, height }
    );
    gpu.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const mapped = new Uint8Array(buf.getMappedRange()).slice();
    buf.unmap();
    buf.destroy();
    return (x, y) => {
      const i = y * bytesPerRow + x * 4;
      return [mapped[i], mapped[i + 1], mapped[i + 2], mapped[i + 3]];
    };
  }

  /** Run one fragment module and read back the output. */
  async function runFragment<Schema extends AnyWgslStruct>(
    module: ShaderModule<Schema>,
    params: Infer<Schema>,
    inputs: Record<string, LabeledTexture>,
    width: number,
    height: number
  ): Promise<(x: number, y: number) => [number, number, number, number]> {
    const output = createLabeledTexture(gpu, {
      label: "regress-output",
      width,
      height,
      format: "rgba8unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      meta: { colorSpace: "linear", alpha: "premultiplied" }
    });
    const encoder = gpu.createCommandEncoder();
    executor.encode({
      ctx,
      module,
      encoder,
      inputs,
      output,
      params,
      dispatch: { kind: "fragment" }
    });
    gpu.queue.submit([encoder.finish()]);
    const at = await readbackTight(output.texture, width, height);
    for (const tex of Object.values(inputs)) {
      tex.destroy();
    }
    output.destroy();
    return at;
  }

  it("filters.blur.gaussianSeparable keeps a uniform image uniform at non-bucket sizes", async () => {
    // 100×100 is deliberately NOT a scratch-pool bucket size (buckets to 128).
    // With a bucketed intermediate, the H pass only writes the logical 100
    // rows, and the V pass clamps its taps to the physical 128 — blending the
    // unwritten margin into the bottom `radius` rows. A gaussian blur of a
    // uniform opaque image must return the same uniform image.
    const width = 100;
    const height = 100;
    const source = makeSource(
      width,
      height,
      new Uint8Array(width * height * 4).fill(255)
    );
    const output = createLabeledTexture(gpu, {
      label: "regress-blur-output",
      width,
      height,
      format: "rgba8unorm",
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC,
      meta: { colorSpace: "linear", alpha: "premultiplied" }
    });

    const runner = createRecipeRunner();
    const registry = createDefaultRegistry();
    const encoder = gpu.createCommandEncoder();
    runner.encode({
      ctx,
      module: filtersBlurSeparableV1,
      encoder,
      inputs: { source },
      output,
      params: { radius: 8, sigma: 0 },
      registry,
      executor
    });
    gpu.queue.submit([encoder.finish()]);

    const at = await readbackTight(output.texture, width, height);
    for (const y of [0, 1, 50, 95, 99]) {
      const [r, , , a] = at(50, y);
      expect(r, `red at row ${y}`).toBe(255);
      expect(a, `alpha at row ${y}`).toBe(255);
    }
    source.destroy();
    output.destroy();
  });

  it("sources.linearGradient does not re-premultiply its premultiplied colour params", async () => {
    // Straight 50%-alpha red premultiplies to (0.5, 0, 0, 0.5) — what hosts
    // send. Both stops identical → uniform output equal to the param. The
    // double-premultiply bug returned rgb·a² = 0.25 (≈64) instead of ≈128.
    const red = d.vec4f(0.5, 0, 0, 0.5);
    const at = await runFragment(
      sourcesLinearGradientV1,
      { colorA: red, colorB: red, angle: 0, midpoint: 0.5 },
      {},
      8,
      8
    );
    const [r, g, b, a] = at(4, 4);
    expect(r).toBeGreaterThanOrEqual(126);
    expect(r).toBeLessThanOrEqual(130);
    expect(g).toBe(0);
    expect(b).toBe(0);
    expect(a).toBeGreaterThanOrEqual(126);
    expect(a).toBeLessThanOrEqual(130);
  });

  it("color.exposure preserves rgb ≤ a on partial-alpha pixels", async () => {
    // Straight C = 0.8 at a = 0.5 → premul rgb = 102, a = 128. +2 stops on the
    // straight colour saturates at 1.0, which re-premultiplies to a — so the
    // output rgb must clamp at alpha (128), not at the literal 255.
    const width = 4;
    const height = 4;
    const pixels = new Uint8Array(width * height * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 102;
      pixels[i + 1] = 102;
      pixels[i + 2] = 102;
      pixels[i + 3] = 128;
    }
    const at = await runFragment(
      colorExposureV1,
      { stops: 2 },
      { source: makeSource(width, height, pixels) },
      width,
      height
    );
    const [r, g, b, a] = at(2, 2);
    expect(a).toBe(128);
    expect(r).toBeLessThanOrEqual(a);
    expect(r).toBeGreaterThanOrEqual(a - 2);
    expect(g).toBe(r);
    expect(b).toBe(r);
  });

  it("transform.displace leaves pixels in place under a fully transparent map", async () => {
    // A transparent displacement texel carries no control signal; it must act
    // as the neutral 0.5 (zero offset), not as 0 (full negative offset, which
    // pushed every pixel out of bounds → transparent black).
    const width = 8;
    const height = 8;
    const pixels = new Uint8Array(width * height * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 0;
      pixels[i + 1] = 200;
      pixels[i + 2] = 0;
      pixels[i + 3] = 255;
    }
    const at = await runFragment(
      transformDisplaceV1,
      { amountX: 0.5, amountY: 0.5 },
      {
        source: makeSource(width, height, pixels),
        displacement: makeSource(
          width,
          height,
          new Uint8Array(width * height * 4),
          "regress-displacement"
        )
      },
      width,
      height
    );
    // (1,1): uv ≈ 0.19, so the buggy −0.5 offset lands out of bounds →
    // transparent black; the neutral 0.5 keeps the source pixel.
    const [r, g, , a] = at(1, 1);
    expect(r).toBe(0);
    expect(g).toBe(200);
    expect(a).toBe(255);
  });
});
