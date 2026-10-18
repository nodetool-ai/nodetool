/**
 * `isolate_subject`'s document state machine, and the op that adjusts what it
 * writes.
 *
 * The provider is not called here and no mask video is synthesized: encoding
 * one needs ffmpeg, which this repo does not require, and neither
 * `packages/agents/tests` nor `packages/timeline/tests` ships an mp4 to borrow.
 * So the fake runner answers with a stored mask's asset id, and every
 * assertion is about the *document* — which matte is
 * current, which status it carries, what the version list holds, and how many
 * times the paid half was called. That is the half a provider key would not
 * make any more testable.
 *
 * Run with:
 *   npx vitest run tests/capabilities-isolate-subject.test.ts
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { TimelineSequence, initTestDb } from "@nodetool-ai/models";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { makeClip, type TimelineClip } from "@nodetool-ai/timeline";
import {
  applyTimelineOp,
  type TimelineOpContext,
  type TimelineOpState
} from "@nodetool-ai/timeline/ops";
import {
  isolateSubjectOnClip,
  providerIsolateSubjectRunner,
  type IsolateSubjectDeps,
  type IsolateSubjectInput,
  type IsolateSubjectOutcome,
  type IsolateSubjectRunResult
} from "../src/capabilities/timeline-isolate-subject.js";
import { module as timelines } from "../src/capabilities/timelines.js";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";

// The source bytes are read through the shared media resolver, which needs
// storage this suite does not stand up.
vi.mock("@nodetool-ai/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@nodetool-ai/runtime")>()),
  loadMediaRefBytes: vi.fn(async () => new Uint8Array([1, 2, 3]))
}));

const MATTE_MODEL = "fal-ai/birefnet/v2/video/General Use (Light)";

const SETTINGS = { provider: "fal_ai", model: MATTE_MODEL };

function videoClip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return makeClip({
    id: "clip_a",
    trackId: "track_a",
    name: "Shot A",
    startMs: 0,
    durationMs: 4000,
    inPointMs: 500,
    mediaType: "video",
    sourceType: "imported",
    status: "generated",
    currentAssetId: "asset_src",
    ...overrides
  });
}

/** A clip that already carries a finished cutout. */
function withReadyMatte(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return videoClip({
    generatedMatte: {
      assetId: "asset_mask_old",
      sourceAssetId: "asset_src",
      sourceRange: { fromMs: 0, toMs: 9000 },
      settings: { model: "Matting" },
      strength: 0.6,
      status: "ready"
    },
    ...overrides
  });
}

interface Harness {
  deps: IsolateSubjectDeps;
  /** Every clip handed to `persist`, in order. */
  saved: TimelineClip[];
  runner: ReturnType<typeof vi.fn>;
}

function harness(
  options: {
    run?: () => Promise<IsolateSubjectRunResult>;
    assetId?: string;
    persist?: (clip: TimelineClip) => Promise<boolean>;
  } = {}
): Harness {
  const saved: TimelineClip[] = [];
  const runner = vi.fn(
    options.run ??
      (async () => ({
        maskAssetId: options.assetId ?? "asset_mask_new",
        generationId: "gen_1",
        costUsd: 0.42
      }))
  );
  const persist =
    options.persist ??
    (async (clip: TimelineClip) => {
      saved.push(structuredClone(clip));
      return true;
    });
  return {
    deps: { runner, persist } as unknown as IsolateSubjectDeps,
    saved,
    runner
  };
}

function input(
  clip: TimelineClip,
  overrides: Partial<IsolateSubjectInput> = {}
): IsolateSubjectInput {
  return { clip, settings: SETTINGS, regenerate: false, ...overrides };
}

/** Narrow away the refusal arm; a refusal in these cases is the failure. */
function outcomeOf(
  value: IsolateSubjectOutcome | { error: string }
): IsolateSubjectOutcome {
  expect(value, `expected an outcome, got ${JSON.stringify(value)}`).toHaveProperty(
    "status"
  );
  return value as IsolateSubjectOutcome;
}

