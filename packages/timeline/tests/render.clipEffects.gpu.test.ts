/**
 * Clip effects from the shader catalog on the GPU path (F12, T13, D7).
 *
 * Each case asserts a property of the pixels the effect exists to produce —
 * glow puts light where the source had none, `levels` clips a mid-grey to
 * black, the key removes the key colour — rather than a golden buffer, so the
 * suite says whether the effect ran and not whether Dawn rounded a texel.
 *
 * The last case is the alpha bug the mask path exposed and this task fixes: a
 * layer that only had effects handed the blend shader premultiplied pixels it
 * reads as straight. Opaque layers hide it, because the two conventions
 * coincide at alpha 1 — which is why it took a semi-transparent one to see.
 *
 * A missing WebGPU adapter skips the suite and says why. On headless Linux that
 * means no Vulkan ICD — see AGENTS.md § WebGPU on a headless machine.
 */
import { describe, expect, it } from "vitest";
import type { ClipEffect } from "../src/index.js";
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
      `render.clipEffects.gpu: skipping every case — no WebGPU device. ${reason}\n`
    );
    return reason;
  }
})();

const SIZE = 64;

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

const uniform = (
  r: number,
  g: number,
  b: number,
  a = 255
): FrameLayerPixels => pixels(`uniform-${r}-${g}-${b}-${a}`, () => [r, g, b, a]);

/** A white square on opaque black — a bright source with room around it. */
const QUAD = { lo: SIZE / 4, hi: (SIZE * 3) / 4 };
const brightQuad = (): FrameLayerPixels =>
  pixels("bright-quad", (x, y) =>
    x >= QUAD.lo && x < QUAD.hi && y >= QUAD.lo && y < QUAD.hi
      ? [255, 255, 255, 255]
      : [0, 0, 0, 255]
  );

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

function pixelAt(
  rgba: Uint8Array,
  x: number,
  y: number
): [number, number, number, number] {
  const i = (y * SIZE + x) * 4;
  return [rgba[i]!, rgba[i + 1]!, rgba[i + 2]!, rgba[i + 3]!];
}

const layerWith = (
  source: FrameLayerPixels,
  effects: ClipEffect[],
  over: Partial<FrameLayer> = {}
): FrameLayer => ({
  id: `shot-${effects.map((e) => e.type).join("-") || "plain"}`,
  source,
  opacity: 1,
  blendMode: "normal",
  zIndex: 0,
  effects,
  ...over
});

