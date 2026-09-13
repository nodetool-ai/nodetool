import { describe, expect, it } from "vitest";

import {
  generationAttachmentStatusSchema,
  generationOutputStatusSchema,
  generationProviderStatusSchema,
  generationStatusSchema,
  generationSubmissionStatusSchema,
  predictionSchema
} from "../src/messages.js";

describe("durable generation lifecycle status", () => {
  it("accepts every public and internal lifecycle state", () => {
    expect(generationStatusSchema.options).toEqual([
      "pending",
      "running",
      "recovering",
      "completed",
      "failed",
      "cancelled",
      "needs_attention",
      "interrupted"
    ]);
    expect(generationSubmissionStatusSchema.parse("submission_unknown")).toBe(
      "submission_unknown"
    );
    expect(generationProviderStatusSchema.parse("succeeded")).toBe("succeeded");
    expect(generationOutputStatusSchema.parse("unavailable")).toBe(
      "unavailable"
    );
    expect(generationAttachmentStatusSchema.parse("target_deleted")).toBe(
      "target_deleted"
    );
  });

  it("carries the durable dimensions on prediction messages", () => {
    expect(
      predictionSchema.parse({
        type: "prediction",
        id: "generation-1",
        user_id: "user-1",
        node_id: "node-1",
        status: "recovering",
        submission_status: "submitted",
        provider_status: "succeeded",
        output_status: "retrying",
        attachment_status: "pending"
      })
    ).toMatchObject({
      status: "recovering",
      submission_status: "submitted",
      provider_status: "succeeded",
      output_status: "retrying",
      attachment_status: "pending"
    });
  });
});
