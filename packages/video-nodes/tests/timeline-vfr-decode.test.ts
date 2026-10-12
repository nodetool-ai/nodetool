/**
 * Decoding a variable-frame-rate clip for the Node compositor.
 *
 * Generated clips (Seedance, Dreamina) report `r_frame_rate=60/1` with an
 * average near 24 fps. Their packets sit on no regular grid, so the
 * source-time stream seeks afresh for every frame: one ffmpeg spawn per frame,
 * which made a five-minute timeline take hours. A clip without a time remap
 * plays forward at a constant rate, and one decode resampled to the timeline's
 * frame rate serves it. These cases build such a file and hold the forward
 * stream to the per-frame seek: the same pictures, without the reopens.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { execFfmpeg, execFfprobe } from "../src/nodes/ffmpeg-helpers.js";
import {
  openForwardSourceFrameStream,
  openFrameEncoder,
  openSourceFrameStream,
  probeVideoFrameRate
} from "../src/nodes/timeline/rawFrames.js";

const WIDTH = 64;
const HEIGHT = 36;
const SOURCE_FPS = 60;
const SOURCE_FRAMES = 240;
const TIMELINE_FPS = 30;
let directory = "";
let vfrPath = "";
/** Presentation times of the VFR file's frames, ascending. */
let frameTimes: number[] = [];

/**
 * The timestamp of the frame a player shows at `sec`: the latest one
 * presented at or before it. The browser export and the editor preview both
 * show this one.
 */
function shownAt(sec: number): number {
  let shown = frameTimes[0] ?? 0;
  for (const time of frameTimes) {
    if (time > sec + 1e-6) break;
    shown = time;
  }
  return shown;
}

/**
 * The frames that may be shown at `sec`. Matroska stores milliseconds, so a
 * frame within a millisecond of the instant can land on either side of it
 * once `setpts` divides its timestamp.
 */
async function expectedGrays(
  seek: { frameAtSourceSec(sec: number): Promise<Uint8Array | null> },
  sec: number
): Promise<number[]> {
  const times = new Set([shownAt(sec - 0.001), shownAt(sec), shownAt(sec + 0.001)]);
  const grays: number[] = [];
  for (const time of [...times].sort((a, b) => a - b)) {
    grays.push(grayOf(await seek.frameAtSourceSec(time)));
  }
  return grays;
}

/** Mean of the red channel: the source frame number, encoded as gray. */
function grayOf(rgba: Uint8Array | null): number {
  if (!rgba) return -1;
  let sum = 0;
  for (let i = 0; i < rgba.length; i += 4) sum += rgba[i] ?? 0;
  return Math.round(sum / (rgba.length / 4));
}

beforeAll(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-vfr-decode-"));
  const cfrPath = path.join(directory, "source-60fps.mkv");
  const encoder = openFrameEncoder({
    outPath: cfrPath,
    width: WIDTH,
    height: HEIGHT,
    fps: SOURCE_FPS,
    encoderArgs: ["-c:v", "ffv1", "-level", "3", "-pix_fmt", "bgra"]
  });
  const frame = new Uint8Array(WIDTH * HEIGHT * 4);
  for (let index = 0; index < SOURCE_FRAMES; index++) {
    const gray = index;
    for (let i = 0; i < frame.length; i += 4) frame.set([gray, gray, gray, 255], i);
    await encoder.write(frame);
  }
  await encoder.finish();
  // Keep two frames of every five, at their own timestamps: the 60/1 nominal
  // rate stays, the average drops to 24 — the profile generated clips have.
  vfrPath = path.join(directory, "vfr.mkv");
  await execFfmpeg([
    "-v", "error", "-y", "-i", cfrPath,
    "-vf", "select='lt(mod(n\\,5)\\,2)'",
    "-fps_mode", "vfr",
    "-c:v", "ffv1", "-level", "3", "-pix_fmt", "bgra",
    vfrPath
  ]);
  const { stdout } = await execFfprobe([
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "packet=pts_time", "-of", "csv=p=0", vfrPath
  ]);
  frameTimes = String(stdout).trim().split(/\r?\n/).map(Number).sort((a, b) => a - b);
});

