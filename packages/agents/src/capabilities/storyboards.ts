/**
 * The `storyboards` capability module.
 *
 * Storyboard capabilities: list and create, render stills and clips, revise
 * one take, assemble a timeline, edit the shot list, extract a script, and
 * delete. The render path used to be seven `Tool` subclasses in
 * `../tools/storyboard-render-tools.ts`.
 *
 * Wire names, descriptions and schemas are unchanged. Prompt composition,
 * entity seasoning, and the shot → timeline mapping stay the editor's own
 * (`entitiesForShot` from `@nodetool-ai/protocol`, `buildStoryboardTimeline`
 * from `@nodetool-ai/timeline`), so a board rendered headlessly matches one
 * rendered in the UI. Every heavy dependency is imported inside the
 * implementation that needs it.
 *
 * Design: docs/tool-class-retirement-design.md § "Migration".
 */

import type { JsonSchema, ProcessingContext } from "@nodetool-ai/runtime";
import type {
  Asset,
  Script,
  Storyboard,
  StoryboardDocument
} from "@nodetool-ai/models";
import type {
  Entity,
  EntityKind,
  ImageRef,
  Screenplay,
  ScriptLinkDocument,
  Shot,
  VideoRef
} from "@nodetool-ai/protocol";
import type { ScriptAssemblyInput } from "@nodetool-ai/timeline";
import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";
import { stampScriptStoryboardId } from "./script-link.js";
import {
  listStoryboardsSpec,
  createStoryboardSpec,
  getStoryboardSpec,
  renderStoryboardStillsSpec,
  renderStoryboardClipsSpec,
  reviseStoryboardClipSpec,
  assembleStoryboardTimelineSpec,
  editStoryboardSpec,
  extractScriptFromStoryboardSpec,
  DEFAULT_CONCURRENCY,
  MAX_CONCURRENCY,
  SHOT_TARGETS_SCHEMA,
  LIST_STORYBOARDS_SCHEMA,
  CREATE_STORYBOARD_SCHEMA,
  GET_STORYBOARD_SCHEMA,
  RENDER_STILLS_SCHEMA,
  RENDER_CLIPS_SCHEMA,
  REVISE_CLIP_SCHEMA,
  ASSEMBLE_STORYBOARD_TIMELINE_SCHEMA,
  EDIT_STORYBOARD_SCHEMA,
  EXTRACT_SCRIPT_SCHEMA,
  deleteStoryboardSpec
} from "./storyboards.specs.js";
import {
  isNonBlankString,
  isNumber,
  isObjectLike,
  isRecord,
  isString
} from "../utils/type-guards.js";

export {
  DEFAULT_CONCURRENCY,
  MAX_CONCURRENCY,
  SHOT_TARGETS_SCHEMA,
  LIST_STORYBOARDS_SCHEMA,
  CREATE_STORYBOARD_SCHEMA,
  GET_STORYBOARD_SCHEMA,
  RENDER_STILLS_SCHEMA,
  RENDER_CLIPS_SCHEMA,
  REVISE_CLIP_SCHEMA,
  ASSEMBLE_STORYBOARD_TIMELINE_SCHEMA,
  EDIT_STORYBOARD_SCHEMA,
  EXTRACT_SCRIPT_SCHEMA
} from "./storyboards.specs.js";
/** Shots one call may render, so a stray `targets: "all"` cannot bankrupt a run. */
const MAX_SHOTS_PER_CALL = 24;
/** Attempts to land a document write before reporting a conflict. */
const CAS_ATTEMPTS = 5;

const ENTITY_METADATA_KEY = "nodetool_entity";
const ENTITY_KINDS: ReadonlySet<string> = new Set([
  "character",
  "location",
  "style",
  "prop"
]);

interface BoardHandle {
  row: Storyboard;
  doc: StoryboardDocument;
}

type ToolError = { error: string };

const isError = (value: unknown): value is ToolError =>
  !!value &&
  typeof value === "object" &&
  typeof (value as ToolError).error === "string";

async function loadBoard(
  run: CapabilityRun,
  storyboardId: unknown
): Promise<BoardHandle | ToolError> {
  if (!isString(storyboardId) || !storyboardId) {
    return {
      error: "storyboard_id is required (use list_storyboards to find one)."
    };
  }
  const { Storyboard } = await import("@nodetool-ai/models");
  const row = await Storyboard.findById(storyboardId);
  // A board owned by someone else reads as missing — the same rule the tRPC
  // router's ownership check applies.
  if (!row || row.user_id !== run.context.userId) {
    return { error: `Storyboard ${storyboardId} was not found.` };
  }
  return { row, doc: row.toDocument() };
}

/**
 * The board as a {@link Screenplay}, which is the shape every script-link
 * function reads. `doc.shots` is the authoritative shot list — `doc.screenplay`
 * carries the piece's framing (title, narration, music, and the `script_id`
 * link) and a board directed shot-by-shot may not have one at all.
 */
function boardScreenplay(row: Storyboard, doc: StoryboardDocument): Screenplay {
  return {
    type: "screenplay",
    id: `sp_${row.id}`,
    title: row.name,
    ...(doc.screenplay ?? {}),
    shots: doc.shots
  };
}

/** The linked script's document, or null when nothing links or it is gone. */
async function loadLinkedScript(
  screenplay: Screenplay,
  userId: string | undefined
): Promise<ScriptLinkDocument | null> {
  const scriptId = screenplay.script_id;
  if (!scriptId) return null;
  const { Script } = await import("@nodetool-ai/models");
  const row = await Script.findById(scriptId);
  if (!row || row.user_id !== userId) return null;
  return row.toDocument();
}

/**
 * The linked script as the joint assembler wants it, or `null` when nothing
 * links, the script is gone, or reading it failed. Never throws: a broken link
 * downgrades the assemble to the unlinked path with a warning (design §1.3).
 */
async function loadLinkedAssemblyScript(
  scriptId: string,
  userId: string | undefined
): Promise<ScriptAssemblyInput | null> {
  try {
    const { Script } = await import("@nodetool-ai/models");
    const row = await Script.findById(scriptId);
    if (!row || row.user_id !== userId) return null;
    const doc = row.toDocument();
    return { scriptId, cast: doc.cast, sections: doc.sections };
  } catch {
    // A link that cannot be read is a link that is not there.
    return null;
  }
}

