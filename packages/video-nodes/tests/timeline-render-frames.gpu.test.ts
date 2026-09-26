/**
 * The server render path's frame selection, its preview scale, and layers
 * that cover no area, read back as pixels.
 *
 * Frames arrive through `writeFrame`, so no encoder opens. A missing WebGPU
 * adapter skips the suite and says why — see AGENTS.md § WebGPU on a headless
 * machine.
 */
import { describe, it, expect } from "vitest";
import type { TimelineClip, TimelineSequence } from "@nodetool-ai/timeline";

const { renderTimelineComposited } = await import(
  "../src/nodes/timeline/compositeRender.js"
);

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
      `timeline-render-frames.gpu: skipping every case — no WebGPU device. ${reason}\n`
    );
    return reason;
  }
})();

const WIDTH = 160;
const HEIGHT = 90;

const shape = (id: string, over: Partial<TimelineClip> = {}): TimelineClip => ({
  id,
  trackId: "t0",
  name: id,
  startMs: 0,
  durationMs: 1000,
  mediaType: "shape",
  sourceType: "generated",
  status: "generated",
  locked: false,
  versions: [],
  shapeStyle: { kind: "rect", fill: "#ff0000" },
  ...over
});

const transform = (
  scale: { x: number; y: number },
  position = { x: 0, y: 0 }
): TimelineClip["transform"] => ({
  position,
  scale,
  rotation: 0,
  anchor: { x: 0.5, y: 0.5 }
});

function sequence(
  clips: TimelineClip[],
  size = { width: WIDTH, height: HEIGHT }
): TimelineSequence {
  return {
    id: "seq-frames",
    projectId: "proj-1",
    name: "Frames fixture",
    fps: 10,
    width: size.width,
    height: size.height,
    durationMs: 1000,
    tracks: [
      { id: "t0", name: "V1", type: "video", index: 0, visible: true, locked: false }
    ],
    clips,
    markers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

interface Rendered {
  frames: number[];
  pixels: Uint8Array[];
}

async function render(
  seq: TimelineSequence,
  opts: { frames?: number[]; width?: number; height?: number } = {}
): Promise<Rendered> {
  const rendered: Rendered = { frames: [], pixels: [] };
  await renderTimelineComposited({
    sequence: seq,
    width: opts.width ?? WIDTH,
    height: opts.height ?? HEIGHT,
    fps: 10,
    durationMs: 1000,
    resolveAssetPath: async () => null,
    outPath: "/dev/null",
    frames: opts.frames ?? [0],
    writeFrame: async (frame, rgba) => {
      rendered.frames.push(frame);
      rendered.pixels.push(rgba.slice());
    }
  });
  return rendered;
}

function redAt(rgba: Uint8Array, width: number, x: number, y: number): number {
  return rgba[(y * width + x) * 4]!;
}

/** The brightest channel value anywhere in the frame. */
function maxChannel(rgba: Uint8Array): number {
  let max = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    max = Math.max(max, rgba[i]!, rgba[i + 1]!, rgba[i + 2]!);
  }
  return max;
}

const GLOW: TimelineClip["effects"] = [
  { id: "g", type: "glow", enabled: true, radius: 8, intensity: 0.9, color: "#34d399" }
];

describe.runIf(noAdapterReason === null)(
  "renderTimelineComposited — frame selection, preview scale, empty layers",
  () => {
    it("renders only the selected frames, in ascending order", async () => {
      const { frames } = await render(sequence([shape("red")]), {
        frames: [7, 2, 7, 40, -1, 4]
      });

      // 40 and -1 are outside the ten-frame timeline; 7 is asked for twice.
      expect(frames).toEqual([2, 4, 7]);
    });

    it.each([
      ["both axes", { x: 0, y: 0 }, undefined],
      ["both axes, with a glow", { x: 0, y: 0 }, GLOW],
      ["one axis, with a glow", { x: 1, y: 0 }, GLOW]
    ])(
      "draws nothing for a layer scaled to zero on %s",
      async (_label, scale, effects) => {
        const clip = shape("zero", { transform: transform(scale) });
        if (effects) clip.effects = effects;
        const { pixels } = await render(sequence([clip]));

        expect(maxChannel(pixels[0]!)).toBeLessThan(8);
      }
    );

    it("keeps the layout when the frame is smaller than the sequence", async () => {
      // The sequence is twice the frame size. A quarter-size square offset
      // right by a quarter of the sequence width (in sequence pixels) has its
      // centre at 75% of the frame at any output size.
      const sequenceSize = { width: WIDTH * 2, height: HEIGHT * 2 };
      const seq = sequence(
        [
          shape("red", {
            transform: transform(
              { x: 0.25, y: 0.25 },
              { x: sequenceSize.width / 4, y: 0 }
            )
          })
        ],
        sequenceSize
      );
      const { pixels } = await render(seq, { width: WIDTH, height: HEIGHT });

      const frame = pixels[0]!;
      expect(redAt(frame, WIDTH, Math.round(WIDTH * 0.75), HEIGHT / 2)).toBeGreaterThan(240);
      expect(redAt(frame, WIDTH, WIDTH / 2, HEIGHT / 2)).toBeLessThan(12);
    });
  }
);
