/**
 * The video.ts editing nodes on real media: each test checks what the node
 * wrote (frame count, size, pixels, sound), not how it got there. Inputs come
 * from the runtime's media helper, not the ffmpeg CLI.
 */

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { RAW_RGBA_MIME } from "@nodetool-ai/protocol";
import { transformMedia } from "@nodetool-ai/runtime/media";
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
  writeRgbaVideo,
  type MediaReport
} from "@nodetool-ai/runtime/media/testing";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const nodes = await import("@nodetool-ai/video-nodes");

let dir = "";
const file = (name: string): string => path.join(dir, name);

/** Gray level k*20 on frame k, 10 fps, 1 s, every frame a keyframe, with a 440 Hz tone. */
let grayAv: Uint8Array;
/** The same picture, no sound. */
let gray: Uint8Array;
let red: Uint8Array;
let green: Uint8Array;
let pattern: Uint8Array;
let toneWav: Uint8Array;

const W = 64;
const H = 48;

const videoRef = (data: Uint8Array) => ({
  type: "video",
  uri: "",
  data: Buffer.from(data).toString("base64")
});

function bytesOf(ref: unknown): Uint8Array {
  const data = (ref as { data?: string | Uint8Array }).data;
  if (data instanceof Uint8Array) return data;
  return new Uint8Array(Buffer.from(String(data ?? ""), "base64"));
}

async function inspect(bytes: Uint8Array, name: string): Promise<MediaReport> {
  await fs.writeFile(file(name), bytes);
  return inspectMedia(file(name));
}

async function grayLevels(bytes: Uint8Array, name: string, size = { width: W, height: H }): Promise<number[]> {
  await fs.writeFile(file(name), bytes);
  const frames = await readRgbaFrames(file(name), size);
  return frames.map((rgba) => Math.round(meanRgba(rgba)[0]));
}

async function run(Node: new () => unknown, props: Record<string, unknown>): Promise<Record<string, unknown>> {
  const node = Node as unknown as new () => {
    assign(props: Record<string, unknown>): void;
    process(): Promise<Record<string, unknown>>;
  };
  const instance = new node();
  instance.assign(props);
  return instance.process();
}

async function writeClip(
  name: string,
  frameAt: (k: number) => Uint8Array,
  opts: { frames?: number; width?: number; height?: number } = {}
): Promise<Uint8Array> {
  await writeRgbaVideo({
    outPath: file(name),
    width: opts.width ?? W,
    height: opts.height ?? H,
    fps: 10,
    frames: opts.frames ?? 10,
    frameAt,
    spec: { codec: "libx264", pixelFormat: "yuv420p", options: { qp: "0", g: "1" } }
  });
  return new Uint8Array(await fs.readFile(file(name)));
}

/** Levels within this many steps count as equal after a lossy re-encode. */
const LOSSY = 4;

function expectLevels(actual: number[], expected: number[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((level, i) => expect(Math.abs(level - expected[i]!)).toBeLessThanOrEqual(LOSSY));
}

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-video-edit-"));
  gray = await writeClip("gray.mp4", (k) => solidRgba(W, H, [k * 20, k * 20, k * 20, 255]));
  await generateMedia({
    outPath: file("tone.m4a"),
    audio: { source: "sine=frequency=440:sample_rate=48000:duration=1" }
  });
  await transformMedia({
    inputs: [{ filePath: file("gray.mp4") }, { filePath: file("tone.m4a") }],
    outPath: file("gray-av.mp4"),
    video: { copy: 0 },
    audio: { copy: 1 }
  });
  grayAv = new Uint8Array(await fs.readFile(file("gray-av.mp4")));
  red = await writeClip("red.mp4", () => solidRgba(32, 24, [255, 0, 0, 255]), { width: 32, height: 24 });
  green = await writeClip("green.mp4", () => solidRgba(W, H, [0, 255, 0, 255]));
  await generateMedia({
    outPath: file("pattern.mp4"),
    video: { source: `testsrc2=size=${W}x${H}:rate=10:duration=1` },
    audio: { source: "sine=frequency=440:sample_rate=48000:duration=1" }
  });
  pattern = new Uint8Array(await fs.readFile(file("pattern.mp4")));
  toneWav = encodeWav(
    sineSamples({ frequency: 440, sampleRate: 48000, channels: 1, durationSec: 3, amplitude: 0.5 }),
    48000,
    1
  );
});

afterAll(async () => {
  if (dir) await fs.rm(dir, { recursive: true, force: true });
});

