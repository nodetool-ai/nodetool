/**
 * useRenderSceneClip
 *
 * Render a run of 2 to 5 consecutive shots as one clip: a one take over part
 * of the board. The run is compiled with `compileOneTake` over its shots
 * alone, so `[Image N]` and the step windows start at its first shot, and it
 * goes through the same `reference_to_video` request as a one take.
 *
 * A setting the scene clip leaves unset falls back to the board's one-take
 * setting (the reference source included), then as {@link resolveOneTakeSettings} documents. The duration is
 * the exception: the board's one-take duration is the whole film's length, so
 * an unset scene clip duration is the run's shot total.
 *
 * The request text is compiled from the shots alone, with no creator prompt,
 * so a re-render sends the same direction. The creator controls the rest
 * through the reference images the clip stores.
 *
 * The clip lands on the run's first shot and every other shot in the run is
 * covered by its window, so the preview, the slideshow and the timeline play
 * it from where the run starts without any change to the shot order.
 */

import { useCallback, useMemo } from "react";
import { sceneClipRun } from "@nodetool-ai/protocol";
import type {
  Entity,
  OneTakeDirection,
  SceneClipDirection,
  ShotModelRef
} from "@nodetool-ai/protocol";
import {
  useStoryboardStore,
  type StoryboardBoard
} from "../../stores/storyboard/StoryboardStore";
import { useLastModelStore } from "../../stores/lastModelStore";
import { useEntities } from "../../serverState/useEntities";
import { useVideoModelsByProvider } from "../useModelsByProvider";
import { useGenerateShot } from "./useGenerateShot";
import {
  ONE_TAKE_TASK,
  boardCast,
  oneTakeBlockers,
  oneTakeRequestData,
  planOneTake,
  rememberedOneTakeModels,
  resolveOneTakeSettings,
  type OneTakeCatalogModel,
  type OneTakeRenderPlan,
  type OneTakeSettings
} from "./useRenderOneTake";

/** The direction a scene clip renders with, after the board fallbacks. */
export const sceneClipDirectionWithFallbacks = (
  board: StoryboardBoard | undefined,
  clip: SceneClipDirection
): OneTakeDirection => ({
  prompt: "",
  duration_seconds: clip.duration_seconds ?? null,
  model: clip.model ?? board?.oneTake?.model ?? null,
  aspect_ratio: clip.aspect_ratio ?? board?.oneTake?.aspect_ratio ?? null,
  resolution: clip.resolution ?? board?.oneTake?.resolution ?? null,
  reference_source:
    clip.reference_source ?? board?.oneTake?.reference_source ?? null,
  reference_shot_ids: clip.reference_shot_ids ?? null,
  reference_entity_ids: clip.reference_entity_ids ?? null
});

/**
 * The entities a scene clip can send: the board's cast, then each entity the
 * clip chose from the library. Choosing one does not add it to the board.
 */
export const sceneClipCast = (
  board: StoryboardBoard | undefined,
  clip: SceneClipDirection,
  library: readonly Entity[] | undefined
): Entity[] => {
  const cast = boardCast(board, library);
  const inCast = new Set(cast.map((entity) => entity.id));
  const chosen = new Set(clip.reference_entity_ids ?? []);
  return [
    ...cast,
    ...(library ?? []).filter(
      (entity) => chosen.has(entity.id) && !inCast.has(entity.id)
    )
  ];
};

/** The board narrowed to the scene clip's run, with its direction. */
const sceneClipBoard = (
  board: StoryboardBoard | undefined,
  clip: SceneClipDirection
): StoryboardBoard | undefined =>
  board && {
    ...board,
    shots: sceneClipRun(board.shots, clip.shot_ids).shots,
    oneTake: sceneClipDirectionWithFallbacks(board, clip)
  };

/** Compile the scene clip. Null when none of its shots exist. */
export const planSceneClip = (
  board: StoryboardBoard | undefined,
  clip: SceneClipDirection,
  entities: readonly Entity[] = []
): OneTakeRenderPlan | null =>
  planOneTake(sceneClipBoard(board, clip), entities);

