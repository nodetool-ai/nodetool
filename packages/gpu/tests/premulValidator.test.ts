import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createExecutor } from "../src/executor.js";
import { createGPUContextFromDevice } from "../src/context.js";
import { createLabeledTexture } from "../src/texture.js";
import { passthroughV1 } from "../src/shaders/_canary/passthrough/v1/module.js";
import { createNodeGPUDevice } from "../src/node.js";
import * as d from "typegpu/data";
import {
  consumePremulDebugWarnings,
  isPremulDebugEnabled,
  resetPremulDebugCache,
  setPremulDebugEnabled
} from "../src/debug/premulValidator.js";

/**
 * Item 5 of the shader-pool invariant enforcement plan: prove the runtime
 * debug pass detects premul invariant violations (rgb > a) and stays silent
 * on valid premul inputs.
 *
 * Requires a real `GPUDevice`. Skips cleanly without one (same pattern as the
 * other GPU-bound tests in this package).
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

describe.skipIf(!device)("premul debug validator (GPU)", () => {
  beforeAll(() => {
    // Flip the gate via the test hook so we don't depend on env-var ordering
    // relative to module load. The env-flag path is exercised in unit form
    // below.
    setPremulDebugEnabled(true);
  });

  afterAll(() => {
    setPremulDebugEnabled(false);
    resetPremulDebugCache();
  });

  it("env-flag gate honors NODETOOL_GPU_DEBUG=premul", () => {
    resetPremulDebugCache();
    const env = (
      globalThis as { process?: { env?: Record<string, string | undefined> } }
    ).process?.env;
    const prev = env?.NODETOOL_GPU_DEBUG;
    if (env) env.NODETOOL_GPU_DEBUG = "premul,otherflag";
    try {
      expect(isPremulDebugEnabled()).toBe(true);
    } finally {
      if (env) {
        if (prev === undefined) delete env.NODETOOL_GPU_DEBUG;
        else env.NODETOOL_GPU_DEBUG = prev;
      }
      // Restore the explicit-on state for the rest of the suite.
      setPremulDebugEnabled(true);
    }
  });

  it("reports zero violations for a valid premul input (identity copy)", async () => {
    const gpuDevice = device as GPUDevice;
    const ctx = createGPUContextFromDevice(gpuDevice);
    const executor = createExecutor();

    const width = 4;
    const height = 4;
    // Valid premul texels: rgb <= a everywhere.
    // Use a=200 and rgb=100 — every channel safely under alpha.
    const pixels = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      pixels[i * 4 + 0] = 100;
      pixels[i * 4 + 1] = 100;
      pixels[i * 4 + 2] = 100;
      pixels[i * 4 + 3] = 200;
    }

    const source = createLabeledTexture(gpuDevice, {
      label: "valid-premul-source",
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

    // Output needs TEXTURE_BINDING so the validator can sample it.
    const output = createLabeledTexture(gpuDevice, {
      label: "valid-premul-output",
      width,
      height,
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC
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
    gpuDevice.queue.submit([encoder.finish()]);

    const violations = await consumePremulDebugWarnings(ctx);
    expect(violations).toHaveLength(1);
    const [v] = violations;
    expect(v.moduleKey).toBe("_canary.passthrough@1");
    expect(v.totalChecked).toBe(width * height);
    expect(v.rgbExceedsA).toBe(0);
    expect(v.negative).toBe(0);
    expect(v.nan).toBe(0);

    source.destroy();
    output.destroy();
    ctx.scratch.dispose();
  });

  it("flags rgb > a violations on a malformed premul texture", async () => {
    const gpuDevice = device as GPUDevice;
    const ctx = createGPUContextFromDevice(gpuDevice);
    const executor = createExecutor();

    const width = 4;
    const height = 4;
    // Deliberately invalid premul: rgb=255, a=128 — every texel violates.
    const pixels = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      pixels[i * 4 + 0] = 255;
      pixels[i * 4 + 1] = 255;
      pixels[i * 4 + 2] = 255;
      pixels[i * 4 + 3] = 128;
    }

    const source = createLabeledTexture(gpuDevice, {
      label: "invalid-premul-source",
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
      label: "invalid-premul-output",
      width,
      height,
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC
    });

    const encoder = gpuDevice.createCommandEncoder();
    // tint = identity (1,1,1,1) so the output is a byte-exact copy of the
    // invalid source.
    executor.encode({
      ctx,
      module: passthroughV1,
      encoder,
      inputs: { source },
      output,
      params: { tint: d.vec4f(1, 1, 1, 1) },
      dispatch: { kind: "fragment" }
    });
    gpuDevice.queue.submit([encoder.finish()]);

    const violations = await consumePremulDebugWarnings(ctx);
    expect(violations).toHaveLength(1);
    const [v] = violations;
    expect(v.moduleKey).toBe("_canary.passthrough@1");
    expect(v.totalChecked).toBe(width * height);
    expect(v.rgbExceedsA).toBe(width * height);
    expect(v.negative).toBe(0);
    expect(v.nan).toBe(0);

    source.destroy();
    output.destroy();
    ctx.scratch.dispose();
  });

  it("returns empty list when no validation passes were encoded", async () => {
    const gpuDevice = device as GPUDevice;
    const ctx = createGPUContextFromDevice(gpuDevice);
    const violations = await consumePremulDebugWarnings(ctx);
    expect(violations).toEqual([]);
  });
});
