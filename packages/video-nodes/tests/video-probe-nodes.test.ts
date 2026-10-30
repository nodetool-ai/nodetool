/**
 * Fps and GetVideoInfo on real media: the numbers they report are the file's,
 * in ffprobe's terms (an NTSC rate, a libav codec name, a frame count).
 */

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { generateMedia } from "@nodetool-ai/runtime/media/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const { FpsNode, GetVideoInfoNode } = await import("@nodetool-ai/video-nodes");

let dir = "";
let ntsc: Uint8Array;
let silent: Uint8Array;

const ref = (data: Uint8Array) => ({
  type: "video",
  uri: "",
  data: Buffer.from(data).toString("base64")
});

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-probe-nodes-"));
  const ntscPath = path.join(dir, "ntsc.mp4");
  await generateMedia({
    outPath: ntscPath,
    video: { source: "testsrc2=size=64x48:rate=30000/1001:duration=2" },
    audio: { source: "sine=frequency=440:sample_rate=48000:duration=2" }
  });
  ntsc = new Uint8Array(await fs.readFile(ntscPath));
  const silentPath = path.join(dir, "silent.mp4");
  await generateMedia({
    outPath: silentPath,
    video: { source: "testsrc2=size=320x240:rate=25:duration=1" }
  });
  silent = new Uint8Array(await fs.readFile(silentPath));
});

afterAll(async () => {
  if (dir) await fs.rm(dir, { recursive: true, force: true });
});

describe("FpsNode", () => {
  it("reports an NTSC rate as 30000/1001", async () => {
    const node = new FpsNode();
    node.assign({ video: ref(ntsc) });
    const { output } = (await node.process()) as { output: number };
    expect(output).toBeCloseTo(30000 / 1001, 3);
  });

  it("answers 0 for bytes that are no video", async () => {
    const node = new FpsNode();
    node.assign({ video: ref(new Uint8Array(2048).fill(7)) });
    expect(await node.process()).toEqual({ output: 0 });
  });
});

describe("GetVideoInfoNode", () => {
  it("reports size, rate, length, frame count, codec and sound", async () => {
    const node = new GetVideoInfoNode();
    node.assign({ video: ref(ntsc) });
    const info = (await node.process()) as Record<string, number | string | boolean>;
    expect(info).toMatchObject({ width: 64, height: 48, codec: "h264", has_audio: true });
    expect(info.fps).toBeCloseTo(30000 / 1001, 3);
    expect(info.frame_count).toBe(60);
    expect(Math.abs((info.duration as number) - 2)).toBeLessThan(0.05);
  });

  it("reports a picture-only file as silent", async () => {
    const node = new GetVideoInfoNode();
    node.assign({ video: ref(silent) });
    const info = (await node.process()) as Record<string, number | string | boolean>;
    expect(info).toMatchObject({ width: 320, height: 240, fps: 25, frame_count: 25, has_audio: false });
  });
});
