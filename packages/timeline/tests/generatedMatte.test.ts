/**
 * Generated mattes as pure clip math (T16, D2).
 *
 * The claim under test is the one the design rests on: because the matte lives
 * on the clip, an edit that keeps the clip inside the source the generation
 * covered keeps the matte valid — no re-generation, no second clip to move.
 * So `splitClip` and `trimClip` are exercised here too, even though neither
 * knows the field exists.
 */
import { describe, expect, it } from "vitest";

import { makeClip } from "../src/defaults.js";
import { splitClip } from "../src/splitClip.js";
import { trimClip } from "../src/trimClip.js";
import {
  applyGeneratedMatteResult,
  clearGeneratedMatte,
  clipSourceWindowMs,
  isGeneratedMatteStale,
  selectGeneratedMatteVersion,
  type GeneratedMatteResult
} from "../src/generatedMatte.js";
import type { ClipGeneratedMatte, TimelineClip } from "../src/types.js";

const MATTE: ClipGeneratedMatte = {
  assetId: "mask-1",
  sourceAssetId: "asset-1",
  sourceRange: { fromMs: 0, toMs: 10_000 },
  settings: { model: "fal-ai/birefnet/v2/video", resolution: 1024 },
  status: "ready"
};

const clip = (over: Partial<TimelineClip> = {}): TimelineClip =>
  makeClip({
    id: "shot",
    trackId: "video",
    mediaType: "video",
    startMs: 1000,
    durationMs: 4000,
    inPointMs: 2000,
    outPointMs: 6000,
    status: "generated",
    currentAssetId: "asset-1",
    generatedMatte: { ...MATTE },
    ...over
  });

describe("clipSourceWindowMs", () => {
  it("measures the window at the clip's rate, not its timeline duration", () => {
    const fast = clip({ speedMultiplier: 2, inPointMs: 1000 });
    expect(clipSourceWindowMs(fast)).toEqual({ fromMs: 1000, toMs: 9000 });
  });

  it("takes a baked speed at 1:1", () => {
    const baked = clip({ speedMultiplier: 2, speedBaked: true, inPointMs: 0 });
    expect(clipSourceWindowMs(baked)).toEqual({ fromMs: 0, toMs: 4000 });
  });

  it("reads a remapped clip off its curve, in both directions", () => {
    const reversed = clip({
      inPointMs: 0,
      timeRemap: {
        keyframes: [
          { t: 0, sourceMs: 8000 },
          { t: 1, sourceMs: 3000 }
        ]
      }
    });
    expect(clipSourceWindowMs(reversed)).toEqual({ fromMs: 3000, toMs: 8000 });
  });
});

describe("isGeneratedMatteStale", () => {
  it("is false for a clip with no generated matte at all", () => {
    expect(isGeneratedMatteStale(clip({ generatedMatte: undefined }))).toBe(
      false
    );
  });

  it("is false while the clip's window sits inside the covered range", () => {
    expect(isGeneratedMatteStale(clip())).toBe(false);
  });

  it("is true when the clip's asset was regenerated under the matte", () => {
    expect(isGeneratedMatteStale(clip({ currentAssetId: "asset-2" }))).toBe(
      true
    );
  });

  it("is true when the window reaches source the generation never saw", () => {
    // The generation covered 0–10 000 ms of the source; this window ends at
    // 12 000, so the tail of the clip has no matte frames.
    expect(
      isGeneratedMatteStale(clip({ inPointMs: 8000, durationMs: 4000 }))
    ).toBe(true);
  });

  it("is true when speed pushes the window past the covered range", () => {
    // Same window in timeline ms, four times the source: 2 000 → 18 000.
    expect(isGeneratedMatteStale(clip({ speedMultiplier: 4 }))).toBe(true);
  });

  it("is true when a remap curve reaches outside the covered range", () => {
    const remapped = clip({
      timeRemap: {
        keyframes: [
          { t: 0, sourceMs: 500 },
          { t: 1, sourceMs: 14_000 }
        ]
      }
    });
    expect(isGeneratedMatteStale(remapped)).toBe(true);
  });
});

describe("splitClip / trimClip keep a generated matte aligned (D2)", () => {
  it("gives both halves of a split the same matte, neither stale", () => {
    const [left, right] = splitClip(clip(), 3000);

    expect(left.generatedMatte).toEqual(clip().generatedMatte);
    expect(right.generatedMatte).toEqual(clip().generatedMatte);
    expect(isGeneratedMatteStale(left)).toBe(false);
    expect(isGeneratedMatteStale(right)).toBe(false);
    // The halves cover disjoint source, and the generation covered both.
    expect(clipSourceWindowMs(left)).toEqual({ fromMs: 2000, toMs: 4000 });
    expect(clipSourceWindowMs(right)).toEqual({ fromMs: 4000, toMs: 6000 });
  });

  it("keeps a trim inside the covered range valid and a trim past it stale", () => {
    const shorter = trimClip(clip(), "end", -1000);
    expect(shorter.generatedMatte).toEqual(clip().generatedMatte);
    expect(isGeneratedMatteStale(shorter)).toBe(false);

    // Trimming the head *outwards* reveals source before the in point; here it
    // is still inside the covered range.
    const longerHead = trimClip(clip(), "start", 500);
    expect(isGeneratedMatteStale(longerHead)).toBe(false);

    const beyond = trimClip(clip({ inPointMs: 7000 }), "end", 5000);
    expect(isGeneratedMatteStale(beyond)).toBe(true);
  });
});

