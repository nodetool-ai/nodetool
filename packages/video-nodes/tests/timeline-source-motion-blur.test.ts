import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TimelineClip, TimelineSequence } from "@nodetool-ai/timeline";
import { openFrameEncoder } from "../src/nodes/timeline/rawFrames.js";
import { renderTimelineComposited } from "../src/nodes/timeline/compositeRender.js";
import { resolveTimelineOutput } from "../src/nodes/timeline/outputFormats.js";

const SIZE = 16;
const SOURCE_FPS = 240;
let directory = "";
let dynamicPath = "";
let staticPath = "";
beforeAll(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "source-blur-"));
  for (const kind of ["dynamic", "static"] as const) {
    const file = path.join(directory, `${kind}.mkv`);
    const encoder = openFrameEncoder({
      outPath: file,
      width: SIZE,
      height: SIZE,
      fps: SOURCE_FPS,
      encoderArgs: ["-c:v", "ffv1", "-pix_fmt", "bgra"]
    });
    for (let index = 0; index < 720; index++) {
      const gray = kind === "static" ? 96 : (index % 16) * 16;
      const frame = new Uint8Array(SIZE * SIZE * 4);
      for (let pixel = 0; pixel < frame.length; pixel += 4) {
        frame.set([gray, gray, gray, 255], pixel);
      }
      await encoder.write(frame);
    }
    await encoder.finish();
    if (kind === "dynamic") {
      dynamicPath = file;
    } else {
      staticPath = file;
    }
  }
}, 60_000);
afterAll(async () => {
  if (directory) {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

function sourceGray(file: string, timeMs: number): number {
  const rgba = execFileSync("ffmpeg", [
    "-v",
    "error",
    "-ss",
    String(timeMs / 1000),
    "-i",
    file,
    "-frames:v",
    "1",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgba",
    "pipe:1"
  ]);
  return rgba[(SIZE * Math.floor(SIZE / 2) + Math.floor(SIZE / 2)) * 4];
}
async function render(
  file: string,
  samples: number,
  patch: Partial<TimelineClip>
): Promise<number> {
  const sequence = {
    id: "source-blur",
    name: "Source blur",
    width: SIZE,
    height: SIZE,
    fps: 30,
    durationMs: 2000,
    tracks: [{ id: "video", type: "video", index: 0, visible: true }],
    clips: [
      {
        id: "clip",
        trackId: "video",
        name: "Native frame pattern",
        startMs: 0,
        durationMs: 2000,
        mediaType: "video",
        sourceType: "generated",
        status: "generated",
        currentAssetId: "source",
        ...patch
      }
    ]
  } as TimelineSequence;
  let gray = -1;
  await renderTimelineComposited({
    sequence,
    width: SIZE,
    height: SIZE,
    fps: 30,
    durationMs: 2000,
    frames: [30],
    resolveAssetPath: async () => file,
    outPath: path.join(directory, "unused.zip"),
    output: resolveTimelineOutput({
      format: "png_sequence",
      motionBlurSamples: samples,
      shutterAngle: 180
    }),
    writeFrame: async (_frame, rgba) => {
      gray = rgba[(SIZE * Math.floor(SIZE / 2) + Math.floor(SIZE / 2)) * 4];
    }
  });
  return gray;
}
describe("source video shutter sampling", () => {
  for (const control of [
    { name: "normal playback", patch: {}, sourceTime: (time: number) => time },
    {
      name: "trimmed playback",
      patch: { inPointMs: 25 },
      sourceTime: (time: number) => time + 25
    },
    {
      name: "double speed",
      patch: { speedMultiplier: 2 },
      sourceTime: (time: number) => time * 2
    },
    {
      name: "time remap",
      patch: {
        timeRemap: {
          keyframes: [
            { t: 0, sourceMs: 0 },
            { t: 1, sourceMs: 2500 }
          ]
        }
      },
      sourceTime: (time: number) => time * 1.25
    }
  ]) {
    it(`averages independently decoded source frames during ${control.name}`, async () => {
      const unblurred = sourceGray(
        dynamicPath,
        control.sourceTime(1000)
      );
      expect(await render(dynamicPath, 1, control.patch)).toBe(unblurred);
      const times = Array.from(
        { length: 4 },
        (_, index) => 1000 + (((index + 0.5) / 4) * (1000 / 30)) / 2
      );
      const values = times.map((time) =>
        sourceGray(dynamicPath, control.sourceTime(time))
      );
      expect(new Set(values).size).toBeGreaterThan(1);
      const expected =
        values.reduce((sum, value) => sum + value, 0) / values.length;
      expect(await render(dynamicPath, 4, control.patch)).toBeCloseTo(
        expected,
        0
      );
    }, 60_000);
  }
  it("preserves a static source with blur on and off", async () => {
    expect(await render(staticPath, 1, {})).toBe(96);
    expect(await render(staticPath, 4, {})).toBe(96);
  }, 60_000);
});
