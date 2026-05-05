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
});
