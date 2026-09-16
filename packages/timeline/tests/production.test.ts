import { describe, expect, it } from "vitest";

import {
  applyProductionDraft,
  auditionProductionCandidate,
  compileProductionCandidates,
  landProductionCandidate,
  productionCandidateIdentity,
  productionCandidatesForClip,
  undoProductionDraft
} from "../src/production.js";
import type { TimelineOpState } from "../src/ops/types.js";
import type { ClipVersion, TimelineClip } from "../src/types.js";

function clip(id: string): TimelineClip {
  return {
    id,
    trackId: "track-1",
    name: id,
    startMs: 1000,
    durationMs: 3000,
    mediaType: "video",
    sourceType: "generated",
    status: "draft",
    locked: false,
    versions: []
  };
}

function landing(
  destinationId: string,
  variationIndex: number,
  assetId: string
) {
  const identity = productionCandidateIdentity(
    "batch-1",
    destinationId,
    variationIndex
  );
  const snapshot = {
    schemaVersion: 1 as const,
    batchId: identity.batchId,
    requestId: identity.requestId,
    candidateId: identity.candidateId,
    variationId: identity.variationId,
    variationIndex: identity.variationIndex,
    destinationKind: "timeline_clip" as const,
    destinationId,
    operation: "initial_generation" as const,
    prompt: `candidate ${variationIndex}`
  };
  const version: Omit<
    ClipVersion,
    | "candidateId"
    | "batchId"
    | "requestId"
    | "variationId"
    | "variationIndex"
    | "productionSnapshot"
  > & {
    productionSnapshot: typeof snapshot;
  } = {
    id: `${destinationId}-take-${variationIndex}`,
    createdAt: `2026-01-01T00:00:0${variationIndex}.000Z`,
    jobId: `${destinationId}-job-${variationIndex}`,
    assetId,
    workflowUpdatedAt: "2026-01-01T00:00:00.000Z",
    dependencyHash: `hash-${variationIndex}`,
    paramOverridesSnapshot: {},
    status: "success",
    productionSnapshot: snapshot
  };
  return { identity, version };
}

function state(clips: TimelineClip[]): TimelineOpState {
  return {
    fps: 30,
    width: 1080,
    height: 1920,
    tracks: [],
    clips,
    markers: [],
    playheadMs: 0,
    selectedClipIds: []
  };
}

