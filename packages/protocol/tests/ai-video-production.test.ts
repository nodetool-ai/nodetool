import { describe, expect, it } from "vitest";
import {
  aiVideoCreativeContextSchema,
  aiVideoProductionRequirementSchema,
  aiVideoCandidateSchema,
  createAiVideoCandidateVariation,
  landAiVideoCandidateInactive,
  selectAiVideoPreview,
  validateAiVideoAcceptance,
  type AiVideoCandidate
} from "../src/ai-video-production.js";
import {
  creativeContext,
  productionRequirement,
  productionCandidate,
  productionVariationIdentity,
  selectProductionPreview,
  validateProductionAcceptance
} from "../src/production-authoring.js";

const identity = createAiVideoCandidateVariation({
  batchId: "batch-1",
  documentId: "doc-1",
  destinationKind: "timeline_clip",
  destinationId: "clip-1",
  variationIndex: 2
});

function candidate(
  overrides: Partial<AiVideoCandidate> = {}
): AiVideoCandidate {
  const input = {
    ...identity,
    targetVersion: 3,
    status: "pending",
    active: false,
    accepted: false,
    ...overrides
  };
  return aiVideoCandidateSchema.parse({
    ...input,
    snapshot: {
      batchId: input.batchId,
      requestId: input.requestId,
      candidateId: input.candidateId,
      variationId: input.variationId,
      variationIndex: input.variationIndex,
      destinationKind: input.destinationKind,
      destinationId: input.destinationId,
      documentId: input.documentId,
      targetVersion: input.targetVersion,
      operation: "initial_generation"
    }
  });
}

