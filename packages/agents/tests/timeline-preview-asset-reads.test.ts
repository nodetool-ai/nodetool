/**
 * How a render pass treats an asset read that fails.
 *
 * A pass draws many frames from one `loadAsset`, so the caching around it
 * decides how far one bad read reaches. A transient failure must cost its own
 * frame and nothing after it, and a persistent one must say what went wrong —
 * an agent reading the report cannot otherwise tell a blip from a corrupt
 * asset.
 */

import { describe, expect, it } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import type {
  TimelineClip,
  TimelineSequence,
  TimelineTrack
} from "@nodetool-ai/timeline";

import { renderTimelineFrames } from "../src/timeline-preview/frames.js";

const WIDTH = 160;

const tracks: TimelineTrack[] = [
  {
    id: "track-0",
    name: "V1",
    type: "video",
    index: 0,
    visible: true,
    locked: false
  }
];

const imageClip: TimelineClip = {
  id: "shot",
  trackId: tracks[0]!.id,
  name: "Shot",
  startMs: 0,
  durationMs: 4000,
  mediaType: "image",
  sourceType: "imported",
  status: "generated",
  currentAssetId: "asset-red"
};

function sequence(): TimelineSequence {
  return {
    id: "seq-1",
    projectId: "proj-1",
    name: "Asset read sequence",
    fps: 30,
    width: 640,
    height: 360,
    durationMs: 4000,
    tracks,
    clips: [imageClip],
    markers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/** A full-frame solid red, as PNG bytes an asset load can return. */
function redPng(): Uint8Array {
  const canvas = createCanvas(640, 360);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(0, 0, 640, 360);
  return new Uint8Array(canvas.toBuffer("image/png"));
}

/** The RGBA of one pixel of a rendered PNG frame. */
async function pixelAt(
  png: Uint8Array,
  x: number,
  y: number
): Promise<[number, number, number, number]> {
  const image = await loadImage(Buffer.from(png));
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const d = ctx.getImageData(x, y, 1, 1).data;
  return [d[0]!, d[1]!, d[2]!, d[3]!];
}

describe("renderTimelineFrames — asset reads", () => {
  it("retries an asset whose first read failed", async () => {
    let calls = 0;
    const loadAsset = async (): Promise<Uint8Array | null> => {
      calls += 1;
      if (calls === 1) throw new Error("storage timed out");
      return redPng();
    };

    const { frames } = await renderTimelineFrames({
      sequence: sequence(),
      timesMs: [0, 1000],
      width: WIDTH,
      loadAsset
    });

    expect(frames[0]!.layers[0]!.skipped).toContain("storage timed out");
    // The second frame reads the asset again and draws it.
    expect(frames[1]!.layers[0]!.skipped).toBeUndefined();
    expect((await pixelAt(frames[1]!.png, WIDTH / 2, 20))[0]).toBeGreaterThan(
      240
    );
  });

  it("names the failure on every frame of a persistent one", async () => {
    const loadAsset = async (): Promise<Uint8Array | null> => {
      throw new Error("asset row is missing");
    };

    const { frames } = await renderTimelineFrames({
      sequence: sequence(),
      timesMs: [0, 1000, 2000, 3000],
      width: WIDTH,
      loadAsset
    });

    for (const frame of frames) {
      expect(frame.layers[0]!.skipped).toBe(
        "asset asset-red could not be read: asset row is missing"
      );
    }
  });

  it("stops reading an asset that keeps failing", async () => {
    let calls = 0;
    const loadAsset = async (): Promise<Uint8Array | null> => {
      calls += 1;
      throw new Error("storage unreachable");
    };

    await renderTimelineFrames({
      sequence: sequence(),
      timesMs: [0, 1000, 2000, 3000, 4000],
      width: WIDTH,
      loadAsset
    });

    // Bounded per pass, not once per frame.
    expect(calls).toBe(3);
  });

  it("reads an asset once when the first read succeeds", async () => {
    let calls = 0;
    const loadAsset = async (): Promise<Uint8Array | null> => {
      calls += 1;
      return redPng();
    };

    const { frames } = await renderTimelineFrames({
      sequence: sequence(),
      timesMs: [0, 1000, 2000],
      width: WIDTH,
      loadAsset
    });

    expect(calls).toBe(1);
    for (const frame of frames) {
      expect(frame.layers[0]!.skipped).toBeUndefined();
    }
  });
});
