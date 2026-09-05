/**
 * One queue submission per composited frame (A5.3).
 *
 * Every graded layer, mask, matte and precomposite used to finish and submit
 * its own command buffer, so a frame's cost included a queue round trip per
 * call and the GPU idled between them. This counts the submissions a frame
 * makes by wrapping `device.queue.submit`, and asserts the picture is the same
 * one — a batching change that alters a pixel is a regression, not an
 * optimization.
 *
 * A missing WebGPU adapter skips the suite and says why. On headless Linux
 * that means no Vulkan ICD — see AGENTS.md § WebGPU on a headless machine.
 */
import { describe, expect, it } from "vitest";
import {
  HeadlessFrameCompositor,
  type FrameLayer,
  type FramePrecomposite
} from "../src/render/frameCompositor.js";
import type { ClipEffect } from "../src/types.js";

const noAdapterReason = await (async (): Promise<string | null> => {
  try {
    const { getNodeGPUDevice } = await import("@nodetool-ai/gpu/node");
    await getNodeGPUDevice();
    return null;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `render.frameSubmits.gpu: skipping every case — no WebGPU device. ${reason}\n`
    );
    return reason;
  }
})();

const SIZE = 32;

function band(fromX: number, toX: number, tag: string): FrameLayer["source"] {
  const rgba = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = fromX; x < toX; x++) {
      const i = (y * SIZE + x) * 4;
      rgba[i] = 255;
      rgba[i + 1] = 255;
      rgba[i + 2] = 255;
      rgba[i + 3] = 255;
    }
  }
  return { rgba, width: SIZE, height: SIZE, version: tag };
}

const grade: ClipEffect = {
  id: "grade",
  type: "color",
  enabled: true,
  brightness: 0,
  contrast: 1,
  saturation: 1
};

const group: FramePrecomposite = {
  id: "g",
  zIndex: 10,
  opacity: 1,
  blendMode: "normal",
  effects: [grade]
};

/** Two graded layers inside a graded group: four effect chains, one frame. */
function layers(): FrameLayer[] {
  return [
    {
      id: "a",
      source: band(0, 16, "a"),
      opacity: 1,
      blendMode: "normal",
      zIndex: 0,
      effects: [grade],
      precomposeGroupId: "g"
    },
    {
      id: "b",
      source: band(16, SIZE, "b"),
      opacity: 1,
      blendMode: "normal",
      zIndex: 1,
      effects: [grade],
      precomposeGroupId: "g"
    }
  ];
}

describe.runIf(!noAdapterReason)("HeadlessFrameCompositor — submissions", () => {
  it("submits the frame's compositing work once, with the same pixels", async () => {
    const { getNodeGPUDevice } = await import("@nodetool-ai/gpu/node");
    const device = await getNodeGPUDevice();
    const compositor = new HeadlessFrameCompositor(device, SIZE, SIZE);
    const queue = device.queue;
    const realSubmit = queue.submit.bind(queue);
    let submits = 0;
    try {
      const before = await compositor.renderFrame(layers(), [group]);
      queue.submit = ((buffers: GPUCommandBuffer[]) => {
        submits += 1;
        return realSubmit(buffers);
      }) as typeof queue.submit;
      const after = await compositor.renderFrame(layers(), [group]);
      // The composite is one submission; the readback the frame ends with is
      // its own, which is why this is 2 and not 1. Before the change the same
      // frame submitted one per effect chain, precomposite and resolve.
      expect(submits).toBeLessThanOrEqual(2);
      expect(Buffer.from(after)).toEqual(Buffer.from(before));
    } finally {
      queue.submit = realSubmit;
      compositor.dispose();
    }
  });

  it("reads consecutive frames back in order through alternating buffers", async () => {
    const { getNodeGPUDevice } = await import("@nodetool-ai/gpu/node");
    const device = await getNodeGPUDevice();
    const compositor = new HeadlessFrameCompositor(device, SIZE, SIZE);
    const wide: FrameLayer = {
      id: "w",
      source: band(0, SIZE, "w"),
      opacity: 1,
      blendMode: "normal",
      zIndex: 0
    };
    const narrow: FrameLayer = {
      id: "w",
      source: band(0, 8, "n"),
      opacity: 1,
      blendMode: "normal",
      zIndex: 0
    };
    try {
      // Three frames in a row cover both buffers twice. Each frame must be its
      // own picture: a frame that read the other buffer would come back as its
      // neighbour.
      const first = Buffer.from(await compositor.renderFrame([wide]));
      const second = Buffer.from(await compositor.renderFrame([narrow]));
      const third = Buffer.from(await compositor.renderFrame([wide]));
      expect(third).toEqual(first);
      expect(second).not.toEqual(first);
    } finally {
      compositor.dispose();
    }
  });
});
