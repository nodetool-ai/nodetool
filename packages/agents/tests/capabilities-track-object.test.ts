import { describe, expect, it, vi } from "vitest";
import {
  makeClip,
  type MediaTrack,
  type TimelineClip
} from "@nodetool-ai/timeline";
import {
  contextTrackObjectRunner,
  trackObjectOnDocument,
  type TrackObjectDeps,
  type TrackObjectInput,
  type TrackObjectOutcome,
  type TrackObjectRunResult
} from "../src/capabilities/timeline-track-object.js";
import {
  BaseProvider,
  ProcessingContext,
  type Message,
  type ProviderStreamItem,
  type ObjectTrackingParams,
  type ObjectTrackingResult
} from "@nodetool-ai/runtime";

class UnsupportedTrackingProvider extends BaseProvider {
  constructor() {
    super("fake");
  }
  async generateMessage(): Promise<Message> {
    throw new Error("unused");
  }
  async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
    throw new Error("unused");
  }
}

class ExecutableTrackingProvider extends UnsupportedTrackingProvider {
  override async trackObject(
    _video: Uint8Array,
    params: ObjectTrackingParams
  ): Promise<ObjectTrackingResult> {
    return { samples: [{ sourceMs: params.startMs, ...params.initialRegion }] };
  }
}

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
  expect(
    value,
    `expected an outcome, got ${JSON.stringify(value)}`
  ).toHaveProperty("status");
  return value as TrackObjectOutcome;
}

describe("track_object", () => {
  it("connects an executable provider to generation dispatch and saves its provenance", async () => {
    const context = new ProcessingContext({});
    context.registerProvider("fake", new ExecutableTrackingProvider());
    const dispatch = vi.spyOn(context, "runGeneration").mockResolvedValue({
      id: "gen-tracking",
      assets: [],
      receipt: null,
      duration_ms: 1,
      output: {
        samples: [{ sourceMs: 40_000, x: 0.1, y: 0.1, width: 0.2, height: 0.2 }]
      }
    });
    const runner = await contextTrackObjectRunner(
      context,
      "fake",
      "box-tracker"
    );
    expect(runner).not.toBeNull();
    const h = harness();
    const result = outcomeOf(
      await trackObjectOnDocument(
        { ...h.deps, runner },
        input(videoClip({ inPointMs: 40_000 }), {
          startMs: 40_000,
          endMs: 44_000
        })
      )
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "fake",
        model: "box-tracker",
        capability: "track_object",
        params: expect.objectContaining({
          sourceAssetId: "asset_src",
          startMs: 40_000,
          endMs: 44_000
        })
      })
    );
    expect(result.generationId).toBe("gen-tracking");
    expect(result.track.provenance).toEqual({
      provider: "fake",
      model: "box-tracker",
      settings: expect.objectContaining({ startMs: 40_000, endMs: 44_000 })
    });
    expect(h.saved.at(-1)?.[0]).toEqual(result.track);
  });

  it("does not create a runner for an unsupported provider or missing model", async () => {
    const context = new ProcessingContext({});
    context.registerProvider("fake", new UnsupportedTrackingProvider());
    expect(
      await contextTrackObjectRunner(context, "fake", "tracker")
    ).toBeNull();
    expect(
      await contextTrackObjectRunner(context, "fake", undefined)
    ).toBeNull();
  });
  it.each([
    { x: 0.9, y: 0.1, width: 0.2, height: 0.2 },
    { x: 0.1, y: 0.9, width: 0.2, height: 0.2 },
    { x: 0.1, y: 0.1, width: 0, height: 0.2 }
  ])(
    "refuses a box that cannot select a subject: %j",
    async (initialRegion) => {
      const h = harness();
      expect(
        await trackObjectOnDocument(
          h.deps,
          input(videoClip(), { initialRegion })
        )
      ).toHaveProperty("error");
      expect(h.saved).toEqual([]);
      expect(h.runner).not.toHaveBeenCalled();
    }
  );

  it.each([NaN, Infinity, -1])(
    "refuses invalid source times: %s",
    async (startMs) => {
      const h = harness();
      expect(
        await trackObjectOnDocument(h.deps, input(videoClip(), { startMs }))
      ).toHaveProperty("error");
      expect(h.runner).not.toHaveBeenCalled();
    }
  );

  it("refuses an unavailable provider without mutating the document", async () => {
    const h = harness();
    const result = await trackObjectOnDocument(
      { ...h.deps, runner: null },
      input(videoClip())
    );
    expect(result).toEqual({
      error: "No executable subject-tracking provider is available."
    });
    expect(h.saved).toEqual([]);
  });

  it("cannot replace another clip's track", async () => {
    const h = harness();
    expect(
      await trackObjectOnDocument(
        h.deps,
        input(videoClip(), {
          mediaTracks: [readyTrack({ clipId: "other-clip" })],
          regenerate: true
        })
      )
    ).toHaveProperty("error");
    expect(h.saved).toEqual([]);
    expect(h.runner).not.toHaveBeenCalled();
  });

  it("does not restore old-source samples as ready after a failed regeneration", async () => {
    const h = harness({
      run: async () => {
        throw new Error("provider failed");
      }
    });
    const outcome = outcomeOf(
      await trackObjectOnDocument(
        h.deps,
        input(videoClip({ currentAssetId: "new-source" }), {
          mediaTracks: [readyTrack()]
        })
      )
    );
    expect(outcome.track.status).toBe("stale");
    expect(outcome.track.sourceAssetId).toBe("asset_src");
  });

  it("refuses empty provider samples instead of marking tracking ready", async () => {
    const h = harness({ run: async () => ({ samples: [] }) });
    const result = outcomeOf(
      await trackObjectOnDocument(h.deps, input(videoClip()))
    );
    expect(result.status).toBe("failed");
    expect(result.track.status).toBe("failed");
  });

  it("refuses a stale destination at settlement", async () => {
    const h = harness({
      persist: async () =>
        h.saved.length === 0 ? (h.saved.push([]), true) : false
    });
    expect(await trackObjectOnDocument(h.deps, input(videoClip()))).toEqual({
      error:
        "The timeline is being modified concurrently; nothing was saved. Retry the call."
    });
    expect(h.runner).toHaveBeenCalledOnce();
  });
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
