import { describe, expect, it } from "vitest";
import { clipVersion } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import {
  captureMediaEditSourceContext,
  composeGenerativeTakePatch,
  createMediaEditRequest,
  mediaEditGenerateMediaData,
  mediaEditTakeMetadata,
  withResolvedMediaEditReferences,
  planGenerativeOperation,
  takeSourceForOperation
} from "../src/generative.js";
import type { MediaTrack, TimelineClip } from "../src/types.js";

const clip = (overrides: Partial<TimelineClip> = {}): TimelineClip => ({
  id: "clip-1",
  trackId: "track-1",
  name: "Hero",
  startMs: 1000,
  durationMs: 5000,
  inPointMs: 200,
  outPointMs: 5200,
  mediaType: "video",
  sourceType: "generated",
  currentAssetId: "asset-1",
  status: "generated",
  locked: false,
  versions: [],
  opacity: 0.7,
  ...overrides
});

const track: MediaTrack = {
  id: "track-object",
  clipId: "clip-1",
  sourceAssetId: "asset-1",
  name: "Phone",
  kind: "box",
  sourceStartMs: 0,
  sourceEndMs: 5000,
  samples: [{ sourceMs: 0, x: 0.1, y: 0.1, width: 0.2, height: 0.2 }],
  status: "ready"
};

