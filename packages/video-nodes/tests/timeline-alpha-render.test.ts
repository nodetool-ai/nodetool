/**
 * Alpha through the whole server render (F13, T27).
 *
 * `renderTimelineComposited` runs against a real WebGPU device and writes a
 * real PNG sequence — no encoder is faked here, because the claim under test is
 * exactly that the transparency survives every step: the compositor's
 * transparent seed, the premultiplied accumulation, the un-premultiply on
 * readback, and the PNG encode. The fixture is a shape covering the middle of
 * the frame, so the corners are ground nothing drew on and the centre is the
 * shape's own opaque colour.
 *
 * PNG is the readable end of this: a WebM the same pipeline writes needs ffmpeg
 * to decode, and `yuva420p` subsamples chroma, so a byte comparison there would
 * be about the codec rather than about the render. The `mp4` and `webm`
 * argument routing is pinned in `timeline-output-formats.test.ts`.
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
      `timeline-alpha-render: skipping every case — no WebGPU device. ${reason}\n`
    );
    return reason;
  }
})();

const WIDTH = 64;
const HEIGHT = 64;
const FPS = 10;
const DURATION_MS = 200;

/** One opaque blue rectangle over the middle half of the frame. */
function fixture(): TimelineSequence {
  return {
    id: "seq-alpha",
    name: "Alpha fixture",
    width: WIDTH,
    height: HEIGHT,
    fps: FPS,
    durationMs: DURATION_MS,
    tracks: [{ id: "t-shape", type: "video", index: 0, visible: true }],
    clips: [
      {
        id: "clip-shape",
        trackId: "t-shape",
        name: "Card",
        startMs: 0,
        durationMs: DURATION_MS,
        mediaType: "shape",
        sourceType: "generated",
        shapeStyle: {
          kind: "rect",
          fill: "#0000ff",
          x: 0.25,
          y: 0.25,
          width: 0.5,
          height: 0.5
        }
      }
    ]
  } as TimelineSequence;
}

/** The first frame's PNG bytes, pulled out of the stored zip. */
function firstFramePng(archive: Buffer): Buffer {
  // Local file header of the first entry sits at offset 0 in a stored zip.
  if (archive.readUInt32LE(0) !== 0x04034b50) {
    throw new Error("not a zip archive");
  }
  const size = archive.readUInt32LE(18);
  const nameLen = archive.readUInt16LE(26);
  const extraLen = archive.readUInt16LE(28);
  const name = archive.toString("utf8", 30, 30 + nameLen);
  if (name !== "frame_000001.png") {
    throw new Error(`first entry is "${name}"`);
  }
  const at = 30 + nameLen + extraLen;
  return archive.subarray(at, at + size);
}

async function pixels(
  png: Buffer
): Promise<(x: number, y: number) => [number, number, number, number]> {
  const image = await loadImage(png);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const { data, width } = ctx.getImageData(0, 0, image.width, image.height);
  return (x, y) => {
    const i = (y * width + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };
}

async function renderFirstFrame(alpha: boolean): Promise<Buffer> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-alpha-"));
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
      output: resolveTimelineOutput({ format: "png_sequence", alpha })
    });
    return firstFramePng(await fs.readFile(outPath));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe.runIf(noAdapterReason === null)(
  "renderTimelineComposited — alpha",
  () => {
    it("leaves the ground at alpha 0 and keeps the drawn shape opaque", async () => {
      const at = await pixels(await renderFirstFrame(true));

      // A corner: outside the rectangle, so nothing ever drew there.
      expect(at(2, 2)[3]).toBe(0);
      // The middle of the rectangle: opaque, and the colour it was given.
      const centre = at(WIDTH / 2, HEIGHT / 2);
      expect(centre[3]).toBe(255);
      expect(centre[2]).toBeGreaterThan(200);
      expect(centre[0]).toBeLessThan(60);
    }, 60_000);

    it("is opaque black in the same corner without alpha", async () => {
      const at = await pixels(await renderFirstFrame(false));
      expect(at(2, 2)).toEqual([0, 0, 0, 255]);
    }, 60_000);
  }
);
