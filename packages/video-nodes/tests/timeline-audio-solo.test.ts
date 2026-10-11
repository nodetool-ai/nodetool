import { describe, expect, it, vi } from "vitest";
import { mixCompositedTimelineAudio } from "../src/nodes/timeline.js";
import { resolveTimelineOutput } from "../src/nodes/timeline/outputFormats.js";

/**
 * Solo matches the browser preview and export: when any audio or midi track is
 * soloed, every other track is silent. A silenced clip's asset is never
 * resolved, which is what these cases look for.
 */
const sequenceWith = (tracks: unknown[], clips: unknown[]) => ({
  id: "seq", projectId: "test", name: "Solo", width: 32, height: 32,
  fps: 10, durationMs: 2000, createdAt: "", updatedAt: "", transcript: [],
  tracks, clips
});

const resolvedAssets = async (
  sequence: ReturnType<typeof sequenceWith>
): Promise<string[]> => {
  const resolveAssetPath = vi.fn(async (_id: string) => null);
  await mixCompositedTimelineAudio({
    sequence: sequence as never,
    basePath: "/nonexistent/base.mp4",
    workDir: "/nonexistent",
    output: resolveTimelineOutput({ format: "mp4" }),
    resolveAssetPath
  }).catch(() => undefined);
  return resolveAssetPath.mock.calls.map(([id]) => id);
};

const soloTrack = (solo: boolean) => ({
  id: "soloed", type: "audio", index: 0, visible: true, solo
});

describe("timeline audio solo", () => {
  it("silences an audio track that is not soloed", async () => {
    const sequence = (solo: boolean) => sequenceWith(
      [soloTrack(solo), { id: "other", type: "audio", index: 1, visible: true }],
      [{
        id: "tone", trackId: "other", name: "Tone", mediaType: "audio",
        currentAssetId: "tone", status: "generated", startMs: 0, durationMs: 1000
      }]
    );
    expect(await resolvedAssets(sequence(false))).toContain("tone");
    expect(await resolvedAssets(sequence(true))).not.toContain("tone");
  });

  it("silences embedded video audio while a sound track is soloed", async () => {
    const sequence = (solo: boolean) => sequenceWith(
      [soloTrack(solo), { id: "v", type: "video", index: 1, visible: true }],
      [{
        id: "shot", trackId: "v", name: "Shot", mediaType: "video",
        currentAssetId: "shot", status: "generated", startMs: 0, durationMs: 1000
      }]
    );
    expect(await resolvedAssets(sequence(false))).toContain("shot");
    expect(await resolvedAssets(sequence(true))).not.toContain("shot");
  });
});
