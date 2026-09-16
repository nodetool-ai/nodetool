/**
 * useGenerateShot
 *
 * Per-shot generation for the Storyboard surface. Every entry point fires the
 * unified runner's `generate_media` RPC — no workflow, no job row:
 *
 *   - `generateKeyframe(boardId, shot)` — mode `image`, prompt from the shot
 *     action + board style. Entity mentions travel as `entity://<id>` tokens
 *     the server expands at generation time (name inline, descriptor block,
 *     reference image routed into the provider inputs); when the selected
 *     still model cannot edit, descriptors are seasoned client-side instead.
 *   - `generateClip(boardId, shot)` — mode `video` with the shot's keyframe as
 *     `source_asset_id` (image-to-video), timed to the linked script's takes.
 *   - `generateRevisedClip(boardId, shot, instruction)` — mode `video_edit`
 *     over the shot's rendered clip.
 *
 * All three register the request on {@link useStoryboardGenerationStore} and
 * subscribe through the shared GlobalWebSocketManager machinery so completion
 * writes the resulting ImageRef/VideoRef back to the board and settles the
 * shot status.
 */

import { useCallback } from "react";
import type {
  BoardRenderContext,
  Entity,
  Shot,
  ShotModelRef,
  ShotStatus
} from "@nodetool-ai/protocol";
import {
  compileProductionCandidates,
  createMediaEditRequest,
  createMediaEditSourceContext,
  mediaEditGenerateMediaData
} from "@nodetool-ai/timeline";
import type {
  CompiledProductionCandidate,
  MediaEditRequest
} from "@nodetool-ai/timeline";
import {
  clipPromptFor,
  entitiesForShot,
  injectEntities,
  keyframePrompt,
  sceneForShot,
  shotRenderMode
} from "@nodetool-ai/protocol";
import { globalWebSocketManager } from "../../lib/websocket/GlobalWebSocketManager";
import {
  useStoryboardStore,
  type StoryboardBoard
} from "../../stores/storyboard/StoryboardStore";
import { boardRenderContext } from "../../lib/storyboard/boardRenderContext";
import { useEntities } from "../../serverState/useEntities";
import {
  useImageModelsByProvider,
  useVideoModelsByProvider
} from "../useModelsByProvider";
import { modelMatchesTask } from "../modelTaskMatching";
import {
  subscribeDirectShotJob,
  unsubscribeShotJob,
  useStoryboardGenerationStore,
  type ShotJobKind
} from "../../stores/storyboard/StoryboardGenerationStore";
import { fetchShotDurationSeconds } from "./useShotDuration";
import { CLIP_RESOLUTION, STILL_RESOLUTION } from "./renderSpec";
import { getErrorMessage } from "../../utils/errorHandling";
import { useLastModelStore } from "../../stores/lastModelStore";

/**
 * Shots with a start in flight, before `registerJob` marks them active in the
 * generation store. Without this, two rapid clicks (or concurrent agent
 * calls) both pass the store check and start two paid jobs, and the second
 * registration orphans the first subscription. Mirrors the timeline's
 * `startingClips` guard.
 */
const startingShots = new Set<string>();

/** True when the shot already has a queued/running job or a start in flight. */
const isShotBusy = (shotId: string): boolean => {
  if (startingShots.has(shotId)) return true;
  const job = useStoryboardGenerationStore.getState().shotJobs[shotId];
  return job?.status === "queued" || job?.status === "running";
};

export const __resetStartingShotsForTests = (): void => {
  startingShots.clear();
};

/** The stored asset id behind a media ref, when it has one. */
const assetIdFromRef = (ref: unknown): string | undefined => {
  if (!ref || typeof ref !== "object") return undefined;
  const r = ref as { asset_id?: unknown; uri?: unknown };
  if (typeof r.asset_id === "string" && r.asset_id.length > 0) {
    return r.asset_id;
  }
  if (typeof r.uri === "string" && r.uri.startsWith("asset://")) {
    const bare = r.uri.slice("asset://".length);
    return bare.slice(0, bare.lastIndexOf("."));
  }
  return undefined;
};

/** Entity mentions on their own line; the server seasons the prompt with them. */
const entityTokenSuffix = (entities: Entity[]): string =>
  entities.length > 0
    ? `\n${entities.map((e) => `entity://${e.id}`).join(" ")}`
    : "";

