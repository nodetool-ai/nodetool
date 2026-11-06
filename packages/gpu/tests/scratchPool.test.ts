import { expect, it, vi } from "vitest";
import { makeScratchPool } from "../src/context.js";
import { getNodeGPUDevice } from "../src/node.js";

it("separates formats and metadata, budgets physical bytes and releases once", async () => {
  const device = await getNodeGPUDevice();
  const pool = makeScratchPool(device, { maxFreeBytes: 64 * 64 * 4 });
  const spec = { width: 1, height: 1, format: "rgba8unorm", usage: GPUTextureUsage.TEXTURE_BINDING } as const;
  const byte = pool.acquire(spec);
  const half = pool.acquire({ ...spec, format: "rgba16float" });
  expect(half).not.toBe(byte);
  const releaseHalf = vi.spyOn(half, "destroy");
  const releaseByte = vi.spyOn(byte, "destroy");
  pool.release(byte);
  pool.release(byte);
  pool.release(half); // Half exceeds the whole budget and is destroyed.
  expect(releaseHalf).toHaveBeenCalledTimes(1);
  expect(pool.acquire(spec)).toBe(byte);
  const nextHalf = pool.acquire({ ...spec, format: "rgba16float" });
  expect(nextHalf).not.toBe(half);
  pool.release(byte);
  expect(pool.acquire({ ...spec, meta: { alpha: "straight" } })).not.toBe(byte);
  pool.dispose();
  expect(releaseByte).toHaveBeenCalledTimes(1);
  expect(releaseHalf).toHaveBeenCalledTimes(1);
});

it("reuses each format independently when both fit the retention budget", async () => {
  const device = await getNodeGPUDevice();
  const pool = makeScratchPool(device, { maxFreeBytes: 64 * 64 * 12 });
  const spec = { width: 1, height: 1, format: "rgba8unorm", usage: GPUTextureUsage.TEXTURE_BINDING } as const;
  const byte = pool.acquire(spec);
  const half = pool.acquire({ ...spec, format: "rgba16float" });
  pool.release(byte);
  pool.release(half);
  expect(pool.acquire(spec)).toBe(byte);
  expect(pool.acquire({ ...spec, format: "rgba16float" })).toBe(half);
  pool.dispose();
});