describe("Trim", () => {
  it("copies the frames between start and end", async () => {
    const { output } = await run(nodes.TrimVideoNode, { video: videoRef(grayAv), start_time: 0.3, end_time: 0.7 });
    expectLevels(await grayLevels(bytesOf(output), "trim-copy.mp4"), [60, 80, 100, 120]);
  });

  it("keeps everything after the start when end_time is -1", async () => {
    const { output } = await run(nodes.TrimVideoNode, { video: videoRef(grayAv), start_time: 0.6, end_time: -1 });
    expectLevels(await grayLevels(bytesOf(output), "trim-open.mp4"), [120, 140, 160, 180]);
  });

  it("re-encodes frame-exact cuts", async () => {
    const { output } = await run(nodes.TrimVideoNode, {
      video: videoRef(grayAv),
      start_time: 0.3,
      end_time: 0.7,
      accurate: true
    });
    const bytes = bytesOf(output);
    expectLevels(await grayLevels(bytes, "trim-exact.mp4"), [60, 80, 100, 120]);
    expect((await inspect(bytes, "trim-exact-probe.mp4")).audio).not.toBeNull();
  });
});

describe("single-filter nodes", () => {
  it("Resize scales the picture and keeps the sound", async () => {
    const { output } = await run(nodes.ResizeVideoNode, { video: videoRef(grayAv), width: 32, height: 24 });
    const report = await inspect(bytesOf(output), "resize.mp4");
    expect(report.video).toMatchObject({ width: 32, height: 24 });
    expect(report.frameTimes).toHaveLength(10);
    expect(report.audio).not.toBeNull();
  });

  it("Rotate by 90 degrees swaps the frame size", async () => {
    const { output } = await run(nodes.RotateVideoNode, { video: videoRef(gray), angle: 90 });
    const report = await inspect(bytesOf(output), "rotate.mp4");
    expect(report.video).toMatchObject({ width: H, height: W });
    expect(report.frameTimes).toHaveLength(10);
  });

  it("ColorBalance raises red", async () => {
    const { output } = await run(nodes.ColorBalanceVideoNode, { video: videoRef(gray), red_adjust: 2 });
    await fs.writeFile(file("balance.mp4"), bytesOf(output));
    // `rs` moves the shadows: a dark frame shows it.
    const [r, g] = meanRgba((await readRgbaFrames(file("balance.mp4"), { width: W, height: H }))[1]!);
    expect(r - g).toBeGreaterThan(20);
  });

  it("Saturation 0 turns the picture gray", async () => {
    const { output } = await run(nodes.SaturationVideoNode, { video: videoRef(pattern), saturation: 0 });
    await fs.writeFile(file("saturation.mp4"), bytesOf(output));
    const frame = (await readRgbaFrames(file("saturation.mp4"), { width: W, height: H }))[3]!;
    let spread = 0;
    for (let i = 0; i < frame.length; i += 4) {
      spread = Math.max(spread, Math.abs(frame[i]! - frame[i + 1]!), Math.abs(frame[i + 1]! - frame[i + 2]!));
    }
    expect(spread).toBeLessThan(12);
  });

  it("Blur and Sharpness move the picture's detail in opposite directions", async () => {
    const detail = async (bytes: Uint8Array, name: string): Promise<number> => {
      await fs.writeFile(file(name), bytes);
      const frame = (await readRgbaFrames(file(name), { width: W, height: H }))[3]!;
      let sum = 0;
      for (let i = 4; i < frame.length; i += 4) sum += Math.abs(frame[i]! - frame[i - 4]!);
      return sum;
    };
    const source = await detail(pattern, "pattern-copy.mp4");
    const blurred = await run(nodes.BlurVideoNode, { video: videoRef(pattern), strength: 3 });
    const sharpened = await run(nodes.SharpnessVideoNode, { video: videoRef(pattern), luma_amount: 1.5 });
    expect(await detail(bytesOf(blurred.output), "blur.mp4")).toBeLessThan(source * 0.8);
    expect(await detail(bytesOf(sharpened.output), "sharp.mp4")).toBeGreaterThan(source);
  });

  it("Denoise keeps every frame", async () => {
    const { output } = await run(nodes.DenoiseVideoNode, { video: videoRef(pattern), strength: 3 });
    const report = await inspect(bytesOf(output), "denoise.mp4");
    expect(report.frameTimes).toHaveLength(10);
    expect(report.audio).not.toBeNull();
  });

  it("ChromaKey writes every frame; MP4 drops the key's alpha", async () => {
    const { output } = await run(nodes.ChromaKeyVideoNode, { video: videoRef(green), key_color: { value: "#00FF00" } });
    const report = await inspect(bytesOf(output), "chroma.mp4");
    expect(report.frameTimes).toHaveLength(10);
    expect(report.video).toMatchObject({ width: W, height: H, alpha: false });
  });

  it("Stabilize writes every frame, with and without the black-border crop", async () => {
    for (const crop_black of [false, true]) {
      const { output } = await run(nodes.StabilizeVideoNode, { video: videoRef(pattern), crop_black });
      const report = await inspect(bytesOf(output), `stabilize-${crop_black}.mp4`);
      expect(report.frameTimes).toHaveLength(10);
      expect(report.video!.width).toBeLessThanOrEqual(W);
      expect(report.video!.height).toBeLessThanOrEqual(H);
    }
  });
});

