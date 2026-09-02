/**
 * The GPU compositor's half of I2: an effect type this build cannot apply
 * reaches `HeadlessFrameCompositor` on a real device and is skipped, not
 * thrown on. The Canvas 2D half and the scene model are in
 * `render.forwardCompat.test.ts`; only the GPU path needs pixels, because the
 * effect chain there allocates textures and would fail loudly if an unmatched
 * type reached a shader step.
 *
 * A missing WebGPU adapter skips the suite and says why. On headless Linux that
 * means no Vulkan ICD — see AGENTS.md § WebGPU on a headless machine.
 */
import { describe, expect, it } from "vitest";
import type { ClipEffect } from "../src/index.js";
import {
  HeadlessFrameCompositor,
  type FrameLayer
} from "../src/render/frameCompositor.js";

const noAdapterReason = await (async (): Promise<string | null> => {
  try {
    const { getNodeGPUDevice } = await import("@nodetool-ai/gpu/node");
    await getNodeGPUDevice();
    return null;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `render.forwardCompat.gpu: skipping every case — no WebGPU device. ${reason}\n`
    );
    return reason;
  }
})();

const SIZE = 32;

/** An opaque white frame. */
function white(): FrameLayer["source"] {
  const rgba = new Uint8Array(SIZE * SIZE * 4).fill(255);
  return { rgba, width: SIZE, height: SIZE, version: "white" };
}

const filmGrain: ClipEffect = {
  id: "fx-grain",
  type: "filmGrain",
  enabled: true,
  size: 2,
  strength: 0.4
};

const layer = (effects: ClipEffect[]): FrameLayer => ({
  id: "l1",
  source: white(),
  opacity: 1,
  blendMode: "normal",
  zIndex: 0,
  effects
});

describe.runIf(!noAdapterReason)(
  "HeadlessFrameCompositor — unknown effect",
  () => {
    it("renders the layer unchanged instead of throwing", async () => {
      const { getNodeGPUDevice } = await import("@nodetool-ai/gpu/node");
      const device = await getNodeGPUDevice();
      const compositor = new HeadlessFrameCompositor(device, SIZE, SIZE);
      try {
        const plain = await compositor.renderFrame([layer([])]);
        const withUnknown = await compositor.renderFrame([layer([filmGrain])]);
        expect([...withUnknown]).toEqual([...plain]);
      } finally {
        compositor.dispose();
      }
    });
  }
);