describe("AI video production protocol", () => {
  it("converts legacy camelCase authoring fields to one canonical shape", () => {
    expect(
      aiVideoCreativeContextSchema.parse({
        productName: "Camera",
        approvedClaims: ["Compact"],
        referenceBindings: [
          {
            kind: "product",
            assetId: "camera-photo",
            entityId: "camera",
            label: "Approved"
          }
        ]
      })
    ).toEqual(
      creativeContext.parse({
        product_name: "Camera",
        approved_claims: ["Compact"],
        reference_bindings: [
          {
            kind: "product",
            asset_id: "camera-photo",
            entity_id: "camera",
            label: "Approved"
          }
        ]
      })
    );
    const converted = aiVideoProductionRequirementSchema.parse({
      visualTreatment: "actor_to_camera",
      speechMode: "on_camera",
      speechBinding: {
        scriptLineId: "line-1",
        speakerId: "speaker-1",
        voiceId: "legacy-voice"
      },
      durationMs: 3000,
      speechDurationMs: 2200,
      requestedTakeCount: 3,
      referenceBindings: [{ kind: "character", assetId: "portrait" }]
    });
    expect(converted).toEqual(
      productionRequirement.parse({
        visual_treatment: "actor_to_camera",
        speech_mode: "on_camera",
        speech_binding: {
          script_line_id: "line-1",
          speaker_id: "speaker-1",
          voice_id: "legacy-voice"
        },
        duration_ms: 3000,
        speech_duration_ms: 2200,
        requested_take_count: 3,
        reference_bindings: [{ kind: "character", asset_id: "portrait" }]
      })
    );
    expect(aiVideoProductionRequirementSchema.parse(converted)).toEqual(
      converted
    );
    expect(converted).not.toHaveProperty("speechMode");
    expect(converted.speech_binding).not.toHaveProperty("scriptLineId");
  });

  it("prefers explicit canonical fields and applies the same ownership validation to aliases", () => {
    expect(
      aiVideoCreativeContextSchema.parse({
        productName: "Alias",
        product_name: "Canonical"
      }).product_name
    ).toBe("Canonical");
    expect(
      aiVideoProductionRequirementSchema.safeParse({
        speechMode: "on_camera",
        speechBinding: { scriptLineId: "line-1", text: "Duplicated ownership" }
      }).success
    ).toBe(false);
  });

  it("converts pending and absent request IDs only at the legacy boundary", () => {
    const { requestId: _requestId, ...legacyIdentity } = identity;
    const converted = aiVideoCandidateSchema.parse({
      ...legacyIdentity,
      status: "pending",
      targetVersion: 3,
      active: false,
      accepted: false
    });
    expect(converted.status).toBe("planned");
    expect(converted.requestId).toBe(identity.requestId);
    expect(converted.snapshot).toBeUndefined();
    expect(
      validateAiVideoAcceptance({
        candidates: [landAiVideoCandidateInactive(converted, "legacy-asset")],
        targets: [{ destinationId: "clip-1", targetVersion: 3 }],
        selection: { "clip-1": converted.candidateId },
        batchId: "batch-1",
        documentId: "doc-1"
      })
    ).toMatchObject({
      valid: false,
      issues: ["clip-1: candidate has no captured inputs"]
    });
    expect(productionCandidate.parse(converted)).toEqual(converted);
    expect(
      productionCandidate.safeParse({ ...converted, status: "pending" }).success
    ).toBe(false);
    expect(selectAiVideoPreview).toBe(selectProductionPreview);
    expect(validateAiVideoAcceptance).toBe(validateProductionAcceptance);
  });
  it("accepts optional authoring context and validates speech requirements", () => {
    expect(
      aiVideoCreativeContextSchema.parse({ audience: "Creators" }).audience
    ).toBe("Creators");
    expect(
      aiVideoProductionRequirementSchema.safeParse({
        speechMode: "on_camera",
        speechBinding: { text: "Try it now." },
        requestedTakeCount: 3
      }).success
    ).toBe(true);
    expect(
      aiVideoProductionRequirementSchema.safeParse({
        speechMode: "none",
        speechBinding: { text: "Not valid." }
      }).success
    ).toBe(false);
  });

  it("keeps variation and candidate ids stable regardless of completion order", () => {
    expect(
      createAiVideoCandidateVariation({
        batchId: "batch-1",
        documentId: "doc-1",
        destinationKind: "timeline_clip",
        destinationId: "clip-1",
        variationIndex: 2
      })
    ).toEqual(identity);
    expect(identity.variationId).toBe(
      "variation:batch-1:timeline_clip:clip-1:2"
    );
    expect(identity.candidateId).toBe(
      "candidate:variation:batch-1:timeline_clip:clip-1:2"
    );
    expect(identity).toMatchObject(
      productionVariationIdentity({
        batchId: "batch-1",
        destinationKind: "timeline_clip",
        destinationId: "clip-1",
        variationIndex: 2
      })
    );
  });

  it("lands a completed candidate inactive", () => {
    const landed = landAiVideoCandidateInactive(candidate(), "asset-1");
    expect(landed).toMatchObject({
      status: "ready",
      assetId: "asset-1",
      active: false,
      accepted: false
    });
  });

  it("builds preview selection without mutating candidates", () => {
    const pending = candidate();
    const ready = landAiVideoCandidateInactive(pending, "asset-1");
    const preview = selectAiVideoPreview(
      [ready],
      { "clip-1": ready.candidateId },
      {
        batchId: "batch-1",
        documentId: "doc-1"
      }
    );
    expect(preview.selections).toEqual({ "clip-1": ready.candidateId });
    expect(preview.unresolvedDestinationIds).toEqual([]);
    expect(ready).toMatchObject({ active: false, accepted: false });
  });

  it("rejects the complete acceptance when one selected target conflicts", () => {
    const ready = landAiVideoCandidateInactive(candidate(), "asset-1");
    const result = validateAiVideoAcceptance({
      candidates: [ready],
      targets: [
        { destinationId: "clip-1", targetVersion: 3 },
        { destinationId: "clip-2", targetVersion: 3 }
      ],
      selection: { "clip-1": ready.candidateId },
      batchId: "batch-1",
      documentId: "doc-1"
    });
    expect(result.valid).toBe(false);
    expect(result).toMatchObject({ valid: false });
  });

  it("rejects a selected destination deleted after generation", () => {
    const ready = landAiVideoCandidateInactive(candidate(), "asset-1");
    expect(
      validateAiVideoAcceptance({
        candidates: [ready],
        targets: [],
        selection: { "clip-1": ready.candidateId },
        batchId: "batch-1",
        documentId: "doc-1"
      })
    ).toEqual({
      valid: false,
      issues: ["clip-1: selected destination is missing"]
    });
  });

  it("keeps pending selections unresolved and excludes other documents from preview", () => {
    const pending = candidate();
    const preview = selectAiVideoPreview(
      [
        pending,
        candidate({
          ...createAiVideoCandidateVariation({
            batchId: "batch-1",
            documentId: "other-doc",
            destinationKind: "timeline_clip",
            destinationId: "other-clip",
            variationIndex: 1
          })
        })
      ],
      { "clip-1": pending.candidateId },
      { batchId: "batch-1", documentId: "doc-1" }
    );
    expect(preview.unresolvedDestinationIds).toEqual(["clip-1"]);
  });

  it("keeps three alternatives on one destination with explicit preview despite late completion", () => {
    const variations = [1, 2, 3].map((variationIndex) =>
      candidate({
        ...createAiVideoCandidateVariation({
          batchId: "batch-1",
          documentId: "doc-1",
          destinationKind: "timeline_clip",
          destinationId: "clip-1",
          variationIndex
        })
      })
    );
    const completed = [variations[2], variations[0]].map((value) =>
      landAiVideoCandidateInactive(value, `asset-${value.variationIndex}`)
    );
    const selection = { "clip-1": completed[1].candidateId };
    const before = JSON.stringify(completed);
    const preview = selectAiVideoPreview(completed, selection, {
      batchId: "batch-1",
      documentId: "doc-1"
    });
    const late = landAiVideoCandidateInactive(variations[1], "asset-2");
    expect(
      selectAiVideoPreview([...completed, late], preview.selections, {
        batchId: "batch-1",
        documentId: "doc-1"
      }).selections
    ).toEqual(selection);
    selection["clip-1"] = late.candidateId;
    expect(preview.selections["clip-1"]).toBe(completed[1].candidateId);
    expect(JSON.stringify(completed)).toBe(before);
    expect(completed.map((value) => value.variationIndex)).toEqual([3, 1]);
  });

  it("deduplicates landing without undoing acceptance or replacing the first output", () => {
    const accepted = candidate({
      status: "ready",
      assetId: "asset-1",
      active: true,
      accepted: true
    });
    expect(landAiVideoCandidateInactive(accepted, "asset-1")).toEqual(accepted);
    expect(() =>
      landAiVideoCandidateInactive(accepted, "different-output")
    ).toThrow();
    expect(() =>
      landAiVideoCandidateInactive(
        candidate({ status: "cancelled" }),
        "asset-1"
      )
    ).toThrow();
  });

  it.each([
    { targetVersion: 4 },
    { acceptedCandidateId: "previous" },
    { acceptedAssetId: "imported-asset" },
    { acceptedTakeId: "imported-take" },
    { destinationKind: "storyboard_shot" as const },
    { documentId: "other-doc" },
    { authoringFingerprint: "changed-inputs" }
  ])(
    "rejects a conflicting target atomically without returning a partial candidate list %#",
    (change) => {
      const first = landAiVideoCandidateInactive(candidate(), "asset-1");
      const second = landAiVideoCandidateInactive(
        candidate({
          ...createAiVideoCandidateVariation({
            batchId: "batch-1",
            documentId: "doc-1",
            destinationKind: "timeline_clip",
            destinationId: "clip-2",
            variationIndex: 1
          })
        }),
        "asset-2"
      );
      const candidates = [first, second];
      const before = JSON.stringify(candidates);
      const result = validateAiVideoAcceptance({
        candidates,
        targets: [
          { destinationId: "clip-1", targetVersion: 3 },
          { destinationId: "clip-2", targetVersion: 3, ...change }
        ],
        selection: {
          "clip-1": first.candidateId,
          "clip-2": second.candidateId
        },
        batchId: "batch-1",
        documentId: "doc-1"
      });
      expect(result.valid).toBe(false);
      expect(result).not.toHaveProperty("candidates");
      expect(JSON.stringify(candidates)).toBe(before);
    }
  );

  it("accepts an explicit ready subset and rejects empty or ambiguous selections", () => {
    const ready = landAiVideoCandidateInactive(candidate(), "asset-1");
    const input = {
      candidates: [ready],
      targets: [{ destinationId: "clip-1", targetVersion: 3 }],
      selection: { "clip-1": ready.candidateId },
      batchId: "batch-1",
      documentId: "doc-1"
    };
    expect(validateAiVideoAcceptance(input)).toEqual({
      valid: true,
      candidates: [ready]
    });
    expect(
      validateAiVideoAcceptance({ ...input, selection: {}, targets: [] }).valid
    ).toBe(false);
    expect(
      validateAiVideoAcceptance({
        ...input,
        targets: [...input.targets, ...input.targets]
      }).valid
    ).toBe(false);
    expect(
      validateAiVideoAcceptance({ ...input, candidates: [ready, ready] }).valid
    ).toBe(false);
    expect(
      validateAiVideoAcceptance({ ...input, documentId: "other-doc" }).valid
    ).toBe(false);
    expect(
      validateAiVideoAcceptance({ ...input, batchId: "other-batch" }).valid
    ).toBe(false);
  });
});