describe("time nodes", () => {
  it("SetSpeed doubles the speed of picture and sound", async () => {
    const { output } = await run(nodes.SetSpeedVideoNode, { video: videoRef(grayAv), speed_factor: 2 });
    const report = await inspect(bytesOf(output), "speed.mp4");
    expect(report.durationSec).toBeGreaterThan(0.4);
    expect(report.durationSec).toBeLessThan(0.75);
    expect(report.audio).not.toBeNull();
  });

  it("SetSpeed retimes a silent clip's picture alone", async () => {
    const { output } = await run(nodes.SetSpeedVideoNode, { video: videoRef(gray), speed_factor: 2 });
    const report = await inspect(bytesOf(output), "speed-silent.mp4");
    expect(report.durationSec).toBeLessThan(0.75);
    expect(report.audio).toBeNull();
  });

  it("Reverse plays the frames backwards", async () => {
    const { output } = await run(nodes.ReverseVideoNode, { video: videoRef(grayAv) });
    const bytes = bytesOf(output);
    expectLevels(await grayLevels(bytes, "reverse.mp4"), [180, 160, 140, 120, 100, 80, 60, 40, 20, 0]);
    expect((await inspect(bytes, "reverse-probe.mp4")).audio).not.toBeNull();
  });

  it("Reverse handles a clip with no sound", async () => {
    const { output } = await run(nodes.ReverseVideoNode, { video: videoRef(gray) });
    expectLevels(await grayLevels(bytesOf(output), "reverse-silent.mp4"), [180, 160, 140, 120, 100, 80, 60, 40, 20, 0]);
  });

  it("EaseCurve stretches the clip to the requested duration", async () => {
    const { output } = await run(nodes.EaseCurveVideoNode, { video: videoRef(grayAv), easing: "linear", duration: 2 });
    const report = await inspect(bytesOf(output), "ease.mp4");
    expect(report.durationSec).toBeGreaterThan(1.9);
    expect(report.durationSec).toBeLessThan(2.15);
    expect(report.audio).not.toBeNull();
  });
});

