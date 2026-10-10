/**
 * useRenderOneTake
 *
 * Render a whole storyboard as one continuous clip. `compileOneTake` joins
 * the creator's prompt to the block compiled from the board, and lists the
 * shot stills, in shot order, as `[Image N]`. They
 * are sent through the `reference_to_video` capability of `generate_media`.
 *
 * The render settings (model, duration, aspect ratio, resolution) live on the
 * board's one-take direction. An absent setting falls back as
 * {@link resolveOneTakeSettings} documents, and the panel, the dialog and the
 * request all read that one helper.
 *
 * The request runs as the first shot's clip job, so progress, failure and
 * reattachment behave like any shot clip. On completion the clip becomes the
 * first shot's clip and every other shot is covered by its window of it (see
 * `coverBoardWithOneTake` in the generation store).
 */

import { useCallback, useMemo } from "react";
import { compileOneTake } from "@nodetool-ai/protocol";
import type {
  CompiledOneTake,
  Shot,
  ShotModelRef
} from "@nodetool-ai/protocol";
import {
  useStoryboardStore,
  type StoryboardBoard
} from "../../stores/storyboard/StoryboardStore";
import { useLastModelStore } from "../../stores/lastModelStore";
import { useVideoModelsByProvider } from "../useModelsByProvider";
import { modelMatchesTask } from "../modelTaskMatching";
import { useGenerateShot } from "./useGenerateShot";
import { CLIP_RESOLUTION } from "./renderSpec";

/** The most reference images one omni-reference request takes. */
export const ONE_TAKE_MAX_IMAGES = 9;
/** The longest clip assumed when a model declares no durations. */
export const ONE_TAKE_DEFAULT_MAX_SECONDS = 30;
/** The catalog task a one-take model must support. */
export const ONE_TAKE_TASK = "reference_to_video";
/** A board's aspect ratio when it has none. */
const DEFAULT_ASPECT_RATIO = "16:9";
/** The durations offered when a model declares none. */
export const ONE_TAKE_FALLBACK_DURATIONS: readonly number[] = [
  4, 5, 6, 8, 10, 12, 15, 20, 25, 30
];
/** The resolutions offered when a model declares none. */
export const ONE_TAKE_FALLBACK_RESOLUTIONS: readonly string[] = [
  "720p",
  "1080p"
];

export interface OneTakeRenderPlan {
  compiled: CompiledOneTake;
  /** The shot the clip attaches to: the first in board order. */
  firstShot: Shot;
}

/** What the catalog says about a video model, for the one-take settings. */
export interface OneTakeCatalogModel {
  id: string;
  provider: string;
  name?: string;
  supported_tasks?: string[] | null;
  durations?: readonly number[] | null;
  resolutions?: readonly string[] | null;
  aspect_ratios?: readonly string[] | null;
}

/** What the picked model allows, for {@link oneTakeBlockers}. */
export interface OneTakeModelLimits {
  durations?: readonly number[] | null;
}

/** The settings a one-take render uses, after every fallback. */
export interface OneTakeSettings {
  /** Null when no stored, board or remembered model applies. */
  model: ShotModelRef | null;
  /** The effective model's catalog entry, when the catalog lists it. */
  catalogModel: OneTakeCatalogModel | null;
  /** The clip length: the stored duration, else the shot total. */
  duration_seconds: number;
  /** The sum of the shot durations. */
  shot_total_seconds: number;
  aspect_ratio: string;
  resolution: string;
}

interface UseRenderOneTakeResult {
  /** Null while the board has no shots. */
  plan: OneTakeRenderPlan | null;
  settings: OneTakeSettings;
  /** Why the board cannot render now, or an empty list. */
  blockers: string[];
  /** Renders with the effective settings. Rejects while blocked. */
  renderOneTake: () => Promise<void>;
}

