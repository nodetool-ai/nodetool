/**
 * What a storyboard render call would send, per shot.
 *
 * The plan is the whole decision — which prompt, which entities, which model,
 * which shots are already current — separated from the spending. The agent
 * capability (`render_storyboard_stills`, `render_storyboard_clips`) and the
 * `nodetool.storyboard.*` render nodes both plan through here, so a board
 * rendered from a graph matches one rendered from chat (design §3.1).
 *
 * Pure: no provider, no database, no clock.
 */

import {
  assertProductionGenerationAllowed,
  currentRenderInputs,
  entitiesForShot,
  entityConditioningHash,
  isVersionStale,
  keyframePrompt,
  clipPromptFor,
  sceneForShot,
  shotRenderMode
} from "@nodetool-ai/protocol";
import type {
  BoardRenderContext,
  ClipVersion,
  Entity,
  ImageRef,
  KeyframeVersion,
  RenderInputsDraft,
  Shot
} from "@nodetool-ai/protocol";
import {
  compileProductionCandidates,
  effectiveShotDuration
} from "@nodetool-ai/timeline";
import type { CompiledProductionCandidate } from "@nodetool-ai/timeline";
import type { ScriptLine } from "@nodetool-ai/protocol/api-schemas/scripts.js";
import type { StoryboardDocument } from "./document.js";

/** The wire shape the provider layer expands: descriptor text and one image. */
export interface WireEntity {
  name: string;
  descriptor: string;
  reference_images: NonNullable<Entity["reference_images"]>;
}

export interface ShotRenderPlan {
  shotId: string;
  /** The shot's 0-based position, for asset naming and result rows. */
  index: number;
  slug?: string;
  kind: "keyframe" | "clip";
  /** The composed shot prompt. Entities ride alongside in {@link entities}. */
  prompt: string;
  /** The entities seasoning this shot, in the shape the provider layer reads. */
  entities: WireEntity[];
  referenceAssetIds: string[];
  model: { provider: string; model: string; supportedTasks?: string[] };
  /** Capability support resolved by the host for this effective still model. */
  stillModelTakesImages?: boolean;
  /** Production requests compiled before spending, one for each requested take. */
  productionCandidates?: CompiledProductionCandidate[];
  preflightError?: string;
  aspectRatio: string;
  /** How a clip is produced. Always `"keyframe"` on a stills plan. */
  mode: "keyframe" | "direct" | "reference";
  /** Ordered entity reference images to pass to reference_to_video. */
  referenceImages: ImageRef[];
  /** Clip length, when the shot or its linked lines fix one. */
  durationSeconds?: number;
  /** The still a keyframe-mode clip animates. Null when there is none. */
  sourceKeyframe: KeyframeVersion | null;
  /** What to stamp on the version this plan produces. */
  renderInputs: RenderInputsDraft;
  /** True when render_inputs match this plan: nothing to do. */
  fresh: boolean;
}

function imageAssetId(image: ImageRef): string | undefined {
  if (typeof image.asset_id === "string" && image.asset_id.length > 0) {
    return image.asset_id;
  }
  if (typeof image.uri !== "string" || !image.uri.startsWith("asset://")) {
    return undefined;
  }
  const locator = image.uri.slice("asset://".length);
  const extension = locator.lastIndexOf(".");
  return extension > 0 ? locator.slice(0, extension) : locator || undefined;
}

/** Per-call overrides. Each one is recorded, so a render made against something
 * other than the board's own settings reads stale against the board. */
export interface ShotRenderPlanOptions {
  provider?: string;
  model?: string;
  supportedTasks?: string[];
  /** Planning identity. The renderer assigns a fresh batch before dispatch. */
  batchId?: string;
  style?: string;
  aspectRatio?: string;
  /** Forces every shot's clip mode for this call only. */
  mode?: "keyframe" | "direct" | "reference";
  /** Linked script lines, so a clip is rendered long enough to hold its voiceover. */
  scriptLines?: Map<string, ScriptLine>;
}

/**
 * The board values a version's render record is compared against.
 *
 * The board's one style entity is the last style id in the cast, which is what
 * `set_style` writes.
 */
