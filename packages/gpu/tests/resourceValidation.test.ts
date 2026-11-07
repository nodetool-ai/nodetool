import { expect, it, vi } from "vitest";
import { createNodeGPUDevice, getNodeGPUDevice } from "../src/node.js";
import { checkRenderTexture, validateRenderTexture } from "../src/resourceValidation.js";
import { createGPUContextFromDevice } from "../src/context.js";

it("supports real RGBA8 and FP16 renderer usages without shader-f16", async () => {
  const device = await getNodeGPUDevice();
  expect(device.features.has("shader-f16")).toBe(false);
  const ctx = createGPUContextFromDevice(device);
  expect(ctx.capabilities.f16Storage).toBe(true);
  expect(ctx.capabilities.shaderF16).toBe(false);
  const usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST;
  for (const format of ["rgba8unorm", "rgba16float"] as const) {
    await checkRenderTexture(device, 3, 2, format, usage);
  }
  expect(() => validateRenderTexture(device, device.limits.maxTextureDimension2D + 1, 2, "rgba16float", usage)).toThrow("limit");
  ctx.scratch.dispose();
  ctx.uniformRing.dispose();
});

it("reports asynchronous allocation validation and device loss", async () => {
  const device = await createNodeGPUDevice();
  try {
    await expect(checkRenderTexture(device, 1, 1, "rgba16float", 0x80000000)).rejects.toThrow("allocation failed");
    device.destroy();
    await device.lost;
    await expect(checkRenderTexture(device, 1, 1, "rgba16float", GPUTextureUsage.COPY_SRC)).rejects.toThrow("device lost");
  } finally {
    device.destroy();
  }
});

it("preserves BGRA presentation resources without requesting storage features", async () => {
  const device = await getNodeGPUDevice();
  await checkRenderTexture(device, 3, 2, "bgra8unorm", GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST);
  expect(() => validateRenderTexture(device, 3, 2, "bgra8unorm", GPUTextureUsage.STORAGE_BINDING)).toThrow("Storage binding");
});


it("releases partial resize allocations and preserves the old pair on failure", async () => {
  const { WebGPULayerCompositor } = await import("../src/compositor/compositor.js");
  const device = await getNodeGPUDevice();
  const compositor = new WebGPULayerCompositor(device, "rgba16float");
  compositor.ensureSize(2, 2);
  const previous = compositor.textureA;
  const create = device.createTexture.bind(device);
  let calls = 0;
  let destroyPartial: ReturnType<typeof vi.spyOn> | undefined;
  const allocation = vi.spyOn(device, "createTexture").mockImplementation((descriptor) => {
    if (++calls === 2) throw new Error("injected allocation failure");
    const texture = create(descriptor);
    destroyPartial = vi.spyOn(texture, "destroy");
    return texture;
  });
  try {
    expect(() => compositor.ensureSize(3, 3)).toThrow("allocation failure");
    expect(compositor.textureA).toBe(previous);
    expect(destroyPartial).toHaveBeenCalledTimes(1);
  } finally {
    allocation.mockRestore();
    compositor.dispose();
  }
});
