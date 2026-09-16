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

const identity = createAiVideoCandidateVariation({
  batchId: "batch-1",
  documentId: "doc-1",
  destinationKind: "timeline_clip",
  destinationId: "clip-1",
  variationIndex: 2
});

function candidate(overrides: Partial<AiVideoCandidate> = {}): AiVideoCandidate {
  return aiVideoCandidateSchema.parse({
    ...identity,
    targetVersion: 3,
    status: "pending",
    active: false,
    accepted: false,
    ...overrides
  });
}

describe("AI video production protocol", () => {
  it("accepts optional authoring context and validates speech requirements", () => {
    expect(aiVideoCreativeContextSchema.parse({ audience: "Creators" }).audience).toBe(
      "Creators"
    );
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
    expect(identity.variationId).toBe("variation:batch-1:timeline_clip:clip-1:2");
    expect(identity.candidateId).toBe("candidate:variation:batch-1:timeline_clip:clip-1:2");
  });

  it("lands a completed candidate inactive", () => {
    const landed = landAiVideoCandidateInactive(candidate(), "asset-1");
    expect(landed).toMatchObject({ status: "ready", assetId: "asset-1", active: false, accepted: false });
  });

  it("builds preview selection without mutating candidates", () => {
    const pending = candidate();
    const ready = landAiVideoCandidateInactive(pending, "asset-1");
    const preview = selectAiVideoPreview([ready], { "clip-1": ready.candidateId }, {
      batchId: "batch-1",
      documentId: "doc-1"
    });
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
});
