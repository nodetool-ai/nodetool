import { getNodeGPUDevice } from "@nodetool-ai/gpu/node";
import { HeadlessFrameCompositor } from "../src/render/frameCompositor.js";
import type { ClipEffect } from "../src/types.js";

export async function renderEffects(
  width: number,
  height: number,
  data: Uint8ClampedArray,
  effects: ClipEffect[]
): Promise<Uint8Array> {
  const device = await getNodeGPUDevice();
  const renderer = new HeadlessFrameCompositor(device, width, height);
  try {
    return await renderer.renderFrame([{
      id: "fixture", source: { rgba: new Uint8Array(data), width, height },
      opacity: 1, blendMode: "normal", zIndex: 0, effects
    }], [], { alpha: true });
  } finally {
    renderer.dispose();
  }
}