/**
 * Link state for a board: what it links, which shots' text has drifted from
 * the lines they project, which lines no shot covers, and what
 * `validateScriptLink` says. Reported by `get_storyboard` so an agent can see
 * what needs fixing without a second round trip.
 */
async function scriptLinkSummary(
  screenplay: Screenplay,
  scriptDoc: ScriptLinkDocument | null
): Promise<{
  linked: boolean;
  script_id: string | null;
  script_found: boolean;
  drifted_shot_ids: string[];
  orphan_line_ids: string[];
  issues: string[];
}> {
  const { orphanedLineIds, shotDialogueDrifted, validateScriptLink } =
    await import("@nodetool-ai/protocol");
  const linked = !!screenplay.script_id;
  const validation = validateScriptLink(screenplay, scriptDoc);
  const linesById = new Map(
    (scriptDoc?.sections ?? [])
      .flatMap((section) => section.lines)
      .map((line) => [line.id, line] as const)
  );
  return {
    linked,
    script_id: screenplay.script_id ?? null,
    script_found: !!scriptDoc,
    drifted_shot_ids: scriptDoc
      ? screenplay.shots
          .filter((shot) => shotDialogueDrifted(shot, linesById))
          .map((shot) => shot.id)
      : [],
    orphan_line_ids: scriptDoc ? orphanedLineIds(screenplay, scriptDoc) : [],
    issues: [...validation.errors, ...validation.warnings].map((i) => i.message)
  };
}

/** Resolve a shot reference: shot id, 0-based index, or a slug. */
function findShot(shots: Shot[], target: string): Shot | undefined {
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

/**
 * The shots a render call acts on: the explicit `targets` when given, else
 * every shot `needsWork` accepts — the "render what is missing" default that
 * makes a whole board one call.
 */
function selectShots(
  shots: Shot[],
  targets: unknown,
  needsWork: (shot: Shot) => boolean
): Shot[] | ToolError {
  const ordered = [...shots].sort((a, b) => a.index - b.index);
  if (targets === undefined || targets === null) {
    return ordered.filter(needsWork);
  }
  const list = Array.isArray(targets) ? targets : [targets];
  const selected: Shot[] = [];
  for (const raw of list) {
    const target = String(raw);
    const shot = findShot(ordered, target);
    if (!shot) {
      return {
        error: `No shot matches "${target}". Call get_storyboard to list shot ids and indexes.`
      };
    }
    if (!selected.includes(shot)) selected.push(shot);
  }
  return selected;
}

function clampConcurrency(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return DEFAULT_CONCURRENCY;
  return Math.min(n, MAX_CONCURRENCY);
}

/** Run `task` over `items`, at most `limit` in flight. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      for (;;) {
        const index = next++;
        if (index >= items.length) return;
        results[index] = await task(items[index]);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

/**
 * Apply `patch` to one shot and persist the board.
 *
 * Renders run concurrently against a single row, so the write is a CAS on
 * `updated_at`: on conflict the row is re-read and the patch re-applied to the
 * fresher document, never to the stale copy the render started from.
 */
async function patchShot(
  storyboardId: string,
  shotId: string,
  patch: (shot: Shot) => Shot
): Promise<Shot | ToolError> {
  const { Storyboard } = await import("@nodetool-ai/models");
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
    const row = await Storyboard.findById(storyboardId);
    if (!row) return { error: `Storyboard ${storyboardId} was not found.` };
    const doc = row.toDocument();
    const index = doc.shots.findIndex((s) => s.id === shotId);
    if (index === -1)
      return { error: `Shot ${shotId} is no longer on the board.` };
    const updated = patch(doc.shots[index]);
    const shots = [...doc.shots];
    shots[index] = updated;
    const saved = await Storyboard.updateFieldsIfUnchanged(
      storyboardId,
      row.updated_at,
      { document: JSON.stringify({ ...doc, shots }) }
    );
    if (saved) return updated;
  }
  return {
    error: `Storyboard ${storyboardId} is being modified concurrently; the render finished but could not be saved. Retry the call.`
  };
}

/** Read an entity marker off an asset, mirroring the library's storage rule. */
function entityFromAsset(
  asset: Asset,
  mimeToExt: Record<string, string>
): Entity | null {
  const metadata = asset.metadata;
  const raw = metadata?.[ENTITY_METADATA_KEY];
  if (!isObjectLike(raw)) return null;
  const marker = raw as Record<string, unknown>;
  const kind = isString(marker.kind) ? marker.kind : "";
  if (!ENTITY_KINDS.has(kind)) return null;
  const ext = mimeToExt[asset.content_type] ?? "png";
  return {
    type: "entity",
    id: asset.id,
    kind: kind as EntityKind,
    name: isString(marker.name) ? marker.name : "",
    descriptor: isString(marker.descriptor) ? marker.descriptor : "",
    reference_images: [
      { type: "image", asset_id: asset.id, uri: `asset://${asset.id}.${ext}` }
    ]
  };
}

/** The board's library entities, dropping ids that no longer resolve. */
async function loadBoardEntities(
  context: ProcessingContext,
  doc: StoryboardDocument
): Promise<Entity[]> {
  const ids = doc.entityIds ?? [];
  if (ids.length === 0 || !context.userId) return [];
  const { Asset } = await import("@nodetool-ai/models");
  const { MIME_TO_EXT } = await import("../tools/asset-persist.js");
  const loaded = await Promise.all(
    ids.map(async (id) => {
      try {
        const asset = await Asset.find(context.userId, id);
        return asset ? entityFromAsset(asset, MIME_TO_EXT) : null;
      } catch {
        return null;
      }
    })
  );
  return loaded.filter((e): e is Entity => !!e && e.name.length > 0);
}

/** The wire shape the provider layer expands (descriptor text + one image). */
const wireEntity = (entity: Entity) => ({
  name: entity.name,
  descriptor: entity.descriptor,
  reference_images: entity.reference_images?.slice(0, 1) ?? []
});

