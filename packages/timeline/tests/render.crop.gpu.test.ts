/**
 * Clip crop on the GPU path.
 *
 * The whole semantics reduce to one equivalence, and that is what is asserted
 * here rather than a golden buffer: **a cropped layer renders exactly like an
 * uncropped layer whose source is the crop.** If that holds, the crop rectangle
 * really has become the layer's picture — the contain fit was recomputed from
 * the cropped size, the transform placed the cropped frame, and the copy took
 * the texels the insets name. If it fails, one of those three is reading the
 * original source size.
 *
 * A missing WebGPU adapter skips the suite and says why. On headless Linux that
 * means no Vulkan ICD — see AGENTS.md § WebGPU on a headless machine.
 */
import { describe, expect, it } from "vitest";
import type { ClipCrop } from "../src/index.js";
import {
  HeadlessFrameCompositor,
  type FrameLayer,
  type FrameLayerPixels
} from "../src/render/frameCompositor.js";

const noAdapterReason = await (async (): Promise<string | null> => {
  try {
    const { getNodeGPUDevice } = await import("@nodetool-ai/gpu/node");
    await getNodeGPUDevice();
    return null;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `render.crop.gpu: skipping every case — no WebGPU device. ${reason}\n`
    );
    return reason;
  }
})();

const FRAME = 64;

/**
 * A distinguishable source: every pixel encodes its own coordinates, so a
 * render that read the wrong texels differs rather than merely looking similar.
 */
function coordinateRamp(
  width: number,
  height: number,
  offsetX = 0,
  offsetY = 0
): FrameLayerPixels {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      rgba[i] = (x + offsetX) * 3;
      rgba[i + 1] = (y + offsetY) * 3;
      rgba[i + 2] = 128;
      rgba[i + 3] = 255;
    }
  }
  return {
    rgba,
    width,
    height,
    version: `ramp-${width}x${height}+${offsetX}+${offsetY}`
  };
}

function layer(over: Partial<FrameLayer> & { source: FrameLayerPixels }): FrameLayer {
  return {
    id: "shot",
    opacity: 1,
    blendMode: "normal",
    zIndex: 0,
    ...over
  };
}

async function renderFrame(layers: FrameLayer[]): Promise<Uint8Array> {
  const { getNodeGPUDevice } = await import("@nodetool-ai/gpu/node");
  const device = await getNodeGPUDevice();
  const compositor = new HeadlessFrameCompositor(device, FRAME, FRAME);
  try {
    return await compositor.renderFrame(layers);
  } finally {
    compositor.dispose();
  }
}

/** Mean absolute difference per byte — 0 is identical. */
function meanDiff(a: Uint8Array, b: Uint8Array): number {
  let total = 0;
  for (let i = 0; i < a.length; i++) total += Math.abs(a[i]! - b[i]!);
  return total / a.length;
}

describe.runIf(noAdapterReason === null)("crop on the GPU path", () => {
  it("renders a cropped source exactly like the pre-cropped source itself", async () => {
    // Keep the middle half of a 64-wide, full-height source: x 16..48.
    const crop: ClipCrop = { left: 0.25, right: 0.25, top: 0, bottom: 0 };
    const cropped = await renderFrame([
      layer({ source: coordinateRamp(64, 64), crop })
    ]);
    // The same picture, handed over already cut: 32×64 starting at x=16.
    const equivalent = await renderFrame([
      layer({ source: coordinateRamp(32, 64, 16, 0) })
    ]);

    expect(Array.from(cropped)).toEqual(Array.from(equivalent));
  });

  it("matches the pre-cropped equivalent on both axes at once", async () => {
    const crop: ClipCrop = {
      left: 0.25,
      right: 0.125,
      top: 0.125,
      bottom: 0.25
    };
    // 64 wide: 16 off the left, 8 off the right → 40 wide from x=16.
    // 64 high: 8 off the top, 16 off the bottom → 40 high from y=8.
    const cropped = await renderFrame([
      layer({ source: coordinateRamp(64, 64), crop })
    ]);
    const equivalent = await renderFrame([
      layer({ source: coordinateRamp(40, 40, 16, 8) })
    ]);

    expect(Array.from(cropped)).toEqual(Array.from(equivalent));
  });

  it("actually changes the frame — the equivalence is not two identical renders", async () => {
    // Without this the two cases above would pass on a crop that did nothing,
    // as long as `coordinateRamp` happened to agree.
    const plain = await renderFrame([layer({ source: coordinateRamp(64, 64) })]);
    const cropped = await renderFrame([
      layer({
        source: coordinateRamp(64, 64),
        crop: { left: 0.25, right: 0.25, top: 0, bottom: 0 }
      })
    ]);

    expect(meanDiff(plain, cropped)).toBeGreaterThan(5);
  });

  it("re-fits the crop to the frame rather than shrinking the picture", async () => {
    // A 32×64 crop of a 64×64 source is 1:2, so contain-fit makes it half the
    // frame wide and full height. The centre column is drawn; the far left is
    // the ground. A crop that knocked pixels out in place instead would leave
    // the kept strip at its original width.
    const cropped = await renderFrame([
      layer({
        source: coordinateRamp(64, 64),
        crop: { left: 0.25, right: 0.25, top: 0, bottom: 0 }
      })
    ]);
    const at = (x: number, y: number) => {
      const i = (y * FRAME + x) * 4;
      return [cropped[i]!, cropped[i + 1]!, cropped[i + 2]!] as const;
    };
    // Centre carries picture (blue channel 128 marks the source).
    expect(at(FRAME / 2, FRAME / 2)[2]).toBe(128);
    // The sides are the opaque-black ground the contain fit left behind.
    expect(at(2, FRAME / 2)).toEqual([0, 0, 0]);
    expect(at(FRAME - 3, FRAME / 2)).toEqual([0, 0, 0]);
  });

  it("draws the whole source when the insets keep no picture", async () => {
    const plain = await renderFrame([layer({ source: coordinateRamp(64, 64) })]);
    const degenerate = await renderFrame([
      layer({
        source: coordinateRamp(64, 64),
        crop: { left: 0.7, right: 0.7, top: 0, bottom: 0 }
      })
    ]);

    expect(Array.from(degenerate)).toEqual(Array.from(plain));
  });

  it("stops cropping when the crop is cleared, reusing the same layer id", async () => {
    // The crop texture is cached by layer id, so a clip that was cropped and is
    // not any more must not keep drawing the stale copy.
    const { getNodeGPUDevice } = await import("@nodetool-ai/gpu/node");
    const device = await getNodeGPUDevice();
    const compositor = new HeadlessFrameCompositor(device, FRAME, FRAME);
    try {
      const source = coordinateRamp(64, 64);
      await compositor.renderFrame([
        layer({ source, crop: { left: 0.25, right: 0.25, top: 0, bottom: 0 } })
      ]);
      const after = await compositor.renderFrame([layer({ source })]);
      const never = await compositor.renderFrame([layer({ source })]);
      expect(Array.from(after)).toEqual(Array.from(never));
    } finally {
      compositor.dispose();
    }
  });
});