const hasReferenceImage = (entities: Entity[]): boolean =>
  entities.some((e) => (e.reference_images?.length ?? 0) > 0);

interface UseGenerateShotResult {
  generateKeyframe: (
    boardId: string,
    shot: Shot,
    model?: ShotModelRef
  ) => Promise<void>;
  generateClip: (
    boardId: string,
    shot: Shot,
    model?: ShotModelRef
  ) => Promise<void>;
  generateRevisedClip: (
    boardId: string,
    shot: Shot,
    instruction: string,
    model?: ShotModelRef
  ) => Promise<void>;
}

export const useGenerateShot = (): UseGenerateShotResult => {
  const registerJob = useStoryboardGenerationStore(
    (state) => state.registerJob
  );
  const recordStartFailure = useStoryboardGenerationStore(
    (state) => state.recordStartFailure
  );
  // Library entities; a board's `entityIds` picks which ones season prompts.
  const { data: allEntities } = useEntities();
  // Model catalogs, for checking whether the selected model can take entity
  // reference images (image_to_image support).
  const { models: imageModels } = useImageModelsByProvider();
  const { models: videoModels } = useVideoModelsByProvider();

  const boardEntities = useCallback(
    (entityIds: string[] | undefined): Entity[] => {
      if (!entityIds || entityIds.length === 0 || !allEntities) {
        return [];
      }
      const byId = new Map(allEntities.map((e) => [e.id, e]));
      return entityIds
        .map((id) => byId.get(id))
        .filter((e): e is Entity => !!e);
    },
    [allEntities]
  );

  /**
   * The board settings a render record is taken from.
   *
   * `style_entity_id` is derived here rather than in the generation store: the
   * board holds entity ids, and the kinds live in the entity query this hook
   * already has. `setStylePreset` keeps at most one `style` entity on a board,
   * so the first match is the board's style.
   */
  const renderContext = useCallback(
    (board: StoryboardBoard | undefined, shot?: Shot): BoardRenderContext =>
      boardRenderContext(board, allEntities ?? [], shot),
    [allEntities]
  );

  /** Fire one direct-generation request and track it on the shot. */
  const startDirectGeneration = useCallback(
    async (
      boardId: string,
      shot: Shot,
      kind: ShotJobKind,
      data: Record<string, unknown>,
      board?: BoardRenderContext,
      mediaEdit?: MediaEditRequest,
      production?: CompiledProductionCandidate
    ): Promise<void> => {
      // Single-flight per shot: skip when a job is active or a start is
      // already in the pre-registration window.
      if (!production && isShotBusy(shot.id)) {
        return;
      }
      startingShots.add(shot.id);
      const requestId = production?.identity.requestId ?? crypto.randomUUID();
      const acceptedShotStatus =
        mediaEdit || production
          ? useStoryboardStore
              .getState()
              .getBoard(boardId)
              ?.shots.find((candidate) => candidate.id === shot.id)?.status
          : undefined;
      try {
        registerJob(
          shot.id,
          boardId,
          requestId,
          kind,
          board ? { shot, board } : undefined,
          mediaEdit,
          acceptedShotStatus,
          production
        );
        // Watched from the send, not only from a reattach. A socket that
        // drops and reconnects without a reload — a network blip — leaves the
        // reply addressed to a server session that is gone, exactly as a
        // reload does, and nothing re-runs reattachment in that case. The row
        // is the authority; the subscription just gets there faster.
        await subscribeDirectShotJob(requestId, {
          shotId: shot.id,
          boardId,
          kind,
          mediaEdit,
          acceptedShotStatus,
          production
        });
        try {
          await globalWebSocketManager.send({
            command: "generate_media",
            request_id: requestId,
            data
          });
        } catch (error) {
          // The request never left: drop the registration and subscription so
          // a retry is not blocked by a phantom queued job.
          if (production) {
            useStoryboardGenerationStore
              .getState()
              .updateJobStatus(requestId, "failed", {
                errorMessage: getErrorMessage(
                  error,
                  "Could not submit the production candidate."
                )
              });
          } else {
            useStoryboardGenerationStore.getState().clear(shot.id);
          }
          unsubscribeShotJob(requestId);
          throw error;
        }
      } catch (error) {
        // A start that throws has no job and therefore no message stream to
        // report on: record the reason on the shot so the card and a toast
        // can show it, then rethrow for callers that await (the agent tools).
        if (!production) {
          recordStartFailure(
            shot.id,
            boardId,
            kind,
            getErrorMessage(error, "Could not start the render."),
            mediaEdit,
            acceptedShotStatus
          );
        }
        throw error;
      } finally {
        startingShots.delete(shot.id);
      }
    },
    [registerJob, recordStartFailure]
  );

  const generateKeyframe = useCallback(
    async (
      boardId: string,
      shot: Shot,
      modelOverride?: ShotModelRef
    ): Promise<void> => {
      const board = useStoryboardStore.getState().getBoard(boardId);
      const model = modelOverride ?? shot.still_model ?? board?.imageModel;
      const style = board?.style ?? "";
      const aspectRatio = board?.aspectRatio ?? "16:9";
      const entities = entitiesForShot(shot, boardEntities(board?.entityIds));
      const entityIds = entities.map((e) => e.id);
      // Entities with reference images ride as `entity://` tokens when the
      // board's still model can edit — the server expands them into prompt
      // text and routes the reference images into the provider call.
      // Otherwise season descriptors client-side only.
      const stillModel = model?.id
        ? imageModels.find((candidate) => candidate.id === model.id)
        : undefined;
      const useEditModel =
        hasReferenceImage(entities) &&
        !!stillModel?.supported_tasks?.includes("image_to_image");
      const basePrompt = keyframePrompt(shot, {
        scene: sceneForShot(shot, board?.screenplay?.scenes),
        style
      });
      const prompt =
        useEditModel && entities.length > 0
          ? `${basePrompt}${entityTokenSuffix(entities)}`
          : entityIds.length > 0
            ? injectEntities(basePrompt, entities, entityIds).prompt
            : basePrompt;

      const data: Record<string, unknown> = {
        mode: "image",
        prompt,
        aspect_ratio: aspectRatio,
        resolution: STILL_RESOLUTION,
        variations: 1
      };
      if (model) {
        data.provider = model.provider;
        data.model = model.id;
        useStoryboardStore
          .getState()
          .updateShot(boardId, shot.id, { still_model: model });
        useLastModelStore.getState().remember("image", {
          provider: model.provider,
          model: model.id
        });
      }
      const renderShot = model ? { ...shot, still_model: model } : shot;
      await startDirectGeneration(
        boardId,
        renderShot,
        "keyframe",
        data,
        renderContext(board, renderShot)
      );
    },
    [startDirectGeneration, boardEntities, imageModels, renderContext]
  );

  const generateClip = useCallback(
    async (
      boardId: string,
      shot: Shot,
      modelOverride?: ShotModelRef
    ): Promise<void> => {
      if (isShotBusy(shot.id)) {
        return;
      }
      const board = useStoryboardStore.getState().getBoard(boardId);
      const model = modelOverride ?? shot.clip_model ?? board?.videoModel;
      const renderMode = shotRenderMode(shot);
      const selectedModel = videoModels.find(
        (candidate) =>
          candidate.id === model?.id && candidate.provider === model.provider
      );
      if (model && !selectedModel) {
        const message = `The remembered clip model ${model.name ?? model.id} is no longer available. Choose another model.`;
        recordStartFailure(shot.id, boardId, "clip", message);
        throw new Error(message);
      }
      let sourceAssetId: string | undefined;
      if (renderMode === "keyframe") {
        if (!shot.keyframe) {
          throw new Error(
            "Shot has no keyframe to animate. Generate a still first, or set its render mode to direct."
          );
        }
        sourceAssetId = assetIdFromRef(shot.keyframe);
        if (!sourceAssetId) {
          throw new Error(
            "The shot's still has no stored asset to animate. Generate a still first."
          );
        }
      }
      const aspectRatio = board?.aspectRatio ?? "16:9";
      // A board linked to a script renders each shot as long as the takes it
      // covers, so the clip holds its voiceover (design §2.3).
      const durationSeconds = await fetchShotDurationSeconds(
        board?.screenplay?.script_id,
        shot
      );
      const prompt = clipPromptFor(
        shot,
        {
          scene: sceneForShot(shot, board?.screenplay?.scenes),
          style: board?.style ?? ""
        },
        renderMode
      );
      const entities = entitiesForShot(shot, boardEntities(board?.entityIds));
      const entityIds = entities.map((entity) => entity.id);
      const referenceAssetIds = [
        ...new Set(
          [
            ...(renderMode === "reference"
              ? entities
                  .flatMap((entity) => entity.reference_images ?? [])
                  .map(assetIdFromRef)
              : []),
            ...(board?.creativeContext?.reference_bindings ?? []).map(
              (binding) => binding.asset_id
            )
          ].filter((id): id is string => id !== undefined)
        )
      ];
      const referenceBindings = [
        ...(board?.creativeContext?.reference_bindings ?? []),
        ...(shot.production?.reference_bindings ?? [])
      ];
      const productionCandidates = compileProductionCandidates({
        batchId: crypto.randomUUID(),
        destinationId: shot.id,
        destinationKind: "storyboard_shot",
        operation: "initial_generation",
        prompt,
        requirement: shot.production,
        entityIds,
        ...(referenceAssetIds.length > 0 && { referenceAssetIds }),
        ...(referenceBindings.length > 0 && { referenceBindings }),
        ...(model != null && {
          provider: model.provider,
          model: model.id
        }),
        ...(durationSeconds !== undefined && {
          requestedDurationMs: Math.round(durationSeconds * 1000)
        }),
        routeSupport: {
          referenceToVideo: true,
          audioDrivenPerformance: false
        }
      });
      if (
        renderMode === "reference" &&
        productionCandidates[0]?.referenceAssetIds.length === 0
      ) {
        throw new Error(
          "Reference mode requires at least one resolved reference image."
        );
      }
      const productionRoute = productionCandidates[0]?.executionRoute;
      const requiredTask =
        productionRoute === "reference_to_video"
          ? "reference_to_video"
          : renderMode === "direct"
            ? "text_to_video"
            : "image_to_video";
      if (
        selectedModel &&
        !modelMatchesTask(selectedModel.supported_tasks, requiredTask)
      ) {
        const message = `Choose a clip model that supports ${requiredTask.replaceAll("_", " ")} for this shot.`;
        recordStartFailure(shot.id, boardId, "clip", message);
        throw new Error(message);
      }
      const data: Record<string, unknown> = {
        mode: "video",
        prompt: `${productionCandidates[0]?.snapshot.prompt ?? prompt}${entityTokenSuffix(entities)}`,
        aspect_ratio: aspectRatio,
        resolution: CLIP_RESOLUTION,
        variations: 1
      };
      if (productionRoute === "reference_to_video") {
        data.reference_images = productionCandidates[0]?.referenceAssetIds.map(
          (assetId) => ({ type: "image", asset_id: assetId })
        );
        data.capability = "reference_to_video";
      }
      if (sourceAssetId && productionRoute !== "reference_to_video") {
        data.source_asset_id = sourceAssetId;
      }
      if (durationSeconds !== undefined) {
        data.duration = durationSeconds;
      }
      if (model) {
        data.provider = model.provider;
        data.model = model.id;
        useStoryboardStore
          .getState()
          .updateShot(boardId, shot.id, { clip_model: model });
        useLastModelStore.getState().remember("video", {
          provider: model.provider,
          model: model.id
        });
        useLastModelStore.getState().rememberForTask("video", requiredTask, {
          provider: model.provider,
          model: model.id
        });
      }
      const renderShot = model ? { ...shot, clip_model: model } : shot;
      await Promise.all(
        productionCandidates.map((production) =>
          startDirectGeneration(
            boardId,
            renderShot,
            "clip",
            data,
            renderContext(board, renderShot),
            undefined,
            production
          )
        )
      );
    },
    [
      startDirectGeneration,
      boardEntities,
      renderContext,
      videoModels,
      recordStartFailure
    ]
  );

  const generateRevisedClip = useCallback(
    async (
      boardId: string,
      shot: Shot,
      instruction: string,
      modelOverride?: ShotModelRef
    ): Promise<void> => {
      // Check before building the edit snapshot or running any preflight. An
      // agent call can reach this path while an ordinary render is already
      // active; its failure must not replace that render's job or pending row.
      if (isShotBusy(shot.id)) {
        return;
      }
      const prompt = instruction.trim();
      const board = useStoryboardStore.getState().getBoard(boardId);
      const acceptedShotStatus = board?.shots.find(
        (candidate) => candidate.id === shot.id
      )?.status;
      const model = modelOverride ?? shot.clip_model ?? board?.videoModel;
      const sourceAssetId = assetIdFromRef(shot.clip);
      let durationSeconds = shot.clip?.duration;
      if (durationSeconds === undefined && shot.clip) {
        try {
          durationSeconds = await fetchShotDurationSeconds(
            board?.screenplay?.script_id,
            shot
          );
        } catch {
          // The failure is recorded below with the captured edit inputs.
          durationSeconds = undefined;
        }
      }
      // The duration lookup yields to other generation entry points. Recheck
      // before any preflight failure can record a revision and replace an
      // ordinary render that started while the lookup was pending.
      if (isShotBusy(shot.id)) {
        return;
      }
      const capturedDurationMs =
        typeof durationSeconds === "number" && Number.isFinite(durationSeconds)
          ? durationSeconds * 1000
          : 0;
      // Build the retry record before preflight validation. Invalid values are
      // intentionally retained as a snapshot for inspection and retry. The
      // validated request below is the only value sent to the provider.
      const capturedMediaEdit = createMediaEditRequest({
        sourceContext: {
          sequenceId: boardId,
          clipId: shot.id,
          sourceAssetId: sourceAssetId ?? "",
          sourceStartMs: 0,
          sourceEndMs: capturedDurationMs,
          timelineStartMs: 0,
          timelineDurationMs: capturedDurationMs,
          speedMultiplier: 1
        },
        instruction: prompt,
        provider: model?.provider ?? "",
        model: model?.id ?? ""
      });
      const failPreflight = (message: string): never => {
        recordStartFailure(
          shot.id,
          boardId,
          "clip",
          message,
          capturedMediaEdit,
          acceptedShotStatus
        );
        throw new Error(message);
      };
      if (!shot.clip) {
        return failPreflight(
          "Shot has no clip to revise — generate one first."
        );
      }
      if (prompt.length === 0) {
        return failPreflight("A revision instruction is required.");
      }
      if (!sourceAssetId) {
        return failPreflight(
          "The shot's clip has no stored asset to revise. Render it again."
        );
      }
      if (!model) {
        return failPreflight("Choose a video model before revising this shot.");
      }
      const selectedModel = videoModels.find(
        (candidate) =>
          candidate.id === model.id && candidate.provider === model.provider
      );
      if (videoModels.length > 0 && !selectedModel) {
        const message = `The remembered clip model ${model.name ?? model.id} is no longer available. Choose another model.`;
        return failPreflight(message);
      }
      if (
        selectedModel &&
        !modelMatchesTask(selectedModel.supported_tasks, "video_to_video")
      ) {
        const message =
          "Choose a clip model that supports video to video for this shot.";
        return failPreflight(message);
      }
      if (!durationSeconds || !Number.isFinite(durationSeconds)) {
        const message =
          "Edit video requires a positive playable shot duration.";
        return failPreflight(message);
      }
      const source = createMediaEditSourceContext({
        sequenceId: boardId,
        clipId: shot.id,
        sourceAssetId,
        sourceStartMs: 0,
        sourceEndMs: durationSeconds * 1000,
        timelineStartMs: 0,
        timelineDurationMs: durationSeconds * 1000,
        speedMultiplier: 1
      });
      if (!source.ok) {
        return failPreflight(source.error);
      }
      const request = createMediaEditRequest({
        sourceContext: source.context,
        instruction: prompt,
        provider: model.provider,
        model: model.id
      });
      const data = mediaEditGenerateMediaData(request);
      // No render record: a revision renders the instruction over an existing
      // clip, not the shot's composed prompt, so there is nothing a later
      // board change would make it out of date with respect to. Like an
      // upload or an image-editor edit, it is never stale (PRD § 7.7.4).
      await startDirectGeneration(
        boardId,
        shot,
        "clip",
        data,
        undefined,
        request
      );
    },
    [startDirectGeneration, recordStartFailure, videoModels]
  );

  return { generateKeyframe, generateClip, generateRevisedClip };
};

export default useGenerateShot;
