/**
 * `track_object`'s document state machine (P0 AI Video, Phase 2).
 *
 * No provider is called here: `notImplementedTrackObjectRunner` throws by
 * design (no tracking-capable node is registered in this build — see that
 * function's doc comment), so every test injects a fake runner through
 * `TrackObjectDeps`, mirroring `capabilities-isolate-subject.test.ts`'s own
 * pattern: the paid half is untestable without a provider key, so only the
 * document half is asserted here — which track is current, its status, and
 * how many times the paid half was called.
 */

import { describe, expect, it, vi } from "vitest";
import { makeClip, type MediaTrack, type TimelineClip } from "@nodetool-ai/timeline";
import {
  trackObjectOnDocument,
  type TrackObjectDeps,
  type TrackObjectInput,
  type TrackObjectOutcome,
  type TrackObjectRunResult
} from "../src/capabilities/timeline-track-object.js";

function videoClip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return makeClip({
    id: "clip_a",
    trackId: "track_a",
    name: "Shot A",
    startMs: 0,
    durationMs: 4000,
    mediaType: "video",
    sourceType: "imported",
    status: "generated",
    currentAssetId: "asset_src",
    ...overrides
  });
}

function readyTrack(overrides: Partial<MediaTrack> = {}): MediaTrack {
  return {
    id: "track_media_1",
    clipId: "clip_a",
    sourceAssetId: "asset_src",
    name: "Product",
    kind: "box",
    sourceStartMs: 0,
    sourceEndMs: 4000,
    samples: [{ sourceMs: 0, x: 0.2, y: 0.2, width: 0.1, height: 0.1 }],
    status: "ready",
    ...overrides
  };
}

interface Harness {
  deps: TrackObjectDeps;
  saved: MediaTrack[][];
  runner: ReturnType<typeof vi.fn>;
}

function harness(
  options: {
    run?: () => Promise<TrackObjectRunResult>;
    persist?: (tracks: MediaTrack[]) => Promise<boolean>;
  } = {}
): Harness {
  const saved: MediaTrack[][] = [];
  const runner = vi.fn(
    options.run ??
      (async () => ({
        samples: [
          { sourceMs: 0, x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
          { sourceMs: 2000, x: 0.5, y: 0.5, width: 0.2, height: 0.2 }
        ],
        confidence: 0.9,
        generationId: "gen_1",
        costUsd: 0.1
      }))
  );
  const persist =
    options.persist ??
    (async (tracks: MediaTrack[]) => {
      saved.push(structuredClone(tracks));
      return true;
    });
  return { deps: { runner, persist }, saved, runner };
}

function input(
  clip: TimelineClip,
  overrides: Partial<TrackObjectInput> = {}
): TrackObjectInput {
  return {
    clip,
    mediaTracks: [],
    name: "Product",
    initialRegion: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
    startMs: 0,
    endMs: 4000,
    direction: "forward",
    regenerate: false,
    trackId: "track_media_1",
    ...overrides
  };
}

function outcomeOf(
  value: TrackObjectOutcome | { error: string }
): TrackObjectOutcome {
  expect(value, `expected an outcome, got ${JSON.stringify(value)}`).toHaveProperty(
    "status"
  );
  return value as TrackObjectOutcome;
}

describe("track_object", () => {
  it("writes a ready track from the runner's samples", async () => {
    const h = harness();
    const clip = videoClip();

    const outcome = outcomeOf(await trackObjectOnDocument(h.deps, input(clip)));

    expect(outcome.status).toBe("ready");
    expect(outcome.reused).toBe(false);
    expect(outcome.track.status).toBe("ready");
    expect(outcome.track.samples).toHaveLength(2);
    expect(outcome.track.sourceAssetId).toBe("asset_src");
    expect(outcome.generationId).toBe("gen_1");
    expect(outcome.costUsd).toBe(0.1);
  });

  it("marks the track generating first, then ready", async () => {
    const h = harness();

    await trackObjectOnDocument(h.deps, input(videoClip()));

    expect(h.saved).toHaveLength(2);
    expect(h.saved[0]![0]!.status).toBe("generating");
    expect(h.saved[1]![0]!.status).toBe("ready");
  });

  it("hands back a ready track without spending when regenerate is false", async () => {
    const h = harness();
    const clip = videoClip();

    const outcome = outcomeOf(
      await trackObjectOnDocument(
        h.deps,
        input(clip, { mediaTracks: [readyTrack()] })
      )
    );

    expect(outcome.reused).toBe(true);
    expect(outcome.status).toBe("ready");
    expect(h.runner).toHaveBeenCalledTimes(0);
    expect(h.saved).toEqual([]);
  });

  it("regenerates rather than reusing a track whose source asset was replaced", async () => {
    const h = harness();
    const clip = videoClip({ currentAssetId: "asset_src_v2" });

    const outcome = outcomeOf(
      await trackObjectOnDocument(
        h.deps,
        input(clip, { mediaTracks: [readyTrack()] })
      )
    );

    expect(outcome.reused).toBe(false);
    expect(h.runner).toHaveBeenCalledTimes(1);
    expect(outcome.track.sourceAssetId).toBe("asset_src_v2");
  });

  it("keeps the previous ready track selected when the generation fails", async () => {
    const h = harness({ run: () => Promise.reject(new Error("no provider")) });
    const clip = videoClip();

    const outcome = outcomeOf(
      await trackObjectOnDocument(
        h.deps,
        input(clip, { mediaTracks: [readyTrack()], regenerate: true })
      )
    );

    expect(outcome.status).toBe("failed");
    expect(outcome.error).toContain("no provider");
    // The working track is back, ready — a failed regenerate must not cost
    // the caller the track they already had.
    expect(outcome.track).toEqual(readyTrack());
    expect(h.saved.at(-1)![0]).toEqual(readyTrack());
  });

  it("leaves a failed marker when there was no previous track to keep", async () => {
    const h = harness({ run: () => Promise.reject(new Error("no provider")) });

    const outcome = outcomeOf(
      await trackObjectOnDocument(h.deps, input(videoClip()))
    );

    expect(outcome.status).toBe("failed");
    expect(outcome.track.status).toBe("failed");
  });

  it("refuses without spending when the clip has no asset", async () => {
    const clip = videoClip({ currentAssetId: undefined });
    const h = harness();

    const result = await trackObjectOnDocument(h.deps, input(clip));

    expect(result).toHaveProperty("error");
    expect(h.runner).not.toHaveBeenCalled();
  });

  it("refuses a region outside 0..1", async () => {
    const h = harness();
    const result = await trackObjectOnDocument(
      h.deps,
      input(videoClip(), {
        initialRegion: { x: 1.5, y: 0.1, width: 0.2, height: 0.2 }
      })
    );
    expect(result).toHaveProperty("error");
    expect(h.runner).not.toHaveBeenCalled();
  });

  it("refuses endMs <= startMs", async () => {
    const h = harness();
    const result = await trackObjectOnDocument(
      h.deps,
      input(videoClip(), { startMs: 1000, endMs: 1000 })
    );
    expect(result).toHaveProperty("error");
    expect(h.runner).not.toHaveBeenCalled();
  });

  it("reports a concurrent edit when persist refuses the in-flight write", async () => {
    const h = harness({ persist: async () => false });

    const result = await trackObjectOnDocument(h.deps, input(videoClip()));

    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toMatch(/concurrently/i);
    expect(h.runner).not.toHaveBeenCalled();
  });
});