export function boardRenderContext(
  doc: StoryboardDocument,
  entities: readonly Entity[]
): BoardRenderContext {
  const styleIds = new Set(
    entities.filter((e) => e.kind === "style").map((e) => e.id)
  );
  const modelId = (selection: Record<string, unknown> | null): string =>
    typeof selection?.["id"] === "string" ? (selection["id"] as string) : "";
  return {
    aspect_ratio: doc.aspectRatio || "16:9",
    image_model: modelId(doc.imageModel),
    video_model: modelId(doc.videoModel),
    style_entity_id:
      [...(doc.entityIds ?? [])].reverse().find((id) => styleIds.has(id)) ??
      null,
    style: doc.style,
    scenes: doc.screenplay?.scenes ?? null,
    production_reference_asset_ids: doc.creative_context?.reference_bindings?.map((binding) => binding.asset_id) ?? [],
    entity_conditioning_hash: entityConditioningHash(
      entities.filter((entity) => (doc.entityIds ?? []).includes(entity.id))
    ),
    reference_asset_ids: entities
      .filter((entity) => (doc.entityIds ?? []).includes(entity.id))
      .flatMap((entity) => (entity.reference_images ?? []).map(imageAssetId))
      .filter((id): id is string => typeof id === "string" && id.length > 0)
  };
}

const wireEntity = (entity: Entity): WireEntity => ({
  name: entity.name,
  descriptor: entity.descriptor,
  reference_images: entity.reference_images?.slice(0, 1) ?? []
});

const stringField = (
  selection: { id?: unknown; provider?: unknown } | null,
  key: "id" | "provider"
): string => {
  const value = selection?.[key];
  return typeof value === "string" ? value : "";
};

/** Resolve a target: shot id, 0-based index, or slug. */
function findShot(shots: readonly Shot[], target: string): Shot | undefined {
  const byId = shots.find((s) => s.id === target);
  if (byId) return byId;
  const index = Number(target);
  if (Number.isInteger(index)) {
    const byIndex = shots.find((s) => s.index === index);
    if (byIndex) return byIndex;
  }
  const slug = target.trim().toLowerCase();
  return shots.find((s) => (s.slug ?? "").trim().toLowerCase() === slug);
}

/** The shots a plan covers: `targets` in the order given, else every shot by index. */
function selectShots(doc: StoryboardDocument, targets?: string[]): Shot[] {
  const ordered = [...doc.shots].sort((a, b) => a.index - b.index);
  if (!targets) return ordered;
  const selected: Shot[] = [];
  for (const target of targets) {
    const shot = findShot(ordered, String(target));
    if (shot && !selected.includes(shot)) selected.push(shot);
  }
  return selected;
}

/**
 * The render each selected shot needs for `kind`.
 *
 * `fresh` is measured against the board's own settings, never the call's
 * overrides — a shot is current when the board would render it the same way,
 * which is what "skip what is already up to date" means. The record on
 * {@link ShotRenderPlan.renderInputs} is the opposite: it says what this call
 * actually rendered with, overrides included.
 */
