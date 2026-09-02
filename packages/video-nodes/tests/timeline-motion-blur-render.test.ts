/**
 * Motion blur through the whole server render (F11, T28, D10).
 *
 * `packages/timeline/tests/render.motionBlur.gpu.test.ts` pins what the
 * compositor does with a list of samples. What only this can say is that
 * `renderTimelineComposited` builds that list at all: it resolves the scene once
 * per sub-frame instant, and a frame is the average rather than the last one.
 * The fixture is a shape crossing the frame at a known speed, so the smear's two
 * edges are arithmetic — and they are computed from the fixture's own numbers,
 * not from the sampler, so a wrong sample offset moves the picture away from
 * them rather than moving both together.
 *
 * A PNG sequence is the readable end of this for the same reason the alpha suite
 * uses one: no encoder, no chroma subsampling, no ffmpeg between the render and
 * the assertion.
 *
 * A missing WebGPU adapter skips the suite and says why — on headless Linux
 * that means no Vulkan ICD; see AGENTS.md § WebGPU on a headless machine.
 */
import { describe, it, expect } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TimelineSequence } from "@nodetool-ai/timeline";

import { renderTimelineComposited } from "../src/nodes/timeline/compositeRender.js";
import { resolveTimelineOutput } from "../src/nodes/timeline/outputFormats.js";

const noAdapterReason = await (async (): Promise<string | null> => {
  try {
    const { getNodeGPUDevice } = await import("@nodetool-ai/gpu/node");
    await getNodeGPUDevice();
    return null;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `timeline-motion-blur-render: skipping every case — no WebGPU device. ${reason}\n`
    );
    return reason;
  }
})();

// Every expected number below comes off this block.
const WIDTH = 320;
const HEIGHT = 64;
const FPS = 25;
const FRAME_MS = 1000 / FPS; // 40
/** How much of the timeline is rendered: two frames, the first under test. */
const DURATION_MS = 80;
/**
 * The clip outlives the render. An animation's window is clamped to its clip,
 * so a clip as short as the render would compress the 400ms ramp into 80ms and
 * quintuple the speed every expectation below is derived from.
 */
const CLIP_MS = 400;
const SHUTTER_ANGLE = 180;
const WINDOW_MS = (SHUTTER_ANGLE / 360) * FRAME_MS; // 20
const SAMPLES = 8;

const SHAPE_LEFT = 16;
const SHAPE_RIGHT = 48;
/** The `offsetX` ramp: 1600px over 400ms, so 4px per millisecond. */
const SPEED_PX_PER_MS = 1600 / 400;

/** One white bar, ramping to the right at a constant speed. */
function fixture(): TimelineSequence {
  return {
    id: "seq-blur",
    name: "Motion blur fixture",
    width: WIDTH,
    height: HEIGHT,
    fps: FPS,
    durationMs: CLIP_MS,
    tracks: [{ id: "t-shape", type: "video", index: 0, visible: true }],
    clips: [
      {
        id: "clip-bar",
        trackId: "t-shape",
        name: "Bar",
        startMs: 0,
        durationMs: CLIP_MS,
        mediaType: "shape",
        sourceType: "generated",
        shapeStyle: {
          kind: "rect",
          fill: "#ffffff",
          x: SHAPE_LEFT / WIDTH,
          y: 0.25,
          width: (SHAPE_RIGHT - SHAPE_LEFT) / WIDTH,
          height: 0.5
        },
        animations: [
          {
            id: "ramp",
            role: "in",
            preset: "custom",
            durationMs: CLIP_MS,
            custom: {
              curves: [
                {
                  property: "offsetX",
                  keyframes: [
                    { t: 0, value: 0 },
                    { t: 1, value: 1600 }
                  ]
                }
              ]
            }
          }
        ]
      }
    ]
  } as unknown as TimelineSequence;
}

/** The first frame's PNG bytes, pulled out of the stored zip. */
function firstFramePng(archive: Buffer): Buffer {
  if (archive.readUInt32LE(0) !== 0x04034b50) {
    throw new Error("not a zip archive");
  }
  const size = archive.readUInt32LE(18);
  const nameLen = archive.readUInt16LE(26);
  const extraLen = archive.readUInt16LE(28);
  const at = 30 + nameLen + extraLen;
  return archive.subarray(at, at + size);
}

/** First and last column of the middle row carrying any light at all. */
async function litSpan(png: Buffer): Promise<{ first: number; last: number }> {
  const image = await loadImage(png);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(0, HEIGHT / 2, image.width, 1);
  let first = -1;
  let last = -1;
  for (let x = 0; x < image.width; x++) {
    if (data[x * 4] > 8) {
      if (first === -1) first = x;
      last = x;
    }
  }
  return { first, last };
}

async function renderFirstFrame(
  motionBlurSamples: number
): Promise<{ first: number; last: number }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-blur-"));
  const outPath = path.join(dir, "frames.zip");
  try {
    await renderTimelineComposited({
      sequence: fixture(),
      width: WIDTH,
      height: HEIGHT,
      fps: FPS,
      durationMs: DURATION_MS,
      resolveAssetPath: async () => null,
      outPath,
      output: resolveTimelineOutput({
        format: "png_sequence",
        motionBlurSamples,
        shutterAngle: SHUTTER_ANGLE
      })
    });
    return litSpan(firstFramePng(await fs.readFile(outPath)));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe.runIf(noAdapterReason === null)(
  "renderTimelineComposited — motion blur",
  () => {
    it("samples one instant per frame when blur is off", async () => {
      // Frame 0 sits at t = 0, where the ramp has moved nothing.
      const span = await renderFirstFrame(1);
      expect(Math.abs(span.first - SHAPE_LEFT)).toBeLessThanOrEqual(1);
      expect(Math.abs(span.last - (SHAPE_RIGHT - 1))).toBeLessThanOrEqual(1);
    }, 60_000);

    it("smears across the shutter window, both edges within a pixel", async () => {
      const span = await renderFirstFrame(SAMPLES);
      const firstSampleMs = (0.5 / SAMPLES) * WINDOW_MS;
      const lastSampleMs = ((SAMPLES - 0.5) / SAMPLES) * WINDOW_MS;

      expect(
        Math.abs(span.first - (SHAPE_LEFT + SPEED_PX_PER_MS * firstSampleMs))
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(
          span.last - (SHAPE_RIGHT + SPEED_PX_PER_MS * lastSampleMs - 1)
        )
      ).toBeLessThanOrEqual(1);
      expect(span.last - span.first).toBeGreaterThan(SHAPE_RIGHT - SHAPE_LEFT);
    }, 120_000);
  }
);
