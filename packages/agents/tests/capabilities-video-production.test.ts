import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Prediction, initTestDb } from "@nodetool-ai/models";
import {
  createCapabilityRun,
  UNGATED
} from "../src/capabilities/invoke.js";
import {
  preflightVideoProduction,
  prepareVideoProduction
} from "../src/capabilities/video-production.js";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";

const REQUEST = {
  batch_id: "batch-1",
  destination: {
    document_id: "storyboard-1",
    target_type: "storyboard_shot",
    target_id: "shot-1",
    target_revision: "rev-1"
  },
  route: "reference_to_video",
  provider: "fake",
  model: "reference-model",
  prompt: "A product rotates on a clean studio table.",
  required_reference_asset_ids: ["product-asset"],
  reference_asset_ids: ["product-asset"],
  candidate_count: 2,
  generation_params: { duration_seconds: 5, aspect_ratio: "9:16" }
};

function asContext(value: Record<string, unknown>): ProcessingContext {
  return value as unknown as ProcessingContext;
}

function tool(name: string, context: ProcessingContext) {
  return toolForCapabilityName(name, () =>
    createCapabilityRun({ context, gate: UNGATED })
  );
}

describe("AI-video production capability contract", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("prepares stable candidate and request identities without reading assets", async () => {
    const resolveAssetBytes = vi.fn();
    const context = asContext({ userId: "u1", resolveAssetBytes });
    const result = (await tool("prepare_video_production", context).process(
      context,
      REQUEST
    )) as {
      ok: boolean;
      prepared: {
        batch_id: string;
        request: { prompt: string };
        candidate_requests: Array<{
          candidate_id: string;
          request_id: string;
          variation_index: number;
        }>;
      };
    };

    expect(result.ok).toBe(true);
    expect(result.prepared.request.prompt).toBe(REQUEST.prompt);
    expect(result.prepared.candidate_requests).toEqual([
      {
        candidate_id: "batch-1:candidate:1",
        request_id: "batch-1:request:1",
        variation_index: 0
      },
      {
        candidate_id: "batch-1:candidate:2",
        request_id: "batch-1:request:2",
        variation_index: 1
      }
    ]);
    expect(resolveAssetBytes).not.toHaveBeenCalled();
  });

  it("rejects missing required reference ids and text-only routes before spend", () => {
    const missing = preflightVideoProduction({
      ...REQUEST,
      reference_asset_ids: []
    });
    expect(missing).toMatchObject({
      ok: false,
      error: { code: "required_reference_assets_missing" }
    });

    const textOnly = prepareVideoProduction({
      ...REQUEST,
      route: "text_to_video"
    });
    expect(textOnly).toMatchObject({ code: "text_only_route_rejected" });
  });

  it("resolves required assets before calling the existing generation seam", async () => {
    const resolveAssetBytes = vi.fn(async (uri: string) => ({
      bytes: uri === "asset://product-asset" ? new Uint8Array([1, 2, 3]) : null,
      attempts: []
    }));
    const runGeneration = vi.fn(async (request: Record<string, unknown>) => ({
      id: request.id,
      output: new Uint8Array([0]),
      assets: [{ asset_id: `generated-${String(request.id)}` }],
      receipt: null,
      duration_ms: 1
    }));
    const context = asContext({
      userId: "u1",
      jobId: "job-1",
      resolveAssetBytes,
      runGeneration
    });
    const prepared = (await tool("prepare_video_production", context).process(
      context,
      REQUEST
    )) as { prepared: Record<string, unknown> };

    const submitted = (await tool("submit_video_production", context).process(
      context,
      { prepared: prepared.prepared }
    )) as {
      ok: boolean;
      candidates: Array<{
        candidate_id: string;
        request_id: string;
        status: string;
        accepted: boolean;
        asset_ids: string[];
      }>;
    };

    expect(submitted.ok).toBe(true);
    expect(resolveAssetBytes).toHaveBeenCalledWith("asset://product-asset");
    expect(runGeneration).toHaveBeenCalledTimes(2);
    expect(runGeneration.mock.calls[0]?.[0]).toMatchObject({
      id: "batch-1:request:1",
      capability: "reference_to_video",
      destination: {
        document_id: "storyboard-1",
        target_type: "storyboard_shot",
        target_id: "shot-1",
        selected: false
      }
    });
    expect(runGeneration.mock.calls[0]?.[0].params).toMatchObject({
      prompt: REQUEST.prompt,
      duration_seconds: 5,
      reference_images: [new Uint8Array([1, 2, 3])],
      reference_videos: []
    });
    expect(submitted.candidates).toMatchObject([
      {
        candidate_id: "batch-1:candidate:1",
        request_id: "batch-1:request:1",
        status: "ready",
        accepted: false,
        asset_ids: ["generated-batch-1:request:1"]
      },
      {
        candidate_id: "batch-1:candidate:2",
        request_id: "batch-1:request:2",
        status: "ready",
        accepted: false,
        asset_ids: ["generated-batch-1:request:2"]
      }
    ]);
  });

  it("does not submit when a reference id cannot be resolved", async () => {
    const runGeneration = vi.fn();
    const context = asContext({
      userId: "u1",
      jobId: "job-1",
      resolveAssetBytes: vi.fn(async () => ({ bytes: null, attempts: [] })),
      runGeneration
    });
    const prepared = prepareVideoProduction(REQUEST);
    if ("code" in prepared) throw new Error(prepared.message);

    const result = (await tool("submit_video_production", context).process(
      context,
      { prepared }
    )) as { code: string; error: string };
    expect(result.code).toBe("reference_asset_unavailable");
    expect(result.error).toContain("No provider call was submitted");
    expect(runGeneration).not.toHaveBeenCalled();
  });

  it("refreshes candidate state from the existing generation ledger", async () => {
    await Prediction.create<Prediction>({
      id: "batch-1:request:1",
      user_id: "u1",
      provider: "fake",
      model: "reference-model",
      capability: "reference_to_video",
      status: "completed",
      asset_ids: ["generated-1"],
      created_at: new Date().toISOString()
    });
    const context = asContext({ userId: "u1", jobId: "job-1" });
    const candidate = {
      candidate_id: "batch-1:candidate:1",
      batch_id: "batch-1",
      request_id: "batch-1:request:1",
      generation_id: "batch-1:request:1",
      variation_index: 0,
      destination: REQUEST.destination,
      route: "reference_to_video",
      provider: "fake",
      model: "reference-model",
      asset_ids: [],
      status: "running",
      accepted: false
    };

    const result = (await tool(
      "inspect_video_production_candidates",
      context
    ).process(context, { candidates: [candidate] })) as {
      candidates: Array<{ status: string; asset_ids: string[]; accepted: boolean }>;
    };
    expect(result.candidates).toEqual([
      expect.objectContaining({
        status: "ready",
        asset_ids: ["generated-1"],
        accepted: false
      })
    ]);
  });

  it("returns a validated non-mutating acceptance manifest", async () => {
    const updateTimelineSequence = vi.fn();
    const context = asContext({
      userId: "u1",
      updateTimelineSequence
    });
    const candidate = {
      candidate_id: "batch-1:candidate:1",
      batch_id: "batch-1",
      request_id: "batch-1:request:1",
      generation_id: "generation-1",
      variation_index: 0,
      destination: REQUEST.destination,
      route: "reference_to_video",
      provider: "fake",
      model: "reference-model",
      asset_ids: ["generated-1"],
      status: "ready",
      accepted: false
    };

    const result = (await tool(
      "accept_video_production_candidates",
      context
    ).process(context, {
      candidates: [candidate],
      candidate_ids: [candidate.candidate_id],
      expected_target_revision: "rev-1"
    })) as {
      ok: boolean;
      outcome: string;
      mutation_applied: boolean;
      live_target_validated: boolean;
      requires_destination_apply: boolean;
      accepted_candidate_ids: string[];
      acceptance_manifest: {
        schema_version: string;
        document_id: string;
        batch_id: string;
        expected_target_revision: string;
        selection: Array<{
          candidate_id: string;
          asset_id: string;
          destination: typeof REQUEST.destination;
        }>;
      };
      message: string;
    };
    expect(result).toEqual({
      ok: true,
      outcome: "validated_acceptance_manifest",
      mutation_applied: false,
      live_target_validated: false,
      requires_destination_apply: true,
      accepted_candidate_ids: [],
      acceptance_manifest: {
        schema_version: "ai-video-production.acceptance.v1",
        document_id: "storyboard-1",
        batch_id: "batch-1",
        expected_target_revision: "rev-1",
        selection: [
          {
            candidate_id: "batch-1:candidate:1",
            request_id: "batch-1:request:1",
            generation_id: "generation-1",
            variation_index: 0,
            asset_id: "generated-1",
            destination: REQUEST.destination
          }
        ]
      },
      message:
        "The candidate manifest is internally valid for destination handoff. No live target was validated, no document was mutated, and no candidate was marked accepted. The destination-specific apply adapter must revalidate the live target before applying it."
    });
    expect(updateTimelineSequence).not.toHaveBeenCalled();
  });

  it("rejects two candidates for one destination without claiming mutation", async () => {
    const context = asContext({ userId: "u1" });
    const candidate = {
      candidate_id: "batch-1:candidate:1",
      batch_id: "batch-1",
      request_id: "batch-1:request:1",
      variation_index: 0,
      destination: REQUEST.destination,
      route: "reference_to_video",
      provider: "fake",
      model: "reference-model",
      asset_ids: ["generated-1"],
      status: "ready",
      accepted: false
    };
    const other = { ...candidate, candidate_id: "batch-1:candidate:2", variation_index: 1 };
    const result = (await tool(
      "accept_video_production_candidates",
      context
    ).process(context, {
      candidates: [candidate, other],
      candidate_ids: [candidate.candidate_id, other.candidate_id]
    })) as {
      ok: boolean;
      code: string;
      mutation_applied: boolean;
      live_target_validated: boolean;
      accepted_candidate_ids: string[];
    };
    expect(result).toMatchObject({
      ok: false,
      code: "multiple_candidates_for_slot",
      mutation_applied: false,
      live_target_validated: false,
      accepted_candidate_ids: []
    });
  });

  it("rejects unsupported protocol destinations", async () => {
    const context = asContext({ userId: "u1" });
    const candidate = {
      candidate_id: "batch-1:candidate:1",
      batch_id: "batch-1",
      request_id: "batch-1:request:1",
      variation_index: 0,
      destination: { ...REQUEST.destination, target_type: "unknown_surface" },
      route: "reference_to_video",
      provider: "fake",
      model: "reference-model",
      asset_ids: ["generated-1"],
      status: "ready",
      accepted: false
    };
    const result = (await tool(
      "accept_video_production_candidates",
      context
    ).process(context, {
      candidates: [candidate],
      candidate_ids: [candidate.candidate_id]
    })) as { code: string; mutation_applied: boolean };

    expect(result).toMatchObject({
      code: "unsupported_destination_type",
      mutation_applied: false
    });
  });

  it("rejects selections spanning batches or documents", async () => {
    const context = asContext({ userId: "u1" });
    const candidate = {
      candidate_id: "batch-1:candidate:1",
      batch_id: "batch-1",
      request_id: "batch-1:request:1",
      variation_index: 0,
      destination: REQUEST.destination,
      route: "reference_to_video",
      provider: "fake",
      model: "reference-model",
      asset_ids: ["generated-1"],
      status: "ready",
      accepted: false
    };
    const otherBatch = {
      ...candidate,
      candidate_id: "batch-2:candidate:1",
      batch_id: "batch-2",
      request_id: "batch-2:request:1",
      destination: { ...REQUEST.destination, target_id: "shot-2" }
    };
    const batchResult = (await tool(
      "accept_video_production_candidates",
      context
    ).process(context, {
      candidates: [candidate, otherBatch],
      candidate_ids: [candidate.candidate_id, otherBatch.candidate_id]
    })) as { code: string };
    expect(batchResult.code).toBe("multiple_batches_selected");

    const otherDocument = {
      ...candidate,
      candidate_id: "batch-1:candidate:2",
      request_id: "batch-1:request:2",
      variation_index: 1,
      destination: {
        ...REQUEST.destination,
        document_id: "storyboard-2",
        target_id: "shot-2"
      }
    };
    const documentResult = (await tool(
      "accept_video_production_candidates",
      context
    ).process(context, {
      candidates: [candidate, otherDocument],
      candidate_ids: [candidate.candidate_id, otherDocument.candidate_id]
    })) as { code: string };
    expect(documentResult.code).toBe("multiple_documents_selected");
  });
});
