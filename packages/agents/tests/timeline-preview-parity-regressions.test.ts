import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { TimelineClip, TimelineSequence } from "@nodetool-ai/timeline";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { describe, expect, it } from "vitest";
import { renderTimelineFrames } from "../src/timeline-preview/frames.js";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";

const WIDTH = 160;
const HEIGHT = 90;

function document(imageStartMs: number): TimelineSequence {
  const mover: TimelineClip = {
    id: "mover", name: "Moving background", trackId: "background",
    startMs: 0, durationMs: 2000, mediaType: "shape",
    sourceType: "generated", status: "generated",
    shapeStyle: { kind: "rect", fill: "#00ff00", x: 0, y: 0, width: 0.1, height: 0.1 },
    animations: [{ id: "move", role: "in", preset: "custom", durationMs: 2000,
      custom: { curves: [{ property: "offsetX", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 100 }] }] } }]
  };
  return {
    id: "sequence", projectId: "project", name: "Sample diagnostics",
    width: WIDTH, height: HEIGHT, fps: 30, durationMs: 2000,
    tracks: [
      { id: "image", name: "Image", type: "video", index: 0, visible: true, locked: false },
      { id: "background", name: "Background", type: "video", index: 1, visible: true, locked: false }
    ],
    clips: [mover, {
      id: "picture", name: "Picture", trackId: "image",
      startMs: imageStartMs, durationMs: 2000, mediaType: "image",
      sourceType: "imported", status: "generated", currentAssetId: "asset-picture"
    }], markers: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function redPng(): Uint8Array {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ff0000";
  context.fillRect(0, 0, WIDTH, HEIGHT);
  return new Uint8Array(canvas.toBuffer("image/png"));
}

async function centerPixel(png: Uint8Array): Promise<number[]> {
  const image = await loadImage(Buffer.from(png));
  const canvas = createCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  return [...context.getImageData(WIDTH / 2, HEIGHT / 2, 1, 1).data];
}

describe("motion-blur preview sample diagnostics", () => {
  it("preserves failures that occur only after the representative first sample", async () => {
    let reads = 0;
    const result = await renderTimelineFrames({
      sequence: document(1005), timesMs: [1000], width: WIDTH,
      motionBlur: { samplesPerFrame: 4, shutterAngle: 180 },
      loadAsset: async () => { reads++; return null; }
    });
    const frame = result.frames[0]!;
    expect(reads).toBe(3);
    expect(frame.complete).toBe(false);
    expect(frame.layers.some((layer) => layer.clip_id === "picture")).toBe(false);
    expect(frame.failures).toMatchObject([{
      kind: "skipped", clip_id: "picture", reason: expect.stringContaining("asset-picture"),
      samples: [{ index: 1 }, { index: 2 }, { index: 3 }]
    }]);
    expect(frame.failures[0]!.samples.map((sample) => sample.time_ms)).toEqual([
      1006.25, 1010.4166666666666, 1014.5833333333334
    ]);
    expect(await centerPixel(frame.png)).toEqual([0, 0, 0, 255]);
  });

  it("retains the first-sample failure when later samples recover", async () => {
    let reads = 0;
    const result = await renderTimelineFrames({
      sequence: document(0), timesMs: [1000], width: WIDTH,
      motionBlur: { samplesPerFrame: 4, shutterAngle: 180 },
      loadAsset: async () => ++reads === 1 ? null : redPng()
    });
    expect(reads).toBe(2);
    const frame = result.frames[0]!;
    expect(frame.complete).toBe(false);
    expect(frame.failures).toMatchObject([{
      kind: "skipped", clip_id: "picture", samples: [{ index: 0, time_ms: 1002.0833333333334 }]
    }]);
    const pixel = await centerPixel(frame.png);
    expect(pixel[0]).toBeGreaterThanOrEqual(190);
    expect(pixel[0]).toBeLessThanOrEqual(192);
    expect(pixel.slice(1)).toEqual([0, 0, 255]);
  });

  it("composites every successful sample without failure evidence", async () => {
    const result = await renderTimelineFrames({
      sequence: document(1005), timesMs: [1000], width: WIDTH,
      motionBlur: { samplesPerFrame: 4, shutterAngle: 180 }, loadAsset: async () => redPng()
    });
    const frame = result.frames[0]!;
    expect(frame.complete).toBe(true);
    expect(frame.failures).toEqual([]);
    // The picture enters after sample 0, so three of four taps contribute red.
    const pixel = await centerPixel(frame.png);
    expect(pixel[0]).toBeGreaterThanOrEqual(190);
    expect(pixel[0]).toBeLessThanOrEqual(192);
    expect(pixel.slice(1)).toEqual([0, 0, 255]);
  });

  it("keeps blur-disabled pixels and diagnostics at the nominal time", async () => {
    let reads = 0;
    const result = await renderTimelineFrames({
      sequence: document(1005), timesMs: [1000], width: WIDTH,
      loadAsset: async () => { reads++; return null; }
    });
    expect(reads).toBe(0);
    expect(result.frames[0]!.complete).toBe(true);
    expect(result.frames[0]!.failures).toEqual([]);
    expect(await centerPixel(result.frames[0]!.png)).toEqual([0, 0, 0, 255]);
  });

  it("deduplicates later dropped layers without losing affected sample indices", async () => {
    const sequence = document(0);
    sequence.clips[0]!.durationMs = 1005;
    sequence.clips[1] = {
      ...sequence.clips[1]!, durationMs: 2000, mediaType: "shape", currentAssetId: undefined,
      shapeStyle: { kind: "rect", fill: "#ffffff", x: 0, y: 0, width: 1, height: 1 },
      matte: { sourceClipId: "mover", mode: "alpha" }
    };
    const result = await renderTimelineFrames({
      sequence, timesMs: [1000], width: WIDTH,
      motionBlur: { samplesPerFrame: 4, shutterAngle: 180 }, loadAsset: async () => null
    });
    const frame = result.frames[0]!;
    expect(frame.complete).toBe(false);
    expect(frame.dropped).toEqual([{ clip_id: "picture", clip_name: "Picture", reason: "matte_source_inactive" }]);
    expect(frame.failures).toMatchObject([{
      kind: "dropped", clip_id: "picture", reason: "matte_source_inactive",
      samples: [{ index: 1 }, { index: 2 }, { index: 3 }]
    }]);
    expect(await centerPixel(frame.png)).toEqual([0, 0, 0, 255]);
  });

  it("returns later-sample failure evidence through the preview capability", async () => {
    const context = {
      userId: "u1", hasModelInterface: (name: string) => name === "createAsset",
      createAsset: async () => ({ id: "preview-output" })
    } as unknown as ProcessingContext;
    const result = await toolForCapabilityName("preview_timeline_frame").process(context, {
      document: document(1005), times_ms: [1000], width: WIDTH,
      motion_blur_samples: 4, shutter_angle: 180
    });
    expect(result).toMatchObject({
      complete: false,
      frames: [{ complete: false, failures: [{
        kind: "skipped", clip_id: "picture",
        samples: [{ index: 1 }, { index: 2 }, { index: 3 }]
      }] }]
    });
  });
});
