/**
 * `openSourceConverter`: a clip the browser has no decoder for is converted
 * to VP9 once, with its frame timing kept; anything the browser reads is
 * served as it is.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { pngFrames } from "@nodetool-ai/runtime/media";
import { generateMedia, videoPacketInfo, videoStreamFormat } from "@nodetool-ai/runtime/media/testing";
import { openSourceConverter } from "../src/nodes/timeline/browserSources.js";

let directory = "";
let h264 = "";
let png = "";

beforeAll(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-browser-sources-"));
  h264 = path.join(directory, "vfr.mp4");
  // Variable frame rate: two of every five frames of a 60 fps pattern.
  await generateMedia({
    outPath: h264,
    video: {
      source: "testsrc2=size=160x90:rate=60:duration=1",
      filter: "select='lt(mod(n\\,5)\\,2)'",
      options: { preset: "ultrafast" }
    }
  });
  png = path.join(directory, "still.png");
  await fs.writeFile(png, await firstPng("color=red:size=16x16:duration=0.1"));
});

afterAll(async () => {
  if (directory) await fs.rm(directory, { recursive: true, force: true });
});

/** A PNG of a lavfi source's first frame. */
async function firstPng(source: string): Promise<Uint8Array> {
  const clip = path.join(directory, "still-source.mkv");
  await generateMedia({ outPath: clip, video: { source, codec: "ffv1", pixelFormat: "bgr0" } });
  for await (const frame of pngFrames({ filePath: clip, limit: 1 })) return frame;
  throw new Error(`${source} produced no frame`);
}

async function frameTimes(file: string): Promise<number[]> {
  return (await videoPacketInfo(file)).map((packet) => packet.pts);
}

describe("openSourceConverter", () => {
  it("converts an H.264 clip once when the browser has no H.264 decoder", async () => {
    const converter = openSourceConverter({ workDir: directory, decodable: new Set(["vp9", "av1"]) });
    const [first, second] = await Promise.all([converter.prepare(h264), converter.prepare(h264)]);
    expect(first).toBe(second);
    expect(first).not.toBe(h264);
    expect(converter.converted).toBe(1);

    expect((await videoStreamFormat(first))?.codec).toBe("vp9");
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