/** Still prompt: the shot's action, its framing, and the board style. */
function keyframePrompt(shot: Shot, style: string): string {
  const parts = [shot.action.trim()];
  if (shot.camera?.framing) parts.push(`${shot.camera.framing} shot`);
  if (style.trim()) parts.push(style.trim());
  return parts.filter((p) => p.length > 0).join(", ");
}

/** Clip prompt: what moves, then what is in frame. */
const clipPrompt = (shot: Shot): string =>
  [shot.motion, shot.action]
    .filter((p): p is string => !!p && p.trim().length > 0)
    .join(", ");

interface ModelChoice {
  provider: string;
  model: string;
}

/**
 * The provider+model a render runs on: the call's override, else the board's
 * own selection. There is no fallback default — an unset model is an error
 * that names `find_model`, rather than silent spend on a model nobody chose.
 */
function resolveModel(
  params: Record<string, unknown>,
  boardModel: Record<string, unknown> | null,
  kind: string
): ModelChoice | ToolError {
  const provider =
    isString(params["provider"]) && params["provider"]
      ? params["provider"]
      : isString(boardModel?.provider)
        ? boardModel.provider
        : "";
  const model =
    isString(params["model"]) && params["model"]
      ? params["model"]
      : isString(boardModel?.id)
        ? boardModel.id
        : "";
  if (!provider || !model) {
    return {
      error: `No ${kind} model is set on this storyboard. Pass provider + model (use find_model with capability=${kind === "still" ? "text_to_image" : "image_to_video"}), or set one on the board.`
    };
  }
  return { provider, model };
}

/** Save rendered bytes as an asset; the board can only reference persisted media. */
async function saveMedia(
  context: ProcessingContext,
  bytes: Uint8Array,
  namePrefix: string,
  mime: string
): Promise<{ assetId: string; uri: string } | ToolError> {
  const { persistOutput } = await import("../tools/asset-persist.js");
  const saved = await persistOutput(context, bytes, { namePrefix, mime });
  if (!saved.asset_id || !saved.asset_uri) {
    return {
      error:
        "The render succeeded but could not be saved as an asset, so it cannot be attached to the shot. This host has no asset storage wired."
    };
  }
  return { assetId: saved.asset_id, uri: saved.asset_uri };
}

const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

/** Per-shot outcome, one row per selected shot. */
interface ShotOutcome {
  shot_id: string;
  index: number;
  slug?: string;
  ok: boolean;
  asset_id?: string;
  asset_uri?: string;
  status?: string;
  error?: string;
}

const listStoryboards: CapabilityExport = {
  spec: listStoryboardsSpec,
  impl: async (run, params) => {
    const userId = run.context.userId;
    if (!userId) return { error: "No user is bound to this session." };
    const { Storyboard } = await import("@nodetool-ai/models");
    const limit = Math.max(1, Math.min(Number(params["limit"]) || 20, 100));
    const rows = await Storyboard.listByUser(userId, limit);
    return {
      storyboards: rows.map((row) => {
        const doc = row.toDocument();
        return {
          id: row.id,
          name: row.name,
          shots: doc.shots.length,
          with_keyframe: doc.shots.filter((s) => !!s.keyframe).length,
          with_clip: doc.shots.filter((s) => !!s.clip).length,
          timeline_id: row.timeline_id ?? undefined,
          updated_at: row.updated_at
        };
      })
    };
  }
};

/** A blank board matching `storyboards.create` on the tRPC router. */
function createdBoardSummary(row: Storyboard) {
  const doc = row.toDocument();
  return {
    ok: true as const,
    storyboard_id: row.id,
    name: row.name,
    project_id: row.project_id,
    shots: doc.shots.length,
    updated_at: row.updated_at
  };
}

const createStoryboard: CapabilityExport = {
  spec: createStoryboardSpec,
  impl: async (run, params) => {
    const userId = run.context.userId;
    if (!userId) return { error: "No user is bound to this session." };
    const name = params["name"];
    if (!isNonBlankString(name)) {
      return { error: "name is required and must be a non-empty string." };
    }
    const projectId = isNonBlankString(params["project_id"])
      ? params["project_id"].trim()
      : "default";
    const requestedId = isNonBlankString(params["id"])
      ? params["id"].trim()
      : undefined;

    const { Storyboard, emptyStoryboardDocument } = await import(
      "@nodetool-ai/models"
    );
    if (requestedId) {
      const existing = await Storyboard.findById(requestedId);
      if (existing) {
        if (existing.user_id !== userId) {
          return {
            error: `A storyboard with id ${requestedId} already exists.`
          };
        }
        return createdBoardSummary(existing);
      }
    }

    const document = emptyStoryboardDocument();
    if (isNonBlankString(params["brief"])) {
      document.brief = params["brief"].trim();
    }
    if (isNonBlankString(params["style"])) {
      document.style = params["style"].trim();
    }
    if (isNonBlankString(params["aspect_ratio"])) {
      document.aspectRatio = params["aspect_ratio"].trim();
    }

    const fields: ConstructorParameters<typeof Storyboard>[0] = {
      user_id: userId,
      project_id: projectId,
      name: name.trim(),
      document: JSON.stringify(document)
    };
    if (requestedId) {
      fields.id = requestedId;
    }
    const board = new Storyboard(fields);
    await board.save();
    return createdBoardSummary(board);
  }
};

