/**
 * The GPU half of motion blur: `renderFrameSamples` (F11, T28, D10).
 *
 * What only a real device can say is whether the `rgba16float` accumulation and
 * its resolve actually produce the mean — a blend factor on the wrong channel,
 * a load op that clears every sample away, or an un-premultiply applied twice
 * all typecheck. So every case here has an answer that is arithmetic: N solid
 * samples average to their mean, N half-covering samples average to a known
 * partial alpha, and one sample is the unblurred frame byte for byte.
 *
 * The Canvas 2D twin of these claims is
 * `packages/agents/tests/timeline-motion-blur-frames.test.ts`; the sample times
 * both paths share are pinned in `render.motionBlur.test.ts`.
 *
 * A missing WebGPU adapter skips the suite and says why. On headless Linux that
 * means no Vulkan ICD — see AGENTS.md § WebGPU on a headless machine, which
 * installs lavapipe (CI does exactly that on the test-packages leg).
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  HeadlessFrameCompositor,
  type FrameLayer,
  type FrameLayerPixels,
  type FrameSample
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
      `render.motionBlur.gpu: skipping every case — no WebGPU device. ${reason}\n`
    );
    return reason;
  }
})();

const SIZE = 32;

/** A frame-sized source in one straight-alpha colour. */
function solid(
  r: number,
  g: number,
  b: number,
  a = 255
): FrameLayerPixels {
  const rgba = new Uint8Array(SIZE * SIZE * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = a;
  }
  return { rgba, width: SIZE, height: SIZE, version: `solid-${r}-${g}-${b}-${a}` };
}

const layer = (source: FrameLayerPixels): FrameLayer => ({
  id: "shot",
  source,
  opacity: 1,
  blendMode: "normal",
  zIndex: 0
});

const sample = (source: FrameLayerPixels): FrameSample => ({
  layers: [layer(source)]
});

/**
 * One compositor for the whole suite, not one per case.
 *
 * Building a `HeadlessFrameCompositor` compiles its pipelines, which on the
 * software rasterizer CI installs (lavapipe) costs seconds. Five of them would
 * put this file over the default per-test timeout while the other GPU suites
 * run beside it — and the object is reusable by design: it holds a texture
 * cache across the frames of a render, which is what these cases are.
 */
let shared: HeadlessFrameCompositor | null = null;

async function withCompositor<T>(
  run: (compositor: HeadlessFrameCompositor) => Promise<T>
): Promise<T> {
  if (!shared) {
    const { getNodeGPUDevice } = await import("@nodetool-ai/gpu/node");
    shared = new HeadlessFrameCompositor(await getNodeGPUDevice(), SIZE, SIZE);
  }
  return run(shared);
}

afterAll(() => {
  shared?.dispose();
  shared = null;
});

/** One pixel of a straight-alpha RGBA8 frame. */
function pixelAt(
  rgba: Uint8Array,
  x: number,
  y: number
): [number, number, number, number] {
  const i = (y * SIZE + x) * 4;
  return [rgba[i]!, rgba[i + 1]!, rgba[i + 2]!, rgba[i + 3]!];
}

describe.runIf(noAdapterReason === null)(
  "HeadlessFrameCompositor — motion blur accumulation",
  () => {
    it("one sample renders exactly what the unblurred path renders", async () => {
      const [blurred, plain] = await withCompositor(async (compositor) => [
        await compositor.renderFrameSamples([sample(solid(200, 40, 10))]),
        await compositor.renderFrame([layer(solid(200, 40, 10))])
      ]);
      expect(Buffer.from(blurred).equals(Buffer.from(plain))).toBe(true);
    }, 60_000);

    it("averages the samples rather than keeping the last", async () => {
      // Four samples: black, black, white, white. The mean is mid grey; the
      // last-writer-wins failure would be white and the first-wins one black.
      const frame = await withCompositor((compositor) =>
        compositor.renderFrameSamples([
          sample(solid(0, 0, 0)),
          sample(solid(0, 0, 0)),
          sample(solid(255, 255, 255)),
          sample(solid(255, 255, 255))
        ])
      );
      const [r, g, b, a] = pixelAt(frame, SIZE / 2, SIZE / 2);
      for (const channel of [r, g, b]) {
        expect(Math.abs(channel - 128)).toBeLessThanOrEqual(2);
      }
      expect(a).toBe(255);
    }, 60_000);

    it("weights every sample equally across the window", async () => {
      // One of eight samples is white, the rest black: 255/8 ≈ 32. An 8-bit
      // accumulation would round a 1/8 contribution toward nothing here, which
      // is why the accumulation texture is rgba16float.
      const samples = [0, 1, 2, 3, 4, 5, 6, 7].map((i) =>
        sample(i === 3 ? solid(255, 255, 255) : solid(0, 0, 0))
      );
      const frame = await withCompositor((compositor) =>
        compositor.renderFrameSamples(samples)
      );
      expect(Math.abs(pixelAt(frame, 4, 4)[0] - 32)).toBeLessThanOrEqual(2);
    }, 60_000);

    it("keeps straight alpha over a transparent ground", async () => {
      // Half the samples are an opaque red, half draw nothing. The mean alpha
      // is 1/2 and the colour stays the red it was — dividing the summed
      // colour by the summed alpha is what recovers it. Averaging the samples
      // *after* un-premultiplying each would give the same colour here but
      // weight a nearly transparent sample as heavily as an opaque one.
      const frame = await withCompositor((compositor) =>
        compositor.renderFrameSamples(
          [
            sample(solid(255, 0, 0)),
            sample(solid(255, 0, 0)),
            { layers: [] },
            { layers: [] }
          ],
          { alpha: true }
        )
      );
      const [r, g, b, a] = pixelAt(frame, SIZE / 2, SIZE / 2);
      expect(Math.abs(a - 128)).toBeLessThanOrEqual(2);
      expect(r).toBeGreaterThan(248);
      expect(g).toBeLessThan(6);
      expect(b).toBeLessThan(6);
    }, 60_000);

    it("refuses a frame with no samples rather than rendering nothing", async () => {
      await expect(
        withCompositor((compositor) => compositor.renderFrameSamples([]))
      ).rejects.toThrow(/at least one sample/);
    }, 60_000);
  }
);
