/**
 * The rough-cut fallback on real media. The server falls back to it when no
 * WebGPU adapter exists, and `timeline-nodes.test.ts` covers it only with a
 * mocked ffmpeg (gap G2 in docs/ffmpeg-in-process-plan.md). Here the
 * compositor is the one thing faked, as unavailable; every clip is decoded,
 * normalized, concatenated and mixed for real.
 */

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { createCanvas } from "@napi-rs/canvas";
import {
  encodeWav,
  inspectMedia,
  meanRgba,
  readPcm,
  readRgbaFrames,
  rmsBetween,
  sineSamples,
  solidRgba
} from "@nodetool-ai/runtime/media/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { diskContext, writeClip, writeRenderOutput } from "./_fixtures/render-media.js";

vi.mock("../src/nodes/timeline/compositeRender.js", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  const { CompositorUnavailableError } = original as {
    CompositorUnavailableError: new (cause: unknown) => Error;
  };
  return {
    ...original,
    renderTimelineComposited: () => {
      throw new CompositorUnavailableError(new Error("no adapter in tests"));
    }
  };
});

const { RenderTimelineNode } = await import("../src/nodes/timeline.js");

const WIDTH = 64;
const HEIGHT = 48;
const FPS = 10;
let dir = "";
const files: Record<string, string> = {};

beforeAll(async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-rough-cut-"));
  // A red clip at half the sequence size, carrying a 440 Hz tone.
  files.red = path.join(dir, "red.mp4");
  await writeClip({
    outPath: files.red,
    width: 32,
    height: 24,
    fps: 25,
    frames: 50,
    frameAt: () => solidRgba(32, 24, [255, 0, 0, 255]),
    audio: sineSamples({ sampleRate: 48000, channels: 1, durationSec: 2, frequency: 440 })
  });
  // A blue still.
  files.blue = path.join(dir, "blue.png");
  const canvas = createCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext("2d");
  context.fillStyle = "rgb(0,0,255)";
  context.fillRect(0, 0, WIDTH, HEIGHT);
  await fs.writeFile(files.blue, canvas.toBuffer("image/png"));
  // A quiet 1 kHz voiceover.
  files.voice = path.join(dir, "voice.wav");
  await fs.writeFile(
    files.voice,
    encodeWav(
      sineSamples({ sampleRate: 48000, channels: 1, durationSec: 1, frequency: 1000, amplitude: 0.3 }),
      48000,
      1
    )
  );
});

afterAll(async () => {
  if (dir) await fs.rm(dir, { recursive: true, force: true });
});

function sequence(clips: unknown[], durationMs: number) {
  return {
    id: "seq-rough",
    projectId: "test",
    name: "Rough",
    width: WIDTH,
    height: HEIGHT,
    fps: FPS,
    durationMs,
    createdAt: "",
    updatedAt: "",
    transcript: [],
    tracks: [
      { id: "video", type: "video", index: 0, visible: true },
      { id: "audio", type: "audio", index: 1, visible: true }
    ],
    clips
  };
}

const clip = (fields: Record<string, unknown>) => ({
  sourceType: "imported",
  status: "generated",
  ...fields
});

async function render(seq: ReturnType<typeof sequence>, name: string): Promise<string> {
  const node = new RenderTimelineNode();
  node.assign({ timeline: { type: "timeline", id: seq.id } });
  const result = (await node.process(diskContext(seq, files) as never)) as {
    output: { data: string | null; metadata: { render_mode: string } };
  };
  expect(result.output.metadata.render_mode).toBe("rough_cut");
  return writeRenderOutput(result, path.join(dir, name));
}

describe("rough-cut fallback", () => {
  it("normalizes, concatenates and mixes real clips", async () => {
    const out = await render(
      sequence(
        [
          clip({ id: "c1", trackId: "video", name: "Red", mediaType: "video", currentAssetId: "red", startMs: 0, durationMs: 1000, inPointMs: 0, outPointMs: 1000 }),
          clip({ id: "c2", trackId: "video", name: "Blue", mediaType: "image", currentAssetId: "blue", startMs: 1000, durationMs: 1000 }),
          clip({ id: "c3", trackId: "audio", name: "Voice", mediaType: "audio", currentAssetId: "voice", startMs: 1200, durationMs: 500 })
        ],
        2000
      ),
      "cut.mp4"
    );
    const report = await inspectMedia(out);
    // Every segment is scaled to the sequence frame and resampled to its rate.
    expect(report.video).toMatchObject({ codec: "avc", width: WIDTH, height: HEIGHT });
    expect(report.frameTimes).toHaveLength(20);
    expect(report.durationSec).toBeGreaterThan(1.95);
    expect(report.durationSec).toBeLessThan(2.15);

    const frames = await readRgbaFrames(out, { width: WIDTH, height: HEIGHT });
    const [r0, , b0] = meanRgba(frames[5]!);
    expect(r0).toBeGreaterThan(200);
    expect(b0).toBeLessThan(40);
    const [r1, , b1] = meanRgba(frames[15]!);
    expect(r1).toBeLessThan(40);
    expect(b1).toBeGreaterThan(200);

    const pcm = await readPcm(out, { sampleRate: 48000, channels: 1 });
    // The red clip's own tone plays under its picture.
    expect(rmsBetween(pcm, 0.1, 0.9)).toBeGreaterThan(0.2);
    // The still carries silence, until the voiceover at 1.2 s for 0.5 s.
    expect(rmsBetween(pcm, 1.05, 1.15)).toBeLessThan(0.02);
    expect(rmsBetween(pcm, 1.3, 1.6)).toBeGreaterThan(0.1);
    expect(rmsBetween(pcm, 1.8, 1.95)).toBeLessThan(0.02);
  });

  it("puts an audio-only timeline over black", async () => {
    const out = await render(
      sequence(
        [clip({ id: "c3", trackId: "audio", name: "Voice", mediaType: "audio", currentAssetId: "voice", startMs: 500, durationMs: 1000 })],
        1500
      ),
      "audio-only.mp4"
    );
    const report = await inspectMedia(out);
    expect(report.video).toMatchObject({ width: WIDTH, height: HEIGHT });
    expect(report.durationSec).toBeGreaterThan(1.45);
    expect(report.durationSec).toBeLessThan(1.6);
    const frames = await readRgbaFrames(out, { width: WIDTH, height: HEIGHT });
    expect(meanRgba(frames[3]!)[0]).toBeLessThan(10);
    const pcm = await readPcm(out, { sampleRate: 48000, channels: 1 });
    expect(rmsBetween(pcm, 0.1, 0.4)).toBeLessThan(0.02);
    expect(rmsBetween(pcm, 0.7, 1.3)).toBeGreaterThan(0.1);
  });
});
