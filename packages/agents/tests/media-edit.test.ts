/**
 * The in-process media operations behind `media_edit`: each one runs on media
 * generated without the CLI and is checked by what the output contains —
 * duration, size, frame content, loudness — not by what was called.
 */

import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  encodeWav,
  generateMedia,
  inspectMedia,
  meanRgba,
  readPcm,
  readRgbaFrames,
  rmsBetween,
  sineSamples,
  solidRgba,
  writeRgbaVideo
} from "@nodetool-ai/runtime/media/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  parseMediaEditRequest,
  runMediaEdit,
  type MediaEditRequest
} from "../src/media-edit.js";
import { encodePixels } from "../src/sandbox-media.js";

let dir = "";
const at = (name: string): string => path.join(dir, name);
const edit = (request: MediaEditRequest) => runMediaEdit(request, at);

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "media-edit-"));
  // 2 s of 64x48 test pattern at 24 fps with a 440 Hz tone.
  await generateMedia({
    outPath: at("clip.mp4"),
    video: { source: "testsrc2=size=64x48:rate=24:duration=2" },
    audio: { source: "sine=frequency=440:sample_rate=48000:duration=2" }
  });
  // 1 s of a different size and rate, so concat has to normalize it.
  await generateMedia({
    outPath: at("other.mp4"),
    video: { source: "testsrc2=size=32x32:rate=30:duration=1" },
    audio: { source: "sine=frequency=880:sample_rate=44100:duration=1" }
  });
  // 2 s of solid mid gray, no audio, lossless: pixel checks read it exactly.
  await writeRgbaVideo({
    outPath: at("gray.mkv"),
    width: 64,
    height: 48,
    fps: 24,
    frames: 48,
    frameAt: () => solidRgba(64, 48, [128, 128, 128, 255])
  });
  await writeFile(
    at("tone.wav"),
    encodeWav(sineSamples({ frequency: 440, sampleRate: 48000, channels: 1, durationSec: 2, amplitude: 0.5 }), 48000, 1)
  );
  await writeFile(
    at("quiet.wav"),
    encodeWav(sineSamples({ frequency: 220, sampleRate: 48000, channels: 1, durationSec: 1, amplitude: 0.05 }), 48000, 1)
  );
}, 60_000);

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("media_edit operations", () => {
  it("trims to the window asked for", async () => {
    await edit({ operation: "trim", input: "clip.mp4", output: "trim.mp4", start: 0.5, end: 1.5 });
    const report = await inspectMedia(at("trim.mp4"));
    expect(report.durationSec).toBeCloseTo(1, 1);
    expect(report.audio).not.toBeNull();
  });

  it("scales the picture", async () => {
    await edit({ operation: "scale", input: "clip.mp4", output: "scaled.mp4", width: 32, height: 24 });
    const report = await inspectMedia(at("scaled.mp4"));
    expect([report.video?.displayWidth, report.video?.displayHeight]).toEqual([32, 24]);
  });

  it("crops a region", async () => {
    await edit({ operation: "crop", input: "clip.mp4", output: "crop.mp4", x: 8, y: 8, width: 32, height: 16 });
    const report = await inspectMedia(at("crop.mp4"));
    expect([report.video?.displayWidth, report.video?.displayHeight]).toEqual([32, 16]);
  });

  it("rotates by 90 degrees", async () => {
    await edit({ operation: "rotate", input: "clip.mp4", output: "rot.mp4", degrees: 90 });
    const report = await inspectMedia(at("rot.mp4"));
    expect([report.video?.displayWidth, report.video?.displayHeight]).toEqual([48, 64]);
  });

  it("converts the container by the output extension", async () => {
    await edit({ operation: "convert", input: "clip.mp4", output: "clip.webm" });
    const report = await inspectMedia(at("clip.webm"));
    expect(report.format.toLowerCase()).toContain("webm");
    expect(report.durationSec).toBeCloseTo(2, 1);
  });

  it("extracts the audio track", async () => {
    await edit({ operation: "extract_audio", input: "clip.mp4", output: "sound.wav" });
    const report = await inspectMedia(at("sound.wav"));
    expect(report.video).toBeNull();
    expect(report.durationSec).toBeCloseTo(2, 1);
  });

  it("joins clips of different sizes at the first clip's size", async () => {
    await edit({ operation: "concat", sources: ["clip.mp4", "other.mp4"], output: "joined.mp4" });
    const report = await inspectMedia(at("joined.mp4"));
    expect(report.durationSec).toBeCloseTo(3, 1);
    expect([report.video?.width, report.video?.height]).toEqual([64, 48]);
    // The second clip's tone is there, after the first's.
    const pcm = await readPcm(at("joined.mp4"), { sampleRate: 48000, channels: 1 });
    expect(rmsBetween(pcm, 2.2, 2.8)).toBeGreaterThan(0.05);
  });

  it("puts a soundtrack on a silent video, cut to the picture", async () => {
    await edit({ operation: "add_audio", input: "gray.mkv", audio: "tone.wav", output: "scored.mkv" });
    const report = await inspectMedia(at("scored.mkv"));
    expect(report.audio).not.toBeNull();
    const pcm = await readPcm(at("scored.mkv"), { sampleRate: 48000, channels: 1 });
    expect(rmsBetween(pcm, 0.5, 1.5)).toBeGreaterThan(0.2);
    expect(pcm.samples.length / 48000).toBeLessThanOrEqual(2.05);
  });

  it("mixes a soundtrack under the video's own sound", async () => {
    await edit({
      operation: "add_audio",
      input: "clip.mp4",
      audio: "quiet.wav",
      output: "mixed.mp4",
      mode: "mix",
      volume: 1
    });
    const pcm = await readPcm(at("mixed.mp4"), { sampleRate: 48000, channels: 1 });
    // The clip's own tone carries the whole length; the soundtrack ends at 1 s.
    expect(rmsBetween(pcm, 1.2, 1.8)).toBeGreaterThan(0.05);
    expect(pcm.samples.length / 48000).toBeCloseTo(2, 1);
  });

  it("mixes audio files to the longest", async () => {
    await edit({ operation: "mix_audio", sources: ["tone.wav", "quiet.wav"], output: "mix.wav", volumes: [1, 0] });
    const pcm = await readPcm(at("mix.wav"), { sampleRate: 48000 });
    expect(pcm.channels).toBe(2);
    expect(pcm.samples.length / 2 / 48000).toBeCloseTo(2, 1);
    // A mono tone at 0.5 lands in each stereo channel at -3 dB: RMS 0.25.
    expect(rmsBetween(pcm, 0.5, 1.5)).toBeGreaterThan(0.2);
  });

  it("fades the picture and the sound in and out", async () => {
    await edit({ operation: "fade", input: "clip.mp4", output: "faded.mp4", fadeIn: 0.5, fadeOut: 0.5 });
    const frames = await readRgbaFrames(at("faded.mp4"), { width: 64, height: 48 });
    const first = meanRgba(frames[0] ?? new Uint8Array(4));
    const middle = meanRgba(frames[24] ?? new Uint8Array(4));
    expect(first[0] + first[1] + first[2]).toBeLessThan(30);
    expect(middle[0] + middle[1] + middle[2]).toBeGreaterThan(150);
    const pcm = await readPcm(at("faded.mp4"), { sampleRate: 48000, channels: 1 });
    expect(rmsBetween(pcm, 0, 0.05)).toBeLessThan(rmsBetween(pcm, 0.9, 1.1) / 4);
  });

  it("fades a plain audio file", async () => {
    await edit({ operation: "fade", input: "tone.wav", output: "tone-out.wav", fadeOut: 1 });
    const pcm = await readPcm(at("tone-out.wav"), { sampleRate: 48000, channels: 1 });
    expect(rmsBetween(pcm, 1.9, 2)).toBeLessThan(rmsBetween(pcm, 0.2, 0.8) / 4);
  });

  it("raises a quiet track toward the loudness target", async () => {
    await edit({ operation: "normalize", input: "quiet.wav", output: "loud.wav" });
    const before = await readPcm(at("quiet.wav"), { sampleRate: 48000, channels: 1 });
    const after = await readPcm(at("loud.wav"), { sampleRate: 48000, channels: 1 });
    expect(rmsBetween(after, 0.2, 0.8)).toBeGreaterThan(rmsBetween(before, 0.2, 0.8) * 2);
  });

  it("lays a picture over a video for the window asked for", async () => {
    await writeFile(at("red.png"), await encodePixels(solidRgba(16, 16, [255, 0, 0, 255]), 16, 16));
    await edit({
      operation: "overlay",
      input: "gray.mkv",
      overlay: "red.png",
      output: "over.mp4",
      x: 0,
      y: 0,
      start: 1,
      end: 2
    });
    const frames = await readRgbaFrames(at("over.mp4"), { width: 64, height: 48 });
    expect(frames.length).toBeGreaterThanOrEqual(46);
    const corner = (frame: Uint8Array | undefined): number => frame?.[0] ?? 0;
    // Before the window the corner is the gray base; inside it, the red picture.
    expect(Math.abs(corner(frames[6]) - 128)).toBeLessThan(12);
    expect(corner(frames[36])).toBeGreaterThan(200);
  });

  it("extracts frames at the times asked for", async () => {
    const { outputs } = await edit({
      operation: "extract_frames",
      input: "clip.mp4",
      output: "frames",
      times: [0, 1]
    });
    expect(outputs).toEqual(["frames/frame_0001.png", "frames/frame_0002.png"]);
    expect(await readdir(at("frames"))).toHaveLength(2);
    const png = await readFile(at("frames/frame_0001.png"));
    expect([...png.subarray(1, 4)].map((c) => String.fromCharCode(c)).join("")).toBe("PNG");
  });
});

describe("parseMediaEditRequest", () => {
  it("names what an operation is missing", () => {
    expect(parseMediaEditRequest({ operation: "concat", sources: ["a.mp4"], output_file: "b.mp4" })).toEqual({
      error: "concat: sources needs at least two files"
    });
    expect(parseMediaEditRequest({ operation: "trim", input: "a.mp4", output_file: "b.mp4", start: 3, end: 2 })).toEqual({
      error: "trim: end must be after start"
    });
    expect(parseMediaEditRequest({ operation: "rotate", input: "a.mp4", output_file: "b.mp4", degrees: 45 })).toEqual({
      error: "degrees must be 90, 180 or 270"
    });
  });

  it("refuses an operation it does not have", () => {
    const result = parseMediaEditRequest({ operation: "filter_complex", input: "a.mp4", output_file: "b.mp4" });
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toMatch(/operation must be one of/);
  });
});
