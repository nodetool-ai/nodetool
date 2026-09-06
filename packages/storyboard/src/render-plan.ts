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
  currentRenderInputs,
  entitiesForShot,
  isVersionStale,
  keyframePrompt,
  clipPrompt,
  directClipPrompt,
  sceneForShot,
  shotRenderMode
} from "@nodetool-ai/protocol";
import type {
  BoardRenderContext,
  ClipVersion,
  Entity,
  KeyframeVersion,
  RenderInputsDraft,
  Shot
} from "@nodetool-ai/protocol";
import { effectiveShotDuration } from "@nodetool-ai/timeline";
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
  model: { provider: string; model: string };
  aspectRatio: string;
  /** How a clip is produced. Always `"keyframe"` on a stills plan. */
  mode: "keyframe" | "direct";
  /** Clip length, when the shot or its linked lines fix one. */
  durationSeconds?: number;
  /** The still a keyframe-mode clip animates. Null when there is none. */
  sourceKeyframe: KeyframeVersion | null;
  /** What to stamp on the version this plan produces. */
  renderInputs: RenderInputsDraft;
  /** True when render_inputs match this plan: nothing to do. */
  fresh: boolean;
}

/** Per-call overrides. Each one is recorded, so a render made against something
 * other than the board's own settings reads stale against the board. */
export interface ShotRenderPlanOptions {
  provider?: string;
  model?: string;
  style?: string;
  aspectRatio?: string;
  /** Forces every shot's clip mode for this call only. */
  mode?: "keyframe" | "direct";
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
    scenes: doc.screenplay?.scenes ?? null
  };
}

const wireEntity = (entity: Entity): WireEntity => ({
  name: entity.name,
  descriptor: entity.descriptor,
  reference_images: entity.reference_images?.slice(0, 1) ?? []
});

const stringField = (
  selection: Record<string, unknown> | null,
  key: string
): string => (typeof selection?.[key] === "string" ? (selection[key] as string) : "");

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
  const selection = kind === "keyframe" ? doc.imageModel : doc.videoModel;
  const model = {
    provider: options.provider || stringField(selection, "provider"),
    model: options.model || stringField(selection, "id")
  };
  // What this call renders with, which is not always what the board says.
  const rendered: BoardRenderContext = {
    ...board,
    ...(kind === "keyframe"
      ? { image_model: model.model }
      : { video_model: model.model }),
    aspect_ratio: aspectRatio,
    style
  };
  const lines = options.scriptLines ?? new Map<string, ScriptLine>();

  return selectShots(doc, targets).map((shot) => {
    const mode = options.mode ?? shotRenderMode(shot);
    const context = {
      scene: sceneForShot(shot, doc.screenplay?.scenes),
      style
    };
    const prompt =
      kind === "keyframe"
        ? keyframePrompt(shot, context)
        : mode === "direct"
          ? directClipPrompt(shot, context)
          : clipPrompt(shot);
    const applied = entitiesForShot(shot, [...entities]);
    const version: KeyframeVersion | ClipVersion | null | undefined =
      kind === "keyframe" ? shot.keyframe : shot.clip;
    const plan: ShotRenderPlan = {
      shotId: shot.id,
      index: shot.index,
      kind,
      prompt,
      entities: applied.map(wireEntity),
      referenceAssetIds: applied
        .map((e) => e.reference_images?.[0]?.asset_id)
        .filter((id): id is string => !!id),
      model,
      aspectRatio,
      mode: kind === "keyframe" ? "keyframe" : mode,
      sourceKeyframe: shot.keyframe ?? null,
      renderInputs: currentRenderInputs(shot, rendered, kind),
      fresh: !isVersionStale(version, shot, board)
    };
    if (shot.slug !== undefined) plan.slug = shot.slug;
    if (kind === "clip") {
      const duration = effectiveShotDuration(shot, lines).seconds;
      if (duration !== undefined) plan.durationSeconds = duration;
    }
    return plan;
  });
}