describe("two-input nodes", () => {
  it("Overlay places the overlay at its position and keeps the main sound", async () => {
    const { output } = await run(nodes.OverlayVideoNode, {
      main_video: videoRef(grayAv),
      overlay_video: videoRef(red),
      x: 0,
      y: 0,
      scale: 1
    });
    const bytes = bytesOf(output);
    await fs.writeFile(file("overlay.mp4"), bytes);
    const frame = (await readRgbaFrames(file("overlay.mp4"), { width: W, height: H }))[5]!;
    const corner = frame.subarray(((4 * W) + 4) * 4, ((4 * W) + 4) * 4 + 4);
    expect(corner[0]).toBeGreaterThan(200);
    expect(corner[1]).toBeLessThan(60);
    const far = frame.subarray(((40 * W) + 60) * 4, ((40 * W) + 60) * 4 + 4);
    expect(Math.abs(far[0]! - 100)).toBeLessThanOrEqual(LOSSY);
    expect((await inspectMedia(file("overlay.mp4"))).audio).not.toBeNull();
  });

  it("Transition overlaps the clips by the transition length", async () => {
    await writeClip("gray-b.mp4", () => solidRgba(W, H, [200, 200, 200, 255]));
    const b = new Uint8Array(await fs.readFile(file("gray-b.mp4")));
    const { output } = await run(nodes.TransitionVideoNode, {
      video_a: videoRef(gray),
      video_b: videoRef(b),
      transition_type: "fade",
      duration: 0.5
    });
    const bytes = bytesOf(output);
    const report = await inspect(bytes, "transition.mp4");
    expect(report.durationSec).toBeGreaterThan(1.4);
    expect(report.durationSec).toBeLessThan(1.6);
    const levels = await grayLevels(bytes, "transition-levels.mp4");
    expect(Math.abs(levels[0]! - 0)).toBeLessThanOrEqual(LOSSY);
    expect(Math.abs(levels[levels.length - 1]! - 200)).toBeLessThanOrEqual(LOSSY);
  });

  it("AddAudio ends a longer track with the picture", async () => {
    const { output } = await run(nodes.AddAudioVideoNode, {
      video: videoRef(gray),
      audio: { type: "audio", uri: "", data: Buffer.from(toneWav).toString("base64") }
    });
    const bytes = bytesOf(output);
    const report = await inspect(bytes, "add-audio.mp4");
    expect(report.durationSec).toBeLessThan(1.15);
    expect(report.audio).not.toBeNull();
    const pcm = await readPcm(file("add-audio.mp4"), { sampleRate: 48000, channels: 1 });
    expect(rmsBetween(pcm, 0.2, 0.8)).toBeGreaterThan(0.25);
  });

  it("AddAudio keeps the whole track with output_length longest", async () => {
    const { output } = await run(nodes.AddAudioVideoNode, {
      video: videoRef(gray),
      audio: { type: "audio", uri: "", data: Buffer.from(toneWav).toString("base64") },
      output_length: "longest"
    });
    const report = await inspect(bytesOf(output), "add-audio-long.mp4");
    expect(report.durationSec).toBeGreaterThan(2.9);
  });

  it("AddAudio mixes into existing sound, and replaces when there is none", async () => {
    for (const [name, clip] of [["mix-av", grayAv], ["mix-silent", gray]] as const) {
      const { output } = await run(nodes.AddAudioVideoNode, {
        video: videoRef(clip),
        audio: { type: "audio", uri: "", data: Buffer.from(toneWav).toString("base64") },
        mix: true
      });
      const report = await inspect(bytesOf(output), `${name}.mp4`);
      expect(report.audio).not.toBeNull();
      expect(report.durationSec).toBeLessThan(1.15);
    }
  });

  it("Concat joins matching clips end to end", async () => {
    const { output } = await run(nodes.ConcatVideoNode, {});
    expect(bytesOf(output)).toHaveLength(0);
    const node = new nodes.ConcatVideoNode();
    node.dynamicProps.set("a", videoRef(grayAv));
    node.dynamicProps.set("b", videoRef(grayAv));
    const joined = bytesOf(((await node.process()) as { output: unknown }).output);
    const report = await inspect(joined, "concat.mp4");
    expect(report.frameTimes).toHaveLength(20);
    expect(report.durationSec).toBeCloseTo(2, 1);
    expect(report.audio).not.toBeNull();
  });

  it("Concat fits mismatched clips to the first clip's frame", async () => {
    const node = new nodes.ConcatVideoNode();
    node.dynamicProps.set("a", videoRef(grayAv));
    node.dynamicProps.set("b", videoRef(red));
    const joined = bytesOf(((await node.process()) as { output: unknown }).output);
    const report = await inspect(joined, "concat-mixed.mp4");
    expect(report.video).toMatchObject({ width: W, height: H });
    expect(report.durationSec).toBeGreaterThan(1.9);
    expect(report.durationSec).toBeLessThan(2.15);
    expect(report.audio).not.toBeNull();
    const levels = await grayLevels(joined, "concat-mixed-levels.mp4");
    expect(Math.abs(levels[0]! - 0)).toBeLessThanOrEqual(LOSSY);
    // The red clip, letterboxed: red dominates the middle.
    const frames = await readRgbaFrames(file("concat-mixed-levels.mp4"), { width: W, height: H });
    const middle = frames[frames.length - 1]!.subarray(((24 * W) + 32) * 4, ((24 * W) + 32) * 4 + 4);
    expect(middle[0]).toBeGreaterThan(200);
  });
});