const getStoryboard: CapabilityExport = {
  spec: getStoryboardSpec,
  impl: async (run, params) => {
    const board = await loadBoard(run, params["storyboard_id"]);
    if (isError(board)) return board;
    const { row, doc } = board;
    const screenplay = boardScreenplay(row, doc);
    const scriptDoc = await loadLinkedScript(screenplay, run.context.userId);
    const link = await scriptLinkSummary(screenplay, scriptDoc);
    const drifted = new Set(link.drifted_shot_ids);
    return {
      id: row.id,
      name: row.name,
      brief: doc.brief,
      style: doc.style,
      aspect_ratio: doc.aspectRatio,
      image_model: doc.imageModel ?? null,
      video_model: doc.videoModel ?? null,
      entity_ids: doc.entityIds ?? [],
      timeline_id: row.timeline_id ?? undefined,
      narration: doc.screenplay?.narration ?? undefined,
      music_prompt: doc.screenplay?.music_prompt ?? undefined,
      script_id: link.script_id,
      script_link: link,
      shots: [...doc.shots]
        .sort((a, b) => a.index - b.index)
        .map((shot) => ({
          id: shot.id,
          index: shot.index,
          slug: shot.slug,
          action: shot.action,
          camera: shot.camera,
          motion: shot.motion,
          duration_seconds: shot.duration_seconds,
          status: shot.status,
          has_keyframe: !!shot.keyframe,
          has_clip: !!shot.clip,
          script_line_ids: shot.script_line_ids ?? [],
          duration_source: shot.duration_source,
          script_drifted: drifted.has(shot.id)
        }))
    };
  }
};

const renderStoryboardStills: CapabilityExport = {
  spec: renderStoryboardStillsSpec,
  impl: async (run, params) => {
    const context = run.context;
    const board = await loadBoard(run, params["storyboard_id"]);
    if (isError(board)) return board;
    const { row, doc } = board;

    const model = resolveModel(params, doc.imageModel, "still");
    if (isError(model)) return model;

    const selected = selectShots(
      doc.shots,
      params["targets"],
      (s) => !s.keyframe
    );
    if (isError(selected)) return selected;
    if (selected.length === 0) {
      return {
        rendered: 0,
        results: [],
        note: "Every shot already has a still."
      };
    }
    if (selected.length > MAX_SHOTS_PER_CALL) {
      return {
        error: `${selected.length} shots selected, over the ${MAX_SHOTS_PER_CALL}-shot per-call limit. Pass targets in batches.`
      };
    }

    const { entitiesForShot } = await import("@nodetool-ai/protocol");
    const { inferImageMime } = await import("../tools/asset-persist.js");
    const style =
      isString(params["style"])
        ? params["style"]
        : doc.style;
    const entities = await loadBoardEntities(context, doc);
    const aspectRatio = doc.aspectRatio || "16:9";

    const results = await mapWithConcurrency(
      selected,
      clampConcurrency(params["concurrency"]),
      async (shot): Promise<ShotOutcome> => {
        const base: ShotOutcome = {
          shot_id: shot.id,
          index: shot.index,
          slug: shot.slug,
          ok: false
        };
        try {
          const bytes = (await context.runProviderPrediction({
            provider: model.provider,
            capability: "text_to_image",
            model: model.model,
            params: {
              prompt: keyframePrompt(shot, style),
              entities: entitiesForShot(shot, entities).map(wireEntity),
              aspect_ratio: aspectRatio
            }
          })) as Uint8Array;
          const saved = await saveMedia(
            context,
            bytes,
            `shot-${shot.index + 1}-still`,
            inferImageMime(bytes)
          );
          if (isError(saved)) return { ...base, error: saved.error };

          const keyframe: ImageRef = {
            type: "image",
            asset_id: saved.assetId,
            uri: saved.uri
          };
          const updated = await patchShot(row.id, shot.id, (current) => {
            const versions =
              current.keyframe_versions ??
              (current.keyframe ? [current.keyframe] : []);
            return {
              ...current,
              keyframe,
              keyframe_versions: [...versions, keyframe],
              status: "keyframe_ready"
            };
          });
          if (isError(updated)) return { ...base, error: updated.error };
          return {
            ...base,
            ok: true,
            asset_id: saved.assetId,
            asset_uri: saved.uri,
            status: updated.status
          };
        } catch (e) {
          await patchShot(row.id, shot.id, (current) => ({
            ...current,
            status: "failed"
          }));
          return { ...base, error: `text_to_image failed: ${errorMessage(e)}` };
        }
      }
    );

    return {
      storyboard_id: row.id,
      provider: model.provider,
      model: model.model,
      rendered: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results
    };
  }
};

const renderStoryboardClips: CapabilityExport = {
  spec: renderStoryboardClipsSpec,
  impl: async (run, params) => {
    const context = run.context;
    const board = await loadBoard(run, params["storyboard_id"]);
    if (isError(board)) return board;
    const { row, doc } = board;

    const model = resolveModel(params, doc.videoModel, "clip");
    if (isError(model)) return model;

    const selected = selectShots(
      doc.shots,
      params["targets"],
      (s) => !!s.keyframe && !s.clip
    );
    if (isError(selected)) return selected;
    if (selected.length === 0) {
      return {
        rendered: 0,
        results: [],
        note: "No shot has a still waiting to be animated. Run render_storyboard_stills first, or name shots explicitly with `targets`."
      };
    }
    if (selected.length > MAX_SHOTS_PER_CALL) {
      return {
        error: `${selected.length} shots selected, over the ${MAX_SHOTS_PER_CALL}-shot per-call limit. Pass targets in batches.`
      };
    }

    const { loadMediaRefBytes } = await import("@nodetool-ai/runtime");
    const { entitiesForShot } = await import("@nodetool-ai/protocol");
    const { effectiveShotDuration, scriptLinesById } = await import(
      "@nodetool-ai/timeline"
    );
    const entities = await loadBoardEntities(context, doc);
    // A linked board times its shots from the words they cover, so a clip is
    // rendered long enough to hold its voiceover (design §2.3). A shot pinned
    // to `manual`, an unvoiced line, or an unlinked board keeps
    // `duration_seconds`.
    const scriptDoc = await loadLinkedScript(
      boardScreenplay(row, doc),
      context.userId
    );
    const linesById = scriptLinesById(scriptDoc?.sections ?? []);
    const aspectRatio = doc.aspectRatio || "16:9";
    const resolution =
      isString(params["resolution"])
        ? params["resolution"]
        : undefined;

    const results = await mapWithConcurrency(
      selected,
      clampConcurrency(params["concurrency"]),
      async (shot): Promise<ShotOutcome> => {
        const base: ShotOutcome = {
          shot_id: shot.id,
          index: shot.index,
          slug: shot.slug,
          ok: false
        };
        if (!shot.keyframe) {
          return {
            ...base,
            error:
              "Shot has no still to animate. Run render_storyboard_stills first."
          };
        }
        try {
          const seed = await loadMediaRefBytes(shot.keyframe, context);
          if (!seed || seed.length === 0) {
            return {
              ...base,
              error: "The shot's still could not be read back from storage."
            };
          }
          const bytes = (await context.runProviderPrediction({
            provider: model.provider,
            capability: "image_to_video",
            model: model.model,
            params: {
              images: [seed],
              prompt: clipPrompt(shot),
              entities: entitiesForShot(shot, entities).map(wireEntity),
              aspect_ratio: aspectRatio,
              resolution,
              duration_seconds: effectiveShotDuration(shot, linesById).seconds
            }
          })) as Uint8Array;
          const saved = await saveMedia(
            context,
            bytes,
            `shot-${shot.index + 1}-clip`,
            "video/mp4"
          );
          if (isError(saved)) return { ...base, error: saved.error };

          const clip: VideoRef = {
            type: "video",
            asset_id: saved.assetId,
            uri: saved.uri
          };
          const updated = await patchShot(row.id, shot.id, (current) => {
            const versions =
              current.clip_versions ?? (current.clip ? [current.clip] : []);
            return {
              ...current,
              clip,
              clip_versions: [...versions, clip],
              status: "rendered"
            };
          });
          if (isError(updated)) return { ...base, error: updated.error };
          return {
            ...base,
            ok: true,
            asset_id: saved.assetId,
            asset_uri: saved.uri,
            status: updated.status
          };
        } catch (e) {
          await patchShot(row.id, shot.id, (current) => ({
            ...current,
            status: "failed"
          }));
          return {
            ...base,
            error: `image_to_video failed: ${errorMessage(e)}`
          };
        }
      }
    );

    return {
      storyboard_id: row.id,
      provider: model.provider,
      model: model.model,
      rendered: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results
    };
  }
};