describe("isolate_subject", () => {
  it("writes a ready matte naming the source asset, range and settings", async () => {
    const h = harness();
    const clip = videoClip();

    const outcome = outcomeOf(
      await isolateSubjectOnClip(h.deps, input(clip, { sourceDurationMs: 9000 }))
    );

    expect(outcome.status).toBe("ready");
    expect(outcome.reused).toBe(false);
    expect(outcome.assetId).toBe("asset_mask_new");
    expect(outcome.generationId).toBe("gen_1");
    expect(outcome.costUsd).toBe(0.42);
    expect(outcome.sourceRange).toEqual({ fromMs: 0, toMs: 9000 });

    const matte = outcome.clip.generatedMatte;
    expect(matte?.assetId).toBe("asset_mask_new");
    expect(matte?.sourceAssetId).toBe("asset_src");
    expect(matte?.status).toBe("ready");
    // The whole source, not the clip's window: the mask is read at the clip's
    // own source time, so it has to start at the source's first frame.
    expect(matte?.sourceRange).toEqual({ fromMs: 0, toMs: 9000 });
    expect(matte?.settings).toEqual({ provider: "fal_ai", model: MATTE_MODEL });
    expect(h.runner).toHaveBeenCalledWith({
      sourceAssetId: "asset_src",
      settings: SETTINGS
    });
  });

  it("falls back to the clip's own source window when the asset states no duration", async () => {
    const h = harness();

    const outcome = outcomeOf(
      await isolateSubjectOnClip(h.deps, input(videoClip()))
    );

    // inPointMs 500 + 4000ms at 1x.
    expect(outcome.sourceRange).toEqual({ fromMs: 0, toMs: 4500 });
  });

  it("marks the matte in flight first, keeping the previous asset visible", async () => {
    const h = harness();

    await isolateSubjectOnClip(h.deps, input(withReadyMatte(), {
      regenerate: true
    }));

    expect(h.saved).toHaveLength(2);
    expect(h.saved[0]!.generatedMatte).toMatchObject({
      assetId: "asset_mask_old",
      status: "generating"
    });
    expect(h.saved[1]!.generatedMatte).toMatchObject({
      assetId: "asset_mask_new",
      status: "ready"
    });
  });

  it("pushes the displaced result onto versions and keeps the user's knobs", async () => {
    const h = harness();

    const outcome = outcomeOf(
      await isolateSubjectOnClip(h.deps, input(withReadyMatte(), {
        regenerate: true
      }))
    );

    expect(outcome.clip.generatedMatte?.strength).toBe(0.6);
    expect(outcome.clip.generatedMatte?.versions).toEqual([
      expect.objectContaining({
        assetId: "asset_mask_old",
        sourceAssetId: "asset_src",
        jobId: "gen_1"
      })
    ]);
  });

  it("hands back a ready matte without spending when regenerate is false", async () => {
    const h = harness();

    const outcome = outcomeOf(
      await isolateSubjectOnClip(h.deps, input(withReadyMatte()))
    );

    expect(outcome.reused).toBe(true);
    expect(outcome.status).toBe("ready");
    expect(outcome.assetId).toBe("asset_mask_old");
    expect(h.runner).toHaveBeenCalledTimes(0);
    expect(h.saved).toEqual([]);
  });

  it("regenerates rather than reusing a matte whose source was replaced", async () => {
    const h = harness();
    // The clip's asset moved on; the stored matte describes a picture the clip
    // no longer shows, so reuse would be worse than paying again.
    const clip = withReadyMatte({ currentAssetId: "asset_src_v2" });

    const outcome = outcomeOf(await isolateSubjectOnClip(h.deps, input(clip)));

    expect(outcome.reused).toBe(false);
    expect(h.runner).toHaveBeenCalledTimes(1);
    expect(outcome.clip.generatedMatte?.sourceAssetId).toBe("asset_src_v2");
  });

  it("keeps the previous ready matte selected when the generation fails", async () => {
    const h = harness({
      run: () => Promise.reject(new Error("fal: 500 upstream"))
    });

    const outcome = outcomeOf(
      await isolateSubjectOnClip(h.deps, input(withReadyMatte(), {
        regenerate: true
      }))
    );

    expect(outcome.status).toBe("failed");
    expect(outcome.error).toContain("fal: 500 upstream");
    // The working matte is back, ready and selected — a failed regenerate must
    // not cost the user the cutout they were already working with.
    expect(outcome.clip.generatedMatte).toMatchObject({
      assetId: "asset_mask_old",
      status: "ready",
      strength: 0.6
    });
    expect(h.saved.at(-1)!.generatedMatte).toMatchObject({
      assetId: "asset_mask_old",
      status: "ready"
    });
  });

  it("leaves a failed marker when there was no previous result to keep", async () => {
    const h = harness({ run: () => Promise.reject(new Error("no mask")) });

    const outcome = outcomeOf(
      await isolateSubjectOnClip(h.deps, input(videoClip()))
    );

    expect(outcome.status).toBe("failed");
    expect(outcome.clip.generatedMatte).toMatchObject({
      assetId: "",
      status: "failed",
      error: "no mask"
    });
    // The reason is saved, so the inspector can name it after a reload.
    expect(h.saved.at(-1)!.generatedMatte?.error).toBe("no mask");
  });

  it("names the new reason when a retry after a failed first run fails too", async () => {
    const h = harness({
      run: () => Promise.reject(new Error("video_url: too long"))
    });
    const failedBefore = videoClip({
      generatedMatte: {
        assetId: "",
        sourceAssetId: "asset_src",
        sourceRange: { fromMs: 0, toMs: 9000 },
        settings: {},
        status: "failed",
        error: "first reason"
      }
    });

    const outcome = outcomeOf(
      await isolateSubjectOnClip(h.deps, input(failedBefore))
    );

    expect(outcome.clip.generatedMatte).toMatchObject({
      status: "failed",
      error: "video_url: too long"
    });
    // The in-flight marker drops the stale reason while the run is out.
    expect(h.saved[0]!.generatedMatte?.error).toBeUndefined();
  });

  it("clears a failed run's reason once a retry succeeds", async () => {
    const h = harness();
    const failedBefore = videoClip({
      generatedMatte: {
        assetId: "",
        sourceAssetId: "asset_src",
        sourceRange: { fromMs: 0, toMs: 9000 },
        settings: {},
        status: "failed",
        error: "first reason"
      }
    });

    const outcome = outcomeOf(
      await isolateSubjectOnClip(h.deps, input(failedBefore))
    );

    expect(outcome.status).toBe("ready");
    expect(outcome.clip.generatedMatte?.error).toBeUndefined();
    // The marker had no mask, so it is not a version to go back to.
    expect(outcome.clip.generatedMatte?.versions).toBeUndefined();
  });

  it("refuses a clip with no asset without calling the provider", async () => {
    const h = harness();
    const clip = videoClip({ currentAssetId: undefined });

    const result = await isolateSubjectOnClip(h.deps, input(clip));

    expect(result).toEqual({
      error: expect.stringContaining("has no asset yet")
    });
    expect(h.runner).toHaveBeenCalledTimes(0);
  });

  it("refuses a clip that is not video", async () => {
    const h = harness();
    const clip = videoClip({ mediaType: "text", name: "Title" });

    const result = await isolateSubjectOnClip(h.deps, input(clip));

    expect(result).toEqual({
      error: expect.stringContaining("isolate_subject cuts a subject out")
    });
    expect(h.runner).toHaveBeenCalledTimes(0);
  });

  it("reports a concurrent edit instead of paying for a matte it cannot save", async () => {
    const h = harness({ persist: async () => false });

    const result = await isolateSubjectOnClip(h.deps, input(videoClip()));

    expect(result).toEqual({
      error: expect.stringContaining("modified concurrently")
    });
    expect(h.runner).toHaveBeenCalledTimes(0);
  });
});

