/**
 * Shape masks and track mattes on the GPU path (F7, T12, D6).
 *
 * The Canvas 2D suite in `packages/agents/tests/timeline-mask-frames.test.ts`
 * makes the same four claims off `@napi-rs/canvas`. Two compositors cutting one
 * mask differently is the failure this pins (AS1), and only pixels off a real
 * device can say they do not.
 *
 * The mask raster arrives as pixels because that is the contract: the host owns
 * a canvas and the compositor does not, so `drawMask` runs there. The coverage
 * buffers here are built analytically for the same reason a shader test uses a
 * known signal — what is under test is `mask.apply@1` and `mask.fromImage@1`
 * being wired to the right textures, not the rasterizer.
 *
 * A missing WebGPU adapter skips the suite and says why. On headless Linux that
 * means no Vulkan ICD — see AGENTS.md § WebGPU on a headless machine, which
 * installs lavapipe (CI does exactly that on the test-packages leg).
 */
import { describe, expect, it } from "vitest";
import {
  HeadlessFrameCompositor,
  type FrameLayer,
  type FrameLayerPixels
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
    process.stderr.write(
      `render.mask.gpu: skipping every case — no WebGPU device. ${reason}\n`
    );
    return reason;
  }
})();

const SIZE = 64;

/** A frame-sized opaque source in one colour. */
function solid(r: number, g: number, b: number): FrameLayerPixels {
  return pixels(`solid-${r}-${g}-${b}`, () => [r, g, b, 255]);
}

/** A frame-sized buffer whose pixels come from `at(x, y)`. */
function pixels(
  version: string,
  at: (x: number, y: number) => [number, number, number, number]
): FrameLayerPixels {
  const rgba = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const [r, g, b, a] = at(x, y);
      const i = (y * SIZE + x) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = a;
    }
  }
  return { rgba, width: SIZE, height: SIZE, version };
}

/** Coverage in alpha, white RGB — the shape `drawMask` hands the compositor. */
function ellipseCoverage(invert: boolean): FrameLayerPixels {
  const r = SIZE / 2;
  return pixels(`ellipse-${invert}`, (x, y) => {
    const dx = (x + 0.5 - r) / r;
    const dy = (y + 0.5 - r) / r;
    const inside = dx * dx + dy * dy <= 1;
    return [255, 255, 255, (invert ? !inside : inside) ? 255 : 0];
  });
}

async function renderFrame(layers: FrameLayer[]): Promise<Uint8Array> {
  const { getNodeGPUDevice } = await import("@nodetool-ai/gpu/node");
  const device = await getNodeGPUDevice();
  const compositor = new HeadlessFrameCompositor(device, SIZE, SIZE);
  try {
    return await compositor.renderFrame(layers);
  } finally {
    compositor.dispose();
  }
}

/** The RGB of one pixel of a straight-alpha RGBA8 frame. */
function pixelAt(
  rgba: Uint8Array,
  x: number,
  y: number
): [number, number, number] {
  const i = (y * SIZE + x) * 4;
  return [rgba[i]!, rgba[i + 1]!, rgba[i + 2]!];
}

const baseLayer = (over: Partial<FrameLayer>): FrameLayer => ({
  id: "shot",
  source: solid(255, 0, 0),
  opacity: 1,
  blendMode: "normal",
  zIndex: 0,
  ...over
});

