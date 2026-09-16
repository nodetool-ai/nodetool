import { describe, expect, it } from "vitest";
import {
  canTransitionProductionCandidate,
  creativeContext,
  isTerminalProductionCandidateStatus,
  production,
  productionCandidate,
  productionVariationIdentity,
  productionVariationIdentitySchema,
  transitionProductionCandidate,
  validateProductionAcceptance
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

  it("keeps linked words owned by the Script and permits local speech without one", () => {
    expect(
      production.safeParse({
        speech_mode: "on_camera",
        speech_binding: {
          script_line_id: "line-1",
          text: "A second editable copy"
        }
      }).success
    ).toBe(false);
    expect(
      production.safeParse({
        speech_mode: "on_camera",
        speech_binding: {
          text: "Locally owned",
          voice: { provider: "test", model: "tts", voice: "actor" }
        }
      }).success
    ).toBe(true);
  });

  it("rejects disagreement between a candidate and every captured identity field", () => {
    const identity = productionVariationIdentity({
      batchId: "batch-1",
      destinationKind: "timeline_clip",
      destinationId: "clip-1",
      variationIndex: 1
    });
    for (const change of [
      { batchId: "other" },
      { requestId: "other" },
      { variationId: "other" },
      { variationIndex: 2 },
      { destinationKind: "storyboard_shot" },
      { destinationId: "other" }
    ]) {
      expect(
        productionCandidate.safeParse({
          ...identity,
          status: "planned",
          snapshot: { ...identity, operation: "initial_generation", ...change }
        }).success,
        JSON.stringify(change)
      ).toBe(false);
    }
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
    expect(canTransitionProductionCandidate("ready", "generating")).toBe(false);
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

  it("rejects a selection for a destination that is no longer live", () => {
    const identity = productionVariationIdentity({
      batchId: "batch-1",
      destinationKind: "timeline_clip",
      destinationId: "deleted-clip",
      variationIndex: 1
    });
    const candidate = productionCandidate.parse({
      ...identity,
      status: "ready",
      assetId: "asset-1",
      snapshot: {
        ...identity,
        operation: "initial_generation"
      }
    });

    const result = validateProductionAcceptance({
      candidates: [candidate],
      targets: [],
      selection: { "deleted-clip": candidate.candidateId },
      batchId: "batch-1"
    });

    expect(result).toEqual({
      valid: false,
      issues: ["deleted-clip: selected destination is missing"]
    });
  });

  it("rejects a live destination whose selected candidate is missing", () => {
    const result = validateProductionAcceptance({
      candidates: [],
      targets: [{ destinationKind: "timeline_clip", destinationId: "clip-1" }],
      selection: { "clip-1": "missing-candidate" },
      batchId: "batch-1"
    });

    expect(result).toEqual({
      valid: false,
      issues: ["clip-1: candidate is missing"]
    });
  });

  it("accepts one ready candidate for each live destination", () => {
    const first = productionVariationIdentity({
      batchId: "batch-1",
      destinationKind: "timeline_clip",
      destinationId: "clip-1",
      variationIndex: 1
    });
    const second = productionVariationIdentity({
      batchId: "batch-1",
      destinationKind: "timeline_clip",
      destinationId: "clip-2",
      variationIndex: 1
    });
    const candidates = [first, second].map((identity) =>
      productionCandidate.parse({
        ...identity,
        status: "ready",
        assetId: `asset-${identity.destinationId}`,
        snapshot: {
          ...identity,
          operation: "initial_generation"
        }
      })
    );

    const result = validateProductionAcceptance({
      candidates,
      targets: [
        { destinationKind: "timeline_clip", destinationId: "clip-1" },
        { destinationKind: "timeline_clip", destinationId: "clip-2" }
      ],
      selection: {
        "clip-1": candidates[0].candidateId,
        "clip-2": candidates[1].candidateId
      },
      batchId: "batch-1"
    });

    expect(result).toMatchObject({ valid: true, candidates });
  });
});
