import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { createCapabilityRun, UNGATED } from "../src/capabilities/index.js";
import type { DecodedFrame } from "../src/analysis/media-decode.js";

const decoder = vi.hoisted(() => ({
  duration: 3600,
  missing: new Set<number>(),
  timestamps: [] as number[]
}));
vi.mock("../src/analysis/media-decode.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../src/analysis/media-decode.js")>();
  return {
    ...original,
    probeContainer: async () => ({
      format: "controlled",
      duration: decoder.duration,
      sizeBytes: 1,
      video: {
        codec: "raw",
        width: 2,
        height: 2,
        rotation: 0,
        frameRate: 30,
        languageCode: null
      },
      audio: null
    }),
    forEachVideoFrame: async (
      _bytes: Uint8Array,
      timestamps: readonly number[],
      callback: (frame: DecodedFrame) => void | Promise<void>
    ) => {
      decoder.timestamps = [...timestamps];
      let count = 0;
      for (const [index, time] of timestamps.entries()) {
        if (decoder.missing.has(index)) {
          continue;
        }
        await callback({
          time,
          width: 2,
          height: 2,
          rgba: new Uint8Array(16).fill(255)
        });
        count += 1;
      }
      return count;
    }
  };
});

beforeEach(() => {
  decoder.missing.clear();
  decoder.timestamps = [];
});
describe.each([{ wire: "analyze_video" }, { wire: "detect_video_scenes" }])(
  "$wire sampling coverage",
  ({ wire: name }) => {
    it.each([
      {
        duration: 3600,
        requested: 4,
        count: 1200,
        effective: 0.333333,
        gap: 3,
        limited: true
      },
      {
        duration: 4,
        requested: 4,
        count: 16,
        effective: 4,
        gap: 0.25,
        limited: false
      },
      {
        duration: 2.3,
        requested: 4,
        count: 9,
        effective: 3.913043,
        gap: 0.255556,
        limited: false
      }
    ])(
      "reports actual plan for $duration seconds",
      async ({ duration, requested, count, effective, gap, limited }) => {
        decoder.duration = duration;
        const run = createCapabilityRun({
          context: new ProcessingContext({ jobId: "video-sampling" }),
          gate: UNGATED
        });
        const result = await run.invoke(name, {
          video: "data:video/mp4;base64,AA==",
          sample_fps: requested
        });
        expect(decoder.timestamps).toHaveLength(count);
        expect(decoder.timestamps[0]).toBe(0);
        expect(decoder.timestamps.at(-1)).toBeCloseTo(
          duration - duration / count,
          6
        );
        expect(decoder.timestamps[1]).toBeCloseTo(duration / count, 6);
        expect(result).toMatchObject({
          sampling: {
            fps: effective,
            requested_fps: requested,
            requested_frames: Math.floor(duration * requested),
            max_frames: 1200,
            frames_requested: count,
            frames_analyzed: count,
            budget_limited: limited,
            max_gap_seconds: gap
          }
        });
        if (name === "detect_video_scenes") {
          expect(result).toMatchObject({
            notes: expect.arrayContaining([
              expect.stringContaining(`${gap}s sampling gap`)
            ])
          });
        }
      }
    );

    it("reports wider gaps when requested frames fail to decode", async () => {
      decoder.duration = 4;
      decoder.missing = new Set([0, 1, 3, 4, 5]);
      const run = createCapabilityRun({
        context: new ProcessingContext({ jobId: "video-gaps" }),
        gate: UNGATED
      });
      const result = await run.invoke(name, {
        video: "data:video/mp4;base64,AA==",
        sample_fps: 4
      });
      expect(result).toMatchObject({
        sampling: {
          frames_requested: 16,
          frames_analyzed: 11,
          decoded_fps: 2.75,
          max_gap_seconds: 1
        }
      });
      if (name === "detect_video_scenes") {
        expect(result).toMatchObject({
          notes: expect.arrayContaining([
            expect.stringContaining("1s sampling gap")
          ])
        });
      }
    });
    it("includes missing final frames in coverage and reports no evidence explicitly", async () => {
      decoder.duration = 4;
      const run = createCapabilityRun({
        context: new ProcessingContext({ jobId: "video-tail" }),
        gate: UNGATED
      });
      decoder.missing = new Set([15]);
      const tail = await run.invoke(name, {
        video: "data:video/mp4;base64,AA==",
        sample_fps: 4
      });
      expect(tail).toMatchObject({
        sampling: { max_gap_seconds: 0.5, frames_analyzed: 15 }
      });
      decoder.missing = new Set(
        Array.from({ length: 16 }, (_unused, index) => index)
      );
      const empty = await run.invoke(name, {
        video: "data:video/mp4;base64,AA==",
        sample_fps: 4
      });
      expect(empty).toMatchObject({
        error: "No frames decoded from that video track.",
        sampling: { max_gap_seconds: null, decoded_fps: 0, frames_analyzed: 0 }
      });
    });
  }
);