describe("production candidate lifecycle", () => {
  it("compiles resolved references and stable take identities before dispatch", () => {
    const candidates = compileProductionCandidates({
      batchId: "batch-1",
      destinationId: "clip-1",
      destinationKind: "timeline_clip",
      operation: "initial_generation",
      prompt: "A spokesperson demonstrates the product",
      requirement: {
        schema_version: 1,
        speech_mode: "off_camera",
        speech_binding: {
          audio_asset_id: "audio-1"
        },
        reference_bindings: [
          {
            kind: "product",
            asset_id: "product-1"
          }
        ],
        requested_take_count: 3
      },
      referenceAssetIds: ["character-1", "product-1"],
      requestedDurationMs: 4_000,
      routeSupport: {
        referenceToVideo: true,
        audioDrivenPerformance: false
      }
    });

    expect(
      candidates.map((candidate) => candidate.identity.variationIndex)
    ).toEqual([1, 2, 3]);
    expect(candidates.map((candidate) => candidate.identity.requestId)).toEqual(
      [
        "request:candidate:variation:batch-1:timeline_clip:clip-1:1",
        "request:candidate:variation:batch-1:timeline_clip:clip-1:2",
        "request:candidate:variation:batch-1:timeline_clip:clip-1:3"
      ]
    );
    expect(candidates[0]?.referenceAssetIds).toEqual([
      "character-1",
      "product-1"
    ]);
    expect(candidates[0]?.snapshot.speech?.audioAssetId).toBe("audio-1");
    expect(candidates[0]?.executionRoute).toBe("reference_to_video");
  });

  it("rejects timing mismatches and unsupported on-camera performance before dispatch", () => {
    const base = {
      batchId: "batch-1",
      destinationId: "clip-1",
      destinationKind: "timeline_clip" as const,
      operation: "initial_generation" as const,
      prompt: "A spokesperson talks to camera",
      routeSupport: {
        referenceToVideo: true,
        audioDrivenPerformance: false
      }
    };

    expect(() =>
      compileProductionCandidates({
        ...base,
        requirement: {
          schema_version: 1,
          speech_mode: "off_camera",
          speech_binding: { audio_asset_id: "audio-1" },
          duration_ms: 2_000,
          speech_duration_ms: 2_500,
          requested_take_count: 1
        }
      })
    ).toThrow(/speech duration/i);

    expect(() =>
      compileProductionCandidates({
        ...base,
        requirement: {
          schema_version: 1,
          speech_mode: "on_camera",
          speech_binding: { audio_asset_id: "audio-1" },
          reference_bindings: [{ kind: "character", asset_id: "character-1" }],
          requested_take_count: 1
        }
      })
    ).toThrow(/does not support audio-driven/i);
  });

  it("assigns stable identities and lists landed candidates by variation, not completion order", () => {
    const original = clip("clip-1");
    const third = landing("clip-1", 3, "asset-3");
    const first = landing("clip-1", 1, "asset-1");
    const landed = landProductionCandidate(
      landProductionCandidate(original, third),
      first
    );

    expect(productionCandidateIdentity("batch-1", "clip-1", 1)).toEqual(
      first.identity
    );
    expect(landed.currentAssetId).toBeUndefined();
    expect(landed.activeTakeId).toBeUndefined();
    expect(landed.startMs).toBe(original.startMs);
    expect(
      productionCandidatesForClip(landed).map((v) => v.variationIndex)
    ).toEqual([1, 3]);
  });

  it("updates audition selection without mutating document or audition state", () => {
    const before = {};
    const after = auditionProductionCandidate(before, "clip-1", "candidate-1");
    expect(before).toEqual({});
    expect(after).toEqual({ "clip-1": "candidate-1" });
  });

  it("applies an explicit draft atomically and returns an undo-compatible change set", () => {
    const first = landProductionCandidate(
      clip("clip-1"),
      landing("clip-1", 1, "asset-1")
    );
    const second = landProductionCandidate(
      clip("clip-2"),
      landing("clip-2", 2, "asset-2")
    );
    const before = state([first, second]);
    const applied = applyProductionDraft(
      before,
      {
        "clip-1": first.versions[0]?.candidateId ?? "",
        "clip-2": second.versions[0]?.candidateId ?? ""
      },
      "batch-1"
    );

    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.changes).toHaveLength(2);
    expect(applied.state.clips.map((item) => item.currentAssetId)).toEqual([
      "asset-1",
      "asset-2"
    ]);
    expect(
      before.clips.every((item) => item.currentAssetId === undefined)
    ).toBe(true);

    const undone = undoProductionDraft(applied.state, applied);
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(
      undone.state.clips.every((item) => item.currentAssetId === undefined)
    ).toBe(true);
    expect(undone.state.clips.map((item) => item.versions.length)).toEqual([
      1, 1
    ]);
  });

  it("rejects a conflicting draft before changing any selected clip", () => {
    const first = landProductionCandidate(
      clip("clip-1"),
      landing("clip-1", 1, "asset-1")
    );
    const second = landProductionCandidate(
      { ...clip("clip-2"), currentAssetId: "accepted-2" },
      landing("clip-2", 1, "asset-2")
    );
    const before = state([first, second]);
    const result = applyProductionDraft(before, {
      "clip-1": first.versions[0]?.candidateId ?? "",
      "clip-2": second.versions[0]?.candidateId ?? ""
    });
    expect(result.ok).toBe(false);
    expect(result.state).toBe(before);
    expect(before.clips[0]?.currentAssetId).toBeUndefined();
  });

  it("rejects a candidate whose snapshot targets another clip", () => {
    const landed = landProductionCandidate(
      clip("clip-1"),
      landing("clip-1", 1, "asset-1")
    );
    const version = landed.versions[0];
    if (version === undefined) throw new Error("Expected a landed version.");
    const invalid = {
      ...landed,
      versions: [
        {
          ...version,
          productionSnapshot: {
            ...version.productionSnapshot,
            destinationId: "other-clip"
          }
        }
      ]
    };
    const result = applyProductionDraft(
      state([invalid]),
      { "clip-1": version.candidateId ?? "" },
      "batch-1"
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("invalid production provenance");
  });
});