/** The scene clip's effective settings. */
export const resolveSceneClipSettings = (
  board: StoryboardBoard | undefined,
  clip: SceneClipDirection,
  catalog: readonly OneTakeCatalogModel[],
  remembered: readonly ShotModelRef[] = []
): OneTakeSettings =>
  resolveOneTakeSettings(sceneClipBoard(board, clip), catalog, remembered);

export const SCENE_CLIP_NO_REFERENCE_BLOCKER = "Pick at least one reference image.";

/** Why the scene clip cannot render, or an empty list. */
export const sceneClipBlockers = (
  board: StoryboardBoard | undefined,
  clip: SceneClipDirection,
  plan: OneTakeRenderPlan | null,
  settings: OneTakeSettings
): string[] => {
  const issue = board ? sceneClipRun(board.shots, clip.shot_ids).issue : null;
  const blockers = oneTakeBlockers(plan, settings);
  const chosen = clip.reference_shot_ids || clip.reference_entity_ids;
  const noneChosen = chosen && plan?.compiled.references.length === 0;
  return [
    ...(issue ? [issue] : []),
    ...(noneChosen ? [SCENE_CLIP_NO_REFERENCE_BLOCKER] : []),
    ...(noneChosen ? blockers.slice(1) : blockers)
  ];
};

interface UseRenderSceneClipResult {
  plan: OneTakeRenderPlan | null;
  settings: OneTakeSettings;
  blockers: string[];
  /** The entities this clip can send. */
  cast: Entity[];
  /** Renders `clip` against the board as it is now. Rejects while blocked. */
  renderSceneClip: (clip: SceneClipDirection) => Promise<void>;
}

export const useRenderSceneClip = (
  boardId: string,
  clip: SceneClipDirection
): UseRenderSceneClipResult => {
  const board = useStoryboardStore((state) => state.boards[boardId]);
  const { data: library } = useEntities();
  const { models: catalog } = useVideoModelsByProvider();
  const byTask = useLastModelStore((state) => state.byTask);
  const byKind = useLastModelStore((state) => state.byKind);
  const { startOneTakeClip } = useGenerateShot();

  const remembered = useMemo(
    () => rememberedOneTakeModels(byTask, byKind),
    [byTask, byKind]
  );
  const cast = useMemo(
    () => sceneClipCast(board, clip, library),
    [board, clip, library]
  );
  const plan = useMemo(
    () => planSceneClip(board, clip, cast),
    [board, clip, cast]
  );
  const settings = useMemo(
    () => resolveSceneClipSettings(board, clip, catalog, remembered),
    [board, clip, catalog, remembered]
  );
  const blockers = useMemo(
    () => sceneClipBlockers(board, clip, plan, settings),
    [board, clip, plan, settings]
  );

  const renderSceneClip = useCallback(
    async (sendClip: SceneClipDirection): Promise<void> => {
      // Read the board at send time, not the render that built `plan`.
      const current = useStoryboardStore.getState().getBoard(boardId);
      const sendPlan = planSceneClip(
        current,
        sendClip,
        sceneClipCast(current, sendClip, library)
      );
      const sendSettings = resolveSceneClipSettings(
        current,
        sendClip,
        catalog,
        remembered
      );
      const sendBlockers = sceneClipBlockers(
        current,
        sendClip,
        sendPlan,
        sendSettings
      );
      const model = sendSettings.model;
      if (!sendPlan || !model || sendBlockers.length > 0) {
        throw new Error(sendBlockers.join(" "));
      }
      const { compiled, firstShot } = sendPlan;
      useLastModelStore.getState().rememberForTask("video", ONE_TAKE_TASK, {
        provider: model.provider,
        model: model.id
      });
      await startOneTakeClip(
        boardId,
        firstShot,
        oneTakeRequestData(compiled, sendSettings, model),
        { steps: compiled.steps }
      );
    },
    [boardId, catalog, library, remembered, startOneTakeClip]
  );

  return { plan, settings, blockers, cast, renderSceneClip };
};

export default useRenderSceneClip;
