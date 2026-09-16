import { describe, expect, it } from "vitest";
import {
  canTransitionProductionCandidate,
  creativeContext,
  isTerminalProductionCandidateStatus,
  production,
  productionCandidate,
  productionVariationIdentity,
  productionVariationIdentitySchema,
  transitionProductionCandidate
} from "../src/production-authoring.js";

describe("production authoring contract", () => {
  it("validates optional creative context and production requirements", () => {
    expect(
      creativeContext.parse({
        product_name: "Camera",
        audience: "Creators",
        approved_claims: ["Fast setup"]
      })
    ).toMatchObject({ product_name: "Camera" });

    expect(
      production.parse({
        editorial_purpose: "demonstration",
        visual_treatment: "product_close_up",
        speech_mode: "on_camera",
        speech_binding: { text: "See the difference." },
        references: [{ uri: "asset://camera.png", revision: "asset-rev-2" }],
        duration_ms: 3000,
        speech_duration_ms: 2400,
        requested_take_count: 2
      })
    ).toMatchObject({
      speech_mode: "on_camera",
      references: [{ uri: "asset://camera.png", revision: "asset-rev-2" }],
      duration_ms: 3000,
      speech_duration_ms: 2400,
      requested_take_count: 2
    });

    expect(
      production.safeParse({
        speech_mode: "none",
        speech_binding: { text: "Not allowed here." }
      }).success
    ).toBe(false);
  });

  it("creates and validates stable variation identity", () => {
    const input = {
      batchId: "batch-1",
      destinationKind: "storyboard_shot" as const,
      destinationId: "shot-2",
      variationIndex: 2
    };
    const identity = productionVariationIdentity(input);

    expect(productionVariationIdentity(input)).toEqual(identity);
    expect(identity.variationId).toBe(
      "variation:batch-1:storyboard_shot:shot-2:2"
    );
    expect(identity.requestId).toBe(
      "request:candidate:variation:batch-1:storyboard_shot:shot-2:2"
    );
    expect(productionVariationIdentitySchema.safeParse(identity).success).toBe(
      true
    );
    expect(
      productionVariationIdentitySchema.safeParse({
        ...identity,
        candidateId: "other"
      }).success
    ).toBe(false);
  });

  it("enforces candidate lifecycle transitions", () => {
    const identity = productionVariationIdentity({
      batchId: "batch-1",
      destinationKind: "timeline_clip",
      destinationId: "clip-1",
      variationIndex: 1
    });
    const candidate = productionCandidate.parse({
      candidateId: identity.candidateId,
      batchId: identity.batchId,
      requestId: "request-1",
      variationId: identity.variationId,
      variationIndex: identity.variationIndex,
      destinationKind: identity.destinationKind,
      destinationId: identity.destinationId,
      status: "planned",
      snapshot: {
        batchId: identity.batchId,
        requestId: "request-1",
        candidateId: identity.candidateId,
        variationId: identity.variationId,
        variationIndex: identity.variationIndex,
        destinationKind: identity.destinationKind,
        destinationId: identity.destinationId,
        operation: "initial_generation"
      }
    });

    expect(canTransitionProductionCandidate("planned", "queued")).toBe(true);
    expect(canTransitionProductionCandidate("ready", "generating")).toBe(
      false
    );
    expect(isTerminalProductionCandidateStatus("failed")).toBe(true);
    expect(
      transitionProductionCandidate(
        transitionProductionCandidate(candidate, "queued"),
        "generating"
      ).status
    ).toBe("generating");
    expect(() => transitionProductionCandidate(candidate, "ready")).toThrow(
      "Cannot transition"
    );
  });
});