// ---------------------------------------------------------------------------
// set_generated_matte
// ---------------------------------------------------------------------------

function opState(clip: TimelineClip): TimelineOpState {
  return {
    fps: 30,
    width: 1920,
    height: 1080,
    tracks: [
      {
        id: "track_a",
        name: "Video 1",
        type: "video",
        index: 0,
        visible: true,
        locked: false
      }
    ],
    clips: [clip],
    markers: [],
    selectedClipIds: [],
    playheadMs: 0
  };
}

const OP_CONTEXT: TimelineOpContext = {
  newId: (kind) => `${kind}_1`,
  now: () => "2026-01-01T00:00:00.000Z"
};

async function applyOne(
  clip: TimelineClip,
  op: Parameters<typeof applyTimelineOp>[1]
): Promise<{ clip: TimelineClip | undefined; error?: string }> {
  const outcome = await applyTimelineOp(opState(clip), op, OP_CONTEXT);
  const result: { clip: TimelineClip | undefined; error?: string } = {
    clip: outcome.state.clips.find((c) => c.id === clip.id)
  };
  if (outcome.error !== undefined) result.error = outcome.error;
  return result;
}

describe("set_generated_matte", () => {
  const versioned = (): TimelineClip =>
    videoClip({
      generatedMatte: {
        assetId: "asset_mask_2",
        sourceAssetId: "asset_src",
        sourceRange: { fromMs: 0, toMs: 9000 },
        settings: { model: "Matting" },
        status: "ready",
        versions: [
          {
            assetId: "asset_mask_1",
            sourceAssetId: "asset_src",
            createdAt: "2026-01-01T00:00:00.000Z",
            settings: { model: "General Use (Light)" }
          }
        ]
      }
    });

  it("sets invert, strength and feather and leaves the rest alone", async () => {
    const { clip } = await applyOne(versioned(), {
      op: "set_generated_matte",
      target: "clip_a",
      invert: true,
      strength: 0.4,
      featherPx: 6
    });

    expect(clip?.generatedMatte).toMatchObject({
      assetId: "asset_mask_2",
      invert: true,
      strength: 0.4,
      featherPx: 6
    });
  });

  it("clamps strength into 0..1 and feather to zero or more", async () => {
    const { clip } = await applyOne(versioned(), {
      op: "set_generated_matte",
      target: "clip_a",
      strength: 4,
      featherPx: -2
    });

    expect(clip?.generatedMatte?.strength).toBe(1);
    expect(clip?.generatedMatte?.featherPx).toBe(0);
  });

  it("leaves a field the call did not name at the value it had", async () => {
    const first = await applyOne(versioned(), {
      op: "set_generated_matte",
      target: "clip_a",
      strength: 0.3,
      invert: true
    });
    const { clip } = await applyOne(first.clip!, {
      op: "set_generated_matte",
      target: "clip_a",
      strength: 0.9
    });

    expect(clip?.generatedMatte?.strength).toBe(0.9);
    expect(clip?.generatedMatte?.invert).toBe(true);
  });

  it("makes a stored version current and puts the displaced one back in the list", async () => {
    const { clip } = await applyOne(versioned(), {
      op: "set_generated_matte",
      target: "clip_a",
      selectVersionAssetId: "asset_mask_1"
    });

    expect(clip?.generatedMatte?.assetId).toBe("asset_mask_1");
    expect(clip?.generatedMatte?.status).toBe("ready");
    expect(clip?.generatedMatte?.versions).toEqual([
      expect.objectContaining({ assetId: "asset_mask_2" })
    ]);
  });

  it("treats a version that is not in the list as a no-op", async () => {
    const { clip } = await applyOne(versioned(), {
      op: "set_generated_matte",
      target: "clip_a",
      selectVersionAssetId: "asset_mask_missing"
    });

    expect(clip?.generatedMatte?.assetId).toBe("asset_mask_2");
  });

  it("clears the matte, versions and all", async () => {
    const { clip } = await applyOne(versioned(), {
      op: "set_generated_matte",
      target: "clip_a",
      clear: true
    });

    expect(clip?.generatedMatte).toBeUndefined();
  });

  it("refuses knobs on a clip that has no generated matte", async () => {
    const { error } = await applyOne(videoClip(), {
      op: "set_generated_matte",
      target: "clip_a",
      invert: true
    });

    expect(error).toContain("carries no generated matte");
  });
});