describe.runIf(noAdapterReason === null)(
  "HeadlessFrameCompositor — clip effects",
  () => {
    it("glow spreads light past the edge of the bright source", async () => {
      const source = brightQuad();
      const plain = await renderFrame([layerWith(source, [])]);
      const glowing = await renderFrame([
        layerWith(source, [
          { id: "g", type: "glow", enabled: true, radius: 8, intensity: 1 }
        ])
      ]);

      // Four pixels outside the square: black without the glow, lit with it.
      const outside: [number, number][] = [
        [QUAD.lo - 3, SIZE / 2],
        [QUAD.hi + 2, SIZE / 2],
        [SIZE / 2, QUAD.lo - 3],
        [SIZE / 2, QUAD.hi + 2]
      ];
      for (const [x, y] of outside) {
        expect(pixelAt(plain, x, y)[0]).toBeLessThan(4);
        expect(pixelAt(glowing, x, y)[0]).toBeGreaterThan(20);
      }
      // Far from the source it stays dark: a bloom, not a wash.
      expect(pixelAt(glowing, 1, 1)[0]).toBeLessThan(12);
    });

    it("levels with inBlack 0.5 clips a mid-grey to black", async () => {
      const mid = uniform(128, 128, 128);
      const plain = await renderFrame([layerWith(mid, [])]);
      const clipped = await renderFrame([
        layerWith(mid, [
          {
            id: "lv",
            type: "levels",
            enabled: true,
            inBlack: 0.5,
            inWhite: 1,
            gamma: 1,
            outBlack: 0,
            outWhite: 1
          }
        ])
      ]);

      expect(pixelAt(plain, SIZE / 2, SIZE / 2)[0]).toBeGreaterThan(120);
      expect(pixelAt(clipped, SIZE / 2, SIZE / 2)[0]).toBeLessThan(8);
    });

    it("levels lifts the output floor when outBlack is raised", async () => {
      // The second half of the mapping: `color.levels@1` has no output range,
      // so a raised floor is a `color.cdl@1` pass behind it. Black in, mid out.
      const lifted = await renderFrame([
        layerWith(uniform(0, 0, 0), [
          {
            id: "lv",
            type: "levels",
            enabled: true,
            inBlack: 0,
            inWhite: 1,
            gamma: 1,
            outBlack: 0.5,
            outWhite: 1
          }
        ])
      ]);

      const [r] = pixelAt(lifted, SIZE / 2, SIZE / 2);
      expect(r).toBeGreaterThan(112);
      expect(r).toBeLessThan(144);
    });

    it("chroma key removes the keyed colour and keeps the rest", async () => {
      // Green on the left, red on the right, over the frame's black ground.
      const split = pixels("split", (x) =>
        x < SIZE / 2 ? [0, 255, 0, 255] : [255, 0, 0, 255]
      );
      const keyed = await renderFrame([
        layerWith(split, [
          {
            id: "ck",
            type: "chromaKey",
            enabled: true,
            color: "#00ff00",
            tolerance: 0.3,
            softness: 0.05
          }
        ])
      ]);

      const [, greenSide] = pixelAt(keyed, 4, SIZE / 2);
      expect(greenSide).toBeLessThan(24);
      expect(pixelAt(keyed, SIZE - 5, SIZE / 2)[0]).toBeGreaterThan(230);
    });

    it("a vignette darkens the corners and leaves the centre", async () => {
      const flat = uniform(255, 255, 255);
      const shaded = await renderFrame([
        layerWith(flat, [
          {
            id: "v",
            type: "vignette",
            enabled: true,
            amount: 1,
            softness: 0.6
          }
        ])
      ]);

      expect(pixelAt(shaded, SIZE / 2, SIZE / 2)[0]).toBeGreaterThan(230);
      expect(pixelAt(shaded, 1, 1)[0]).toBeLessThan(
        pixelAt(shaded, SIZE / 2, SIZE / 2)[0]
      );
    });

    it("a drop shadow darkens the ground beside the silhouette", async () => {
      // A white square on transparency: the shadow has somewhere to fall, and
      // the frame's black ground is what it falls on — so the assertion is
      // that the offset side is *not* pure black any more.
      const cutout = pixels("cutout", (x, y) =>
        x >= QUAD.lo && x < QUAD.hi && y >= QUAD.lo && y < QUAD.hi
          ? [255, 255, 255, 255]
          : [0, 0, 0, 0]
      );
      const shadowed = await renderFrame([
        layerWith(cutout, [
          {
            id: "ds",
            type: "dropShadow",
            enabled: true,
            offsetX: 6,
            offsetY: 6,
            blur: 4,
            color: "#ff0000",
            opacity: 1
          }
        ])
      ]);

      // Down and to the right of the square's corner: inside the shadow.
      const [r, g] = pixelAt(shadowed, QUAD.hi + 3, QUAD.hi + 3);
      expect(r).toBeGreaterThan(60);
      expect(g).toBeLessThan(40);
      // Up and to the left, the shadow was offset away.
      expect(pixelAt(shadowed, QUAD.lo - 4, QUAD.lo - 4)[0]).toBeLessThan(24);
    });

    it("reads every spelling of one shadow colour as that colour", async () => {
      // The parser this replaces matched six-digit hex and answered pure green
      // for everything else, so a shadow written `black` or `rgb(0,0,0)` cast
      // green on the GPU and black on the Canvas 2D path, with nothing to read
      // about the difference. The frame's ground is white here so a black
      // shadow is visible and a green one is unmistakable.
      const cutout = pixels("cutout-parity", (x, y) =>
        x >= QUAD.lo && x < QUAD.hi && y >= QUAD.lo && y < QUAD.hi
          ? [255, 0, 0, 255]
          : [0, 0, 0, 0]
      );
      const ground = (): FrameLayer => ({
        id: "ground",
        source: uniform(255, 255, 255),
        opacity: 1,
        blendMode: "normal",
        zIndex: -1
      });
      const shadowIn = async (color: string): Promise<[number, number, number]> => {
        const frame = await renderFrame([
          ground(),
          layerWith(
            cutout,
            [
              {
                id: "ds",
                type: "dropShadow",
                enabled: true,
                offsetX: 8,
                offsetY: 8,
                blur: 2,
                color,
                opacity: 1
              }
            ],
            { id: `shadow-${color}` }
          )
        ]);
        const [r, g, b] = pixelAt(frame, QUAD.hi + 4, QUAD.hi + 4);
        return [r, g, b];
      };

      const hex = await shadowIn("#000");
      const named = await shadowIn("black");
      const functional = await shadowIn("rgb(0, 0, 0)");

      for (const sample of [hex, named, functional]) {
        // Darkened by the shadow at all…
        expect(sample[1]).toBeLessThan(200);
        // …and not the green the old fallback produced, which would leave the
        // green channel far above the other two rather than level with them.
        expect(Math.abs(sample[1] - sample[0])).toBeLessThan(8);
        expect(Math.abs(sample[1] - sample[2])).toBeLessThan(8);
      }
      for (let channel = 0; channel < 3; channel++) {
        expect(Math.abs(named[channel]! - hex[channel]!)).toBeLessThan(4);
        expect(Math.abs(functional[channel]! - hex[channel]!)).toBeLessThan(4);
      }
    });

    it("a curve that pulls the midtones down darkens a mid-grey", async () => {
      const mid = uniform(128, 128, 128);
      const graded = await renderFrame([
        layerWith(mid, [
          {
            id: "c",
            type: "curves",
            enabled: true,
            master: [
              { x: 0, y: 0 },
              { x: 0.5, y: 0.25 },
              { x: 1, y: 1 }
            ]
          }
        ])
      ]);

      const [r] = pixelAt(graded, SIZE / 2, SIZE / 2);
      expect(r).toBeGreaterThan(40);
      expect(r).toBeLessThan(90);
    });

    it("liftGammaGain raises one channel and leaves the others", async () => {
      const grey = uniform(128, 128, 128);
      const graded = await renderFrame([
        layerWith(grey, [
          {
            id: "lgg",
            type: "liftGammaGain",
            enabled: true,
            lift: [0, 0, 0],
            gamma: [1, 1, 1],
            gain: [1.4, 1, 1]
          }
        ])
      ]);

      const [r, g, b] = pixelAt(graded, SIZE / 2, SIZE / 2);
      expect(r).toBeGreaterThan(g + 20);
      expect(g).toBe(b);
    });

    it("a semi-transparent layer with an effect keeps its strength", async () => {
      // The premultiplied-alpha bug in one case. Saturation on a neutral grey
      // changes no pixel value, so the two renders must agree — they did not,
      // because the graded texture reached the blend shader premultiplied and
      // was scaled by its own alpha a second time.
      const halfGrey = uniform(200, 200, 200, 128);
      const plain = await renderFrame([layerWith(halfGrey, [])]);
      const graded = await renderFrame([
        layerWith(halfGrey, [
          { id: "s", type: "color", enabled: true, saturation: 2 }
        ])
      ]);

      const [plainR] = pixelAt(plain, SIZE / 2, SIZE / 2);
      const [gradedR] = pixelAt(graded, SIZE / 2, SIZE / 2);
      expect(plainR).toBeGreaterThan(90);
      expect(gradedR).toBeGreaterThan(plainR - 4);
      expect(gradedR).toBeLessThan(plainR + 4);
    });

    it("a semi-transparent layer with an effect and a mask agrees too", async () => {
      // The path T12 already converted, asserted beside the one it did not, so
      // a future change cannot fix one convention and break the other.
      const halfGrey = uniform(200, 200, 200, 128);
      const fullCoverage = uniform(255, 255, 255, 255);
      const masked = await renderFrame([
        layerWith(
          halfGrey,
          [{ id: "s", type: "color", enabled: true, saturation: 2 }],
          { shapeMask: fullCoverage }
        )
      ]);
      const unmasked = await renderFrame([
        layerWith(halfGrey, [
          { id: "s", type: "color", enabled: true, saturation: 2 }
        ])
      ]);

      const [maskedR] = pixelAt(masked, SIZE / 2, SIZE / 2);
      const [unmaskedR] = pixelAt(unmasked, SIZE / 2, SIZE / 2);
      expect(maskedR).toBeGreaterThan(unmaskedR - 4);
      expect(maskedR).toBeLessThan(unmaskedR + 4);
    });
  }
);
