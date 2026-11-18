import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { ModelObserver, Storyboard, initTestDb } from "@nodetool-ai/models";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";

import {
  prepareVideoProduction,
  preflightVideoProduction,
  previewVideoProductionSelection,
  acceptVideoProductionCandidates,
  inspectVideoProductionCandidates,
  submitVideoProduction,
  validateVideoProductionAcceptance,
  type VideoProductionCandidate
} from "../src/capabilities/video-production.js";

const REQUEST = {
  batch_id: "batch-1",
  authorization: { owner_id: "owner-1", project_id: "project-1" },
  destination: {
    document_id: "storyboard-1",
    target_type: "storyboard_shot" as const,
    target_id: "shot-1",
    target_revision: "revision-1"
  },
  review: { status: "reviewed" as const, plan_fingerprint: "plan-1" },
  operation: "initial_generation" as const,
  visual_treatment: "product_close_up" as const,
  speech_mode: "none" as const,
  route: "reference_to_video" as const,
  provider: "fake",
  model: "reference-model",
  prompt: "A product rotates on a clean studio table.",
  required_reference_asset_ids: ["product-asset"],
  reference_asset_ids: ["product-asset"],
  candidate_count: 2,
  timing: {
    requested_duration_ms: 5_000,
    playable_start_ms: 0,
    playable_duration_ms: 5_000
  },
  output_format: "video/mp4",
  generation_params: { aspect_ratio: "9:16" }
};

function readyCandidates(): VideoProductionCandidate[] {
  const prepared = prepareVideoProduction(REQUEST);
  if ("code" in prepared) {
    throw new Error(prepared.message);
  }
  return prepared.candidate_requests.map((request) => ({
    ...request,
    status: "ready",
    assetId: `asset-${request.variationIndex}`,
    asset_ids: [`asset-${request.variationIndex}`],
    documentId: REQUEST.destination.document_id,
    document_id: REQUEST.destination.document_id,
    authorization: REQUEST.authorization,
    preconditions: request.snapshot.preconditions,
    active: false,
    accepted: false,
    timing: {
      requested_duration_ms: 5_000,
      playable_duration_ms: 5_000,
      output_duration_ms: 5_000,
      status: "valid"
    }
  }));
}

describe("AI-video production capability contract", () => {
  it("prepare_video_production requires a reviewed request and validates its references", () => {
    expect(preflightVideoProduction(REQUEST)).toMatchObject({
      ok: true,
      request: { prompt: REQUEST.prompt }
    });

    expect(
      preflightVideoProduction({
        ...REQUEST,
        review: { status: "draft", plan_fingerprint: "plan-1" }
      })
    ).toMatchObject({ ok: false, error: { code: "review_required" } });

    expect(
      preflightVideoProduction({
        ...REQUEST,
        reference_asset_ids: []
      })
    ).toMatchObject({
      ok: false,
      error: { code: "required_reference_assets_missing" }
    });
  });

  it("prepare_video_production freezes stable candidate identities before dispatch", () => {
    const prepared = prepareVideoProduction(REQUEST);
    if ("code" in prepared) {
      throw new Error(prepared.message);
    }

    expect(prepared.candidate_requests).toEqual([
      expect.objectContaining({
        candidateId:
          "candidate:variation:batch-1:storyboard_shot:shot-1:1",
        requestId:
          "request:candidate:variation:batch-1:storyboard_shot:shot-1:1",
        variationIndex: 1
      }),
      expect.objectContaining({
        candidateId:
          "candidate:variation:batch-1:storyboard_shot:shot-1:2",
        requestId:
          "request:candidate:variation:batch-1:storyboard_shot:shot-1:2",
        variationIndex: 2
      })
    ]);
    expect(prepared.candidate_requests[0]?.snapshot).toMatchObject({
      documentId: "storyboard-1",
      referenceAssetIds: ["product-asset"],
      requestedDurationMs: 5_000
    });
    expect(Object.isFrozen(prepared.candidate_requests[0]?.snapshot)).toBe(
      true
    );
  });

  it("prepare_video_production rejects text-only routes when references would be dropped", () => {
    expect(
      preflightVideoProduction({ ...REQUEST, route: "text_to_video" })
    ).toMatchObject({ ok: false, error: { code: "text_only_route_rejected" } });
  });

  it("prepare_video_production rejects unsupported on-camera fallback and speech that exceeds the slot", () => {
    const speechRequest = {
      ...REQUEST,
      speech_mode: "on_camera" as const,
      route: "reference_to_video" as const,
      speech_snapshot: {
        text: "Watch this.",
        audio_asset_id: "audio-1",
        entity_id: "character-1",
        measured_duration_ms: 6_000,
        word_timings: []
      },
      character_reference_asset_id: "character-1",
      performance_source_asset_id: "face-video-1",
      reference_asset_ids: ["product-asset", "character-1", "face-video-1"],
      required_reference_asset_ids: ["face-video-1"]
    };
    expect(preflightVideoProduction(speechRequest)).toMatchObject({
      ok: false,
      error: { code: "on_camera_route_required" }
    });
  });

  it("submit_video_production rejects malformed manifests, inspect_video_production_candidates returns preview-only selections, and accept_video_production_candidates validates an explicit acceptance set", async () => {
    const candidates = readyCandidates();
    const preview = previewVideoProductionSelection(candidates, {
      kind: "preview_take",
      batch_id: "batch-1",
      document_id: "storyboard-1",
      selection: {
        "shot-1": candidates[0]?.candidateId
      }
    });
    expect(preview).toMatchObject({
      kind: "preview_take",
      persisted: false,
      autosave: false,
      exportable: false
    });

    const accepted = validateVideoProductionAcceptance(
      candidates,
      [candidates[0]?.candidateId ?? ""],
      "revision-1"
    );
    expect(accepted).toMatchObject({ ok: true });

    await expect(
      submitVideoProduction.impl({} as never, { prepared: {} })
    ).resolves.toMatchObject({
      ok: false,
      code: "prepared_schema_unsupported"
    });
    await expect(
      inspectVideoProductionCandidates.impl({} as never, { candidates: [] })
    ).resolves.toMatchObject({ ok: false, code: "candidates_required" });
    await expect(
      acceptVideoProductionCandidates.impl({} as never, {})
    ).resolves.toMatchObject({ ok: false, code: "acceptance_request_invalid" });
  });
});

