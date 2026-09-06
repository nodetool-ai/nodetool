/**
 * Adjustment clips on the GPU path, against a real WebGPU device (T25).
 *
 * The scene-model and Canvas 2D halves are in `render.adjustment.test.ts`; this
 * one reads pixels back off `HeadlessFrameCompositor`, because "did the grade
 * reach what was already in the render target, and only that" is a claim about
 * the accumulation and nothing else can see it. The claims are deliberately the
 * same four the Canvas 2D suite makes — an adjustment that treats one way in
 * the preview and another in the export is what having both suites is for.
 *
 * A missing WebGPU adapter skips the suite and says why. On headless Linux that
 * means no Vulkan ICD — see AGENTS.md § WebGPU on a headless machine.
 */
import { describe, expect, it } from "vitest";
import type { ClipEffect } from "../src/index.js";
import {
  HeadlessFrameCompositor,
  type FrameAdjustment,
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
    process.stderr.write(
      `render.adjustment.gpu: skipping every case — no WebGPU device. ${reason}\n`
    );
    return reason;
  }
})();

const SIZE = 64;
const LEFT = 10;
const MIDDLE = 32;
const RIGHT = 54;

type Rgb = [number, number, number];

const CRIMSON: Rgb = [192, 32, 48];
const GREY_40: Rgb = [102, 102, 102];

/** Opaque `color` over `[fromX, toX)` of a frame-sized source, transparent elsewhere. */
function band(fromX: number, toX: number, color: Rgb): FrameLayer["source"] {
  const rgba = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = fromX; x < toX; x++) {
      const i = (y * SIZE + x) * 4;
      rgba[i] = color[0];
      rgba[i + 1] = color[1];
      rgba[i + 2] = color[2];
      rgba[i + 3] = 255;
    }
  }
  return {
    rgba,
    width: SIZE,
    height: SIZE,
    version: `${fromX}-${toX}-${color.join(",")}`
  };
}

const solid = (color: Rgb): FrameLayer["source"] => band(0, SIZE, color);

/** The RGB of the pixel at `x` on the frame's middle row. */
function rgbAt(frame: Uint8Array, x: number): Rgb {
  const i = ((SIZE >> 1) * SIZE + x) * 4;
  return [frame[i]!, frame[i + 1]!, frame[i + 2]!];
}

const isGrey = ([r, g, b]: Rgb): boolean =>
  Math.abs(r - g) <= 2 && Math.abs(g - b) <= 2;

const layer = (
  id: string,
  source: FrameLayer["source"],
  zIndex: number,
  over: Partial<FrameLayer> = {}
): FrameLayer => ({
  id,
  source,
  opacity: 1,
  blendMode: "normal",
  zIndex,
  ...over
});

const desaturate: ClipEffect = {
  id: "grade",
  type: "color",
  enabled: true,
  saturation: 0
};

const brighten: ClipEffect = {
  id: "lift",
  type: "color",
  enabled: true,
  brightness: 0.25
};

const punch: ClipEffect = {
  id: "punch",
  type: "color",
  enabled: true,
  contrast: 2
};

const adjustment = (
  id: string,
  zIndex: number,
  over: Partial<FrameAdjustment> = {}
): FrameAdjustment => ({ id, zIndex, opacity: 1, ...over });

describe.runIf(!noAdapterReason)(
  "HeadlessFrameCompositor — adjustments",
  () => {
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

    it("treats every layer below it and none above", async () => {
      await withCompositor(async (compositor) => {
        const frame = await compositor.renderFrame(
          [
            layer("under", band(0, 21, CRIMSON), 0),
            layer("also-under", band(21, 43, CRIMSON), 1),
            layer("over", band(43, SIZE, CRIMSON), 3)
          ],
          [],
          {},
          [adjustment("adj", 2, { effects: [desaturate] })]
        );
        expect(isGrey(rgbAt(frame, LEFT))).toBe(true);
        expect(isGrey(rgbAt(frame, MIDDLE))).toBe(true);
        expect(isGrey(rgbAt(frame, RIGHT))).toBe(false);
      });
    });

    it("blends treated over untreated at the adjustment's opacity", async () => {
      await withCompositor(async (compositor) => {
        const layers = (): FrameLayer[] => [layer("pic", solid(CRIMSON), 0)];
        const untreated = rgbAt(await compositor.renderFrame(layers()), MIDDLE);
        const treated = rgbAt(
          await compositor.renderFrame(layers(), [], {}, [
            adjustment("adj", 1, { effects: [desaturate] })
          ]),
          MIDDLE
        );
        const half = rgbAt(
          await compositor.renderFrame(layers(), [], {}, [
            adjustment("adj", 1, { opacity: 0.5, effects: [desaturate] })
          ]),
          MIDDLE
        );
        expect(treated).not.toEqual(untreated);
        for (let i = 0; i < 3; i++) {
          expect(
            Math.abs(half[i]! - (untreated[i]! + treated[i]!) / 2)
          ).toBeLessThanOrEqual(3);
        }
      });
    });

    it("runs stacked adjustments bottom-up", async () => {
      await withCompositor(async (compositor) => {
        // The reference is the same two chains run one after the other, each on
        // the picture the previous one produced — no formula assumed, only the
        // order. Two non-commuting grades, so the reverse order is a different
        // pixel and this cannot pass by accident.
        const runOne = async (source: Rgb, effect: ClipEffect): Promise<Rgb> =>
          rgbAt(
            await compositor.renderFrame(
              [layer("pic", solid(source), 0)],
              [],
              {},
              [adjustment("one", 1, { effects: [effect] })]
            ),
            MIDDLE
          );

        const bottomThenTop = await runOne(
          await runOne(GREY_40, brighten),
          punch
        );
        const topThenBottom = await runOne(
          await runOne(GREY_40, punch),
          brighten
        );
        expect(Math.abs(bottomThenTop[0]! - topThenBottom[0]!)).toBeGreaterThan(
          10
        );

        const stacked = rgbAt(
          await compositor.renderFrame(
            [layer("pic", solid(GREY_40), 0)],
            [],
            {},
            [
              adjustment("lower", 1, { effects: [brighten] }),
              adjustment("upper", 2, { effects: [punch] })
            ]
          ),
          MIDDLE
        );
        expect(Math.abs(stacked[0]! - bottomThenTop[0]!)).toBeLessThanOrEqual(
          3
        );
      });
    });

    it("treats only the siblings below it inside its group", async () => {
      await withCompositor(async (compositor) => {
        const group: FramePrecomposite = {
          id: "g",
          zIndex: 10,
          opacity: 1,
          blendMode: "normal"
        };
        const frame = await compositor.renderFrame(
          [
            layer("outside", band(0, 21, CRIMSON), 0),
            layer("under", band(21, 43, CRIMSON), 1, {
              precomposeGroupId: "g"
            }),
            layer("over", band(43, SIZE, CRIMSON), 3, {
              precomposeGroupId: "g"
            })
          ],
          [group],
          {},
          [
            adjustment("adj", 2, {
              effects: [desaturate],
              precomposeGroupId: "g"
            })
          ]
        );
        expect(isGrey(rgbAt(frame, MIDDLE))).toBe(true);
        expect(isGrey(rgbAt(frame, LEFT))).toBe(false);
        expect(isGrey(rgbAt(frame, RIGHT))).toBe(false);
      });
    });
  }
);