const reviseStoryboardClip: CapabilityExport = {
  spec: reviseStoryboardClipSpec,
  impl: async (run, params) => {
    const context = run.context;
    const board = await loadBoard(run, params["storyboard_id"]);
    if (isError(board)) return board;
    const { row, doc } = board;

    const instruction = String(params["instruction"] ?? "").trim();
    if (!instruction) return { error: "instruction is required." };

    const shot = findShot(doc.shots, String(params["target"] ?? ""));
    if (!shot) {
      return {
        error: `No shot matches "${String(params["target"])}". Call get_storyboard to list shot ids.`
      };
    }
    if (!shot.clip) {
      return {
        error: "Shot has no clip to revise. Run render_storyboard_clips first."
      };
    }

    const model = resolveModel(params, doc.videoModel, "clip");
    if (isError(model)) return model;

    const { loadMediaRefBytes } = await import("@nodetool-ai/runtime");
    try {
      const source = await loadMediaRefBytes(shot.clip, context);
      if (!source || source.length === 0) {
        return {
          error: "The shot's clip could not be read back from storage."
        };
      }
      const bytes = (await context.runProviderPrediction({
        provider: model.provider,
        capability: "video_to_video",
        model: model.model,
        params: { video: source, prompt: instruction }
      })) as Uint8Array;
      const saved = await saveMedia(
        context,
        bytes,
        `shot-${shot.index + 1}-revision`,
        "video/mp4"
      );
      if (isError(saved)) return saved;

      const clip: VideoRef = {
        type: "video",
        asset_id: saved.assetId,
        uri: saved.uri
      };
      const updated = await patchShot(row.id, shot.id, (current) => {
        const versions =
          current.clip_versions ?? (current.clip ? [current.clip] : []);
        return {
          ...current,
          clip,
          clip_versions: [...versions, clip],
          status: "rendered"
        };
      });
      if (isError(updated)) return updated;
      return {
        ok: true,
        shot_id: shot.id,
        index: shot.index,
        asset_id: saved.assetId,
        asset_uri: saved.uri,
        status: updated.status
      };
    } catch (e) {
      return { error: `video_to_video failed: ${errorMessage(e)}` };
    }
  }
};

// ---------------------------------------------------------------------------
// assemble_storyboard_timeline
// ---------------------------------------------------------------------------

/** Render size for an aspect ratio, at a 1080px short edge. */
function frameSize(aspectRatio: string) {
  const [w, h] = aspectRatio.split(":").map((part) => Number(part));
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return { width: 1920, height: 1080 };
  }
  const short = 1080;
  const even = (n: number) => Math.round(n / 2) * 2;
  return w >= h
    ? { width: even((short * w) / h), height: short }
    : { width: short, height: even((short * h) / w) };
}