// ---------------------------------------------------------------------------
// the capability, against the database
// ---------------------------------------------------------------------------

describe("isolate_subject capability", () => {
  beforeEach(() => initTestDb());

  const TIMELINE_ID = "0123456789abcdef0123456789abcdef";

  async function seedTimeline(): Promise<void> {
    await TimelineSequence.create<TimelineSequence>({
      id: TIMELINE_ID,
      user_id: "u1",
      project_id: "default",
      name: "Cut",
      fps: 30,
      width: 1920,
      height: 1080,
      duration_ms: 4000,
      document: JSON.stringify({
        tracks: [
          {
            id: "track_a",
            name: "Video 1",
            type: "video",
            index: 0,
            visible: true,
            locked: false
          }
        ],
        clips: [videoClip()],
        markers: []
      })
    });
  }

  /** A provider that lists one matte model, or none when `tasks` says so. */
  function matteContext(options: {
    capabilities?: string[];
    tasks?: string[];
    runGeneration?: () => Promise<unknown>;
  } = {}): ProcessingContext {
    const provider = {
      getCapabilities: () => options.capabilities ?? ["matte_video"],
      getAvailableVideoModels: async () => [
        {
          id: MATTE_MODEL,
          name: "BiRefNet — General Use (Light)",
          provider: "fal_ai",
          supportedTasks: options.tasks ?? ["matte_video"]
        }
      ]
    };
    return {
      userId: "u1",
      getProvider: async () => provider,
      runGeneration:
        options.runGeneration ??
        (async () => {
          throw new Error("FAL queue request failed (HTTP 422): video_url: too long");
        })
    } as unknown as ProcessingContext;
  }

  function isolateEntry() {
    const entry = timelines.exports.find(
      (e) => e.spec.name === "isolate_subject"
    );
    return entry!;
  }

  it("saves to the timeline named by its short id", async () => {
    await seedTimeline();
    // The generation fails after the in-flight write, so both CAS writes run
    // and the provider's reason is what the clip carries.
    const run = createCapabilityRun({ context: matteContext(), gate: UNGATED });

    const result = (await isolateEntry().impl(run, {
      timeline_id: TIMELINE_ID.slice(0, 12),
      clip_id: "clip_a",
      provider: "fal_ai",
      model: MATTE_MODEL
    })) as Record<string, unknown>;

    expect(result.status).toBe("failed");
    expect(result.error).toBe(
      "FAL queue request failed (HTTP 422): video_url: too long"
    );
    const stored = (await TimelineSequence.findById(TIMELINE_ID))!.toDocument();
    expect(stored.clips[0].generatedMatte?.status).toBe("failed");
    expect(stored.clips[0].generatedMatte?.error).toBe(result.error);
  });

  it("refuses a model the provider does not list for matte_video, writing nothing", async () => {
    await seedTimeline();
    const runGeneration = vi.fn();
    const run = createCapabilityRun({
      context: matteContext({ tasks: ["video_to_video"], runGeneration }),
      gate: UNGATED
    });

    const result = (await isolateEntry().impl(run, {
      timeline_id: TIMELINE_ID,
      clip_id: "clip_a",
      provider: "fal_ai",
      model: MATTE_MODEL
    })) as Record<string, unknown>;

    expect(result.error).toContain("does not support matte_video");
    expect(runGeneration).not.toHaveBeenCalled();
    const stored = (await TimelineSequence.findById(TIMELINE_ID))!.toDocument();
    expect(stored.clips[0].generatedMatte).toBeUndefined();
  });

  it("refuses a provider without the matte_video task", async () => {
    await seedTimeline();
    const run = createCapabilityRun({
      context: matteContext({ capabilities: ["upscale_video"] }),
      gate: UNGATED
    });

    const result = (await isolateEntry().impl(run, {
      timeline_id: TIMELINE_ID,
      clip_id: "clip_a",
      provider: "fal_ai",
      model: MATTE_MODEL
    })) as Record<string, unknown>;

    expect(result.error).toContain("does not support the matte_video task");
  });

  it("requires a provider and model", async () => {
    await seedTimeline();
    const run = createCapabilityRun({ context: matteContext(), gate: UNGATED });

    const result = (await isolateEntry().impl(run, {
      timeline_id: TIMELINE_ID,
      clip_id: "clip_a"
    })) as Record<string, unknown>;

    expect(result.error).toContain("provider");
  });
});

