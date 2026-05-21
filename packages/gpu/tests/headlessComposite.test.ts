import { describe, it, expect } from "vitest";
import { compositeLayersHeadless } from "../src/compositor/headless.js";
import { blendModeGpuId } from "../src/blend/blendModes.js";

/**
 * End-to-end proof of the headless (server-side) compositing path: upload two
 * straight-alpha RGBA layers, blend them through `WebGPULayerCompositor`, and
 * read the pixels back. Requires a real `GPUDevice` (browser `navigator.gpu`
 * or the Node Dawn `webgpu` package); skips when none is available, exactly
 * like the canary smoke test.
 */
async function tryGetDevice(): Promise<GPUDevice | null> {
  const nav = (globalThis as { navigator?: { gpu?: GPU } }).navigator;
  if (nav?.gpu) {
    const adapter = await nav.gpu.requestAdapter();
    return (await adapter?.requestDevice()) ?? null;
  }
  try {
    const spec = "webgpu";
    const dawn = (await import(/* @vite-ignore */ spec)) as {
      create?: (flags: string[]) => GPU;
    };
    const gpu = dawn.create?.([]);
    const adapter = await gpu?.requestAdapter();
    return (await adapter?.requestDevice()) ?? null;
  } catch {
    return null;
  }
}

function solid(
  width: number,
  height: number,
  rgba: [number, number, number, number]
): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    out[i * 4] = rgba[0];
    out[i * 4 + 1] = rgba[1];
    out[i * 4 + 2] = rgba[2];
    out[i * 4 + 3] = rgba[3];
  }
  return out;
}

const device = await tryGetDevice();

describe.skipIf(!device)("headless composite (GPU)", () => {
  it("an opaque top layer fully covers the base", async () => {
    const dev = device as GPUDevice;
    const result = await compositeLayersHeadless(
      dev,
      [
        {
          rgba: solid(2, 2, [255, 0, 0, 255]),
          width: 2,
          height: 2,
          opacity: 1,
          blendModeId: blendModeGpuId("normal")
        },
        {
          rgba: solid(2, 2, [0, 0, 255, 255]),
          width: 2,
          height: 2,
          opacity: 1,
          blendModeId: blendModeGpuId("normal")
        }
      ],
      2,
      2
    );
    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    for (let i = 0; i < 4; i++) {
      expect(result.rgba[i * 4]).toBe(0);
      expect(result.rgba[i * 4 + 2]).toBe(255);
      expect(result.rgba[i * 4 + 3]).toBe(255);
    }
  });

  it("a half-opacity normal layer blends 50/50 with the base", async () => {
    const dev = device as GPUDevice;
    const result = await compositeLayersHeadless(
      dev,
      [
        {
          rgba: solid(2, 2, [255, 0, 0, 255]),
          width: 2,
          height: 2,
          opacity: 1,
          blendModeId: blendModeGpuId("normal")
        },
        {
          rgba: solid(2, 2, [0, 0, 255, 255]),
          width: 2,
          height: 2,
          opacity: 0.5,
          blendModeId: blendModeGpuId("normal")
        }
      ],
      2,
      2
    );
    // co = 0.5*blue + 0.5*red ≈ (127, 0, 127), αo = 1.
    expect(Math.abs(result.rgba[0] - 127)).toBeLessThanOrEqual(2);
    expect(result.rgba[1]).toBe(0);
    expect(Math.abs(result.rgba[2] - 127)).toBeLessThanOrEqual(2);
    expect(result.rgba[3]).toBe(255);
  });
});