const assembleStoryboardTimeline: CapabilityExport = {
  spec: assembleStoryboardTimelineSpec,
  impl: async (run, params) => {
    const context = run.context;
    const board = await loadBoard(run, params["storyboard_id"]);
    if (isError(board)) return board;
    const { row, doc } = board;

    const { Storyboard, TimelineSequence } =
      await import("@nodetool-ai/models");
    const {
      buildLinkedTimeline,
      buildStoryboardTimeline,
      foreignTimelineParts
    } = await import("@nodetool-ai/timeline");

    // A board that links a script is cut against the words: shot lengths come
    // from the takes and every voiced line gets its own clip. A link pointing
    // at a script that is gone is a warning, not a failure — the board still
    // assembles on its own (design §1.3).
    const scriptId = doc.screenplay?.script_id ?? null;
    const script = scriptId
      ? await loadLinkedAssemblyScript(scriptId, context.userId)
      : null;
    const warnings: string[] = [];
    if (scriptId && !script) {
      warnings.push(
        `Script ${scriptId} is linked but could not be loaded, so the board was assembled on its own.`
      );
    }

    const assembled = script
      ? buildLinkedTimeline({
          boardId: row.id,
          shots: doc.shots,
          musicPrompt: doc.screenplay?.music_prompt,
          script
        })
      : buildStoryboardTimeline({
          boardId: row.id,
          shots: doc.shots,
          narration: doc.screenplay?.narration,
          musicPrompt: doc.screenplay?.music_prompt
        });
    const skippedLineIds =
      "skippedLineIds" in assembled ? assembled.skippedLineIds : [];
    if (assembled.clips.length === 0) {
      return {
        error:
          "No shot has a rendered clip, so there is nothing to assemble. Run render_storyboard_stills, then render_storyboard_clips.",
        skipped_shot_ids: assembled.skippedShotIds,
        skipped_line_ids: skippedLineIds
      };
    }

    const { width, height } = frameSize(doc.aspectRatio || "16:9");
    const fps = Math.max(1, Math.min(Number(params["fps"]) || 30, 120));
    const name =
      isString(params["name"]) && params["name"]
        ? params["name"]
        : row.name;

    // Re-assembling replaces the board's existing cut rather than leaving a
    // trail of orphan sequences behind it — and rewrites only what this board
    // (and, when linked, this script) owns.
    const existing = row.timeline_id
      ? await TimelineSequence.findById(row.timeline_id)
      : null;
    const reuse =
      existing && existing.user_id === context.userId ? existing : null;

    let tracks = assembled.tracks;
    let clips = assembled.clips;
    let durationMs = assembled.durationMs;
    const previous = reuse?.toDocument();
    if (previous) {
      const foreign = foreignTimelineParts(
        previous,
        (clip) =>
          clip.storyboardBoardId === row.id ||
          (!!scriptId && clip.scriptId === scriptId)
      );
      tracks = [...assembled.tracks, ...foreign.tracks];
      clips = [...assembled.clips, ...foreign.clips];
      durationMs = clips.reduce(
        (end, clip) => Math.max(end, clip.startMs + clip.durationMs),
        0
      );
    }

    const sequence =
      reuse ??
      new TimelineSequence({
        user_id: context.userId,
        project_id: row.project_id,
        name
      });
    sequence.name = name;
    sequence.fps = fps;
    sequence.width = width;
    sequence.height = height;
    sequence.duration_ms = durationMs;
    sequence.fromDocument({
      ...previous,
      tracks,
      clips,
      markers: previous ? previous.markers : []
    });
    await sequence.save();

    if (row.timeline_id !== sequence.id) {
      await Storyboard.updateFieldsIfUnchanged(row.id, row.updated_at, {
        timeline_id: sequence.id
      });
    }

    const result: Record<string, unknown> = {
      ok: true,
      timeline_id: sequence.id,
      name: sequence.name,
      fps,
      width,
      height,
      duration_ms: durationMs,
      clip_count: clips.length,
      track_count: tracks.length,
      script_id: script ? scriptId : null,
      skipped_shot_ids: assembled.skippedShotIds,
      skipped_line_ids: skippedLineIds
    };
    if (warnings.length) {
      result.warnings = warnings;
    }
    return result;
  }
};

// ---------------------------------------------------------------------------
// edit_storyboard
// ---------------------------------------------------------------------------
//
// The render capabilities above fill a board in; this one shapes it. Adding,
// rewriting and reordering shots was browser-only — the `ui_storyboard_*` tools
// round-trip into the open editor's Zustand store — so an agent working
// headlessly could render a board it could not author.

/** Operations one call may apply, so a runaway script cannot rewrite a board. */
const MAX_BOARD_OPS = 60;

const BOARD_OPS = [
  "add_shot",
  "update_shot",
  "remove_shot",
  "reorder_shot",
  "set_board"
] as const;

type BoardOpName = (typeof BOARD_OPS)[number];

const isBoardOpName = (value: string): value is BoardOpName =>
  (BOARD_OPS as readonly string[]).includes(value);

interface ParsedBoardOp {
  op: BoardOpName;
  args: Record<string, unknown>;
}

function parseBoardOps(raw: unknown): ParsedBoardOp[] | ToolError {
  if (!Array.isArray(raw) || raw.length === 0) {
    return {
      error:
        'ops must be a non-empty array, e.g. [{"op": "add_shot", "action": "Wide of the lighthouse at dusk"}].'
    };
  }
  if (raw.length > MAX_BOARD_OPS) {
    return {
      error: `ops holds ${raw.length} entries; at most ${MAX_BOARD_OPS} per call.`
    };
  }
  const parsed: ParsedBoardOp[] = [];
  for (const [index, entry] of raw.entries()) {
    if (!isRecord(entry)) {
      return { error: `ops[${index}] must be an object.` };
    }
    const { op, ...args } = entry as Record<string, unknown>;
    if (!isString(op) || !isBoardOpName(op.trim())) {
      return {
        error: `ops[${index}] names "${String(op)}"; expected one of ${BOARD_OPS.join(", ")}.`
      };
    }
    parsed.push({ op: op.trim() as BoardOpName, args });
  }
  return parsed;
}

/** Renumber `index` to the array order — the field the editor sorts on. */
function renumberShots(shots: Shot[]): Shot[] {
  return shots.map((shot, index) =>
    shot.index === index ? shot : { ...shot, index }
  );
}

const optionalString = (value: unknown): string | undefined =>
  isString(value) ? value : undefined;

/** The shot fields an edit may set. Media and status stay the render tools'. */
function applyShotFields(shot: Shot, args: Record<string, unknown>): Shot {
  const next: Shot = { ...shot };
  if (args["action"] !== undefined) next.action = String(args["action"]);
  if (args["slug"] !== undefined) next.slug = String(args["slug"]);
  if (args["camera"] !== undefined)
    next.camera = args["camera"] as Shot["camera"];
  if (args["motion"] !== undefined) next.motion = String(args["motion"]);
  if (args["dialogue"] !== undefined) next.dialogue = String(args["dialogue"]);
  if (args["narration"] !== undefined)
    next.narration = String(args["narration"]);
  if (args["notes"] !== undefined) next.notes = String(args["notes"]);
  if (args["duration_seconds"] !== undefined) {
    const seconds = Number(args["duration_seconds"]);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      throw new Error("duration_seconds must be a positive number.");
    }
    next.duration_seconds = seconds;
  }
  if (args["duration_source"] !== undefined) {
    const source = String(args["duration_source"]);
    if (source !== "audio" && source !== "manual") {
      throw new Error('duration_source must be "audio" or "manual".');
    }
    next.duration_source = source;
  }
  if (Array.isArray(args["entity_ids"])) {
    next.entity_ids = args["entity_ids"].map(String);
  }
  if (args["location_id"] !== undefined) {
    next.location_id = optionalString(args["location_id"]) ?? null;
  }
  return next;
}

