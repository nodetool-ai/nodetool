/**
 * The server decoder under a time remap (T29, F9, D13), against a real ffmpeg.
 *
 * `openVideoFrameStream` is forward-only: it decodes a clip once, in source
 * order, because a rate-retimed clip never asks for a source instant it has
 * already passed. A remap curve can. `openSourceFrameStream` is the answer —
 * it reopens the decode to seek backwards — and this asks ffmpeg whether the
 * frames that come back are the ones the curve names.
 *
 * The second half runs the same curves through `renderTimelineComposited`, so
 * the claim covers the wiring too: that a remapped clip reaches the
 * source-addressed stream at all, and that the frames the render writes are the
 * ones the curve names.
 *
 * Nothing is mocked and the decoder half cannot skip: ffmpeg is installed on
 * the `test-packages` CI leg (`quality-checks.yml`) and `ffv1` is a native
 * encoder every build carries, so with no ffmpeg on PATH the encoder throws
 * `MissingBinaryError` and the suite goes red. Only the whole-render half is
 * conditional, on a WebGPU device, and it says so when it steps aside.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TimelineSequence } from "@nodetool-ai/timeline";

import { renderTimelineComposited } from "../src/nodes/timeline/compositeRender.js";
import { resolveTimelineOutput } from "../src/nodes/timeline/outputFormats.js";
import {
  openFrameEncoder,
  openSourceFrameStream,
  openVideoFrameStream
} from "../src/nodes/timeline/rawFrames.js";

/**
 * The whole-render half needs a WebGPU device; the decoder half above does not.
 * A missing adapter on headless Linux means no Vulkan ICD — see AGENTS.md
 * § WebGPU on a headless machine — and is announced rather than passed over.
 */
const noAdapterReason = await (async (): Promise<string | null> => {
  try {
    const { getNodeGPUDevice } = await import("@nodetool-ai/gpu/node");
    await getNodeGPUDevice();
    return null;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      "timeline-time-remap-decode: skipping the whole-render case — no WebGPU " +
        `device. ${reason}\n`
    );
    return reason;
  }
})();

const WIDTH = 32;
const HEIGHT = 32;
const FPS = 10;
/** Frames in the fixture media: source times 0.0s … 1.2s. */
const SOURCE_FRAMES = 13;
/** Frames the whole-render cases produce, over a 1200ms clip at `FPS`. */
const RENDER_FRAMES = 12;
const CLIP_MS = (RENDER_FRAMES / FPS) * 1000;
/** Frame k is solid gray at this value — far enough apart to identify a frame. */
const STEP = 18;
const grayOf = (frameIndex: number): number => STEP + frameIndex * STEP;

function solidFrame(value: number): Uint8Array {
  const rgba = new Uint8Array(WIDTH * HEIGHT * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = value;
    rgba[i + 1] = value;
    rgba[i + 2] = value;
    rgba[i + 3] = 255;
  }
  return rgba;
}

/** The gray a decoded frame carries, read from its centre pixel. */
function grayAt(rgba: Uint8Array): number {
  const centre = ((HEIGHT / 2) * WIDTH + WIDTH / 2) * 4;
  return rgba[centre]!;
}

/** Nearest authored frame value, so a decode can be named rather than guessed. */
function nearestFrameIndex(gray: number): number {
  let best = 0;
  for (let k = 1; k < SOURCE_FRAMES; k++) {
    if (Math.abs(grayOf(k) - gray) < Math.abs(grayOf(best) - gray)) best = k;
  }
  return best;
}

let dir = "";
let clipPath = "";

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-time-remap-"));
  clipPath = path.join(dir, "ramp.mkv");
  // ffv1 over planar RGB is lossless and all-intra, so every frame is its own
  // seek point and the gray that goes in is the gray that comes back.
  const encoder = openFrameEncoder({
    outPath: clipPath,
    width: WIDTH,
    height: HEIGHT,
    fps: FPS,
    encoderArgs: ["-c:v", "ffv1", "-pix_fmt", "gbrp"]
  });
  for (let k = 0; k < SOURCE_FRAMES; k++) {
    await encoder.write(solidFrame(grayOf(k)));
  }
  await encoder.finish();
}, 60_000);

