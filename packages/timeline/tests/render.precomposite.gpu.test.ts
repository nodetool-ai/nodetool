/**
 * `HeadlessFrameCompositor`'s precomposite pass, against a real WebGPU device.
 *
 * The scene-model and Canvas 2D halves are checked structurally in
 * `render.precomposite.test.ts`; this one reads pixels back, because what a
 * second compositor pass is for is only visible in them: two overlapping
 * children under a half-opaque group have to read as one 50% layer, not as two
 * stacked ones, and a group blur has to soften the composed edge rather than
 * each child's own.
 *
 * A missing WebGPU adapter skips the suite and says why. On headless Linux that
 * means no Vulkan ICD — see AGENTS.md § WebGPU on a headless machine, which
 * installs lavapipe (CI does exactly that on the test-packages leg).
 */
import { describe, expect, it } from "vitest";
import type { ClipEffect } from "../src/index.js";
import {
  HeadlessFrameCompositor,
  type FrameLayer,
  type FramePrecomposite
} from "../src/render/frameCompositor.js";

/**
 * Probed at module load, not in `beforeAll` — vitest decides `describe.runIf`
 * while collecting, which is before any hook has run.
 */
const noAdapterReason = await (async (): Promise<string | null> => {
  try {
    const { getNodeGPUDevice } = await import("@nodetool-ai/gpu/node");
    await getNodeGPUDevice();
    return null;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    // Straight to stderr: this runs while vitest is collecting, where a
    // console.* call is swallowed rather than reported.
    process.stderr.write(
      `render.precomposite.gpu: skipping every case — no WebGPU device. ${reason}\n`
    );
    return reason;
  }
})();

const SIZE = 64;

/** Opaque white over `[fromX, toX)` of a frame-sized source, transparent elsewhere. */
function band(fromX: number, toX: number): FrameLayer["source"] {
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
  return { rgba, width: SIZE, height: SIZE, version: `${fromX}-${toX}` };
}

/** The red channel of the pixel at `x` on the frame's middle row. */
function redAt(frame: Uint8Array, x: number): number {
  return frame[((SIZE >> 1) * SIZE + x) * 4]!;
}

/** A neutral grade: enough to make a group precomposite, invisible in the pixels. */
const neutralColor: ClipEffect = {
  id: "neutral",
  type: "color",
  enabled: true,
  brightness: 0,
  contrast: 1,
  saturation: 1
};

const child = (id: string, source: FrameLayer["source"]): FrameLayer => ({
  id,
  source,
  opacity: 1,
  blendMode: "normal",
  zIndex: id === "left" ? 0 : 1,
  precomposeGroupId: "g"
});

const halfOpaqueGroup: FramePrecomposite = {
  id: "g",
  zIndex: 10,
  opacity: 0.5,
  blendMode: "normal",
  effects: [neutralColor]
};

describe.runIf(!noAdapterReason)("HeadlessFrameCompositor — precomposite", () => {
  async function withCompositor(
    run: (compositor: HeadlessFrameCompositor) => Promise<void>
  ): Promise<void> {
    const { getNodeGPUDevice } = await import("@nodetool-ai/gpu/node");
    const device = await getNodeGPUDevice();
    const compositor = new HeadlessFrameCompositor(device, SIZE, SIZE);
    try {
      await run(compositor);
    } finally {
      compositor.dispose();
    }
  }

  it("blends two overlapping children as one 50% layer", async () => {
    await withCompositor(async (compositor) => {
      const frame = await compositor.renderFrame(
        [child("left", band(0, 40)), child("right", band(24, SIZE))],
        [halfOpaqueGroup]
      );
      // Left only, overlap, right only: white at 50% over black is 128
      // everywhere. A per-child opacity path lands the overlap near 191.
      const alone = redAt(frame, 10);
      expect(alone).toBeGreaterThan(120);
      expect(alone).toBeLessThan(136);
      expect(Math.abs(redAt(frame, 32) - alone)).toBeLessThanOrEqual(2);
      expect(Math.abs(redAt(frame, 50) - alone)).toBeLessThanOrEqual(2);
    });
  });

  it("stacks the same children twice without the group's effects", async () => {
    // The same fixture with nothing to precomposite for: the group's opacity
    // rides on each child, so the overlap is composited twice. This is what the
    // case above has to differ from, and it is what T9 already did.
    await withCompositor(async (compositor) => {
      const stacked = [
        { ...child("left", band(0, 40)), opacity: 0.5, precomposeGroupId: undefined },
        { ...child("right", band(24, SIZE)), opacity: 0.5, precomposeGroupId: undefined }
      ];
      const frame = await compositor.renderFrame(stacked);
      expect(redAt(frame, 10)).toBeLessThan(136);
      expect(redAt(frame, 32)).toBeGreaterThan(180);
    });
  });

  it("blurs the composed surface, softening the edge the children make", async () => {
    await withCompositor(async (compositor) => {
      const sharp = await compositor.renderFrame([
        { ...child("left", band(0, 32)), precomposeGroupId: undefined }
      ]);
      expect(redAt(sharp, 31)).toBeGreaterThan(240);
      expect(redAt(sharp, 33)).toBeLessThan(16);

      const blurred = await compositor.renderFrame(
        [child("left", band(0, 32))],
        [
          {
            id: "g",
            zIndex: 10,
            opacity: 1,
            blendMode: "normal",
            effects: [{ id: "b", type: "blur", enabled: true, radius: 8 }]
          }
        ]
      );
      // The group's blur ran on the composed surface: the hard edge at x = 32
      // has become a ramp, so both sides of it sit well inside the extremes.
      expect(redAt(blurred, 31)).toBeLessThan(220);
      expect(redAt(blurred, 33)).toBeGreaterThan(30);
    });
  });
});