describe.runIf(noAdapterReason === null)(
  "HeadlessFrameCompositor — masks and mattes",
  () => {
    it("an ellipse mask keeps the centre and cuts the corners", async () => {
      const frame = await renderFrame([
        baseLayer({ shapeMask: ellipseCoverage(false) })
      ]);

      expect(pixelAt(frame, SIZE / 2, SIZE / 2)[0]).toBeGreaterThan(240);
      for (const [x, y] of [
        [1, 1],
        [SIZE - 2, 1],
        [1, SIZE - 2],
        [SIZE - 2, SIZE - 2]
      ]) {
        expect(pixelAt(frame, x!, y!)[0]).toBeLessThan(12);
      }
    });

    it("inverting the mask reads the reverse", async () => {
      const frame = await renderFrame([
        baseLayer({ shapeMask: ellipseCoverage(true) })
      ]);

      expect(pixelAt(frame, SIZE / 2, SIZE / 2)[0]).toBeLessThan(12);
      expect(pixelAt(frame, 1, 1)[0]).toBeGreaterThan(240);
    });

    it("a masked layer keeps its full colour, not a dimmed one", async () => {
      // `mask.apply@1` works premultiplied; feeding its output to the blend
      // shader without converting back scaled RGB by coverage a second time,
      // which showed up as a dark ring rather than a soft edge. A half-covered
      // pixel of pure red must still read as red at half strength over black.
      const half = pixels("half", () => [255, 255, 255, 128]);
      const frame = await renderFrame([baseLayer({ shapeMask: half })]);
      const [r, g, b] = pixelAt(frame, SIZE / 2, SIZE / 2);
      expect(r).toBeGreaterThan(116);
      expect(r).toBeLessThan(140);
      expect(g).toBeLessThan(12);
      expect(b).toBeLessThan(12);
    });

    it("a luma matte from a gradient produces a ramp", async () => {
      const ramp = pixels("ramp", (x) => {
        const v = Math.round((x / (SIZE - 1)) * 255);
        return [v, v, v, 255];
      });
      const frame = await renderFrame([
        baseLayer({
          source: solid(255, 255, 255),
          matte: {
            mode: "luma",
            invert: false,
            layer: { id: "key", source: ramp, opacity: 1, blendMode: "normal", zIndex: 0 }
          }
        })
      ]);

      const left = pixelAt(frame, 2, SIZE / 2)[0];
      const middle = pixelAt(frame, SIZE / 2, SIZE / 2)[0];
      const right = pixelAt(frame, SIZE - 3, SIZE / 2)[0];
      expect(left).toBeLessThan(24);
      expect(middle).toBeGreaterThan(100);
      expect(middle).toBeLessThan(155);
      expect(right).toBeGreaterThan(230);
      expect(left).toBeLessThan(middle);
      expect(middle).toBeLessThan(right);
    });

    it("a matte source never draws itself", async () => {
      // The source is opaque green on the left half and transparent on the
      // right. The red layer survives only on the left, and green — the one
      // colour that could only come from the source drawing — is nowhere.
      const keyhole = pixels("keyhole", (x) =>
        x < SIZE / 2 ? [0, 255, 0, 255] : [0, 255, 0, 0]
      );
      const frame = await renderFrame([
        baseLayer({
          matte: {
            mode: "alpha",
            invert: false,
            layer: {
              id: "key",
              source: keyhole,
              opacity: 1,
              blendMode: "normal",
              zIndex: 0
            }
          }
        })
      ]);

      const [lr, lg] = pixelAt(frame, 4, SIZE / 2);
      expect(lr).toBeGreaterThan(240);
      expect(lg).toBeLessThan(12);
      const [rr, rg] = pixelAt(frame, SIZE - 5, SIZE / 2);
      expect(rr).toBeLessThan(12);
      expect(rg).toBeLessThan(12);

      for (let x = 0; x < SIZE; x++) {
        expect(pixelAt(frame, x, SIZE / 2)[1]).toBeLessThan(12);
      }
    });

    it("an inverted matte keeps what its source hides", async () => {
      const keyhole = pixels("keyhole", (x) =>
        x < SIZE / 2 ? [255, 255, 255, 255] : [255, 255, 255, 0]
      );
      const frame = await renderFrame([
        baseLayer({
          matte: {
            mode: "alpha",
            invert: true,
            layer: {
              id: "key",
              source: keyhole,
              opacity: 1,
              blendMode: "normal",
              zIndex: 0
            }
          }
        })
      ]);

      expect(pixelAt(frame, 4, SIZE / 2)[0]).toBeLessThan(12);
      expect(pixelAt(frame, SIZE - 5, SIZE / 2)[0]).toBeGreaterThan(240);
    });
  }
);