describe("generative timeline operations", () => {
  it("keeps entity selections separate and records server-resolved references on a take", () => {
    const source = clip();
    const context = captureMediaEditSourceContext("sequence", source);
    if (!context.ok) throw new Error(context.error);
    const request = createMediaEditRequest({
      sourceContext: context.context, instruction: "Keep entity://hero",
      provider: "fal_ai", model: "edit", entityIds: ["hero"],
      referenceAssetIds: ["style"]
    });
    expect(request.referenceAssetIds).toEqual(["style"]);
    const references = { referenceAssetIds: ["style", "portrait"], entityIds: ["hero"] };
    const resolved = withResolvedMediaEditReferences(request, references);
    references.referenceAssetIds.push("changed");
    const edited = composeGenerativeTakePatch(source, "restyle", {
      assetId: "candidate", jobId: "job", createdAt: "2026-01-01", mediaEdit: resolved
    });
    expect(edited.versions?.at(-1)?.mediaEdit).toMatchObject({
      referenceAssetIds: ["style", "portrait"], entityIds: ["hero"]
    });
    expect(withResolvedMediaEditReferences(request, undefined)).toBe(request);
    expect(withResolvedMediaEditReferences(request, { referenceAssetIds: [42], entityIds: [] })).toBe(request);
    expect(request.referenceAssetIds).toEqual(["style"]);
  });
  it("snapshots selected Entity and asset ids into the request and inactive take", () => {
    const source = clip();
    const context = captureMediaEditSourceContext("sequence", source);
    if (!context.ok) throw new Error(context.error);
    const references = ["reference", "entity"];
    const entities = ["entity"];
    const request = createMediaEditRequest({
      sourceContext: context.context, instruction: "Keep the identity",
      provider: "fal_ai", model: "edit", referenceAssetIds: references, entityIds: entities
    });
    references.push("later");
    entities.push("recast");
    expect(mediaEditGenerateMediaData(request)).toMatchObject({
      reference_asset_ids: ["reference", "entity"], entity_ids: ["entity"]
    });
    const edited = composeGenerativeTakePatch(source, "restyle", {
      assetId: "candidate", jobId: "job", createdAt: "2026-01-01", mediaEdit: request
    });
    expect(edited.currentAssetId).toBe(source.currentAssetId);
    expect(edited.versions?.at(-1)?.mediaEdit).toEqual(mediaEditTakeMetadata(request, "job"));
    expect(edited.versions?.at(-1)?.mediaEdit?.referenceAssetIds).toEqual(["reference", "entity"]);
    expect(clipVersion.parse(edited.versions?.at(-1)).mediaEdit).toEqual(mediaEditTakeMetadata(request, "job"));
    expect(source.versions).toEqual([]);
  });
  it("captures a trimmed constant-speed source window immutably", () => {
    const result = captureMediaEditSourceContext(
      "sequence-1",
      clip({
        inPointMs: 40000,
        outPointMs: 44000,
        durationMs: 4000,
        activeTakeId: "take-1",
        versions: [
          {
            id: "take-1",
            createdAt: "2025-01-01",
            jobId: "job-1",
            assetId: "asset-1",
            workflowUpdatedAt: "2025-01-01",
            dependencyHash: "hash-1",
            paramOverridesSnapshot: {},
            status: "success"
          }
        ]
      })
    );
    expect(result).toEqual({
      ok: true,
      context: {
        sequenceId: "sequence-1",
        clipId: "clip-1",
        sourceAssetId: "asset-1",
        sourceTakeId: "take-1",
        sourceStartMs: 40000,
        sourceEndMs: 44000,
        timelineStartMs: 1000,
        timelineDurationMs: 4000,
        speedMultiplier: 1
      }
    });
  });

  it("rejects remapped and non-positive playable clips before dispatch", () => {
    expect(
      captureMediaEditSourceContext(
        "sequence-1",
        clip({ timeRemap: { keyframes: [{ timelineMs: 0, sourceMs: 0 }] } })
      ).ok
    ).toBe(false);
    expect(
      captureMediaEditSourceContext("sequence-1", clip({ durationMs: 0 })).ok
    ).toBe(false);
    expect(
      captureMediaEditSourceContext("sequence-1", clip({ speedMultiplier: -1 }))
        .ok
    ).toBe(false);
  });

  it("freezes the submission snapshot", () => {
    const sourceContext = captureMediaEditSourceContext(
      "sequence-1",
      clip()
    ).context;
    if (!sourceContext) throw new Error("expected source context");
    const request = createMediaEditRequest({
      sourceContext,
      instruction: "add fog",
      provider: "fake",
      model: "video-edit"
    });
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(request.sourceContext)).toBe(true);
    expect(() => {
      (request.sourceContext as { sourceStartMs: number }).sourceStartMs = 12;
    }).toThrow();
  });

  it("builds capability-routed extend requests", () => {
    const result = planGenerativeOperation({
      clip: clip(),
      operation: "extend",
      direction: "end",
      durationMs: 1500,
      prompt: "keep the logo visible"
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.requiredCapabilities).toEqual(["video.extend"]);
      expect(result.request.optionalCapabilities).toContain(
        "video.first_last_frame"
      );
      expect(result.request.sourceAssetId).toBe("asset-1");
    }
  });

  it("rejects invalid ranges and extension arguments", () => {
    expect(
      planGenerativeOperation({
        clip: clip(),
        operation: "extend",
        direction: "end"
      }).ok
    ).toBe(false);
    expect(
      planGenerativeOperation({
        clip: clip(),
        operation: "extend",
        direction: "end",
        durationMs: 10,
        range: { startMs: 1, endMs: 2 }
      }).ok
    ).toBe(false);
    expect(
      planGenerativeOperation({
        clip: clip(),
        operation: "regenerate",
        range: { startMs: 0, endMs: 5001 }
      }).ok
    ).toBe(false);
    expect(
      planGenerativeOperation({
        clip: clip(),
        operation: "replace_range",
        range: { startMs: 4, endMs: 4 }
      }).ok
    ).toBe(false);
  });

  it("requires a ready, current-asset track for object operations", () => {
    const base = {
      clip: clip(),
      operation: "remove_object" as const,
      range: { startMs: 100, endMs: 900 },
      trackId: "track-object",
      mediaTracks: [track]
    };
    expect(planGenerativeOperation(base).ok).toBe(true);
    expect(planGenerativeOperation({ ...base, trackId: "missing" }).ok).toBe(
      false
    );
    expect(
      planGenerativeOperation({
        ...base,
        mediaTracks: [{ ...track, sourceAssetId: "old" }]
      }).ok
    ).toBe(false);
    expect(
      planGenerativeOperation({
        ...base,
        mediaTracks: [{ ...track, status: "stale" }]
      }).ok
    ).toBe(false);
  });

  it("routes object replacement with mask and optional references", () => {
    const result = planGenerativeOperation({
      clip: clip(),
      operation: "replace_object",
      range: { startMs: 100, endMs: 900 },
      trackId: track.id,
      mediaTracks: [track],
      referenceAssetIds: ["bottle.png"]
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.requiredCapabilities).toEqual([
        "video.object_replace",
        "video.mask_input"
      ]);
      expect(result.request.referenceAssetIds).toEqual(["bottle.png"]);
    }
  });

  it("adds a completed take without changing editorial fields", () => {
    const original = clip({
      versions: [
        {
          id: "take-1",
          createdAt: "2025-01-01",
          jobId: "job-1",
          assetId: "asset-1",
          workflowUpdatedAt: "2025-01-01",
          dependencyHash: "hash-1",
          paramOverridesSnapshot: {},
          status: "success"
        }
      ]
    });
    const patched = composeGenerativeTakePatch(original, "replace_object", {
      assetId: "asset-2",
      jobId: "job-2",
      createdAt: "2025-01-02",
      dependencyHash: "hash-2",
      provider: "provider",
      model: "model",
      prompt: "a bottle"
    });
    expect(patched.startMs).toBe(original.startMs);
    expect(patched.durationMs).toBe(original.durationMs);
    expect(patched.inPointMs).toBe(original.inPointMs);
    expect(patched.opacity).toBe(original.opacity);
    expect(patched.currentAssetId).toBe("asset-1");
    expect(patched.activeTakeId).toBeUndefined();
    expect(patched.versions).toHaveLength(2);
    expect(patched.versions[1]).toMatchObject({
      source: "object_replace",
      parentTakeId: "take-1",
      provider: "provider"
    });
    expect(
      composeGenerativeTakePatch(original, "regenerate", {
        assetId: "asset-failed",
        createdAt: "2025-01-03",
        status: "failed"
      })
    ).toBe(original);
  });

  it("makes a new take active only after an explicit selection", () => {
    const original = clip();
    const patched = composeGenerativeTakePatch(original, "extend", {
      assetId: "asset-2",
      createdAt: "2025-01-02",
      activate: true
    });
    expect(patched.currentAssetId).toBe("asset-2");
    expect(patched.activeTakeId).toBe("clip-1:2025-01-02");
  });

  it("records an edit candidate and baseline without changing the accepted cut", () => {
    const original = clip({
      inPointMs: 40000,
      outPointMs: 44000,
      durationMs: 4000,
      versions: []
    });
    const context = captureMediaEditSourceContext("sequence-1", original);
    if (!context.ok) throw new Error(context.error);
    const request = createMediaEditRequest({
      sourceContext: context.context,
      instruction: "add fog",
      provider: "fake",
      model: "video-edit"
    });
    const result = composeGenerativeTakePatch(original, "restyle", {
      assetId: "asset-2",
      jobId: "request-1",
      createdAt: "2025-01-02",
      durationMs: 4000,
      mediaEdit: request
    });
    expect(result.currentAssetId).toBe("asset-1");
    expect(result.inPointMs).toBe(40000);
    expect(result.outPointMs).toBe(44000);
    expect(result.versions).toHaveLength(2);
    expect(result.versions[0]).toMatchObject({ assetId: "asset-1" });
    expect(result.versions[1]).toMatchObject({
      assetId: "asset-2",
      parentTakeId: result.versions[0].id,
      mediaEdit: { requestId: "request-1", instruction: "add fog" }
    });
    expect(
      composeGenerativeTakePatch(result, "restyle", {
        assetId: "asset-2",
        jobId: "request-1",
        createdAt: "2025-01-02",
        mediaEdit: request
      })
    ).toBe(result);
  });

  it("keeps stale and locked clips unchanged while appending a candidate", () => {
    for (const original of [
      clip({ status: "stale" }),
      clip({ locked: true, status: "generated" })
    ]) {
      const patched = composeGenerativeTakePatch(original, "restyle", {
        assetId: "asset-2",
        createdAt: "2025-01-02"
      });
      expect(patched.status).toBe(original.status);
      expect(patched.locked).toBe(original.locked);
      expect(patched.currentAssetId).toBe(original.currentAssetId);
    }
  });

  it("maps every operation to existing take provenance", () => {
    expect(takeSourceForOperation("extend")).toBe("extended");
    expect(takeSourceForOperation("remove_object")).toBe("inpainted");
    expect(takeSourceForOperation("replace_object")).toBe("object_replace");
    expect(takeSourceForOperation("restyle")).toBe("video_to_video");
    expect(takeSourceForOperation("regenerate")).toBe("generated");
  });
});