export function planShotRenders(
  doc: StoryboardDocument,
  entities: readonly Entity[],
  kind: "keyframe" | "clip",
  targets?: string[],
  options: ShotRenderPlanOptions = {}
): ShotRenderPlan[] {
  const board = boardRenderContext(doc, entities);
  const style = options.style ?? doc.style;
  const aspectRatio = options.aspectRatio ?? (doc.aspectRatio || "16:9");
  const lines = options.scriptLines ?? new Map<string, ScriptLine>();

  return selectShots(doc, targets).map((shot) => {
    assertProductionGenerationAllowed(shot.production, kind === "keyframe" ? "text_to_image" : "text_to_video");
    const requestedMode = options.mode ?? shotRenderMode(shot);
    let mode = requestedMode;
    const selection =
      kind === "keyframe"
        ? (shot.still_model ?? doc.imageModel)
        : (shot.clip_model ?? doc.videoModel);
    const model: ShotRenderPlan["model"] = {
      provider: options.provider || stringField(selection, "provider"),
      model: options.model || stringField(selection, "id")
    };
    const declaredTasks =
      selection !== null && "supported_tasks" in selection
        ? selection.supported_tasks
        : undefined;
    const usesStoredSelection =
      model.provider === stringField(selection, "provider") &&
      model.model === stringField(selection, "id");
    const supportedTasks =
      options.supportedTasks ??
      (usesStoredSelection && Array.isArray(declaredTasks)
        ? declaredTasks.filter(
            (task): task is string => typeof task === "string"
          )
        : undefined);
    if (supportedTasks !== undefined) {
      model.supportedTasks = supportedTasks;
    }
    const rendered: BoardRenderContext = {
      ...board,
      ...(kind === "keyframe"
        ? { image_model: model.model }
        : { video_model: model.model }),
      aspect_ratio: aspectRatio,
      style
    };
    const context = {
      scene: sceneForShot(shot, doc.screenplay?.scenes),
      style
    };
    let prompt =
      kind === "keyframe"
        ? keyframePrompt(shot, context)
        : clipPromptFor(shot, context, mode);
    const applied = entitiesForShot(shot, [...entities]);
    let shotReferenceAssetIds = applied.flatMap((entity) =>
      (kind === "keyframe"
        ? (entity.reference_images?.slice(0, 1) ?? [])
        : (entity.reference_images ?? [])
      )
        .map(imageAssetId)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    );
    const originalReferenceAssetIds = shotReferenceAssetIds;
    let referenceImages =
      mode === "reference"
        ? applied.flatMap((entity) => entity.reference_images ?? [])
        : [];
    let productionCandidates: CompiledProductionCandidate[] | undefined;
    let preflightError: string | undefined;
    let durationSeconds =
      kind === "clip" ? effectiveShotDuration(shot, lines).seconds : undefined;
    if (kind === "clip") {
      try {
        productionCandidates = compileProductionCandidates({
          batchId: options.batchId ?? "storyboard-render-plan",
          destinationId: shot.id,
          destinationKind: "storyboard_shot",
          operation: "initial_generation",
          prompt,
          ...(shot.production !== undefined && { requirement: shot.production }),
          entityIds: applied.map((entity) => entity.id),
          referenceAssetIds: mode === "reference" ? shotReferenceAssetIds : [],
          ...(doc.creative_context?.reference_bindings !== undefined && { referenceBindings: doc.creative_context.reference_bindings }),
          provider: model.provider,
          model: model.model,
          ...(durationSeconds !== undefined && {
            requestedDurationMs: Math.round(durationSeconds * 1000)
          }),
          routeSupport: {
            referenceToVideo: true,
            audioDrivenPerformance: false
          }
        });
        const first = productionCandidates[0];
        if (first !== undefined) {
          prompt = first.snapshot.prompt ?? prompt;
          if (first.snapshot.requestedDurationMs !== undefined) {
            durationSeconds = first.snapshot.requestedDurationMs / 1000;
          }
          if (first.executionRoute === "reference_to_video") {
            mode = "reference";
            const existingIds = new Set(referenceImages.map(imageAssetId));
            const boundIds = first.referenceAssetIds.filter(
              (id) => !existingIds.has(id)
            );
            referenceImages = [
              ...referenceImages,
              ...boundIds.map(
                (asset_id): ImageRef => ({ type: "image", asset_id })
              )
            ];
            shotReferenceAssetIds = [...first.referenceAssetIds];
          }
        }
        if (mode === "reference" && referenceImages.length === 0) {
          preflightError =
            "Reference mode requires at least one resolved reference image.";
        }
      } catch (error) {
        preflightError = error instanceof Error ? error.message : String(error);
      }
    }
    const conditioningHash = entityConditioningHash(applied);
    const shotBoard = {
      ...board,
      reference_asset_ids: originalReferenceAssetIds,
      entity_conditioning_hash: conditioningHash
    };
    const shotRendered = {
      ...rendered,
      reference_asset_ids: shotReferenceAssetIds,
      entity_conditioning_hash: conditioningHash
    };
    const version: KeyframeVersion | ClipVersion | null | undefined =
      kind === "keyframe" ? shot.keyframe : shot.clip;
    const plan: ShotRenderPlan = {
      shotId: shot.id,
      index: shot.index,
      kind,
      prompt,
      entities: applied.map(wireEntity),
      referenceAssetIds: shotReferenceAssetIds,
      model,
      aspectRatio,
      mode: kind === "keyframe" ? "keyframe" : mode,
      referenceImages,
      sourceKeyframe: shot.keyframe ?? null,
      renderInputs:
        kind === "clip"
          ? currentRenderInputs(
              {
                ...shot,
                render_mode: requestedMode,
                clip_model: { id: model.model, provider: model.provider }
              },
              shotRendered,
              kind
            )
          : currentRenderInputs(
              {
                ...shot,
                still_model: { id: model.model, provider: model.provider }
              },
              shotRendered,
              kind
            ),
      fresh: !isVersionStale(version, shot, shotBoard)
    };
    if (shot.slug !== undefined) plan.slug = shot.slug;
    if (durationSeconds !== undefined) plan.durationSeconds = durationSeconds;
    if (productionCandidates !== undefined)
      plan.productionCandidates = productionCandidates;
    if (preflightError !== undefined) plan.preflightError = preflightError;
    return plan;
  });
}
