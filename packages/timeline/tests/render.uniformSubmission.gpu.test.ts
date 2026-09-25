import { describe, expect, it } from "vitest";
import { getNodeGPUDevice } from "@nodetool-ai/gpu/node";
import type { ClipEffect } from "../src/index.js";
import {
  HeadlessFrameCompositor,
  type FrameLayer,
  type FrameLayerPixels
} from "../src/render/frameCompositor.js";

const SIZE = 16;

function source(): FrameLayerPixels {
  const rgba = new Uint8Array(SIZE * SIZE * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba.set([32, 48, 96, 255], i);
  }
  return { rgba, width: SIZE, height: SIZE, version: "navy" };
}

function layer(effects: ClipEffect[]): FrameLayer {
  return {
    id: "dense-shot",
    source: source(),
    opacity: 1,
    blendMode: "normal",
    zIndex: 0,
    effects
  };
}

const neutralEffects: ClipEffect[] = Array.from({ length: 64 }, (_, index) => ({
  id: `neutral-${index}`,
  type: "grain",
  enabled: true,
  amount: 0
}));

describe("effect uniforms within a frame submission", () => {
  it.each<ClipEffect>([
    { id: "grain", type: "grain", enabled: true, amount: 0.5, seed: 7 },
    { id: "grade", type: "color", enabled: true, brightness: 0.1 }
  ])("preserves pixels and buffer lifetime with a final $type pass", async (effect) => {
    const device = await getNodeGPUDevice();
    const compositor = new HeadlessFrameCompositor(device, SIZE, SIZE);
    try {
      const expected = await compositor.renderFrame([layer([effect])]);
      // The old 64-slot ring either overwrote the first grain's parameters or
      // destroyed its buffer when the larger color-grade uniform reused it.
      // Repeating on the same compositor also exercises submission reuse.
      for (let frame = 0; frame < 2; frame++) {
        device.pushErrorScope("validation");
        let actual: Uint8Array;
        let error: GPUError | null;
        try {
          actual = await compositor.renderFrame([
            layer([...neutralEffects, effect])
          ]);
        } finally {
          error = await device.popErrorScope();
        }
        expect(error).toBeNull();
        expect(actual).toEqual(expected);
      }
    } finally {
      compositor.dispose();
    }
  });
});
