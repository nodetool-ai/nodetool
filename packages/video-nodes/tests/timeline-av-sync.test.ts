/**
 * A/V sync through the Node compositor: a clip whose picture flashes white
 * and whose sound bursts at the same source instant must flash and burst at
 * the same timeline instant in the render (gap G1 in
 * docs/ffmpeg-in-process-plan.md). The clip is trimmed and offset, so both
 * the picture's seek and the audio mix's `atrim` and `adelay` are on the path.
 *
 * Needs a WebGPU device; skips and says why without one.
 */

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  inspectMedia,
  meanRgba,
  readPcm,
  readRgbaFrames,
  rmsBetween,
  solidRgba
} from "@nodetool-ai/runtime/media/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { diskContext, writeClip, writeRenderOutput } from "./_fixtures/render-media.js";

const { RenderTimelineNode } = await import("../src/nodes/timeline.js");

const noAdapterReason = await (async (): Promise<string | null> => {
  try {
    const { getNodeGPUDevice } = await import("@nodetool-ai/gpu/node");
    await getNodeGPUDevice();
    return null;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(`timeline-av-sync: skipping — no WebGPU device. ${reason}\n`);
    return reason;
  }
})();

const FPS = 10;
const SIZE = 64;
/** Source frame and time of the flash and the burst. */
const FLASH_FRAME = 10;
const FLASH_SEC = FLASH_FRAME / FPS;
const CLIP_START_MS = 500;
const IN_POINT_MS = 200;
/** Where the flash lands on the timeline. */
const EXPECTED_SEC = (CLIP_START_MS + FLASH_SEC * 1000 - IN_POINT_MS) / 1000;

let dir = "";
let rendered = "";

beforeAll(async () => {
  if (noAdapterReason) return;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-av-sync-"));
  const clipPath = path.join(dir, "clip.mp4");
  // Silence, then a 1 kHz burst for 100 ms from the flash on.
  const audio = new Float32Array(48000 * 3);
  for (let i = FLASH_SEC * 48000; i < (FLASH_SEC + 0.1) * 48000; i++) {
    audio[i] = 0.5 * Math.sin((2 * Math.PI * 1000 * i) / 48000);
  }
  await writeClip({
    outPath: clipPath,
    width: SIZE,
    height: SIZE,
    fps: FPS,
    frames: 30,
    frameAt: (index) =>
      index === FLASH_FRAME
        ? solidRgba(SIZE, SIZE, [255, 255, 255, 255])
        : solidRgba(SIZE, SIZE, [0, 0, 0, 255]),
    audio
  });
  const sequence = {
    id: "seq-sync",
    projectId: "test",
    name: "Sync",
    width: SIZE,
    height: SIZE,
    fps: FPS,
    durationMs: 3000,
    createdAt: "",
    updatedAt: "",
    transcript: [],
    tracks: [{ id: "video", type: "video", index: 0, visible: true }],
    clips: [
      {
        id: "clip",
        trackId: "video",
        name: "Flash",
        mediaType: "video",
        sourceType: "imported",
        status: "generated",
        currentAssetId: "clip",
        startMs: CLIP_START_MS,
        durationMs: 2500,
        inPointMs: IN_POINT_MS,
        outPointMs: IN_POINT_MS + 2500
      }
    ]
  };
  const node = new RenderTimelineNode();
  node.assign({ timeline: { type: "timeline", id: "seq-sync" } });
  const result = (await node.process(diskContext(sequence, { clip: clipPath }) as never)) as {
    output: { data: string | null; metadata: { render_mode: string } };
  };
  expect(result.output.metadata.render_mode).toBe("composited");
  rendered = await writeRenderOutput(result, path.join(dir, "render.mp4"));
}, 120_000);

afterAll(async () => {
  if (dir) await fs.rm(dir, { recursive: true, force: true });
});

/** Seconds of the first 5 ms window whose RMS clears `threshold`. */
function onsetSec(audio: Awaited<ReturnType<typeof readPcm>>, threshold: number): number {
  const step = 0.005;
  for (let t = 0; t < audio.samples.length / audio.sampleRate; t += step) {
    if (rmsBetween(audio, t, t + step) > threshold) return t;
  }
  return Number.NaN;
}

describe.skipIf(noAdapterReason !== null)("timeline A/V sync", () => {
  it("renders picture and sound for the whole timeline", async () => {
    const report = await inspectMedia(rendered);
    expect(report.video).toMatchObject({ width: SIZE, height: SIZE });
    expect(report.frameTimes).toHaveLength(30);
    expect(report.audio).toMatchObject({ sampleRate: 48000, channels: 2 });
    expect(report.durationSec).toBeGreaterThan(2.95);
    expect(report.durationSec).toBeLessThan(3.1);
  });

  it("flashes on the frame the clip offset and trim put it on", async () => {
    const frames = await readRgbaFrames(rendered, { width: SIZE, height: SIZE });
    const lit = frames
      .map((frame, index) => ({ index, level: meanRgba(frame)[0] }))
      .filter(({ level }) => level > 128)
      .map(({ index }) => index);
    expect(lit).toEqual([Math.round(EXPECTED_SEC * FPS)]);
  });

  it("bursts at the same instant the picture flashes", async () => {
    const pcm = await readPcm(rendered, { sampleRate: 48000, channels: 2 });
    const onset = onsetSec(pcm, 0.1);
    // Within a quarter frame of the flash.
    expect(Math.abs(onset - EXPECTED_SEC)).toBeLessThan(0.025);
    expect(rmsBetween(pcm, 0, EXPECTED_SEC - 0.05)).toBeLessThan(0.01);
    expect(rmsBetween(pcm, EXPECTED_SEC + 0.15, 3)).toBeLessThan(0.01);
  });
});
