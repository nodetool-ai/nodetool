/**
 * useGenerateShot
 *
 * Per-shot generation for the Storyboard surface. Every entry point fires the
 * unified runner's `generate_media` RPC — no workflow, no job row:
 *
 *   - `generateKeyframe(boardId, shot)` — mode `image`, prompt from the shot
 *     action + board style. Entity mentions travel as `entity://<id>` tokens
 *     the server expands at generation time (name inline, descriptor block,
 *     reference image routed into the provider inputs); when the board's still
 *     model cannot edit, descriptors are seasoned client-side instead.
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
import type { Entity, Shot } from "@nodetool-ai/protocol";
import { injectEntities, shotRenderMode } from "@nodetool-ai/protocol";
import {
  globalWebSocketManager
} from "../../lib/websocket/GlobalWebSocketManager";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { entitiesForShot } from "../../stores/storyboard/shotEntities";
import { useEntities } from "../../serverState/useEntities";
import { useImageModelsByProvider } from "../useModelsByProvider";
import {
  subscribeDirectShotJob,
  unsubscribeShotJob,
  useStoryboardGenerationStore,
  type ShotJobKind
} from "../../stores/storyboard/StoryboardGenerationStore";
import { fetchShotDurationSeconds } from "./useShotDuration";
import { CLIP_RESOLUTION, STILL_RESOLUTION } from "./renderSpec";
import { getErrorMessage } from "../../utils/errorHandling";

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

/**
 * Compose an image prompt from a shot's action, camera framing, and board
 * style. Entity mentions ride as `entity://` tokens appended to the prompt;
 * the server expands them (descriptor block + routed reference images).
 */
const keyframePrompt = (shot: Shot, style: string): string => {
  const parts = [shot.action.trim()];
  if (shot.camera?.framing) {
    parts.push(`${shot.camera.framing} shot`);
  }
  if (style.trim().length > 0) {
    parts.push(style.trim());
  }
  return parts.filter((p) => p.length > 0).join(", ");
};

const clipPrompt = (shot: Shot): string =>
  [shot.motion, shot.action]
    .filter((p) => !!p && p.trim().length > 0)
    .join(", ");

/**
 * Direct-mode clip prompt. No still carries the look into the render, so the
 * prompt has to: framing and board style ride along with the action and the
 * motion (mirrors the headless `render_storyboard_clips` tool).
 */
const directClipPrompt = (shot: Shot, style: string): string => {
  const parts: (string | undefined)[] = [shot.action];
  if (shot.camera?.framing) {
    parts.push(`${shot.camera.framing} shot`);
  }
  parts.push(shot.motion, style);
  return parts
    .filter((p): p is string => !!p && p.trim().length > 0)
    .map((p) => p.trim())
    .join(", ");
};

/** Entity mentions on their own line; the server seasons the prompt with them. */
const entityTokenSuffix = (entities: Entity[]): string =>
  entities.length > 0
    ? `\n${entities.map((e) => `entity://${e.id}`).join(" ")}`
    : "";

const hasReferenceImage = (entities: Entity[]): boolean =>
  entities.some((e) => (e.reference_images?.length ?? 0) > 0);

