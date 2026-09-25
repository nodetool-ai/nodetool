import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TimelineSequence } from "@nodetool-ai/timeline";
import type { FrameSample } from "@nodetool-ai/timeline/render";
import { openFrameEncoder } from "../src/nodes/timeline/rawFrames.js";

const WIDTH = 32;
const HEIGHT = 32;
const FPS = 30;
const rendered: Array<{ gray: number; version: string | undefined }> = [];
let directory = "";
let clipPath = "";

vi.mock("@nodetool-ai/gpu/node", () => ({
  getNodeGPUDevice: async () => ({})
}));

vi.mock("@nodetool-ai/timeline/render", async (importOriginal) => {
  const original = await importOriginal<typeof import("@nodetool-ai/timeline/render")>();
  class FakeCompositor {
    constructor(_device: unknown, private width: number, private height: number) {}
    async renderFrameSamples(samples: FrameSample[]): Promise<Uint8Array> {
      for (const sample of samples) {
        const source = sample.layers.find((layer) => layer.source?.rgba)?.source;
        if (source?.rgba) rendered.push({ gray: source.rgba[0] ?? -1, version: source.version });
      }
      return new Uint8Array(this.width * this.height * 4);
    }
    dispose(): void {}
  }
  return { ...original, HeadlessFrameCompositor: FakeCompositor };
});

const { renderTimelineComposited } = await import("../src/nodes/timeline/compositeRender.js");
const { resolveTimelineOutput } = await import("../src/nodes/timeline/outputFormats.js");

beforeAll(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-remap-version-"));
  clipPath = path.join(directory, "source.mkv");
  const encoder = openFrameEncoder({
    outPath: clipPath,
    width: WIDTH,
    height: HEIGHT,
    fps: FPS,
    encoderArgs: ["-c:v", "ffv1", "-pix_fmt", "bgra"]
  });
  for (let index = 0; index < 60; index++) {
    const frame = new Uint8Array(WIDTH * HEIGHT * 4);
    for (let pixel = 0; pixel < frame.length; pixel += 4) frame.set([index * 4, index * 4, index * 4, 255], pixel);
    await encoder.write(frame);
  }
  await encoder.finish();
}, 60_000);

afterAll(async () => {
  if (directory) await fs.rm(directory, { recursive: true, force: true });
});

function sequence(sourceEndMs: number): TimelineSequence {
  const durationMs = 2000 / FPS;
  return {
    id: "remap-version",
    name: "Remap version",
    width: WIDTH,
    height: HEIGHT,
    fps: FPS,
    durationMs,
    tracks: [{ id: "video", type: "video", index: 0, visible: true }],
    clips: [{
      id: "clip",
      trackId: "video",
      name: "Frame ramp",
      startMs: 0,
      durationMs,
      mediaType: "video",
      sourceType: "generated",
      status: "generated",
      currentAssetId: "source",
      timeRemap: { keyframes: [{ t: 0, sourceMs: 1700 }, { t: 1, sourceMs: sourceEndMs }] }
    }]
  } as TimelineSequence;
}

async function render(sourceEndMs: number): Promise<void> {
  rendered.length = 0;
  const outPath = path.join(directory, `out-${sourceEndMs}.zip`);
  await renderTimelineComposited({
    sequence: sequence(sourceEndMs),
    width: WIDTH,
    height: HEIGHT,
    fps: FPS,
    durationMs: 2000 / FPS,
    resolveAssetPath: async () => clipPath,
    outPath,
    output: resolveTimelineOutput({ format: "png_sequence" })
  });
}

describe("time-remapped source upload versions", () => {
  it("changes version when 1.700s and 1.710s decode different frames", async () => {
    await render(1720);
    expect(rendered.map((item) => item.gray)).toEqual([204, 208]);
    expect(rendered[0]?.version).not.toBe(rendered[1]?.version);
  }, 60_000);

  it("reuses the version when two timeline frames hold one decoded frame", async () => {
    await render(1700);
    expect(rendered.map((item) => item.gray)).toEqual([204, 204]);
    expect(rendered[0]?.version).toBe(rendered[1]?.version);
  }, 60_000);
});
