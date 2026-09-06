/**
 * `isolate_subject`'s document state machine, and the op that adjusts what it
 * writes.
 *
 * The provider is not called here and no mask video is synthesized: encoding
 * one needs ffmpeg, which this repo does not require, and neither
 * `packages/agents/tests` nor `packages/timeline/tests` ships an mp4 to borrow.
 * So the fake runner answers with a URL and the fake store answers with an
 * asset id, and every assertion is about the *document* — which matte is
 * current, which status it carries, what the version list holds, and how many
 * times the paid half was called. That is the half a provider key would not
 * make any more testable.
 *
 * Run with:
 *   npx vitest run tests/capabilities-isolate-subject.test.ts
 */

import { describe, expect, it, vi } from "vitest";
import { makeClip, type TimelineClip } from "@nodetool-ai/timeline";
import {
  applyTimelineOp,
  type TimelineOpContext,
  type TimelineOpState
} from "@nodetool-ai/timeline/ops";
import {
  isolateSubjectOnClip,
  type IsolateSubjectDeps,
  type IsolateSubjectInput,
  type IsolateSubjectOutcome,
  type IsolateSubjectRunResult
} from "../src/capabilities/timeline-isolate-subject.js";
import {
  DEFAULT_ISOLATE_SUBJECT_MODEL,
  DEFAULT_ISOLATE_SUBJECT_RESOLUTION,
  ISOLATE_SUBJECT_ENDPOINT
} from "../src/capabilities/timelines.specs.js";

const SETTINGS = {
  model: DEFAULT_ISOLATE_SUBJECT_MODEL,
  operating_resolution: DEFAULT_ISOLATE_SUBJECT_RESOLUTION,
  refine_foreground: true
};

const MASK_URL = "https://v3.fal.media/files/mask.mp4";

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
  storeMask: ReturnType<typeof vi.fn>;
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
        maskVideoUrl: MASK_URL,
        generationId: "gen_1",
        costUsd: 0.42
      }))
  );
  const storeMask = vi.fn(async () => ({
    assetId: options.assetId ?? "asset_mask_new"
  }));
  const persist =
    options.persist ??
    (async (clip: TimelineClip) => {
      saved.push(structuredClone(clip));
      return true;
    });
  return {
    deps: { runner, storeMask, persist } as unknown as IsolateSubjectDeps,
    saved,
    runner,
    storeMask
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
    expect(matte?.settings).toEqual({
      model: DEFAULT_ISOLATE_SUBJECT_MODEL,
      operating_resolution: DEFAULT_ISOLATE_SUBJECT_RESOLUTION,
      refine_foreground: true,
      provider: "fal",
      endpoint: ISOLATE_SUBJECT_ENDPOINT
    });
    expect(h.storeMask).toHaveBeenCalledWith(MASK_URL);
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
      status: "failed"
    });
  });

  it("reports a failed download the same way as a failed generation", async () => {
    const h = harness();
    h.deps.storeMask = vi.fn(() =>
      Promise.reject(new Error("The mask video downloaded as zero bytes."))
    );

    const outcome = outcomeOf(
      await isolateSubjectOnClip(h.deps, input(videoClip()))
    );

    expect(outcome.status).toBe("failed");
    expect(outcome.error).toContain("zero bytes");
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
