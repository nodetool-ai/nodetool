/**
 * `openSourceConverter`: a clip the browser has no decoder for is converted
 * to VP9 once, with its frame timing kept; anything the browser reads is
 * served as it is.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { execFfmpeg, execFfprobe } from "../src/nodes/ffmpeg-helpers.js";
import { openSourceConverter } from "../src/nodes/timeline/browserSources.js";

let directory = "";
let h264 = "";
let png = "";

beforeAll(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-browser-sources-"));
  h264 = path.join(directory, "vfr.mp4");
  // Variable frame rate: two of every five frames of a 60 fps pattern.
  await execFfmpeg([
    "-v", "error", "-y",
    "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=60",
    "-t", "1",
    "-vf", "select='lt(mod(n\\,5)\\,2)'",
    "-fps_mode", "vfr",
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
    h264
  ]);
  png = path.join(directory, "still.png");
  await execFfmpeg(["-v", "error", "-y", "-f", "lavfi", "-i", "color=red:size=16x16", "-frames:v", "1", png]);
});

afterAll(async () => {
  if (directory) await fs.rm(directory, { recursive: true, force: true });
});

async function frameTimes(file: string): Promise<number[]> {
  const { stdout } = await execFfprobe([
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "frame=pts_time", "-of", "csv=p=0", file
  ]);
  return String(stdout).trim().split("\n").map((line) => Number(line.replace(/,$/, "")));
}

describe("openSourceConverter", () => {
  it("converts an H.264 clip once when the browser has no H.264 decoder", async () => {
    const converter = openSourceConverter({ workDir: directory, decodable: new Set(["vp9", "av1"]) });
    const [first, second] = await Promise.all([converter.prepare(h264), converter.prepare(h264)]);
    expect(first).toBe(second);
    expect(first).not.toBe(h264);
    expect(converter.converted).toBe(1);

    const { stdout } = await execFfprobe([
      "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name", "-of", "csv=p=0", first
    ]);
    expect(String(stdout).trim()).toBe("vp9");
    // The same frames at the same times, to the millisecond a webm keeps.
    const [source, converted] = await Promise.all([frameTimes(h264), frameTimes(first)]);
    expect(converted).toHaveLength(source.length);
    converted.forEach((time, index) => expect(Math.abs(time - (source[index] ?? 0))).toBeLessThanOrEqual(0.001));
  }, 60_000);

  it("serves a clip the browser decodes, and a still, as they are", async () => {
    const converter = openSourceConverter({ workDir: directory, decodable: new Set(["h264", "vp9"]) });
    expect(await converter.prepare(h264)).toBe(h264);
    expect(await converter.prepare(png)).toBe(png);
    expect(converter.converted).toBe(0);
  }, 60_000);
});