describe("providerIsolateSubjectRunner", () => {
  it("runs the chosen provider's matte_video task and stores the mask", async () => {
    const runGeneration = vi.fn(async () => ({
      id: "gen_9",
      output: new Uint8Array([9]),
      assets: [{ type: "video", asset_id: "asset_mask_9" }],
      receipt: { cost: { amount: 0.31, currency: "USD" } },
      duration_ms: 10
    }));
    const context = { runGeneration } as unknown as ProcessingContext;

    const result = await providerIsolateSubjectRunner(context, "gen_9")({
      sourceAssetId: "asset_src",
      settings: SETTINGS
    });

    expect(result).toEqual({
      maskAssetId: "asset_mask_9",
      generationId: "gen_9",
      costUsd: 0.31
    });
    expect(runGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "gen_9",
        provider: "fal_ai",
        model: MATTE_MODEL,
        capability: "matte_video",
        params: { asset_id: "asset_src", video: new Uint8Array([1, 2, 3]) },
        persist: expect.objectContaining({ mime: "video/mp4" })
      })
    );
  });

  it("fails when the mask could not be stored as an asset", async () => {
    const context = {
      runGeneration: async () => ({
        id: "gen_9",
        output: new Uint8Array([9]),
        assets: [],
        receipt: null,
        duration_ms: 10
      })
    } as unknown as ProcessingContext;

    await expect(
      providerIsolateSubjectRunner(context, "gen_9")({
        sourceAssetId: "asset_src",
        settings: SETTINGS
      })
    ).rejects.toThrow(/could not be stored as an asset/);
  });
});