interface BoardOpRecord {
  op: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

/** Apply one board operation. Returns its summary, or throws with the reason. */
function applyBoardOp(
  doc: StoryboardDocument,
  { op, args }: ParsedBoardOp
) {
  switch (op) {
    case "add_shot": {
      if (!isString(args["action"]) || args["action"].trim() === "") {
        throw new Error(
          "add_shot needs a non-empty `action` describing the shot."
        );
      }
      const shot = applyShotFields(
        {
          type: "shot",
          id: `shot_${doc.shots.length + 1}_${Date.now().toString(36)}`,
          index: doc.shots.length,
          action: "",
          status: "planned"
        },
        args
      );
      const at =
        isNumber(args["index"])
          ? Math.max(0, Math.min(Math.trunc(args["index"]), doc.shots.length))
          : doc.shots.length;
      const shots = [...doc.shots];
      shots.splice(at, 0, shot);
      doc.shots = renumberShots(shots);
      return { id: shot.id, index: at };
    }

    case "update_shot": {
      const target = String(args["target"] ?? "");
      const shot = findShot(doc.shots, target);
      if (!shot) throw new Error(`No shot matches "${target}".`);
      const updated = applyShotFields(shot, args);
      doc.shots = doc.shots.map((s) => (s.id === shot.id ? updated : s));
      return { id: updated.id, action: updated.action };
    }

    case "remove_shot": {
      const target = String(args["target"] ?? "");
      const shot = findShot(doc.shots, target);
      if (!shot) throw new Error(`No shot matches "${target}".`);
      doc.shots = renumberShots(doc.shots.filter((s) => s.id !== shot.id));
      return { removed: shot.id };
    }

    case "reorder_shot": {
      const target = String(args["target"] ?? "");
      const shot = findShot(doc.shots, target);
      if (!shot) throw new Error(`No shot matches "${target}".`);
      const to = Number(args["index"]);
      if (!Number.isInteger(to) || to < 0 || to >= doc.shots.length) {
        throw new Error(
          `reorder_shot needs an \`index\` in [0, ${doc.shots.length - 1}].`
        );
      }
      const ordered = [...doc.shots].sort((a, b) => a.index - b.index);
      const from = ordered.findIndex((s) => s.id === shot.id);
      const [moved] = ordered.splice(from, 1);
      ordered.splice(to, 0, moved);
      doc.shots = renumberShots(ordered);
      return { id: shot.id, index: to };
    }

    case "set_board": {
      if (args["brief"] !== undefined) doc.brief = String(args["brief"]);
      if (args["style"] !== undefined) doc.style = String(args["style"]);
      if (args["aspect_ratio"] !== undefined) {
        doc.aspectRatio = String(args["aspect_ratio"]);
      }
      if (Array.isArray(args["entity_ids"])) {
        doc.entityIds = args["entity_ids"].map(String);
      }
      return {
        brief: doc.brief,
        style: doc.style,
        aspect_ratio: doc.aspectRatio,
        entity_ids: doc.entityIds
      };
    }
  }
}

const editStoryboard: CapabilityExport = {
  spec: editStoryboardSpec,
  impl: async (run, params) => {
    const ops = parseBoardOps(params["ops"]);
    if (isError(ops)) return ops;

    const { Storyboard } = await import("@nodetool-ai/models");

    for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
      const board = await loadBoard(run, params["storyboard_id"]);
      if (isError(board)) return board;
      const { row, doc } = board;

      // A failing op is recorded and the script continues: stopping at the
      // first error hides every problem behind it.
      const records: BoardOpRecord[] = [];
      for (const parsed of ops) {
        try {
          records.push({
            op: parsed.op,
            ok: true,
            result: applyBoardOp(doc, parsed)
          });
        } catch (e) {
          records.push({
            op: parsed.op,
            ok: false,
            error: e instanceof Error ? e.message : String(e)
          });
        }
      }

      const saved = await Storyboard.updateFieldsIfUnchanged(
        row.id,
        row.updated_at,
        {
          document: JSON.stringify(doc)
        }
      );
      if (!saved) continue;

      const failed = records.filter((record) => !record.ok);
      return {
        storyboard_id: row.id,
        updated_at: saved.updated_at,
        applied: records.length - failed.length,
        failed: failed.length,
        ops: records,
        shots: [...doc.shots]
          .sort((a, b) => a.index - b.index)
          .map((shot) => ({
            id: shot.id,
            index: shot.index,
            slug: shot.slug,
            action: shot.action,
            status: shot.status
          }))
      };
    }

    return {
      error: `Storyboard ${String(params["storyboard_id"])} is being modified concurrently; nothing was saved. Retry the call.`
    };
  }
};

// ---------------------------------------------------------------------------
// extract_script_from_storyboard
// ---------------------------------------------------------------------------
//
// The board is the consumer of the words: it projects line text into shots and
// reads take durations for timing. Extraction moves ownership of the words to a
// script resource and leaves the keys behind — `script_id` on the screenplay,
// `script_line_ids` and a text snapshot on each shot.

