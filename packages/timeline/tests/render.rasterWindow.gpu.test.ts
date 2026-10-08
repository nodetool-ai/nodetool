/**
 * Windowed rasters on the GPU path.
 *
 * The browser preview rasterizes a text or shape clip into only the part of
 * the frame its ink can reach and hands the compositor that window with
 * `sourceWindow`. The contract is one equivalence: **a windowed source renders
 * exactly like the frame-sized raster it was cut from.** That covers the
 * placement shift, the effect chain running on the smaller texture, and the
 * blend pass that touches only the layer's own bounds.
 *
 * A missing WebGPU adapter skips the suite and says why. On headless Linux that
 * means no Vulkan ICD — see AGENTS.md § WebGPU on a headless machine.
 */
import { describe, expect, it } from "vitest";
import type { ClipEffect, ClipTransform } from "../src/index.js";
import { rasterWindowMarginPx } from "../src/render/draw.js";
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
      `render.rasterWindow.gpu: skipping every case — no WebGPU device. ${reason}\n`
    );
    return reason;
  }
})();

const FRAME = 64;
/** The ink: a 16×16 block with a coordinate-coded, half-transparent edge. */
const INK = { x: 24, y: 20, size: 16 };
/** The window the rasterizer would allocate: the ink plus a 16 px margin. */
const WINDOW = { x: 8, y: 4, width: 48, height: 48 };

function inkPixel(x: number, y: number): [number, number, number, number] {
  const inside =
    x >= INK.x && x < INK.x + INK.size && y >= INK.y && y < INK.y + INK.size;
  if (!inside) return [0, 0, 0, 0];
  const edge =
    x === INK.x || y === INK.y || x === INK.x + INK.size - 1 || y === INK.y + INK.size - 1;
  return [x * 4, y * 4, 200, edge ? 128 : 255];
}

/** The frame-sized raster, transparent outside the ink. */
function fullRaster(): FrameLayerPixels {
  const rgba = new Uint8Array(FRAME * FRAME * 4);
  for (let y = 0; y < FRAME; y++) {
    for (let x = 0; x < FRAME; x++) rgba.set(inkPixel(x, y), (y * FRAME + x) * 4);
  }
  return { rgba, width: FRAME, height: FRAME, version: "full" };
}

type Window = typeof WINDOW;

/** The same raster cut to `win`. */
function windowedRaster(win: Window): FrameLayerPixels {
  const rgba = new Uint8Array(win.width * win.height * 4);
  for (let y = 0; y < win.height; y++) {
    for (let x = 0; x < win.width; x++) {
      rgba.set(inkPixel(x + win.x, y + win.y), (y * win.width + x) * 4);
    }
  }
  return { rgba, width: win.width, height: win.height, version: `window-${win.x}-${win.width}` };
}

function background(): FrameLayerPixels {
  const rgba = new Uint8Array(FRAME * FRAME * 4);
  for (let y = 0; y < FRAME; y++) {
    for (let x = 0; x < FRAME; x++) rgba.set([255 - x * 3, 60 + y * 2, 90, 255], (y * FRAME + x) * 4);
  }
  return { rgba, width: FRAME, height: FRAME, version: "ground" };
}

async function renderPair(
  over: Partial<FrameLayer>,
  win: Window = WINDOW
): Promise<[Uint8Array, Uint8Array]> {
  const { getNodeGPUDevice } = await import("@nodetool-ai/gpu/node");
  const device = await getNodeGPUDevice();
  const render = async (top: FrameLayer): Promise<Uint8Array> => {
    const compositor = new HeadlessFrameCompositor(device, FRAME, FRAME);
    try {
      return await compositor.renderFrame([
        { id: "ground", source: background(), opacity: 1, blendMode: "normal", zIndex: 0 },
        top
      ]);
    } finally {
      compositor.dispose();
    }
  };
  const base = { id: "ink", opacity: 1, blendMode: "normal" as const, zIndex: 1, ...over };
  return [
    await render({ ...base, source: fullRaster() }),
    await render({
      ...base,
      source: windowedRaster(win),
      sourceWindow: { x: win.x, y: win.y, frameWidth: FRAME, frameHeight: FRAME }
    })
  ];
}

function maxDiff(a: Uint8Array, b: Uint8Array): number {
  let max = 0;
  for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i]! - b[i]!));
  return max;
}

const turned: ClipTransform = {
  position: { x: 5, y: -3 },
  scale: { x: 1.3, y: 1.1 },
  rotation: 20,
  anchor: { x: 0.5, y: 0.5 }
};

const effectCases: Array<[string, ClipEffect]> = [
  ["blur", { id: "b", type: "blur", enabled: true, radius: 4 }],
  ["glow", { id: "g", type: "glow", enabled: true, radius: 4, intensity: 1, color: "#ffffff" }],
  [
    "drop shadow",
    { id: "d", type: "dropShadow", enabled: true, offsetX: 3, offsetY: 3, blur: 3, color: "#000000", opacity: 0.8 }
  ],
  ["colour grade", { id: "c", type: "color", enabled: true, brightness: 0.3, hue: 40 }]
];

describe.runIf(noAdapterReason === null)("windowed rasters on the GPU path", () => {
  it("renders an untransformed windowed source like the frame-sized raster", async () => {
    const [full, windowed] = await renderPair({});
    expect(maxDiff(full, windowed)).toBeLessThanOrEqual(1);
  });

  it("matches under rotation, scale and translation", async () => {
    const [full, windowed] = await renderPair({ transform: turned });
    expect(maxDiff(full, windowed)).toBeLessThanOrEqual(1);
  });

  it("blends every pixel of a window the ink fills to its edges", async () => {
    // Placed on whole pixels the quad's edge is the ink's edge, so a blend pass
    // scissored even a pixel short of the quad drops visible pixels.
    const tight = { x: INK.x, y: INK.y, width: INK.size, height: INK.size };
    const shifted: ClipTransform = { ...turned, rotation: 0, scale: { x: 1, y: 1 } };
    const [full, windowed] = await renderPair({ transform: shifted }, tight);
    expect(maxDiff(full, windowed)).toBeLessThanOrEqual(1);
  });

  it.each(["screen", "multiply", "difference"] as const)(
    "leaves the ground outside the layer untouched in %s blend",
    async (blendMode) => {
      const [full, windowed] = await renderPair({ blendMode, opacity: 0.7, transform: turned });
      expect(maxDiff(full, windowed)).toBeLessThanOrEqual(1);
    }
  );

  it.each(effectCases)("matches with a %s inside the window margin", async (_name, effect) => {
    const margin = rasterWindowMarginPx([effect]);
    expect(margin).not.toBeNull();
    // The fixture's 16 px margin must cover what the rasterizer would reserve.
    expect(margin!).toBeLessThanOrEqual(16);
    const [full, windowed] = await renderPair({ effects: [effect], transform: turned });
    expect(maxDiff(full, windowed)).toBeLessThanOrEqual(1);
  });

  it("actually draws the ink — the equivalence is not two empty layers", async () => {
    const { getNodeGPUDevice } = await import("@nodetool-ai/gpu/node");
    const compositor = new HeadlessFrameCompositor(await getNodeGPUDevice(), FRAME, FRAME);
    try {
      const ground = await compositor.renderFrame([
        { id: "ground", source: background(), opacity: 1, blendMode: "normal", zIndex: 0 }
      ]);
      const [, windowed] = await renderPair({});
      expect(maxDiff(ground, windowed)).toBeGreaterThan(50);
    } finally {
      compositor.dispose();
    }
  });
});