describe("frames in and out", () => {
  it("ExtractAudio writes the sound as 16-bit WAV", async () => {
    const { output } = await run(nodes.ExtractAudioVideoNode, { video: videoRef(grayAv) });
    const wav = bytesOf(output);
    expect(Buffer.from(wav.subarray(0, 4)).toString("ascii")).toBe("RIFF");
    expect(wav.readUInt16LE?.(34) ?? Buffer.from(wav).readUInt16LE(34)).toBe(16);
    await fs.writeFile(file("extract.wav"), wav);
    const pcm = await readPcm(file("extract.wav"), { sampleRate: 48000, channels: 1 });
    // lavfi's sine is 1/8 full scale: RMS 0.088.
    expect(rmsBetween(pcm, 0.2, 0.8)).toBeGreaterThan(0.07);
  });

  it("ExtractFrame returns the frame shown at the time as PNG", async () => {
    const { output } = await run(nodes.ExtractFrameVideoNode, { video: videoRef(grayAv), time: 0.5 });
    const { data, info } = await sharp(bytesOf(output)).raw().toBuffer({ resolveWithObject: true });
    expect(info).toMatchObject({ width: W, height: H });
    expect(Math.abs(data[0]! - 100)).toBeLessThanOrEqual(LOSSY);
  });

  it("ExtractFrame answers an empty image past the end", async () => {
    const { output } = await run(nodes.ExtractFrameVideoNode, { video: videoRef(grayAv), time: 30 });
    expect((output as { data: unknown }).data).toBeNull();
  });

  it("ForEachFrame yields the selected frames as PNG with their index", async () => {
    const node = new nodes.ForEachFrameNode();
    node.assign({ video: videoRef(gray), start: 2, end: 4 });
    const items: Array<{ frame: unknown; index: number; fps: number }> = [];
    for await (const item of node.genProcess()) items.push(item as (typeof items)[number]);
    expect(items.map((item) => item.index)).toEqual([2, 3, 4]);
    expect(items[0]!.fps).toBe(10);
    const levels = await Promise.all(
      items.map(async (item) => (await sharp(bytesOf(item.frame)).raw().toBuffer())[0]!)
    );
    expectLevels(levels, [40, 60, 80]);
  });

  it("FrameToVideo encodes raw RGBA frames", async () => {
    const frames = [0, 1, 2, 3, 4].map((k) => ({
      type: "image",
      mimeType: RAW_RGBA_MIME,
      width: 32,
      height: 24,
      data: solidRgba(32, 24, [k * 40, k * 40, k * 40, 255])
    }));
    const { output } = await run(nodes.FrameToVideoNode, { frame: frames, fps: 5 });
    const bytes = bytesOf(output);
    const report = await inspect(bytes, "ftv-rgba.mp4");
    expect(report.video).toMatchObject({ width: 32, height: 24 });
    expect(report.durationSec).toBeCloseTo(1, 1);
    expectLevels(await grayLevels(bytes, "ftv-rgba-levels.mp4", { width: 32, height: 24 }), [0, 40, 80, 120, 160]);
  });

  it("FrameToVideo encodes PNG frames", async () => {
    const frames = await Promise.all(
      [0, 1, 2].map(async (k) => ({
        type: "image",
        data: Buffer.from(
          await sharp(Buffer.from(solidRgba(32, 24, [k * 60, k * 60, k * 60, 255])), {
            raw: { width: 32, height: 24, channels: 4 }
          })
            .png()
            .toBuffer()
        ).toString("base64")
      }))
    );
    const { output } = await run(nodes.FrameToVideoNode, { frame: frames, fps: 3 });
    expectLevels(await grayLevels(bytesOf(output), "ftv-png.mp4", { width: 32, height: 24 }), [0, 60, 120]);
  });
});

describe("AddSubtitles", () => {
  it("draws the text only while its chunk is on screen", async () => {
    await writeClip("black.mp4", () => solidRgba(W * 4, H * 4, [0, 0, 0, 255]), { width: W * 4, height: H * 4 });
    const black = new Uint8Array(await fs.readFile(file("black.mp4")));
    const { output } = await run(nodes.AddSubtitlesVideoNode, {
      video: videoRef(black),
      chunks: [{ text: "Hello, world: [ok]", timestamp: [0, 0.5] }],
      font_size: 24
    });
    await fs.writeFile(file("subs.mp4"), bytesOf(output));
    const frames = await readRgbaFrames(file("subs.mp4"), { width: W * 4, height: H * 4 });
    expect(frames).toHaveLength(10);
    const bright = (rgba: Uint8Array): number => {
      let count = 0;
      for (let i = 0; i < rgba.length; i += 4) if (rgba[i]! > 128) count += 1;
      return count;
    };
    expect(bright(frames[2]!)).toBeGreaterThan(50);
    expect(bright(frames[8]!)).toBe(0);
  });
});