afterAll(async () => {
  if (dir) await fs.rm(dir, { recursive: true, force: true });
});

describe("openSourceFrameStream", () => {
  it("decodes the source forward without reopening", async () => {
    const stream = openSourceFrameStream({
      filePath: clipPath,
      size: { width: WIDTH, height: HEIGHT },
      fps: FPS,
      startSec: 0
    });
    try {
      const seen: number[] = [];
      for (let k = 0; k < SOURCE_FRAMES; k++) {
        const rgba = await stream.frameAtSourceSec(k / FPS);
        expect(rgba).not.toBeNull();
        seen.push(nearestFrameIndex(grayAt(rgba!)));
      }
      expect(seen).toEqual([...Array(SOURCE_FRAMES).keys()]);
      expect(stream.reopens).toBe(0);
    } finally {
      stream.close();
    }
  }, 60_000);

  it("serves a reverse curve by reopening, and the frames descend", async () => {
    // The curve a reverse writes: t ascends over the clip, sourceMs descends.
    const sourceSecs: number[] = [];
    for (let k = SOURCE_FRAMES - 1; k >= 0; k--) sourceSecs.push(k / FPS);

    const stream = openSourceFrameStream({
      filePath: clipPath,
      size: { width: WIDTH, height: HEIGHT },
      fps: FPS,
      startSec: sourceSecs[0]!
    });
    try {
      const grays: number[] = [];
      for (const sec of sourceSecs) {
        const rgba = await stream.frameAtSourceSec(sec);
        expect(rgba).not.toBeNull();
        grays.push(grayAt(rgba!));
      }
      // The claim: descending source time yields descending source frames.
      for (let i = 1; i < grays.length; i++) {
        expect(grays[i]).toBeLessThan(grays[i - 1]!);
      }
      expect(grays.map(nearestFrameIndex)).toEqual(
        sourceSecs.map((sec) => Math.round(sec * FPS))
      );
      // Every step but the first is a backwards seek, so every one reopened.
      expect(stream.reopens).toBe(sourceSecs.length - 1);
    } finally {
      stream.close();
    }
  }, 120_000);

  it("holds the last frame past the end of the media, like the rate path", async () => {
    const stream = openSourceFrameStream({
      filePath: clipPath,
      size: { width: WIDTH, height: HEIGHT },
      fps: FPS,
      startSec: 0
    });
    try {
      await stream.frameAtSourceSec(0);
      const past = await stream.frameAtSourceSec(SOURCE_FRAMES / FPS + 5);
      expect(past).not.toBeNull();
      expect(nearestFrameIndex(grayAt(past!))).toBe(SOURCE_FRAMES - 1);
    } finally {
      stream.close();
    }
  }, 60_000);

  it("agrees with the forward-only stream on an unremapped read", async () => {
    const forward = openVideoFrameStream({
      filePath: clipPath,
      size: { width: WIDTH, height: HEIGHT },
      fps: FPS,
      startSec: 0,
      speed: 1
    });
    const source = openSourceFrameStream({
      filePath: clipPath,
      size: { width: WIDTH, height: HEIGHT },
      fps: FPS,
      startSec: 0
    });
    try {
      for (let k = 0; k < SOURCE_FRAMES; k++) {
        const a = await forward.frameAt(k);
        const b = await source.frameAtSourceSec(k / FPS);
        expect(grayAt(b!)).toBe(grayAt(a!));
      }
    } finally {
      forward.close();
      source.close();
    }
  }, 60_000);
});

/**
 * The frames of a stored PNG-sequence zip, in order, as raw entry bytes. The
 * archive also carries a `manifest.json`, which is not a frame.
 */
function pngEntries(archive: Buffer): Buffer[] {
  const out: Buffer[] = [];
  let at = 0;
  while (at + 30 <= archive.length && archive.readUInt32LE(at) === 0x04034b50) {
    const size = archive.readUInt32LE(at + 18);
    const nameLen = archive.readUInt16LE(at + 26);
    const extraLen = archive.readUInt16LE(at + 28);
    const name = archive.toString("utf8", at + 30, at + 30 + nameLen);
    const start = at + 30 + nameLen + extraLen;
    if (name.endsWith(".png")) out.push(archive.subarray(start, start + size));
    at = start + size;
  }
  return out;
}

