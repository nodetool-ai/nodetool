/**
 * `muxStreamCopy` joins a video-only and an audio-only file into one, packets
 * unchanged: what yt-dlp ran ffmpeg for when it merged formats.
 */

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { copyContainerFor, muxStreamCopy, streamCodecs } from "../../src/media/mux.js";
import { generateMedia, inspectMedia } from "../../src/media/testing.js";

let dir: string;
let h264: string;
let aac: string;
let vp9: string;
let opus: string;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "stream-copy-mux-"));
  h264 = path.join(dir, "video.mp4");
  aac = path.join(dir, "audio.m4a");
  vp9 = path.join(dir, "video.webm");
  opus = path.join(dir, "audio.webm");
  await generateMedia({ outPath: h264, video: { source: "testsrc2=size=64x48:rate=24:duration=1" } });
  await generateMedia({ outPath: aac, audio: { source: "sine=frequency=440:duration=1" } });
  await generateMedia({
    outPath: vp9,
    video: { source: "testsrc2=size=64x48:rate=24:duration=1", codec: "libvpx-vp9" }
  });
  await generateMedia({
    outPath: opus,
    audio: { source: "sine=frequency=440:sample_rate=48000:duration=1", codec: "libopus" }
  });
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("copyContainerFor", () => {
  it("picks webm, then mp4, then mkv", () => {
    expect(copyContainerFor("vp9", "opus")).toBe("webm");
    expect(copyContainerFor("h264", "aac")).toBe("mp4");
    expect(copyContainerFor("vp9", "aac")).toBe("mp4");
    expect(copyContainerFor("h264", "vorbis")).toBe("mkv");
  });
});

describe("muxStreamCopy", () => {
  it("copies H.264 video and AAC audio into one mp4", async () => {
    const result = await muxStreamCopy({
      videoPath: h264,
      audioPath: aac,
      outStem: path.join(dir, "h264-aac"),
      container: "auto"
    });
    expect(result).toMatchObject({ container: "mp4", video: "h264", audio: "aac" });
    expect(result.outPath).toBe(path.join(dir, "h264-aac.mp4"));
    expect(await streamCodecs(result.outPath)).toEqual({ video: "h264", audio: "aac" });
    const report = await inspectMedia(result.outPath);
    expect(report.durationSec).toBeGreaterThan(0.9);
  });

  it("copies VP9 and Opus into webm when the container is auto", async () => {
    const result = await muxStreamCopy({
      videoPath: vp9,
      audioPath: opus,
      outStem: path.join(dir, "vp9-opus"),
      container: "auto"
    });
    expect(result.container).toBe("webm");
    expect(await streamCodecs(result.outPath)).toEqual({ video: "vp9", audio: "opus" });
  });

  it("honors an explicit container that holds both codecs", async () => {
    const result = await muxStreamCopy({
      videoPath: h264,
      audioPath: opus,
      outStem: path.join(dir, "h264-opus"),
      container: "mkv"
    });
    expect(await streamCodecs(result.outPath)).toEqual({ video: "h264", audio: "opus" });
  });

  it("copies an MP4-tagged AAC stream into mkv", async () => {
    const result = await muxStreamCopy({
      videoPath: h264,
      audioPath: aac,
      outStem: path.join(dir, "h264-aac"),
      container: "mkv"
    });
    expect(await streamCodecs(result.outPath)).toEqual({ video: "h264", audio: "aac" });
  });

  it("names the codecs and container it cannot copy into, and writes nothing", async () => {
    const outStem = path.join(dir, "refused");
    await expect(
      muxStreamCopy({ videoPath: h264, audioPath: aac, outStem, container: "webm" })
    ).rejects.toThrow(/Cannot stream-copy h264 video with aac audio into webm/);
    await expect(fs.stat(`${outStem}.webm`)).rejects.toThrow();
  });

  it("refuses a container it does not write", async () => {
    await expect(
      muxStreamCopy({ videoPath: h264, audioPath: aac, outStem: path.join(dir, "x"), container: "avi" })
    ).rejects.toThrow(/Cannot write container "avi"/);
  });

  it("refuses an audio side with no audio stream", async () => {
    await expect(
      muxStreamCopy({ videoPath: h264, audioPath: vp9, outStem: path.join(dir, "y"), container: "auto" })
    ).rejects.toThrow(/has no audio stream/);
  });

  it("remuxes one file named on both sides, audio or not", async () => {
    const result = await muxStreamCopy({
      videoPath: h264,
      audioPath: h264,
      outStem: path.join(dir, "same"),
      container: "auto"
    });
    expect(await streamCodecs(result.outPath)).toEqual({ video: "h264", audio: null });
  });
});