describe("applyGeneratedMatteResult", () => {
  const result: GeneratedMatteResult = {
    assetId: "mask-2",
    sourceAssetId: "asset-2",
    sourceRange: { fromMs: 0, toMs: 4000 },
    settings: { resolution: 2048 },
    jobId: "job-9",
    createdAt: "2026-05-05T14:00:00.000Z"
  };

  it("makes the result current and pushes the previous one onto versions", () => {
    const next = applyGeneratedMatteResult(clip(), result);

    expect(next.generatedMatte?.assetId).toBe("mask-2");
    expect(next.generatedMatte?.sourceAssetId).toBe("asset-2");
    expect(next.generatedMatte?.status).toBe("ready");
    expect(next.generatedMatte?.versions).toEqual([
      {
        assetId: "mask-1",
        sourceAssetId: "asset-1",
        createdAt: "2026-05-05T14:00:00.000Z",
        jobId: "job-9",
        settings: MATTE.settings
      }
    ]);
  });

  it("keeps the look knobs the user dialled in across a regenerate", () => {
    const tuned = clip({
      generatedMatte: { ...MATTE, invert: true, strength: 0.4, featherPx: 3 }
    });
    const next = applyGeneratedMatteResult(tuned, result);
    expect(next.generatedMatte).toMatchObject({
      invert: true,
      strength: 0.4,
      featherPx: 3,
      settings: { resolution: 2048 }
    });
  });

  it("records nothing but the result on a clip that had no matte", () => {
    const next = applyGeneratedMatteResult(
      clip({ generatedMatte: undefined }),
      result
    );
    expect(next.generatedMatte?.versions).toBeUndefined();
    expect(next.generatedMatte?.assetId).toBe("mask-2");
  });

  it("leaves the clip it was handed alone", () => {
    const before = clip();
    applyGeneratedMatteResult(before, result);
    expect(before.generatedMatte).toEqual(MATTE);
  });

  it("newest first: two generations stack in order", () => {
    const once = applyGeneratedMatteResult(clip(), result);
    const twice = applyGeneratedMatteResult(once, {
      ...result,
      assetId: "mask-3",
      createdAt: "2026-05-06T14:00:00.000Z"
    });
    expect(twice.generatedMatte?.versions?.map((v) => v.assetId)).toEqual([
      "mask-2",
      "mask-1"
    ]);
  });
});

describe("selectGeneratedMatteVersion", () => {
  const withHistory = (): TimelineClip =>
    applyGeneratedMatteResult(clip(), {
      assetId: "mask-2",
      sourceAssetId: "asset-1",
      sourceRange: { fromMs: 0, toMs: 10_000 },
      settings: { resolution: 2048 },
      createdAt: "2026-05-05T14:00:00.000Z"
    });

  it("swaps a stored version in and the current one out", () => {
    const rolled = selectGeneratedMatteVersion(withHistory(), "mask-1");

    expect(rolled.generatedMatte?.assetId).toBe("mask-1");
    expect(rolled.generatedMatte?.settings).toEqual(MATTE.settings);
    expect(rolled.generatedMatte?.versions?.map((v) => v.assetId)).toEqual([
      "mask-2"
    ]);
    expect(isGeneratedMatteStale(rolled)).toBe(false);
  });

  it("is a no-op for the current asset, an unknown one, or no matte", () => {
    const clipWith = withHistory();
    expect(selectGeneratedMatteVersion(clipWith, "mask-2")).toBe(clipWith);
    expect(selectGeneratedMatteVersion(clipWith, "mask-404")).toBe(clipWith);
    const bare = clip({ generatedMatte: undefined });
    expect(selectGeneratedMatteVersion(bare, "mask-1")).toBe(bare);
  });
});

describe("clearGeneratedMatte", () => {
  it("removes the field entirely, versions and all", () => {
    const cleared = clearGeneratedMatte(withVersions());
    expect("generatedMatte" in cleared).toBe(false);
  });

  it("hands back the same clip when there is nothing to clear", () => {
    const bare = clip({ generatedMatte: undefined });
    expect(clearGeneratedMatte(bare)).toBe(bare);
  });

  function withVersions(): TimelineClip {
    return applyGeneratedMatteResult(clip(), {
      assetId: "mask-2",
      sourceAssetId: "asset-1",
      sourceRange: { fromMs: 0, toMs: 10_000 },
      settings: {}
    });
  }
});
