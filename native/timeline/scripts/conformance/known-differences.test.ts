/**
 * The package tests op-conformance.mjs skips, replaced here:
 *
 * - "splitClip preserves clip metadata and source references across both
 *   halves" checks `toBe` on nested objects. A value that crossed a process
 *   boundary is a copy, so the same case runs with deep equality.
 * - The keyframe and source-anchored curve cases: the native split and trim
 *   refuse those clips. The refusal must be exactly this error, for each of
 *   the four entry points, so a different failure cannot pass as known.
 */
import { describe, expect, it } from "vitest";
import * as native from "./native-ops.ts";

export const REFUSAL =
  "the native editor does not slice keyframe or source-anchored animation curves yet";

function makeBaseClip(): any {
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
    versions: [
      {
        id: "version-1",
        createdAt: "2026-05-05T14:00:00.000Z",
        jobId: "job-1",
        assetId: "asset-1",
        workflowUpdatedAt: "2026-05-05T14:00:00.000Z",
        dependencyHash: "dep-hash",
        paramOverridesSnapshot: {},
        status: "success"
      }
    ]
  };
}

describe("known differences", () => {
  it("splitClip preserves clip metadata and source references across both halves (deep equality)", () => {
    const clip = makeBaseClip();
    const [left, right] = native.splitClip(clip, 250);
    for (const half of [left, right]) {
      expect(half.workflowId).toBe(clip.workflowId);
      expect(half.currentAssetId).toBe(clip.currentAssetId);
      expect(half.paramOverrides).toStrictEqual(clip.paramOverrides);
      expect(half.dependencyHash).toBe(clip.dependencyHash);
      expect(half.lastGeneratedHash).toBe(clip.lastGeneratedHash);
      expect(half.versions).toStrictEqual(clip.versions);
    }
    expect(left.startMs).toBe(clip.startMs);
    expect(left.durationMs).toBe(150);
    expect(right.startMs).toBe(250);
    expect(right.durationMs).toBe(250);
    expect(left.inPointMs).toBe(50);
    expect(left.outPointMs).toBe(200);
    expect(right.inPointMs).toBe(200);
    expect(right.outPointMs).toBe(450);
  });

  const keyframed = {
    ...makeBaseClip(),
    animations: [{ id: "k", role: "emphasis", preset: "custom", delayMs: 0, durationMs: 400, params: { keyframed: true } }]
  };
  const sourceAnchored = {
    ...makeBaseClip(),
    animations: [
      { id: "s", role: "emphasis", preset: "custom", custom: { timeBase: "source", curves: [{ property: "opacity" }] } }
    ]
  };
  for (const [label, clip] of [
    ["keyframe", keyframed],
    ["source-anchored", sourceAnchored]
  ] as const) {
    it(`refuses to split a ${label} animation with the exact error`, () => {
      expect(() => native.splitClip(clip, 250)).toThrow(`splitClip: ${REFUSAL}`);
    });
    it(`refuses to trim a ${label} animation with the exact error`, () => {
      expect(() => native.trimClip(clip, "end", 100)).toThrow(`trimClip: ${REFUSAL}`);
    });
  }
});