/** Compile the board's one take. Null when the board has no shots. */
export const planOneTake = (
  board: StoryboardBoard | undefined
): OneTakeRenderPlan | null => {
  if (!board || board.shots.length === 0) {
    return null;
  }
  const compiled = compileOneTake({
    shots: board.shots,
    oneTake: board.oneTake
  });
  const firstShotId = compiled.steps[0]?.shot_id;
  const firstShot = board.shots.find((shot) => shot.id === firstShotId);
  return firstShot ? { compiled, firstShot } : null;
};

const declared = <T>(list: readonly T[] | null | undefined): readonly T[] =>
  list && list.length > 0 ? list : [];

const findCatalogModel = (
  ref: { id: string; provider?: string | null } | null | undefined,
  catalog: readonly OneTakeCatalogModel[]
): OneTakeCatalogModel | null =>
  ref
    ? (catalog.find(
        (model) => model.id === ref.id && model.provider === ref.provider
      ) ?? null)
    : null;

interface RememberedModel {
  provider?: string;
  model?: string;
}

/** The remembered models a one take falls back to, task-specific first. */
export const rememberedOneTakeModels = (
  byTask: Partial<Record<string, RememberedModel>>,
  byKind: Partial<Record<string, RememberedModel>>
): ShotModelRef[] =>
  [byTask[`video:${ONE_TAKE_TASK}`], byKind.video].flatMap((remembered) =>
    remembered?.model && remembered.provider
      ? [{ id: remembered.model, provider: remembered.provider }]
      : []
  );

/**
 * The effective one-take settings. Each stored setting wins. Otherwise:
 * - model: the board's video model, then a remembered `reference_to_video`
 *   model, each only when the catalog lists it for that task;
 * - duration: the sum of the shot durations;
 * - aspect ratio: the board's;
 * - resolution: 1080p when the model offers it, else the model's first.
 * A stored aspect ratio or resolution the model does not declare falls back.
 */
export const resolveOneTakeSettings = (
  board: StoryboardBoard | undefined,
  catalog: readonly OneTakeCatalogModel[],
  remembered: readonly ShotModelRef[] = []
): OneTakeSettings => {
  const direction = board?.oneTake;
  const compiled = compileOneTake({
    shots: board?.shots ?? [],
    oneTake: direction
  });

  let model: ShotModelRef | null = direction?.model ?? null;
  if (!model) {
    const boardModel = board?.videoModel
      ? {
          id: board.videoModel.id,
          provider: board.videoModel.provider,
          name: board.videoModel.name
        }
      : null;
    for (const candidate of [boardModel, ...remembered]) {
      const entry = findCatalogModel(candidate, catalog);
      if (
        candidate &&
        entry &&
        modelMatchesTask(entry.supported_tasks, ONE_TAKE_TASK)
      ) {
        model = {
          id: candidate.id,
          provider: candidate.provider,
          name: candidate.name ?? entry.name
        };
        break;
      }
    }
  }
  const catalogModel = findCatalogModel(model, catalog);

  const aspects = declared(catalogModel?.aspect_ratios);
  const storedAspect = direction?.aspect_ratio;
  const aspect_ratio =
    storedAspect && (aspects.length === 0 || aspects.includes(storedAspect))
      ? storedAspect
      : (board?.aspectRatio ?? DEFAULT_ASPECT_RATIO);

  const resolutions = declared(catalogModel?.resolutions);
  const storedResolution = direction?.resolution;
  const resolution =
    storedResolution &&
    (resolutions.length === 0 || resolutions.includes(storedResolution))
      ? storedResolution
      : resolutions.length === 0 || resolutions.includes(CLIP_RESOLUTION)
        ? CLIP_RESOLUTION
        : resolutions[0];

  return {
    model,
    catalogModel,
    duration_seconds: compiled.duration_seconds,
    shot_total_seconds: compiled.shot_total_seconds,
    aspect_ratio,
    resolution
  };
};

