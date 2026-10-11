/**
 * A layer whose source is ready but whose placement covers no area counts as
 * drawn, so the host presents a cleared frame rather than holding the last
 * one. A layer whose source has no pixels yet (still decoding) does not.
 *
 * A missing WebGPU adapter skips the suite and says why. On headless Linux that
 * means no Vulkan ICD — see AGENTS.md § WebGPU on a headless machine.
 */
import { describe, expect, it } from "vitest";
import {
  GpuFrameCompositor,
  type FrameLayer,
  type GpuSourceTexture
} from "../src/render/frameCompositor.js";

const noAdapterReason = await (async (): Promise<string | null> => {
  try {
    const { getNodeGPUDevice } = await import("@nodetool-ai/gpu/node");
    await getNodeGPUDevice();
    return null;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `render.emptyLayer.gpu: skipping every case — no WebGPU device. ${reason}\n`
    );
    return reason;
  }
})();

const FRAME = 16;

/** `null` stands for a source that is still decoding. */
type Source = { width: number; height: number } | null;

async function drawnCount(layers: FrameLayer<Source>[]): Promise<number> {
  const { getNodeGPUDevice } = await import("@nodetool-ai/gpu/node");
  const device = await getNodeGPUDevice();
  const textures: GPUTexture[] = [];
  const compositor = new GpuFrameCompositor<Source>(device, FRAME, FRAME, {
    upload: (_id, source): GpuSourceTexture | null => {
      if (!source) return null;
      const texture = device.createTexture({
        size: source,
        format: "rgba8unorm",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.COPY_SRC |
          GPUTextureUsage.RENDER_ATTACHMENT
      });
      textures.push(texture);
      return { texture, width: source.width, height: source.height };
    }
  });
  try {
    const { drawn } = compositor.composite(layers, [], { r: 0, g: 0, b: 0, a: 1 });
    await device.queue.onSubmittedWorkDone();
    return drawn;
  } finally {
    compositor.dispose();
    for (const texture of textures) texture.destroy();
  }
}

function layer(id: string, source: Source, scale = 1): FrameLayer<Source> {
  return {
    id,
    source,
    opacity: 1,
    blendMode: "normal",
    zIndex: 0,
    transform: {
      position: { x: 0, y: 0 },
      scale: { x: scale, y: scale },
      rotation: 0,
      anchor: { x: 0.5, y: 0.5 }
    }
  };
}

describe.runIf(noAdapterReason === null)("empty layers on the GPU path", () => {
  it("counts a ready layer scaled to zero as drawn", async () => {
    expect(await drawnCount([layer("gone", { width: 8, height: 8 }, 0)])).toBe(1);
  });

  it("does not count a layer whose source is still decoding", async () => {
    expect(await drawnCount([layer("decoding", null)])).toBe(0);
  });

  it("counts a layer drawing pixels", async () => {
    expect(await drawnCount([layer("shown", { width: 8, height: 8 })])).toBe(1);
  });
});
