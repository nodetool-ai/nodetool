import { expect, it, vi } from "vitest";
import {
  makeClip,
  makeTrack,
  type TimelineSequence
} from "@nodetool-ai/timeline";
import { renderTimelineFrames } from "../src/timeline-preview/frames.js";
import { forEachVideoFrame } from "../src/analysis/media-decode.js";
vi.mock("../src/analysis/media-decode.js", () => ({
  forEachVideoFrame: vi.fn(
    async (
      _bytes: Uint8Array,
      times: number[],
      visit: (frame: unknown) => void
    ) => {
      const width = 32,
        height = 16;
      for (const time of times) {
        const rgba = new Uint8Array(width * height * 4);
        for (let i = 0; i < rgba.length; i += 4) {
          const v = 80 + ((i / 4 + Math.round(time * 30) * 7) % 17);
          rgba.set([v, v, v, 255], i);
        }
        visit({ time, width, height, rgba });
      }
    }
  )
}));
it("requests bounded temporal neighbors and renders the same frame after backward seeks", async () => {
  const clip = makeClip({
    id: "c",
    trackId: "v",
    mediaType: "video",
    currentAssetId: "source",
    status: "generated",
    startMs: 0,
    durationMs: 200,
    effects: [
      {
        id: "d",
        type: "denoise",
        enabled: true,
        lumaStrength: 0.7,
        temporalStrength: 1
      }
    ]
  });
  const sequence: TimelineSequence = {
    id: "s",
    projectId: "p",
    name: "Noise",
    fps: 30,
    width: 32,
    height: 16,
    durationMs: 200,
    tracks: [makeTrack({ id: "v", type: "video" })],
    clips: [clip],
    markers: [],
    createdAt: "",
    updatedAt: ""
  };
  const result = await renderTimelineFrames({
    sequence,
    timesMs: [100, 0, 100],
    width: 32,
    loadAsset: async () => new Uint8Array([1])
  });
  expect(result.frames).toHaveLength(3);
  expect(result.frames[0]!.png).toEqual(result.frames[2]!.png);
  expect(
    result.frames.every((frame) =>
      frame.layers.some((layer) => layer.clip_id === "c")
    )
  ).toBe(true);
  const times = vi
    .mocked(forEachVideoFrame)
    .mock.calls.flatMap((call) => call[1]);
  expect(times).toHaveLength(9);
  expect(times[0]).toBeCloseTo(0.1);
  expect(times[1]).toBeCloseTo(0.1 - 1 / 30);
  expect(times[2]).toBeCloseTo(0.1 + 1 / 30);
  expect(times[4]).toBe(0);
});