/** The longest clip a model renders. */
export const oneTakeMaxSeconds = (model?: OneTakeModelLimits | null): number =>
  model?.durations && model.durations.length > 0
    ? Math.max(...model.durations)
    : ONE_TAKE_DEFAULT_MAX_SECONDS;

const secondsText = (value: number): string =>
  `${Math.round(value * 10) / 10}s`;

/** Why the plan cannot render with these settings, or an empty list. */
export const oneTakeBlockers = (
  plan: OneTakeRenderPlan | null,
  settings?: Pick<OneTakeSettings, "model" | "catalogModel"> | null
): string[] => {
  if (!plan) {
    return ["Add a shot to the board first."];
  }
  const blockers: string[] = [];
  const imageCount = plan.compiled.references.length;
  if (imageCount === 0) {
    blockers.push("Render a still for at least one shot.");
  }
  if (imageCount > ONE_TAKE_MAX_IMAGES) {
    blockers.push(
      `${imageCount} images is over the limit of ${ONE_TAKE_MAX_IMAGES}. Remove ${imageCount - ONE_TAKE_MAX_IMAGES}.`
    );
  }
  if (settings && !settings.model) {
    blockers.push("No video model chosen.");
  }
  const duration = plan.compiled.duration_seconds;
  const durations = declared(settings?.catalogModel?.durations);
  if (durations.length > 0) {
    if (!durations.includes(duration)) {
      const name =
        settings?.model?.name ??
        settings?.catalogModel?.name ??
        settings?.model?.id;
      blockers.push(
        `${name} does not offer a ${secondsText(duration)} clip. Pick one of ${durations.map(secondsText).join(", ")}.`
      );
    }
  } else if (duration > ONE_TAKE_DEFAULT_MAX_SECONDS) {
    blockers.push(
      `The take runs ${secondsText(duration)}. One take renders at most ${ONE_TAKE_DEFAULT_MAX_SECONDS}s.`
    );
  }
  return blockers;
};

/** The `generate_media` request a one take or a scene clip sends. */
export const oneTakeRequestData = (
  compiled: CompiledOneTake,
  settings: Pick<OneTakeSettings, "aspect_ratio" | "resolution">,
  model: ShotModelRef
): Record<string, unknown> => ({
  mode: "video",
  capability: ONE_TAKE_TASK,
  prompt: compiled.prompt,
  reference_images: compiled.references.map((reference) => ({
    type: "image",
    asset_id: reference.asset_id
  })),
  aspect_ratio: settings.aspect_ratio,
  resolution: settings.resolution,
  duration: compiled.duration_seconds,
  variations: 1,
  provider: model.provider,
  model: model.id
});

export const useRenderOneTake = (boardId: string): UseRenderOneTakeResult => {
  const board = useStoryboardStore((state) => state.boards[boardId]);
  const { models: catalog } = useVideoModelsByProvider();
  const byTask = useLastModelStore((state) => state.byTask);
  const byKind = useLastModelStore((state) => state.byKind);
  const { startOneTakeClip } = useGenerateShot();

  const remembered = useMemo(
    () => rememberedOneTakeModels(byTask, byKind),
    [byTask, byKind]
  );
  const plan = useMemo(() => planOneTake(board), [board]);
  const settings = useMemo(
    () => resolveOneTakeSettings(board, catalog, remembered),
    [board, catalog, remembered]
  );
  const blockers = useMemo(
    () => oneTakeBlockers(plan, settings),
    [plan, settings]
  );

  const renderOneTake = useCallback(async (): Promise<void> => {
    // Read the board at send time, not the render that built `plan`.
    const current = useStoryboardStore.getState().getBoard(boardId);
    const sendPlan = planOneTake(current);
    const sendSettings = resolveOneTakeSettings(current, catalog, remembered);
    const sendBlockers = oneTakeBlockers(sendPlan, sendSettings);
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
  }, [boardId, catalog, remembered, startOneTakeClip]);

  return { plan, settings, blockers, renderOneTake };
};

export default useRenderOneTake;