/** The centre pixel's red channel of a PNG. */
async function centreGray(png: Buffer): Promise<number> {
  const image = await loadImage(png);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const { data, width } = ctx.getImageData(0, 0, image.width, image.height);
  const i = (Math.floor(image.height / 2) * width + Math.floor(width / 2)) * 4;
  return data[i]!;
}

/** A one-clip sequence playing `clipPath` under `keyframes`. */
function sequence(
  keyframes: { t: number; sourceMs: number }[]
): TimelineSequence {
  const durationMs = CLIP_MS;
  return {
    id: "seq-remap",
    name: "Time remap fixture",
    width: WIDTH,
    height: HEIGHT,
    fps: FPS,
    durationMs,
    tracks: [{ id: "t-video", type: "video", index: 0, visible: true }],
    clips: [
      {
        id: "clip-remap",
        trackId: "t-video",
        name: "Ramp",
        startMs: 0,
        durationMs,
        mediaType: "video",
        sourceType: "generated",
        status: "generated",
        currentAssetId: "asset-ramp",
        timeRemap: { keyframes }
      }
    ]
  } as TimelineSequence;
}

/** Render the sequence to a PNG sequence and read each frame's gray. */
async function renderGrays(
  keyframes: { t: number; sourceMs: number }[]
): Promise<number[]> {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-remap-render-"));
  const outPath = path.join(outDir, "frames.zip");
  try {
    const seq = sequence(keyframes);
    await renderTimelineComposited({
      sequence: seq,
      width: WIDTH,
      height: HEIGHT,
      fps: FPS,
      durationMs: seq.durationMs,
      resolveAssetPath: async () => clipPath,
      outPath,
      output: resolveTimelineOutput({ format: "png_sequence" })
    });
    const frames = pngEntries(await fs.readFile(outPath));
    return await Promise.all(frames.map(centreGray));
  } finally {
    await fs.rm(outDir, { recursive: true, force: true });
  }
}

describe.runIf(noAdapterReason === null)(
  "renderTimelineComposited — time remap",
  () => {
    it("plays the source forward when the curve ascends", async () => {
      // Source 0ms at the cut, 1200ms at the end of a 1200ms clip: frame k of
      // the render is source frame k.
      const grays = await renderGrays([
        { t: 0, sourceMs: 0 },
        { t: 1, sourceMs: CLIP_MS }
      ]);
      expect(grays.length).toBe(RENDER_FRAMES);
      expect(grays.map(nearestFrameIndex)).toEqual([
        ...Array(RENDER_FRAMES).keys()
      ]);
    }, 180_000);

    it("plays the source backwards when the curve descends", async () => {
      // The mirror of the forward case: source 1200ms at the cut, 0ms at the
      // end, so frame k of the render is source frame 12 - k.
      const grays = await renderGrays([
        { t: 0, sourceMs: CLIP_MS },
        { t: 1, sourceMs: 0 }
      ]);
      expect(grays.length).toBe(RENDER_FRAMES);
      for (let i = 1; i < grays.length; i++) {
        expect(grays[i]).toBeLessThan(grays[i - 1]!);
      }
      expect(grays.map(nearestFrameIndex)).toEqual(
        Array.from({ length: RENDER_FRAMES }, (_, k) => SOURCE_FRAMES - 1 - k)
      );
    }, 180_000);

    it("holds one source frame for the whole clip when the curve is flat", async () => {
      const frozenAt = 4;
      const grays = await renderGrays([
        { t: 0, sourceMs: (frozenAt / FPS) * 1000 },
        { t: 1, sourceMs: (frozenAt / FPS) * 1000 }
      ]);
      expect(grays.map(nearestFrameIndex)).toEqual(
        new Array(RENDER_FRAMES).fill(frozenAt)
      );
    }, 180_000);
  }
);