afterAll(async () => {
  if (directory) await fs.rm(directory, { recursive: true, force: true });
});

describe("variable-frame-rate decode", () => {
  it("builds a source with a 60/1 nominal rate and a lower average", async () => {
    const { stdout } = await execFfprobe([
      "-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=r_frame_rate,avg_frame_rate",
      "-of", "default=noprint_wrappers=1", vfrPath
    ]);
    expect(String(stdout)).toContain("r_frame_rate=60/1");
    expect(await probeVideoFrameRate(vfrPath)).toBe(SOURCE_FPS);
  });

  // The reference is the per-frame seek to the timestamp of the frame shown
  // at each instant, which decodes exactly that frame.
  it("shows the frame presented at each instant, with no reopens", async () => {
    const startSec = 0.5;
    const instants = Array.from({ length: 30 }, (_, k) => startSec + k / TIMELINE_FPS);
    const forward = openForwardSourceFrameStream({
      filePath: vfrPath,
      size: { width: WIDTH, height: HEIGHT },
      fps: TIMELINE_FPS,
      startSec,
      speed: 1
    });
    const seek = openSourceFrameStream({
      filePath: vfrPath,
      size: { width: WIDTH, height: HEIGHT },
      fps: SOURCE_FPS,
      startSec,
      nativeSampling: true
    });
    try {
      for (const sec of instants) {
        const streamed = grayOf(await forward.frameAtSourceSec(sec));
        expect(await expectedGrays(seek, sec), `source ${sec.toFixed(3)}s`).toContain(streamed);
      }
      expect(forward.reopens).toBe(0);
      // The seek path's reopen count is the regression this stream removes.
      expect(seek.reopens).toBeGreaterThan(instants.length / 2);
    } finally {
      forward.close();
      seek.close();
    }
  }, 120_000);

  it("follows the clip's speed on the timeline grid", async () => {
    const forward = openForwardSourceFrameStream({
      filePath: vfrPath,
      size: { width: WIDTH, height: HEIGHT },
      fps: TIMELINE_FPS,
      startSec: 0,
      speed: 2
    });
    const seek = openSourceFrameStream({
      filePath: vfrPath,
      size: { width: WIDTH, height: HEIGHT },
      fps: SOURCE_FPS,
      startSec: 0,
      nativeSampling: true
    });
    try {
      for (let k = 0; k < 20; k++) {
        const sec = (k * 2) / TIMELINE_FPS;
        const streamed = grayOf(await forward.frameAtSourceSec(sec));
        expect(await expectedGrays(seek, sec), `frame ${k}`).toContain(streamed);
      }
    } finally {
      forward.close();
      seek.close();
    }
  }, 120_000);

  it("decodes a forward clip at a small fraction of the per-frame seek cost", async () => {
    const frames = 60;
    const time = async (stream: { frameAtSourceSec(sec: number): Promise<Uint8Array | null>; close(): void }) => {
      const started = performance.now();
      try {
        for (let k = 0; k < frames; k++) await stream.frameAtSourceSec(k / TIMELINE_FPS);
      } finally {
        stream.close();
      }
      return performance.now() - started;
    };
    const size = { width: WIDTH, height: HEIGHT };
    const forwardMs = await time(
      openForwardSourceFrameStream({ filePath: vfrPath, size, fps: TIMELINE_FPS, startSec: 0, speed: 1 })
    );
    const seekMs = await time(
      openSourceFrameStream({ filePath: vfrPath, size, fps: SOURCE_FPS, startSec: 0, nativeSampling: true })
    );
    process.stderr.write(
      `vfr decode, ${frames} frames: streamed ${forwardMs.toFixed(0)} ms, per-frame seek ${seekMs.toFixed(0)} ms\n`
    );
    // One ffmpeg process against sixty: the margin is wide so a loaded CI
    // machine still passes, while the old path cannot.
    expect(forwardMs * 4).toBeLessThan(seekMs);
  }, 120_000);
});
