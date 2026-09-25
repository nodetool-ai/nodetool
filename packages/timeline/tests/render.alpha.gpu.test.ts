import { afterAll, describe, expect, it } from "vitest";
import {
  HeadlessFrameCompositor,
  type FrameAdjustment,
  type FrameLayer
} from "../src/render/frameCompositor.js";

const noAdapterReason = await (async (): Promise<string | null> => {
  try {
    const { getNodeGPUDevice } = await import("@nodetool-ai/gpu/node");
    await getNodeGPUDevice();
    return null;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(`render.alpha.gpu: skipping every case — no WebGPU device. ${reason}\n`);
    return reason;
  }
})();

const SIZE = 32;
let compositor: HeadlessFrameCompositor | null = null;

async function render(
  pixels: [number, number, number, number],
  alpha: boolean,
  opacity = 1
): Promise<[number, number, number, number]> {
  if (!compositor) {
    const { getNodeGPUDevice } = await import("@nodetool-ai/gpu/node");
    compositor = new HeadlessFrameCompositor(await getNodeGPUDevice(), SIZE, SIZE);
  }
  const rgba = new Uint8Array(SIZE * SIZE * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba.set(pixels, i);
  }
  const layer: FrameLayer = {
    id: "source",
    source: { rgba, width: SIZE, height: SIZE },
    opacity,
    blendMode: "normal",
    zIndex: 0
  };
  const result = await compositor.renderFrame([layer], [], { alpha });
  const i = (SIZE / 2 * SIZE + SIZE / 2) * 4;
  return [result[i]!, result[i + 1]!, result[i + 2]!, result[i + 3]!];
}

afterAll(() => {
  compositor?.dispose();
  compositor = null;
});

describe.runIf(noAdapterReason === null)("single-sample GPU alpha resolve", () => {
  it("returns straight RGB for a translucent source", async () => {
    const pixel = await render([240, 80, 32, 128], true);
    expect(pixel[3]).toBe(128);
    expect(Math.abs(pixel[0] - 240)).toBeLessThanOrEqual(2);
    expect(Math.abs(pixel[1] - 80)).toBeLessThanOrEqual(2);
    expect(Math.abs(pixel[2] - 32)).toBeLessThanOrEqual(2);
  });

  it("sets RGB to zero at zero alpha", async () => {
    expect(await render([240, 80, 32, 0], true)).toEqual([0, 0, 0, 0]);
  });

  it("keeps the opaque ground and blends a translucent source", async () => {
    const pixel = await render([240, 80, 32, 128], false);
    expect(pixel[3]).toBe(255);
    expect(Math.abs(pixel[0] - 120)).toBeLessThanOrEqual(1);
    expect(Math.abs(pixel[1] - 40)).toBeLessThanOrEqual(1);
    expect(Math.abs(pixel[2] - 16)).toBeLessThanOrEqual(1);
  });

  it("leaves an opaque source unchanged", async () => {
    expect(await render([10, 20, 30, 255], true)).toEqual([10, 20, 30, 255]);
  });

  it("resolves alpha lowered by an adjustment after the opaque ground", async () => {
    if (!compositor) {
      const { getNodeGPUDevice } = await import("@nodetool-ai/gpu/node");
      compositor = new HeadlessFrameCompositor(await getNodeGPUDevice(), SIZE, SIZE);
    }
    const rgba = new Uint8Array(SIZE * SIZE * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba.set([0, 255, 0, 255], i);
    }
    const layer: FrameLayer = {
      id: "green",
      source: { rgba, width: SIZE, height: SIZE },
      opacity: 1,
      blendMode: "normal",
      zIndex: 0
    };
    const adjustment: FrameAdjustment = {
      id: "key",
      zIndex: 1,
      opacity: 1,
      effects: [{
        id: "chroma-key",
        type: "chromaKey",
        enabled: true,
        color: "#00ff00",
        tolerance: 0.3,
        softness: 0.05
      }]
    };
    const result = await compositor.renderFrame([layer], [], {}, [adjustment]);
    const i = (SIZE / 2 * SIZE + SIZE / 2) * 4;
    expect([...result.subarray(i, i + 4)]).toEqual([0, 0, 0, 0]);
  });
});
