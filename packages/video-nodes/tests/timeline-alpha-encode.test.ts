/**
 * The alpha-carrying encoders, against a real ffmpeg (F13, T27).
 *
 * `timeline-output-formats.test.ts` pins the arguments; this asks ffmpeg
 * whether they mean what they are supposed to. Frames go in as straight-alpha
 * RGBA, come back out through a decode to RGBA, and a region that was written
 * transparent has to read alpha 0 — which is only true if the pixel format
 * kept the channel end to end.
 *
 * Each case is skipped, with a printed reason, when this ffmpeg build has no
 * encoder for it: ProRes 4444 and VP9 are both optional at build time, and a
 * red suite on a machine that simply cannot encode ProRes says nothing.
 */
import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { execFfmpeg } from "../src/nodes/ffmpeg-helpers.js";
import {
  ffmpegHasEncoder,
  openFrameEncoder
} from "../src/nodes/timeline/rawFrames.js";
import { resolveTimelineOutput } from "../src/nodes/timeline/outputFormats.js";

const WIDTH = 32;
const HEIGHT = 32;
const FRAMES = 4;

/** Left half transparent, right half opaque green. */
function halfTransparent(): Uint8Array {
  const rgba = new Uint8Array(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = WIDTH / 2; x < WIDTH; x++) {
      const i = (y * WIDTH + x) * 4;
      rgba[i + 1] = 255;
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

async function encoderAvailable(name: string): Promise<boolean> {
  const ok = await ffmpegHasEncoder(name);
  if (!ok) {
    process.stderr.write(
      `timeline-alpha-encode: skipping ${name} — this ffmpeg build has no such encoder ` +
        "(or no ffmpeg at all).\n"
    );
  }
  return ok;
}

const hasProres = await encoderAvailable("prores_ks");
const hasVp9 = await encoderAvailable("libvpx-vp9");

/** Encode `FRAMES` half-transparent frames and decode frame 0 back to RGBA. */
async function roundTrip(
  format: "mov" | "webm"
): Promise<Uint8Array> {
  const output = resolveTimelineOutput({ format, alpha: true });
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-alpha-enc-"));
  try {
    const outPath = path.join(dir, `clip.${output.extension}`);
    const encoder = openFrameEncoder({
      outPath,
      width: WIDTH,
      height: HEIGHT,
      fps: 10,
      encoderArgs: output.encoderArgs
    });
    for (let i = 0; i < FRAMES; i++) await encoder.write(halfTransparent());
    await encoder.finish();

    const rawPath = path.join(dir, "frame.raw");
    await execFfmpeg([
      "-y",
      "-v",
      "error",
      "-i",
      outPath,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      rawPath
    ]);
    return new Uint8Array(await fs.readFile(rawPath));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function alphaAt(rgba: Uint8Array, x: number, y: number): number {
  return rgba[(y * WIDTH + x) * 4 + 3];
}

describe.runIf(hasProres)("ProRes 4444", () => {
  it("decodes the transparent half at alpha 0", async () => {
    const frame = await roundTrip("mov");
    expect(alphaAt(frame, 2, 2)).toBe(0);
    expect(alphaAt(frame, WIDTH - 2, 2)).toBeGreaterThan(200);
  }, 120_000);
});

describe.runIf(hasVp9)("VP9 in WebM", () => {
  it("decodes the transparent half at alpha 0", async () => {
    const frame = await roundTrip("webm");
    // yuva420p subsamples chroma, so the colour is approximate near the seam;
    // the alpha plane is full resolution and is what this asserts.
    expect(alphaAt(frame, 2, 2)).toBe(0);
    expect(alphaAt(frame, WIDTH - 2, 2)).toBeGreaterThan(200);
  }, 120_000);
});