/**
 * A revision conflict names the revision the target is at and the one the
 * caller held, and says nothing was written, so the caller can re-read instead
 * of repeating the same stale call.
 */
describe("video production revision conflicts", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  const run = () =>
    createCapabilityRun({
      context: { userId: "owner-1" } as unknown as ProcessingContext,
      gate: UNGATED
    });

  /** A storyboard row the destination resolves, at revision 1. */
  async function destinationBoard() {
    return Storyboard.create<Storyboard>({
      id: "storyboard-1",
      user_id: "owner-1",
      project_id: "project-1",
      name: "Board",
      document: JSON.stringify({
        screenplay: null,
        entityIds: [],
        aspectRatio: "9:16",
        shots: [
          {
            type: "shot",
            id: "shot-1",
            index: 0,
            action: "beat",
            status: "planned",
            duration_seconds: 5
          }
        ]
      })
    });
  }

  it("names both revisions when a selected candidate targets another one", () => {
    const candidates = readyCandidates();
    const result = validateVideoProductionAcceptance(
      candidates,
      [candidates[0]?.candidateId ?? ""],
      "revision-2"
    );
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "target_revision_conflict",
        message: expect.stringContaining('targets revision "revision-1", not "revision-2"')
      }
    });
  });

  it("submit names the target's revision and the prepared one", async () => {
    const board = await destinationBoard();
    const prepared = prepareVideoProduction(REQUEST);
    if ("code" in prepared) throw new Error(prepared.message);
    const result = await submitVideoProduction.impl(run(), { prepared });
    expect(result).toMatchObject({
      ok: false,
      code: "target_revision_conflict",
      target_revision: String(board.revision),
      error:
        `The target is at revision "${board.revision}", but the request was ` +
        `prepared against "revision-1". Nothing was submitted. Prepare the ` +
        `request again.`
    });
  });

  it("accept names the destination's revision and the expected one", async () => {
    const board = await destinationBoard();
    const candidates = readyCandidates().map((candidate) => ({
      ...candidate,
      result: {
        sourceDurationMs: 5_000,
        playableWindow: { startMs: 0, endMs: 5_000 }
      }
    }));
    const result = await acceptVideoProductionCandidates.impl(run(), {
      action: "use_take",
      batch_id: "batch-1",
      document_id: "storyboard-1",
      project_id: "project-1",
      candidates,
      selection: { "shot-1": candidates[0]?.candidateId },
      targets: [
        {
          destination_id: "shot-1",
          destination_kind: "storyboard_shot",
          expected_target_revision: "revision-1"
        }
      ]
    });
    expect(result).toMatchObject({
      ok: false,
      code: "target_revision_conflict",
      error:
        `Destination shot-1 is at revision "${board.revision}", not ` +
        `"revision-1". Nothing was accepted. Inspect the candidates again.`
    });
  });
});
