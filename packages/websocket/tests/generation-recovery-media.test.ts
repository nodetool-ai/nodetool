/**
 * Recovery of the response shapes the live fal provider supports has to save
 * their media. A shape the decoder treats as structured is marked ready with
 * no download and no asset, which completes a paid generation with nothing
 * saved — so these run the real host finalizer, not a stub.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.ASSET_FOLDER = mkdtempSync(join(tmpdir(), "nt-recovery-test-"));

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Asset,
  GenerationAttempt,
  Prediction,
  Storyboard,
  TimelineSequence,
  initTestDb
} from "@nodetool-ai/models";
import { captureMediaEditSourceContext, createMediaEditRequest, ensureBaselineTake, makeClip, makeTrack } from "@nodetool-ai/timeline";
import { createFalGenerationLifecycleHooks } from "@nodetool-ai/execution";
import { boardRenderContext, planShotRenders, renderShots } from "@nodetool-ai/storyboard";
import type { RenderGenerationRequest, StoryboardRenderHost } from "@nodetool-ai/storyboard";
import { isVersionStale } from "@nodetool-ai/protocol";

const fetchExternalMedia = vi.fn();
const storeAssetWithThumbnail = vi.fn();

vi.mock("@nodetool-ai/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@nodetool-ai/runtime")>()),
  fetchExternalMedia: (...args: unknown[]) => fetchExternalMedia(...args)
}));
vi.mock("../src/lib/thumbnail.js", () => ({
  storeAssetWithThumbnail: (...args: unknown[]) =>
    storeAssetWithThumbnail(...args)
}));

const { createGenerationRecoveryWorker } =
  await import("../src/generation-recovery.js");

const MEDIA = new Uint8Array([1, 2, 3, 4]);

async function dueAttempt(id: string): Promise<GenerationAttempt> {
  const accepted = await Prediction.acceptGenerationWithAttempt({
    id,
    user_id: "u1",
    provider: "fal_ai",
    model: "fal-ai/minimax/speech-02-hd",
    idempotency_key: id,
    input_fingerprint: `${id}-fingerprint`,
    provider_account_ref: "user:u1:secret:FAL_API_KEY",
    endpoint: "fal-ai/minimax/speech-02-hd"
  });
  await accepted.attempt.update({
    submission_status: "submitted",
    provider_status: "queued",
    provider_request_id: `${id}-request`,
    endpoint: "fal-ai/minimax/speech-02-hd",
    provider_account_ref: "user:u1:secret:FAL_API_KEY",
    next_check_at: "2026-01-01T00:00:00.000Z"
  });
  return accepted.attempt;
}

function scriptedQueue(result: Record<string, unknown>): {
  bind: ReturnType<typeof vi.fn>;
  wait: ReturnType<typeof vi.fn>;
} {
  return {
    bind: vi.fn().mockResolvedValue({ bound: true }),
    wait: vi.fn().mockResolvedValue({ state: "succeeded", result })
  };
}

describe("durable recovery of fal media responses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchExternalMedia.mockResolvedValue(
      new Response(MEDIA, { headers: { "content-type": "audio/mpeg" } })
    );
    storeAssetWithThumbnail.mockResolvedValue(undefined);
    initTestDb();
  });

  it.each([
    ["audio_url", "https://fal.media/speech.mp3"],
    ["video_url", "https://fal.media/clip.mp4"]
  ])("saves a flat %s result as an asset", async (key, url) => {
    const generationId = `gen-${key}`;
    await dueAttempt(generationId);
    const queue = scriptedQueue({ [key]: url });

    await createGenerationRecoveryWorker({
      provider: { queueFor: async () => queue as never },
      now: () => new Date("2026-01-01T00:01:00.000Z")
    }).runOnce();

    expect(fetchExternalMedia).toHaveBeenCalledWith(url, expect.any(Object));
    expect(storeAssetWithThumbnail).toHaveBeenCalledTimes(1);
    const generation = await Prediction.find(generationId);
    expect(generation?.status).toBe("completed");
    expect(generation?.output_status).toBe("ready");
    expect(generation?.asset_ids).toHaveLength(1);
    const asset = await Asset.find("u1", generation?.asset_ids?.[0] ?? "");
    expect(asset?.content_type).toBe("audio/mpeg");
    // The name every reader looks the bytes up by.
    expect(storeAssetWithThumbnail.mock.calls[0][2]).toBe(
      `${asset?.id}.mp3`
    );
  });

  it("still saves the nested envelope beside its structured fields", async () => {
    await dueAttempt("gen-envelope");
    const queue = scriptedQueue({
      audio: { url: "https://fal.media/nested.mp3" },
      duration: 3.5
    });

    await createGenerationRecoveryWorker({
      provider: { queueFor: async () => queue as never },
      now: () => new Date("2026-01-01T00:01:00.000Z")
    }).runOnce();

    expect(storeAssetWithThumbnail).toHaveBeenCalledTimes(1);
    const generation = await Prediction.find("gen-envelope");
    expect(generation?.status).toBe("completed");
    expect(generation?.asset_ids).toHaveLength(1);
  });

  it.each([
    ["storyboard_keyframe", "image/png", "keyframe", undefined],
    ["storyboard_clip", "video/mp4", "clip", undefined],
    ["storyboard_keyframe", "image/png", "keyframe", { render_inputs: { kind: "clip" } }],
    ["storyboard_clip", "video/mp4", "clip", { render_inputs: { kind: "keyframe" } }]
  ] as const)("attaches an interrupted %s render to its intended shot", async (targetType, mime, kind, provenance) => {
    const board = await Storyboard.create<Storyboard>({
      user_id: "u1",
      name: "Interrupted render",
      document: JSON.stringify({
        shots: [{
          type: "shot",
          id: "shot-1",
          index: 0,
          action: "A lighthouse",
          status: "planned"
        }],
        style: "",
        aspectRatio: "16:9"
      })
    });
    const asset = await Asset.create<Asset>({
      user_id: "u1",
      name: "recovered",
      content_type: mime
    });
    const generationId = `gen-interrupted-${kind}`;
    const request = {
      provider: "fal_ai",
      capability: kind === "keyframe" ? "text_to_image" : "text_to_video",
      model: "fal-ai/test",
      params: { prompt: "A lighthouse" },
      destination: {
        document_id: board.id,
        target_type: targetType,
        target_id: "shot-1",
        selected: true,
        provenance
      }
    };
    const hooks = createFalGenerationLifecycleHooks({ userId: "u1", callbacks: false });
    await hooks.onGenerationAccepted?.({ generationId, request });
    await hooks.onGenerationTerminal?.({
      generationId,
      request,
      status: "completed",
      output: { url: "https://fal.media/recovered" },
      receipt: null,
      assetIds: [asset.id]
    });
    expect((await Storyboard.findById(board.id))?.toDocument().shots[0][kind]).toBeUndefined();
    const queueFor = vi.fn(() => {
      throw new Error("Saved outputs must recover without another provider request");
    });
    const worker = createGenerationRecoveryWorker({
      provider: { queueFor },
      now: () => new Date(Date.now() + 5 * 60_000)
    });
    await worker.runOnce();
    await worker.runOnce();
    const shot = (await Storyboard.findById(board.id))?.toDocument().shots[0];
    expect(shot?.[kind]?.asset_id).toBe(asset.id);
    expect(shot?.[kind]?.render_provenance).toBe("unknown");
    expect(shot?.[kind]?.render_inputs).toBeUndefined();
    expect(kind === "keyframe" ? shot?.keyframe_versions : shot?.clip_versions).toHaveLength(1);
    expect((await Prediction.find(generationId))?.attachment_status).toBe("attached");
    expect(queueFor).not.toHaveBeenCalled();
  });
  it.each(["keyframe", "clip"] as const)(
    "retains submitted %s provenance after an in-flight edit and repeated recovery",
    async (kind) => {
      const initial = {
        screenplay: null,
        brief: "",
        style: "cool light",
        entityIds: [],
        aspectRatio: "16:9",
        setupStage: "done",
        genre: "",
        directorModel: null,
        imageModel: {
          type: "image_model",
          id: "fal-ai/test-image",
          provider: "fal_ai"
        },
        videoModel: {
          type: "video_model",
          id: "fal-ai/test-video",
          provider: "fal_ai"
        },
        shots: [
          {
            type: "shot",
            id: "shot-1",
            index: 0,
            action: "A lighthouse",
            status: "planned",
            render_mode: "direct",
            ...(kind === "clip"
              ? {
                  production: {
                    schema_version: 1,
                    speech_mode: "none",
                    requested_take_count: 1,
                    local_direction: "Slow orbit",
                    duration_ms: 6000,
                    reference_bindings: []
                  }
                }
              : {})
          }
        ]
      };
      const normal = await Storyboard.create<Storyboard>({
        user_id: "u1",
        name: "Normal",
        document: JSON.stringify(initial)
      });
      const interrupted = await Storyboard.create<Storyboard>({
        user_id: "u1",
        name: "Interrupted",
        document: JSON.stringify(initial)
      });
      const asset = await Asset.create<Asset>({
        user_id: "u1",
        name: "render",
        content_type: kind === "keyframe" ? "image/png" : "video/mp4"
      });
      const hooks = createFalGenerationLifecycleHooks({
        userId: "u1",
        callbacks: false
      });
      let submitted: RenderGenerationRequest | undefined;
      const makeHost = (
        rowId: string,
        interrupt: boolean
      ): StoryboardRenderHost => ({
        runGeneration: async (request) => {
          if (interrupt) {
            submitted = request;
            await hooks.onGenerationAccepted?.({
              generationId: request.id,
              request
            });
            expect(
              (await Prediction.find(request.id))?.metadata?.attachments
            ).toEqual([request.destination]);
            await hooks.onGenerationTerminal?.({
              generationId: request.id,
              request,
              status: "completed",
              output: { url: "https://fal.media/recovered" },
              receipt: null,
              assetIds: [asset.id]
            });
            const row = (await Storyboard.findById(rowId))!;
            const edited = row.toDocument();
            edited.style = "warm light";
            edited.shots[0].action = "A forest";
            if (edited.shots[0].production) {
              edited.shots[0].production.local_direction = "Fast pan";
            }
            await Storyboard.updateFieldsIfUnchanged(rowId, row.updated_at, {
              document: JSON.stringify(edited)
            });
          }
          return {
            output: MEDIA,
            assets: [{ asset_id: asset.id, uri: `asset://${asset.id}` }]
          };
        },
        getStoryboard: async () => {
          if (interrupt && submitted) {
            return null;
          }
          const row = (await Storyboard.findById(rowId))!;
          return { document: row.toDocument(), updatedAt: row.updated_at };
        },
        updateStoryboard: async ({ document, baseUpdatedAt }) => {
          const row = await Storyboard.updateFieldsIfUnchanged(
            rowId,
            baseUpdatedAt,
            { document: JSON.stringify(document) }
          );
          return row
            ? { document: row.toDocument(), updatedAt: row.updated_at }
            : null;
        }
      });
      const newId = () => `snapshot-${kind}`;
      const normalOutcomes = await renderShots(
        makeHost(normal.id, false),
        { id: normal.id },
        planShotRenders(normal.toDocument(), [], kind),
        { newId }
      );
      expect(normalOutcomes, JSON.stringify(normalOutcomes)).toMatchObject([
        { ok: true }
      ]);
      await renderShots(
        makeHost(interrupted.id, true),
        { id: interrupted.id },
        planShotRenders(interrupted.toDocument(), [], kind),
        { newId }
      );
      const queueFor = vi.fn(() => {
        throw new Error("Recovery must use saved media");
      });
      const worker = createGenerationRecoveryWorker({
        provider: { queueFor },
        now: () => new Date(Date.now() + 5 * 60_000)
      });
      await worker.runOnce();
      await worker.runOnce();
      const normalShot = (await Storyboard.findById(normal.id))!.toDocument()
        .shots[0];
      const recoveredDoc = (await Storyboard.findById(
        interrupted.id
      ))!.toDocument();
      const recoveredShot = recoveredDoc.shots[0];
      const recovered = recoveredShot[kind]!;
      expect(submitted).toBeDefined();
      expect(await Prediction.find(submitted!.id)).toMatchObject({
        attachment_status: "attached"
      });
      expect(recovered).toBeDefined();
      expect(recovered.render_inputs).toEqual(
        submitted!.destination.provenance.render_inputs
      );
      expect(recovered.render_inputs).toEqual({
        ...normalShot[kind]!.render_inputs,
        recorded_at: expect.any(String)
      });
      expect(
        isVersionStale(
          recovered,
          recoveredShot,
          boardRenderContext(recoveredDoc, [])
        )
      ).toBe(true);
      expect(
        kind === "keyframe"
          ? recoveredShot.keyframe_versions
          : recoveredShot.clip_versions
      ).toHaveLength(1);
      if (kind === "clip") {
        expect(recovered).toMatchObject({
          candidateId: normalShot.clip!.candidateId,
          batchId: normalShot.clip!.batchId,
          requestId: normalShot.clip!.requestId,
          variationId: normalShot.clip!.variationId,
          variationIndex: 1,
          productionSnapshot: normalShot.clip!.productionSnapshot
        });
        expect(recovered.productionSnapshot?.parameters?.localDirection).toBe(
          "Slow orbit"
        );
      }
      expect((await Prediction.find(submitted!.id))?.attachment_status).toBe(
        "attached"
      );
      expect(queueFor).not.toHaveBeenCalled();
    }
  );

  it.each([false, true])("recovers an interrupted timeline edit without another provider call after source changed=%s", async (sourceChanged) => {
    const clip = makeClip({ id: "clip-1", trackId: "track-1", name: "source", startMs: 1200,
      durationMs: 2000, inPointMs: 500, outPointMs: 2500, currentAssetId: "original-asset",
      mediaType: "video", sourceType: "imported", status: "generated" });
    const sequence = await TimelineSequence.create({ user_id: "u1", project_id: "default", name: "recover",
      fps: 30, width: 160, height: 90, duration_ms: 3200,
      document: JSON.stringify({ tracks: [makeTrack({ id: "track-1", type: "video" })], clips: [clip], markers: [] }) });
    const asset = await Asset.create<Asset>({ user_id: "u1", name: "candidate", content_type: "video/mp4" });
    const submittedClip = ensureBaselineTake(clip);
    submittedClip.versions![0].id = "submitted-source-take";
    const source = captureMediaEditSourceContext(sequence.id, submittedClip);
    if (!source.ok) throw new Error(source.error);
    const edit = createMediaEditRequest({ sourceContext: source.context, instruction: "night", provider: "fal_ai", model: "fal-ai/edit" });
    const request = { provider: "fal_ai", model: "fal-ai/edit", capability: "video_to_video", params: { media_edit: edit },
      destination: { document_id: sequence.id, target_type: "timeline_clip", target_id: clip.id, selected: false } };
    const generationId = "timeline-edit-recover";
    const hooks = createFalGenerationLifecycleHooks({ userId: "u1", callbacks: false });
    await hooks.onGenerationAccepted?.({ generationId, request });
    await hooks.onGenerationTerminal?.({ generationId, request, status: "completed", output: { url: "https://fal.media/recovered" }, receipt: null, assetIds: [asset.id] });
    if (sourceChanged) {
      await TimelineSequence.updateDocumentIfUnchanged(sequence.id, sequence.updated_at, {
        ...sequence.toDocument(), clips: [{ ...clip, currentAssetId: "replacement-asset", inPointMs: 0, outPointMs: 4000, durationMs: 4000 }]
      });
    }
    const queueFor = vi.fn(() => { throw new Error("Recovery must not submit a paid request"); });
    const worker = createGenerationRecoveryWorker({ provider: { queueFor }, now: () => new Date(Date.now() + 5 * 60_000) });
    await worker.runOnce();
    await worker.runOnce();
    const recovered = (await TimelineSequence.findById(sequence.id))!.toDocument().clips[0];
    expect(recovered).toMatchObject({ currentAssetId: sourceChanged ? "replacement-asset" : "original-asset", startMs: 1200,
      inPointMs: sourceChanged ? 0 : 500, outPointMs: sourceChanged ? 4000 : 2500,
      versions: expect.arrayContaining([expect.objectContaining({ id: generationId, assetId: asset.id, source: "video_to_video", parentTakeId: "submitted-source-take",
        mediaEdit: expect.objectContaining({ instruction: "night", sourceContext: source.context }) })]) });
    expect(recovered.versions?.filter((take) => take.id === generationId)).toHaveLength(1);
    expect(recovered.versions?.find((take) => take.assetId === "original-asset")).toMatchObject({
      id: "submitted-source-take", durationMs: 2000, sourceMapping: { inPointMs: 500, outPointMs: 2500, speedMultiplier: 1 }
    });
    expect((await Prediction.find(generationId))?.attachment_status).toBe("attached");
    expect(queueFor).not.toHaveBeenCalled();
  });

});
