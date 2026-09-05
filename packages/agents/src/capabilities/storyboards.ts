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

import type {
  GenerationRequest,
  JsonSchema,
  ProcessingContext
} from "@nodetool-ai/runtime";
import type {
  Script,
  Storyboard,
  StoryboardDocument
} from "@nodetool-ai/models";
import type {
  Entity,
  ImageRef,
  Screenplay,
  ScriptLinkDocument,
  Shot,
  ShotCoverage,
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
import { resolveProjectId } from "./project-scope.js";
import { mp4DurationSeconds } from "../utils/video-duration.js";
/** Shots one call may render, so a stray `targets: "all"` cannot bankrupt a run. */
const MAX_SHOTS_PER_CALL = 24;
/** Attempts to land a document write: the first try plus one re-read-and-reapply (ADR 0001). */
const CAS_ATTEMPTS = 2;

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
 * Whether a shot's picture already exists — its own clip, or a window into the
 * clip of the shot that covers it.
 *
 * The render selections read this rather than `shot.clip`, so a shot fused
 * into a sibling's generation is not offered up to be generated a second time.
 */
const shotHasPicture = (shot: Shot, shots: readonly Shot[]): boolean => {
  if (shot.clip) return true;
  const coverage = shot.covered_by;
  if (!coverage) return false;
  return shots.some((s) => s.id === coverage.shot_id && !!s.clip);
};

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
      { document: JSON.stringify({ ...doc, shots }) },
      // One update_shot per write, so an open editor merges this into its
      // draft per shot instead of treating the board as replaced.
      { ops: [{ tool: "update_shot", input: { id: shotId } }] }
    );
    if (saved) return updated;
  }
  return {
    error: `Storyboard ${storyboardId} is being modified concurrently; the render finished but could not be saved. Retry the call.`
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
  const { entityFromAsset } = await import("./entities.js");
  const loaded = await Promise.all(
    ids.map(async (id) => {
      try {
        const asset = await Asset.find(context.userId, id);
        return asset ? entityFromAsset(asset) : null;
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

/**
 * Direct-mode clip prompt. No still carries the look into the render, so the
 * prompt has to: framing and board style ride along with the action and the
 * motion.
 */
function directClipPrompt(shot: Shot, style: string): string {
  const parts = [shot.action, shot.motion, style];
  if (shot.camera?.framing) parts.splice(1, 0, `${shot.camera.framing} shot`);
  return parts
    .filter((p): p is string => !!p && p.trim().length > 0)
    .map((p) => p.trim())
    .join(", ");
}

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
  kind: string,
  capability: string
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
      error: `No ${kind} model is set on this storyboard. Pass provider + model (use find_model with capability=${capability}), or set one on the board.`
    };
  }
  return { provider, model };
}

/**
 * Render through the generation seam and answer with the asset it saved; the
 * board can only reference persisted media. The seam records the row and
 * links the asset (docs/media-generation-tracking-design.md § 8, S2).
 */
async function renderMedia(
  context: ProcessingContext,
  req: Omit<GenerationRequest, "origin" | "persist">,
  namePrefix: string,
  mime?: string
): Promise<
  | { assetId: string; uri: string; generationId: string; output: unknown }
  | ToolError
> {
  const { randomUUID } = await import("node:crypto");
  const id = randomUUID();
  const persist: GenerationRequest["persist"] = { name: namePrefix };
  if (mime) persist.mime = mime;
  const result = await context.runGeneration({
    ...req,
    id,
    origin: { surface: "capability" },
    persist
  });
  const asset = result.assets[0];
  if (!asset?.asset_id) {
    return {
      error:
        "The render succeeded but could not be saved as an asset, so it cannot be attached to the shot. This host has no asset storage wired."
    };
  }
  return {
    assetId: asset.asset_id,
    uri: asset.uri,
    generationId: id,
    output: result.output
  };
}

/**
 * The clip a render actually produced, with its real length when readable.
 *
 * A video model quantizes the duration it is asked for — a shot directed at
 * 1.5s came back as 5.184s — and the ref carried only the asset id, so
 * assembly laid down the *intended* 1.5s over five seconds of footage and
 * threw the rest away without saying so. The bytes are already in hand here,
 * so the length is free to read; a container we cannot parse leaves `duration`
 * unset, which every reader treats as unknown rather than zero.
 */
export function renderedVideoRef(saved: {
  assetId: string;
  uri: string;
  output: unknown;
}): VideoRef {
  const clip: VideoRef = {
    type: "video",
    asset_id: saved.assetId,
    uri: saved.uri
  };
  const bytes = saved.output;
  if (bytes instanceof Uint8Array) {
    const seconds = mp4DurationSeconds(bytes);
    if (seconds !== null) clip.duration = seconds;
  }
  return clip;
}

const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

/** Per-shot outcome, one row per selected shot. */
interface ShotOutcome {
  shot_id: string;
  index: number;
  slug?: string;
  /** How the clip was rendered. Absent on a stills outcome. */
  render_mode?: "keyframe" | "direct";
  ok: boolean;
  asset_id?: string;
  asset_uri?: string;
  /** The ledger row for this render; `get_generation` reads its cost. */
  generation_id?: string;
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
    // The same value under the key a caller reaches for first. Reading `.id`
    // off this result and passing the `undefined` onward is what a create/edit
    // pair actually did, and the edit blamed a missing argument two calls later.
    id: row.id,
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
    const projectId = resolveProjectId(run, params);
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
          has_clip: shotHasPicture(shot, doc.shots),
          covered_by: shot.covered_by ?? null,
          render_mode: shot.render_mode ?? "keyframe",
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

    const model = resolveModel(params, doc.imageModel, "still", "text_to_image");
    if (isError(model)) return model;

    const { shotRenderMode } = await import("@nodetool-ai/protocol");
    // A direct shot renders its clip from the prompt, so it needs no still.
    // Naming it in `targets` still renders one — a board frame to look at is
    // worth having even when the clip does not come from it.
    const selected = selectShots(
      doc.shots,
      params["targets"],
      (s) =>
        !s.keyframe &&
        shotRenderMode(s) !== "direct" &&
        !shotHasPicture(s, doc.shots)
    );
    if (isError(selected)) return selected;
    if (selected.length === 0) {
      return {
        rendered: 0,
        results: [],
        note: "No shot needs a still: each already has one, or renders its clip directly."
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
          const saved = await renderMedia(
            context,
            {
              provider: model.provider,
              capability: "text_to_image",
              model: model.model,
              params: {
                prompt: keyframePrompt(shot, style),
                entities: entitiesForShot(shot, entities).map(wireEntity),
                aspect_ratio: aspectRatio
              }
            },
            `shot-${shot.index + 1}-still`
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
            generation_id: saved.generationId,
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

    const override = params["mode"];
    if (override !== undefined && override !== "keyframe" && override !== "direct") {
      return { error: 'mode must be "keyframe" or "direct".' };
    }
    // The call's override wins over the shot's own setting, for this call only.
    const { shotRenderMode } = await import("@nodetool-ai/protocol");
    const modeOf = (shot: Shot): "keyframe" | "direct" =>
      override === "keyframe" || override === "direct"
        ? override
        : shotRenderMode(shot);

    const model = resolveModel(
      params,
      doc.videoModel,
      "clip",
      // A board renders one way or the other far more often than both, so name
      // the capability the selection actually needs.
      doc.shots.every((s) => modeOf(s) === "direct")
        ? "text_to_video"
        : "image_to_video"
    );
    if (isError(model)) return model;

    const selected = selectShots(
      doc.shots,
      params["targets"],
      (s) =>
        !shotHasPicture(s, doc.shots) &&
        (modeOf(s) === "direct" || !!s.keyframe)
    );
    if (isError(selected)) return selected;
    if (selected.length === 0) {
      return {
        rendered: 0,
        results: [],
        note: "No shot is ready for a clip. A keyframe-mode shot needs a still first (render_storyboard_stills), or set its render_mode to \"direct\" — or pass mode: \"direct\" here — to render straight from the prompt. Name shots explicitly with `targets` to override the selection."
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
    const style = isString(params["style"]) ? params["style"] : doc.style || "";
    const resolution =
      isString(params["resolution"])
        ? params["resolution"]
        : undefined;

    const results = await mapWithConcurrency(
      selected,
      clampConcurrency(params["concurrency"]),
      async (shot): Promise<ShotOutcome> => {
        const mode = modeOf(shot);
        const base: ShotOutcome = {
          shot_id: shot.id,
          index: shot.index,
          slug: shot.slug,
          render_mode: mode,
          ok: false
        };
        if (mode === "keyframe" && !shot.keyframe) {
          return {
            ...base,
            error:
              'Shot has no still to animate. Run render_storyboard_stills first, or set its render_mode to "direct".'
          };
        }
        try {
          // Direct mode skips the still: the prompt carries the whole shot.
          let seed: Uint8Array | null = null;
          if (mode === "keyframe" && shot.keyframe) {
            seed = await loadMediaRefBytes(shot.keyframe, context);
            if (!seed || seed.length === 0) {
              return {
                ...base,
                error: "The shot's still could not be read back from storage."
              };
            }
          }
          const predictionParams: Record<string, unknown> = {
            prompt:
              mode === "direct"
                ? directClipPrompt(shot, style)
                : clipPrompt(shot),
            entities: entitiesForShot(shot, entities).map(wireEntity),
            aspect_ratio: aspectRatio,
            resolution,
            duration_seconds: effectiveShotDuration(shot, linesById).seconds
          };
          if (seed) {
            predictionParams["images"] = [seed];
          }
          const saved = await renderMedia(
            context,
            {
              provider: model.provider,
              capability:
                mode === "direct" ? "text_to_video" : "image_to_video",
              model: model.model,
              params: predictionParams
            },
            `shot-${shot.index + 1}-clip`,
            "video/mp4"
          );
          if (isError(saved)) return { ...base, error: saved.error };

          const clip = renderedVideoRef(saved);
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
            generation_id: saved.generationId,
            status: updated.status
          };
        } catch (e) {
          await patchShot(row.id, shot.id, (current) => ({
            ...current,
            status: "failed"
          }));
          return {
            ...base,
            error: `${mode === "direct" ? "text_to_video" : "image_to_video"} failed: ${errorMessage(e)}`
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

    const model = resolveModel(params, doc.videoModel, "clip", "video_to_video");
    if (isError(model)) return model;

    const { loadMediaRefBytes } = await import("@nodetool-ai/runtime");
    try {
      const source = await loadMediaRefBytes(shot.clip, context);
      if (!source || source.length === 0) {
        return {
          error: "The shot's clip could not be read back from storage."
        };
      }
      const saved = await renderMedia(
        context,
        {
          provider: model.provider,
          capability: "video_to_video",
          model: model.model,
          params: { video: source, prompt: instruction }
        },
        `shot-${shot.index + 1}-revision`,
        "video/mp4"
      );
      if (isError(saved)) return saved;

      const clip = renderedVideoRef(saved);
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
        generation_id: saved.generationId,
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
      foreignTimelineParts,
      frameSizeForAspect
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
    // A model returns the length it returns: shots directed at 1.5s come back
    // at 5.2s, and the cut plays all of it. Saying which shots came back off
    // the length they were directed at turns a film longer than the caller
    // planned into a decision they can make.
    if (assembled.retimedShots.length > 0) {
      const worst = assembled.retimedShots.reduce((a, b) =>
        Math.abs(b.directedMs - b.usedMs) > Math.abs(a.directedMs - a.usedMs)
          ? b
          : a
      );
      warnings.push(
        `${assembled.retimedShots.length} shot(s) run at their rendered length, not the length they were directed at — ` +
          `the largest difference is ${Math.round(Math.abs(worst.directedMs - worst.usedMs))}ms on shot ${worst.shotId} ` +
          `(${worst.usedMs}ms in the cut, ${worst.directedMs}ms directed). ` +
          `Re-render with a duration the model honours, or trim the clips in the timeline.`
      );
    }
    // A jointly assembled cut takes its lengths from the words, so a shot can
    // sit in a slot its footage does not fill: black under the voiceover, or a
    // render the cut never reaches the end of.
    if (assembled.trimmedShots.length > 0) {
      const worst = assembled.trimmedShots.reduce((a, b) =>
        Math.abs(b.sourceMs - b.usedMs) > Math.abs(a.sourceMs - a.usedMs)
          ? b
          : a
      );
      warnings.push(
        `${assembled.trimmedShots.length} shot(s) do not match their rendered footage — ` +
          `the longest gap is ${Math.round(Math.abs(worst.sourceMs - worst.usedMs))}ms on shot ${worst.shotId} ` +
          `(${worst.usedMs}ms in the cut, ${worst.sourceMs}ms rendered). ` +
          `Re-render those shots at the length their lines need.`
      );
    }
    if (assembled.clips.length === 0) {
      return {
        error:
          "No shot has a rendered clip, so there is nothing to assemble. Run render_storyboard_stills, then render_storyboard_clips.",
        skipped_shot_ids: assembled.skippedShotIds,
        skipped_line_ids: skippedLineIds
      };
    }

    const { width, height } = frameSizeForAspect(doc.aspectRatio);
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

    if (!reuse) {
      const sequence = new TimelineSequence({
        user_id: context.userId,
        project_id: row.project_id,
        name
      });
      sequence.name = name;
      sequence.fps = fps;
      sequence.width = width;
      sequence.height = height;
      sequence.duration_ms = assembled.durationMs;
      sequence.fromDocument({
        tracks: assembled.tracks,
        clips: assembled.clips,
        markers: []
      });
      await sequence.save();

      if (row.timeline_id !== sequence.id) {
        await Storyboard.updateFieldsIfUnchanged(
          row.id,
          row.updated_at,
          { timeline_id: sequence.id },
          { ops: [{ tool: "set_link", input: { timeline_id: sequence.id } }] }
        );
      }

      const created: Record<string, unknown> = {
        ok: true,
        timeline_id: sequence.id,
        name: sequence.name,
        fps,
        width,
        height,
        duration_ms: assembled.durationMs,
        clip_count: assembled.clips.length,
        track_count: assembled.tracks.length,
        script_id: script ? scriptId : null,
        skipped_shot_ids: assembled.skippedShotIds,
        skipped_line_ids: skippedLineIds,
        trimmed_shots: assembled.trimmedShots,
        retimed_shots: assembled.retimedShots
      };
      if (warnings.length) {
        created.warnings = warnings;
      }
      return created;
    }

    // Re-assembling over an existing sequence is a CAS write carrying its
    // ops (S2.1): the foreign parts are re-read per attempt, and an open
    // editor merges the change instead of seeing the sequence as replaced.
    for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
      const current =
        attempt === 0 ? reuse : await TimelineSequence.findById(reuse.id);
      if (!current || current.user_id !== context.userId) {
        return {
          error: `Timeline ${reuse.id} was deleted while assembling; create a new timeline by calling this again.`
        };
      }

      const previous = current.toDocument();
      const foreign = foreignTimelineParts(
        previous,
        (clip) =>
          clip.storyboardBoardId === row.id ||
          (!!scriptId && clip.scriptId === scriptId)
      );
      const tracks = [...assembled.tracks, ...foreign.tracks];
      const clips = [...assembled.clips, ...foreign.clips];
      const durationMs = clips.reduce(
        (end, clip) => Math.max(end, clip.startMs + clip.durationMs),
        0
      );

      const nextDocument = {
        ...previous,
        tracks,
        clips,
        markers: previous.markers ?? []
      };
      const saved = await TimelineSequence.updateFieldsIfUnchanged(
        current.id,
        current.updated_at,
        {
          name,
          fps,
          width,
          height,
          duration_ms: durationMs,
          document: JSON.stringify(nextDocument)
        },
        {
          ops: [
            {
              tool: "assemble_storyboard_timeline",
              input: { storyboard_id: row.id }
            }
          ]
        }
      );
      if (!saved) continue;

      if (row.timeline_id !== current.id) {
        await Storyboard.updateFieldsIfUnchanged(
          row.id,
          row.updated_at,
          { timeline_id: current.id },
          { ops: [{ tool: "set_link", input: { timeline_id: current.id } }] }
        );
      }

      const result: Record<string, unknown> = {
        ok: true,
        timeline_id: current.id,
        name,
        fps,
        width,
        height,
        duration_ms: durationMs,
        clip_count: clips.length,
        track_count: tracks.length,
        script_id: script ? scriptId : null,
        skipped_shot_ids: assembled.skippedShotIds,
        skipped_line_ids: skippedLineIds,
        trimmed_shots: assembled.trimmedShots,
        retimed_shots: assembled.retimedShots
      };
      if (warnings.length) {
        result.warnings = warnings;
      }
      return result;
    }

    return {
      error: `Timeline ${reuse.id} is being modified concurrently; the assembly finished but could not be saved. Retry the call.`
    };
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

/**
 * Op names an agent reaches for that mean one of {@link BOARD_OPS}.
 *
 * The browser tool that casts entities is `ui_storyboard_set_entities`, so a
 * script written against it calls `{op: "set_entities", entity_ids: [...]}`
 * here and was refused — the rejection listed the five real ops without
 * saying which one takes `entity_ids`, and the caller had to go read the tool
 * catalogue mid-task. The alias resolves to the op that already does the work.
 */
const BOARD_OP_ALIASES: Readonly<Record<string, BoardOpName>> = {
  set_entities: "set_board",
  set_storyboard: "set_board",
  add_shots: "add_shot",
  edit_shot: "update_shot",
  delete_shot: "remove_shot",
  move_shot: "reorder_shot"
};

const isBoardOpName = (value: string): value is BoardOpName =>
  (BOARD_OPS as readonly string[]).includes(value);

/** The op a name selects, following {@link BOARD_OP_ALIASES}. */
export const resolveBoardOpName = (value: string): BoardOpName | null => {
  const name = value.trim();
  if (isBoardOpName(name)) return name;
  return BOARD_OP_ALIASES[name] ?? null;
};

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
    const resolved = isString(op) ? resolveBoardOpName(op) : null;
    if (!resolved) {
      return {
        error: `ops[${index}] names "${String(op)}"; expected one of ${BOARD_OPS.join(", ")}.`
      };
    }
    parsed.push({ op: resolved, args });
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

/** The shot fields an edit may set, plus the two op-level keys. */
const SHOT_EDIT_FIELDS = new Set([
  "target",
  "index",
  "action",
  "slug",
  "camera",
  "motion",
  "dialogue",
  "narration",
  "notes",
  "duration_seconds",
  "duration_source",
  "render_mode",
  "entity_ids",
  "location_id",
  "covered_by"
]);

/** Fields a caller reaches for to attach media, which an edit cannot set. */
const SHOT_MEDIA_FIELDS = new Set([
  "clip",
  "clip_uri",
  "clip_asset",
  "video",
  "keyframe",
  "keyframe_uri",
  "still",
  "image",
  "status"
]);

/**
 * Refuse a field an edit does not set, instead of dropping it.
 *
 * `{op: "update_shot", target, clip: "asset://…"}` came back `applied: 1` and
 * changed nothing: the write reported success, `has_clip` stayed false, and
 * the session read that as the board rejecting its asset rather than as the
 * op ignoring a field it never had. An op that silently drops half its
 * arguments is indistinguishable from one that worked.
 */
function assertKnownShotFields(op: string, args: Record<string, unknown>): void {
  const unknown = Object.keys(args).filter((key) => !SHOT_EDIT_FIELDS.has(key));
  if (unknown.length === 0) return;
  const media = unknown.filter((key) => SHOT_MEDIA_FIELDS.has(key));
  throw new Error(
    `${op} does not take ${unknown.map((k) => `\`${k}\``).join(", ")}. ` +
      (media.length > 0
        ? "A shot's still and clip are written by render_storyboard_stills / " +
          "render_storyboard_clips, not by an edit. "
        : "") +
      `Accepted: ${[...SHOT_EDIT_FIELDS].join(", ")}.`
  );
}

/** The board fields `set_board` may set. */
const BOARD_EDIT_FIELDS = new Set([
  "brief",
  "style",
  "aspect_ratio",
  "entity_ids",
  "image_model",
  "video_model"
]);

/**
 * The board-level twin of {@link assertKnownShotFields}.
 *
 * `set_board` used to keep whatever it was handed and act on the keys it knew,
 * so `{op: "set_board", image_model: …}` reported success and left the board's
 * model null — and the render then refused for want of a model the caller had
 * just set.
 */
function assertKnownBoardFields(args: Record<string, unknown>): void {
  const unknown = Object.keys(args).filter((key) => !BOARD_EDIT_FIELDS.has(key));
  if (unknown.length === 0) return;
  throw new Error(
    `set_board does not take ${unknown.map((k) => `\`${k}\``).join(", ")}. ` +
      `Accepted: ${[...BOARD_EDIT_FIELDS].join(", ")}.`
  );
}

/**
 * Read `covered_by` on an edit: which shot's clip holds this shot's picture,
 * and the window of it this shot uses.
 *
 * A model that renders a fixed 5.2s window covers several 1.5-2.2s beats in
 * one generation, and the clip lands on one shot. Before this the siblings had
 * no way to say so: they stayed `has_clip: false`, the board read as half
 * unrendered when the cut was locked, and the default clip selection offered
 * to generate them again. The covering shot must own its clip — a window
 * measured against a window has no source length behind it.
 */
function parseShotCoverage(
  shot: Shot,
  shots: readonly Shot[],
  value: unknown
): ShotCoverage | null {
  if (value === null) return null;
  const raw = isString(value) ? { shot_id: value } : value;
  if (!isRecord(raw)) {
    throw new Error(
      "covered_by must be {shot_id, start_seconds?, end_seconds?} or null. " +
        "A bare shot id is accepted and means the whole clip."
    );
  }
  const ref = raw["shot_id"] ?? raw["target"] ?? raw["shot"];
  if (!isString(ref) || ref.trim() === "") {
    throw new Error("covered_by needs a `shot_id` naming the covering shot.");
  }
  const cover = findShot([...shots], ref.trim());
  if (!cover) throw new Error(`covered_by names no shot: "${ref}".`);
  if (cover.id === shot.id) {
    throw new Error("A shot cannot cover itself.");
  }
  if (cover.covered_by) {
    throw new Error(
      `Shot ${cover.id} is itself covered by ${cover.covered_by.shot_id}; ` +
        "point at the shot that owns the clip."
    );
  }
  const seconds = (key: "start_seconds" | "end_seconds"): number | undefined => {
    const given = raw[key];
    if (given === undefined || given === null) return undefined;
    const n = Number(given);
    if (!Number.isFinite(n) || n < 0) {
      throw new Error(`covered_by.${key} must be a number of seconds >= 0.`);
    }
    return n;
  };
  const start = seconds("start_seconds");
  const end = seconds("end_seconds");
  if (start !== undefined && end !== undefined && end <= start) {
    throw new Error(
      `covered_by.end_seconds (${end}) must be after start_seconds (${start}).`
    );
  }
  const coverage: ShotCoverage = { shot_id: cover.id };
  if (start !== undefined) coverage.start_seconds = start;
  if (end !== undefined) coverage.end_seconds = end;
  return coverage;
}

/** The shot fields an edit may set. Media and status stay the render tools'. */
function applyShotFields(
  shot: Shot,
  args: Record<string, unknown>,
  shots: readonly Shot[] = []
): Shot {
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
  if (args["render_mode"] !== undefined) {
    const mode = String(args["render_mode"]);
    if (mode !== "keyframe" && mode !== "direct") {
      throw new Error('render_mode must be "keyframe" or "direct".');
    }
    next.render_mode = mode;
  }
  if (Array.isArray(args["entity_ids"])) {
    next.entity_ids = args["entity_ids"].map(String);
  }
  if (args["location_id"] !== undefined) {
    next.location_id = optionalString(args["location_id"]) ?? null;
  }
  if (args["covered_by"] !== undefined) {
    const coverage = parseShotCoverage(next, shots, args["covered_by"]);
    next.covered_by = coverage;
    // Status is the render tools' to write, with one exception: coverage is
    // the only way a shot's picture arrives without a render, and a covered
    // shot left at `keyframe_ready` is the drift this field exists to remove.
    if (coverage) {
      next.status = "rendered";
    } else if (!next.clip) {
      next.status = next.keyframe ? "keyframe_ready" : "planned";
    }
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
      assertKnownShotFields("add_shot", args);
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
        args,
        doc.shots
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
      assertKnownShotFields("update_shot", args);
      const target = String(args["target"] ?? "");
      const shot = findShot(doc.shots, target);
      if (!shot) throw new Error(`No shot matches "${target}".`);
      const updated = applyShotFields(shot, args, doc.shots);
      doc.shots = doc.shots.map((s) => (s.id === shot.id ? updated : s));
      return { id: updated.id, action: updated.action };
    }

    case "remove_shot": {
      const target = String(args["target"] ?? "");
      const shot = findShot(doc.shots, target);
      if (!shot) throw new Error(`No shot matches "${target}".`);
      // Coverage pointing at a shot that is gone would read as a picture that
      // exists and assemble as nothing, so the dependents go back to needing
      // their own render.
      const uncovered = doc.shots
        .filter((s) => s.covered_by?.shot_id === shot.id)
        .map((s) => s.id);
      doc.shots = renumberShots(
        doc.shots
          .filter((s) => s.id !== shot.id)
          .map((s) =>
            s.covered_by?.shot_id === shot.id
              ? {
                  ...s,
                  covered_by: null,
                  status: s.keyframe ? "keyframe_ready" : "planned"
                }
              : s
          )
      );
      return uncovered.length > 0
        ? { removed: shot.id, uncovered }
        : { removed: shot.id };
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
      assertKnownBoardFields(args);
      if (args["brief"] !== undefined) doc.brief = String(args["brief"]);
      if (args["style"] !== undefined) doc.style = String(args["style"]);
      if (args["aspect_ratio"] !== undefined) {
        doc.aspectRatio = String(args["aspect_ratio"]);
      }
      if (Array.isArray(args["entity_ids"])) {
        doc.entityIds = args["entity_ids"].map(String);
      }
      // The board's default models. Without these the only way to set one was
      // the editor, so a headless caller passed them here, saw the op succeed,
      // and then had `render_storyboard_stills` refuse for want of a model —
      // the keys were being dropped silently.
      const model = (key: "image_model" | "video_model") => {
        const value = args[key];
        if (value === null) return null;
        return isRecord(value) ? (value as Record<string, unknown>) : undefined;
      };
      const imageModel = model("image_model");
      if (args["image_model"] !== undefined) {
        if (imageModel === undefined) {
          throw new Error(
            "set_board: image_model must be a model object (use find_model) or null"
          );
        }
        doc.imageModel = imageModel;
      }
      const videoModel = model("video_model");
      if (args["video_model"] !== undefined) {
        if (videoModel === undefined) {
          throw new Error(
            "set_board: video_model must be a model object (use find_model) or null"
          );
        }
        doc.videoModel = videoModel;
      }
      return {
        brief: doc.brief,
        style: doc.style,
        aspect_ratio: doc.aspectRatio,
        entity_ids: doc.entityIds,
        image_model: doc.imageModel,
        video_model: doc.videoModel
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
      const resolvedOps: { tool: string; input: Record<string, unknown> }[] = [];
      for (const parsed of ops) {
        try {
          const result = applyBoardOp(doc, parsed) as Record<string, unknown> | undefined;
          records.push({
            op: parsed.op,
            ok: true,
            result
          });
          // Resolve non-id targets (index/slug) to the canonical shot id so
          // the merge adapter can attribute the write to the real unit.
          const canonicalId =
            typeof result?.["id"] === "string"
              ? (result["id"] as string)
              : typeof result?.["removed"] === "string"
                ? (result["removed"] as string)
                : undefined;
          if (canonicalId && (parsed.op === "update_shot" || parsed.op === "remove_shot" || parsed.op === "reorder_shot")) {
            resolvedOps.push({
              tool: parsed.op,
              input: { ...parsed.args, target: canonicalId, id: canonicalId }
            });
          } else {
            resolvedOps.push({ tool: parsed.op, input: parsed.args });
          }
        } catch (e) {
          records.push({
            op: parsed.op,
            ok: false,
            error: e instanceof Error ? e.message : String(e)
          });
          resolvedOps.push({ tool: parsed.op, input: parsed.args });
        }
      }

      const saved = await Storyboard.updateFieldsIfUnchanged(
        row.id,
        row.updated_at,
        {
          document: JSON.stringify(doc)
        },
        // The ops ride on the write so an open editor can merge this change
        // per shot instead of treating the board as replaced.
        { ops: resolvedOps }
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
        },
        { ops: [{ tool: "set_link", input: { script_id: scriptId } }] }
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