interface UseGenerateShotResult {
  generateKeyframe: (boardId: string, shot: Shot) => Promise<void>;
  generateClip: (boardId: string, shot: Shot) => Promise<void>;
  generateRevisedClip: (
    boardId: string,
    shot: Shot,
    instruction: string
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
  // Model catalog, for checking whether the still model can take entity
  // reference images (image_to_image support).
  const { models: imageModels } = useImageModelsByProvider();

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

  /** Fire one direct-generation request and track it on the shot. */
  const startDirectGeneration = useCallback(
    async (
      boardId: string,
      shot: Shot,
      kind: ShotJobKind,
      data: Record<string, unknown>
    ): Promise<void> => {
      // Single-flight per shot: skip when a job is active or a start is
      // already in the pre-registration window.
      if (isShotBusy(shot.id)) {
        return;
      }
      startingShots.add(shot.id);
      const requestId = crypto.randomUUID();
      try {
        registerJob(shot.id, boardId, requestId, kind);
        await subscribeDirectShotJob(requestId, {
          shotId: shot.id,
          boardId,
          kind
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
          useStoryboardGenerationStore.getState().clear(shot.id);
          unsubscribeShotJob(requestId);
          throw error;
        }
      } catch (error) {
        // A start that throws has no job and therefore no message stream to
        // report on: record the reason on the shot so the card and a toast
        // can show it, then rethrow for callers that await (the agent tools).
        recordStartFailure(
          shot.id,
          boardId,
          kind,
          getErrorMessage(error, "Could not start the render.")
        );
        throw error;
      } finally {
        startingShots.delete(shot.id);
      }
    },
    [registerJob, recordStartFailure]
  );

  const generateKeyframe = useCallback(
    async (boardId: string, shot: Shot): Promise<void> => {
      const board = useStoryboardStore.getState().getBoard(boardId);
      const style = board?.style ?? "";
      const aspectRatio = board?.aspectRatio ?? "16:9";
      const entities = entitiesForShot(shot, boardEntities(board?.entityIds));
      const entityIds = entities.map((e) => e.id);
      // Entities with reference images ride as `entity://` tokens when the
      // board's still model can edit — the server expands them into prompt
      // text and routes the reference images into the provider call.
      // Otherwise season descriptors client-side only.
      const stillModel = board?.imageModel?.id
        ? imageModels.find((m) => m.id === board.imageModel?.id)
        : undefined;
      const useEditModel =
        hasReferenceImage(entities) &&
        !!stillModel?.supported_tasks?.includes("image_to_image");
      const basePrompt = keyframePrompt(shot, style);
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
      if (board?.imageModel) {
        data.provider = board.imageModel.provider;
        data.model = board.imageModel.id;
      }
      await startDirectGeneration(boardId, shot, "keyframe", data);
    },
    [startDirectGeneration, boardEntities, imageModels]
  );

  const generateClip = useCallback(
    async (boardId: string, shot: Shot): Promise<void> => {
      const board = useStoryboardStore.getState().getBoard(boardId);
      const isDirect = shotRenderMode(shot) === "direct";
      let sourceAssetId: string | undefined;
      if (!isDirect) {
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
      const prompt = isDirect
        ? directClipPrompt(shot, board?.style ?? "")
        : clipPrompt(shot);
      const data: Record<string, unknown> = {
        mode: "video",
        prompt: `${prompt}${entityTokenSuffix(
          entitiesForShot(shot, boardEntities(board?.entityIds))
        )}`,
        aspect_ratio: aspectRatio,
        resolution: CLIP_RESOLUTION,
        variations: 1
      };
      if (sourceAssetId) {
        data.source_asset_id = sourceAssetId;
      }
      if (durationSeconds !== undefined) {
        data.duration = durationSeconds;
      }
      if (board?.videoModel) {
        data.provider = board.videoModel.provider;
        data.model = board.videoModel.id;
      }
      await startDirectGeneration(boardId, shot, "clip", data);
    },
    [startDirectGeneration, boardEntities]
  );

  const generateRevisedClip = useCallback(
    async (boardId: string, shot: Shot, instruction: string): Promise<void> => {
      if (!shot.clip) {
        throw new Error("Shot has no clip to revise — generate one first.");
      }
      const prompt = instruction.trim();
      if (prompt.length === 0) {
        throw new Error("A revision instruction is required.");
      }
      const sourceAssetId = assetIdFromRef(shot.clip);
      if (!sourceAssetId) {
        throw new Error(
          "The shot's clip has no stored asset to revise. Render it again."
        );
      }
      const board = useStoryboardStore.getState().getBoard(boardId);
      const data: Record<string, unknown> = {
        mode: "video_edit",
        prompt,
        source_asset_id: sourceAssetId
      };
      if (board?.videoModel) {
        data.provider = board.videoModel.provider;
        data.model = board.videoModel.id;
      }
      await startDirectGeneration(boardId, shot, "clip", data);
    },
    [startDirectGeneration]
  );

  return { generateKeyframe, generateClip, generateRevisedClip };
};

export default useGenerateShot;
