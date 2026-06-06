import { describe, expect, it } from "vitest";
import { splitClip } from "../src/splitClip.js";
import type { TimelineClip } from "../src/types.js";

function makeBaseClip(): TimelineClip {
  return {
    id: "clip-1",
    trackId: "track-1",
    name: "Base clip",
    startMs: 100,
    durationMs: 400,
    inPointMs: 50,
    outPointMs: 450,
    mediaType: "video",
    sourceType: "generated",
    workflowId: "workflow-1",
    paramOverrides: { prompt: "hello" },
    dependencyHash: "dep-hash",
    lastGeneratedHash: "last-hash",
    currentAssetId: "asset-1",
    status: "generated",
    locked: false,
    versions: [{
      id: "version-1",
      createdAt: "2026-05-05T14:00:00.000Z",
      jobId: "job-1",
      assetId: "asset-1",
      workflowUpdatedAt: "2026-05-05T14:00:00.000Z",
      dependencyHash: "dep-hash",
      paramOverridesSnapshot: {},
      status: "success"
    }]
  };
}

describe("splitClip", () => {
  it("preserves clip metadata and source references across both halves", () => {
    const clip = makeBaseClip();
    const [left, right] = splitClip(clip, 250);

    expect(left.workflowId).toBe(clip.workflowId);
    expect(right.workflowId).toBe(clip.workflowId);
    expect(left.currentAssetId).toBe(clip.currentAssetId);
    expect(right.currentAssetId).toBe(clip.currentAssetId);
    expect(left.paramOverrides).toBe(clip.paramOverrides);
    expect(right.paramOverrides).toBe(clip.paramOverrides);
    expect(left.dependencyHash).toBe(clip.dependencyHash);
    expect(right.dependencyHash).toBe(clip.dependencyHash);
    expect(left.lastGeneratedHash).toBe(clip.lastGeneratedHash);
    expect(right.lastGeneratedHash).toBe(clip.lastGeneratedHash);

    expect(left.startMs).toBe(clip.startMs);
    expect(left.durationMs).toBe(150);
    expect(right.startMs).toBe(250);
    expect(right.durationMs).toBe(250);

    expect(left.inPointMs).toBe(50);
    expect(left.outPointMs).toBe(200);
    expect(right.inPointMs).toBe(200);
    expect(right.outPointMs).toBe(450);

    expect(left.versions).toBe(clip.versions);
    expect(right.versions).toBe(clip.versions);

    expect(left.durationMs + right.durationMs).toBe(clip.durationMs);
    expect(left.outPointMs! - left.inPointMs!).toBe(left.durationMs);
    expect(right.outPointMs! - right.inPointMs!).toBe(right.durationMs);
  });

  it("throws when split position violates preconditions", () => {
    const clip = makeBaseClip();

    expect(() => splitClip(clip, clip.startMs)).toThrow(/startMs < atMs/);
    expect(() => splitClip(clip, clip.startMs + clip.durationMs)).toThrow(/startMs < atMs/);
    expect(() => splitClip(clip, clip.startMs - 1)).toThrow(/startMs < atMs/);
  });

  it("generates unique ids for each split half", () => {
    const clip = makeBaseClip();
    const [left, right] = splitClip(clip, 250);

    expect(left.id).not.toBe(clip.id);
    expect(right.id).not.toBe(clip.id);
    expect(left.id).not.toBe(right.id);
    expect(left.id).toMatch(/^[0-9a-f]{32}$/);
    expect(right.id).toMatch(/^[0-9a-f]{32}$/);
  });

  it("drops the boundary fades/transition that now fall on the interior cut", () => {
    const clip: TimelineClip = {
      ...makeBaseClip(),
      fadeInMs: 80,
      fadeOutMs: 90,
      transitionIn: { type: "crossfade", durationMs: 120 }
    };
    const [left, right] = splitClip(clip, 250);

    // The real clip start stays on the left, the real clip end on the right.
    expect(left.fadeInMs).toBe(80);
    expect(left.fadeOutMs).toBeUndefined();
    expect(left.transitionIn).toEqual(clip.transitionIn);

    expect(right.fadeOutMs).toBe(90);
    expect(right.fadeInMs).toBeUndefined();
    expect(right.transitionIn).toBeUndefined();
  });

  it("partitions caption words across the halves instead of duplicating them", () => {
    const clip: TimelineClip = {
      ...makeBaseClip(),
      caption: {
        words: [
          { word: "alpha", startMs: 0, endMs: 100 },
          { word: "beta", startMs: 120, endMs: 200 }, // straddles the cut at 150
          { word: "gamma", startMs: 220, endMs: 380 }
        ]
      }
    };
    // Split at timeline 250 → 150ms into the clip (clip.startMs is 100).
    const [left, right] = splitClip(clip, 250);

    expect(left.caption?.words.map((w) => w.word)).toEqual(["alpha", "beta"]);
    // The straddling word's end is clamped to the left half's duration (150).
    expect(left.caption?.words[1]).toEqual({ word: "beta", startMs: 120, endMs: 150 });

    // Right-half words are rebased to the right half's new start.
    expect(right.caption?.words).toEqual([
      { word: "gamma", startMs: 220 - 150, endMs: 380 - 150 }
    ]);

    // Each word lands in exactly one half — never duplicated across both.
    const total =
      (left.caption?.words.length ?? 0) + (right.caption?.words.length ?? 0);
    expect(total).toBe(clip.caption!.words.length);
  });

  it("splits the source in/out points by playback rate for unbaked speed", () => {
    // 2x speed, not baked: 400ms timeline consumes 800ms of source (50→850).
    const clip: TimelineClip = {
      ...makeBaseClip(),
      inPointMs: 50,
      outPointMs: 850,
      durationMs: 400,
      startMs: 100,
      speedMultiplier: 2
    };
    const [left, right] = splitClip(clip, 300); // 200ms into the clip

    // 200ms timeline * 2 = 400ms of source consumed by the left half.
    expect(left.inPointMs).toBe(50);
    expect(left.outPointMs).toBe(450);
    expect(right.inPointMs).toBe(450);
    expect(right.outPointMs).toBe(850);
    // Source spans scale with rate; timeline durations still sum to the original.
    expect(left.durationMs + right.durationMs).toBe(clip.durationMs);
  });
});