const extractScriptFromStoryboard: CapabilityExport = {
  spec: extractScriptFromStoryboardSpec,
  impl: async (run, params) => {
    const context = run.context;
    const board = await loadBoard(run, params["storyboard_id"]);
    if (isError(board)) return board;
    const { row, doc } = board;

    const relink = params["relink"] === true;
    const screenplay = boardScreenplay(row, doc);
    const linkedScriptId = screenplay.script_id ?? null;
    if (linkedScriptId && !relink) {
      return {
        error: `Storyboard ${row.id} already links script ${linkedScriptId}. Pass relink: true to re-project the board's words onto that script.`
      };
    }

    const { extractScriptFromScreenplay, joinLineTexts, validateScriptLink } =
      await import("@nodetool-ai/protocol");
    const entities = await loadBoardEntities(context, doc);
    const extracted = extractScriptFromScreenplay(screenplay, entities);
    const lines = extracted.document.sections.flatMap((s) => s.lines);
    if (lines.length === 0) {
      return {
        error:
          "No shot on this board carries dialogue or narration, so there is nothing to extract. Write the words with edit_storyboard first."
      };
    }
    const textByLineId = new Map(lines.map((line) => [line.id, line.text]));

    /** Stamp the projection onto whatever shots the board holds right now. */
    const project = (shots: Shot[]): Shot[] =>
      shots.map((shot) => {
        const lineIds = extracted.lineIdsByShotId[shot.id];
        const next: Shot = { ...shot };
        if (!lineIds || lineIds.length === 0) {
          delete next.script_line_ids;
          delete next.script_text_snapshot;
          return next;
        }
        next.script_line_ids = lineIds;
        next.script_text_snapshot = joinLineTexts(
          lineIds.map((id) => textByLineId.get(id) ?? "")
        );
        return next;
      });

    // Bound as a namespace so the `Script` / `Storyboard` row types imported at
    // the top of this file stay visible here.
    const models = await import("@nodetool-ai/models");
    const document = JSON.stringify(extracted.document);

    // The link is stamped only after the row it names exists (design §7), so a
    // failed second write leaves an unlinked-but-valid pair rather than a
    // half-link no validation would accept.
    let scriptId: string;
    let reused = false;
    const existing =
      relink && linkedScriptId
        ? await models.Script.findById(linkedScriptId)
        : null;
    if (existing && existing.user_id === context.userId) {
      const saved = await models.Script.updateFieldsIfUnchanged(
        existing.id,
        existing.updated_at,
        { document }
      );
      if (!saved) {
        return {
          error: `Script ${existing.id} is being modified concurrently; nothing was written. Retry the call.`
        };
      }
      scriptId = saved.id;
      reused = true;
    } else {
      const name =
        isString(params["name"]) && params["name"]
          ? (params["name"] as string)
          : `${row.name} script`;
      const created = await models.Script.create<Script>({
        user_id: context.userId,
        project_id: row.project_id,
        name,
        document
      });
      scriptId = created.id;
    }

    const validation = validateScriptLink(
      { ...screenplay, script_id: scriptId, shots: project(doc.shots) },
      extracted.document
    );
    if (validation.errors.length > 0) {
      return {
        error: `The projected link is invalid, so the board was left unlinked: ${validation.errors
          .map((issue) => issue.message)
          .join(" ")}`,
        script_id: scriptId
      };
    }

    for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
      const current = await models.Storyboard.findById(row.id);
      if (!current) return { error: `Storyboard ${row.id} was not found.` };
      const currentDoc = current.toDocument();
      const shots = project(currentDoc.shots);
      const saved = await models.Storyboard.updateFieldsIfUnchanged(
        current.id,
        current.updated_at,
        {
          document: JSON.stringify({
            ...currentDoc,
            shots,
            screenplay: {
              ...boardScreenplay(current, currentDoc),
              script_id: scriptId
            }
          })
        }
      );
      if (!saved) continue;

      // Last write, and only now that the board carries the forward link: the
      // back-pointer never names a board that failed to link (design §7).
      const stamped = await stampScriptStoryboardId(
        scriptId,
        current.id,
        context.userId
      );
      if (isError(stamped)) {
        return {
          error: `Storyboard ${current.id} links script ${scriptId}, but the script's back-pointer could not be written: ${stamped.error} The board is valid; the script reads as unlinked until this is retried with relink: true.`,
          storyboard_id: current.id,
          script_id: scriptId
        };
      }

      return {
        ok: true,
        storyboard_id: current.id,
        script_id: scriptId,
        relinked: reused,
        line_count: lines.length,
        cast_count: extracted.document.cast.length,
        linked_shot_ids: shots
          .filter((shot) => (shot.script_line_ids ?? []).length > 0)
          .map((shot) => shot.id),
        warnings: validation.warnings.map((issue) => issue.message)
      };
    }

    return {
      error: `Storyboard ${row.id} is being modified concurrently, so script ${scriptId} was written but the board could not be linked to it. Retry with relink: true.`,
      script_id: scriptId
    };
  }
};

/** Every storyboard capability, in the order the tool file declared them. */
/**
 * Delete a storyboard the caller owns.
 *
 * The ownership check and the version cascade are `Storyboard.deleteOwned`, the
 * same function the tRPC route calls — a delete is not a place for two copies
 * of one rule, and version rows outliving their document would be unreachable
 * garbage. Missing and not-yours are one answer.
 */
const deleteStoryboard: CapabilityExport = {
  spec: deleteStoryboardSpec,
  impl: async (run, params) => {
    const userId = run.context.userId;
    if (!userId) return { error: "No user is bound to this session." };
    const { Storyboard } = await import("@nodetool-ai/models");
    const id = String(params["storyboard_id"]);
    const deleted = await Storyboard.deleteOwned(userId, id);
    return deleted
      ? { storyboard_id: id, deleted: true }
      : { error: `Storyboard ${id} was not found, or it is not yours.` };
  }
};
export const STORYBOARD_CAPABILITIES: readonly CapabilityExport[] = [
  listStoryboards,
  createStoryboard,
  getStoryboard,
  renderStoryboardStills,
  renderStoryboardClips,
  reviseStoryboardClip,
  assembleStoryboardTimeline,
  editStoryboard,
  extractScriptFromStoryboard,
  deleteStoryboard
];

export const module: CapabilityModule = {
  module: "storyboards",
  exports: STORYBOARD_CAPABILITIES
};

export {
  listStoryboards,
  createStoryboard,
  getStoryboard,
  renderStoryboardStills,
  renderStoryboardClips,
  reviseStoryboardClip,
  assembleStoryboardTimeline,
  editStoryboard,
  extractScriptFromStoryboard,
  deleteStoryboard
};
