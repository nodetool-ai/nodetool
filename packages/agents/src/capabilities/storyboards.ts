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
  BoardRenderContext,
  ClipVersion,
  Entity,
  ImageRef,
  KeyframeVersion,
  Scene,
  Screenplay,
  ScriptLinkDocument,
  Shot,
  ShotCoverage,
  VideoRef
} from "@nodetool-ai/protocol";
import type { StoryboardSetupStage } from "@nodetool-ai/protocol/api-schemas/storyboards.js";
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
  directStoryboardSpec,
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
  DIRECT_STORYBOARD_SCHEMA,
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
  DIRECT_STORYBOARD_SCHEMA,
  EXTRACT_SCRIPT_SCHEMA
} from "./storyboards.specs.js";
import { resolveProjectId } from "./project-scope.js";
import { mp4DurationSeconds } from "../utils/video-duration.js";
/** Shots one call may render, so a stray `targets: "all"` cannot bankrupt a run. */
const MAX_SHOTS_PER_CALL = 24;
/** Attempts to land a document write: the first try plus one re-read-and-reapply (ADR 0001). */
const CAS_ATTEMPTS = 2;
/** The guided-setup stages, in order. Mirrors `storyboardSetupStage`. */
const SETUP_STAGES: readonly StoryboardSetupStage[] = [
  "idea",
  "genre",
  "review",
  "look",
  "done"
];

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

/**
 * The board values a version's render record is compared against
 * (`BoardRenderContext`). The board's one style entity is the last style id in
 * the cast, which is what `set_style` writes.
 */
function boardRenderContext(
  doc: StoryboardDocument,
  entities: readonly Entity[]
): BoardRenderContext {
  const styleIds = new Set(
    entities.filter((e) => e.kind === "style").map((e) => e.id)
  );
  return {
    aspect_ratio: doc.aspectRatio || "16:9",
    image_model: isString(doc.imageModel?.id) ? doc.imageModel.id : "",
    video_model: isString(doc.videoModel?.id) ? doc.videoModel.id : "",
    style_entity_id:
      [...(doc.entityIds ?? [])].reverse().find((id) => styleIds.has(id)) ??
      null,
    style: doc.style,
    scenes: doc.screenplay?.scenes ?? null
  };
}

/**
 * Drop the shots whose selected version is still current. Additive: without
 * `stale_only` the selection is returned untouched.
 */
async function filterStale(
  selected: Shot[],
  params: Record<string, unknown>,
  doc: StoryboardDocument,
  entities: readonly Entity[],
  kind: "keyframe" | "clip"
): Promise<{ shots: Shot[]; skipped: string[] }> {
  if (params["stale_only"] !== true) {
    return { shots: selected, skipped: [] };
  }
  const { staleClipShots, staleKeyframeShots } = await import(
    "@nodetool-ai/protocol"
  );
  const context = boardRenderContext(doc, entities);
  const stale =
    kind === "keyframe"
      ? staleKeyframeShots(selected, context)
      : staleClipShots(selected, context);
  const keep = new Set(stale.map((shot) => shot.id));
  return {
    shots: stale,
    skipped: selected
      .filter((shot) => !keep.has(shot.id))
      .map((shot) => shot.id)
  };
}

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
    const entities = await loadBoardEntities(context, doc);
    const fresh = await filterStale(selected, params, doc, entities, "keyframe");
    const skipped = fresh.skipped;
    const chosen = fresh.shots;
    if (chosen.length === 0) {
      return {
        rendered: 0,
        results: [],
        skipped,
        note:
          skipped.length > 0
            ? "No selected shot's still is stale."
            : "No shot needs a still: each already has one, or renders its clip directly."
      };
    }
    if (chosen.length > MAX_SHOTS_PER_CALL) {
      return {
        error: `${chosen.length} shots selected, over the ${MAX_SHOTS_PER_CALL}-shot per-call limit. Pass targets in batches.`
      };
    }

    const {
      currentRenderInputs,
      entitiesForShot,
      keyframePrompt,
      sceneForShot,
      stampRenderInputs
    } = await import("@nodetool-ai/protocol");
    const { inferImageMime } = await import("../tools/asset-persist.js");
    const style =
      isString(params["style"])
        ? params["style"]
        : doc.style;
    const aspectRatio = doc.aspectRatio || "16:9";
    // What this call actually renders with, which is not always what the board
    // says: `style` and `model` can be overridden per call. Recording the
    // override is the point — a version rendered against something other than
    // the board's settings reads stale against the board, correctly.
    const rendered: BoardRenderContext = {
      ...boardRenderContext(doc, entities),
      image_model: model.model,
      style
    };

    const results = await mapWithConcurrency(
      chosen,
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
                prompt: keyframePrompt(shot, {
                  scene: sceneForShot(shot, doc.screenplay?.scenes),
                  style
                }),
                entities: entitiesForShot(shot, entities).map(wireEntity),
                aspect_ratio: aspectRatio
              }
            },
            `shot-${shot.index + 1}-still`
          );
          if (isError(saved)) return { ...base, error: saved.error };

          const keyframe: KeyframeVersion = {
            type: "image",
            asset_id: saved.assetId,
            uri: saved.uri,
            render_inputs: stampRenderInputs(
              currentRenderInputs(shot, rendered, "keyframe")
            )
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
      skipped,
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
    const entities = await loadBoardEntities(context, doc);
    const fresh = await filterStale(selected, params, doc, entities, "clip");
    const skipped = fresh.skipped;
    const chosen = fresh.shots;
    if (chosen.length === 0) {
      return {
        rendered: 0,
        results: [],
        skipped,
        note:
          skipped.length > 0
            ? "No selected shot's clip is stale."
            : "No shot is ready for a clip. A keyframe-mode shot needs a still first (render_storyboard_stills), or set its render_mode to \"direct\" — or pass mode: \"direct\" here — to render straight from the prompt. Name shots explicitly with `targets` to override the selection."
      };
    }
    if (chosen.length > MAX_SHOTS_PER_CALL) {
      return {
        error: `${chosen.length} shots selected, over the ${MAX_SHOTS_PER_CALL}-shot per-call limit. Pass targets in batches.`
      };
    }

    const { loadMediaRefBytes } = await import("@nodetool-ai/runtime");
    const {
      clipPrompt,
      currentRenderInputs,
      directClipPrompt,
      entitiesForShot,
      sceneForShot,
      stampRenderInputs
    } =
      await import("@nodetool-ai/protocol");
    const { effectiveShotDuration, scriptLinesById } = await import(
      "@nodetool-ai/timeline"
    );
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
    // As in the stills path: the record says what this call rendered with, so
    // a per-call model or style override reads stale against the board.
    const rendered: BoardRenderContext = {
      ...boardRenderContext(doc, entities),
      video_model: model.model,
      style
    };

    const results = await mapWithConcurrency(
      chosen,
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
                ? directClipPrompt(shot, {
                    scene: sceneForShot(shot, doc.screenplay?.scenes),
                    style
                  })
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

          const clip: ClipVersion = {
            ...renderedVideoRef(saved),
            render_inputs: stampRenderInputs(
              currentRenderInputs(shot, rendered, "clip")
            )
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
      skipped,
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
  "move_shot",
  "duplicate_shot",
  "set_board",
  "set_setup",
  "update_scene",
  "create_scene",
  "merge_scene",
  "set_style",
  "select_version",
  "delete_version",
  "add_keyframe_version"
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
  // `move_shot` used to alias `reorder_shot`. It is its own op now, and the
  // two coincide on a board with no scenes: one implicit group means a
  // position inside it is a board position.
  copy_shot: "duplicate_shot",
  set_scene: "update_scene",
  add_scene: "create_scene",
  set_setup_stage: "set_setup"
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

// ── Scenes ──────────────────────────────────────────────────────────────────
// A scene has no order of its own: its position is the position of its first
// shot, and its shots are contiguous in `index` (PRD § 7.7.3). These mirror
// `web/src/lib/storyboard/sceneOrder.ts` and the store's `structural`, so a
// board edited headlessly and one edited in the browser end up the same shape.

/** The board's scenes. They live on the screenplay; the document reads them. */
function docScenes(doc: StoryboardDocument): Scene[] {
  return doc.screenplay?.scenes ?? [];
}

/** Write scenes back, materializing a minimal screenplay when there is none. */
function setDocScenes(doc: StoryboardDocument, scenes: Scene[]): void {
  if (doc.screenplay) {
    doc.screenplay = { ...doc.screenplay, scenes };
    return;
  }
  if (scenes.length === 0) return;
  doc.screenplay = {
    type: "screenplay",
    id: `sp_${Date.now().toString(36)}`,
    title: "",
    shots: [],
    scenes
  };
}

interface SceneGroup {
  sceneId: string | null;
  shots: Shot[];
}

/** Scenes in derived order, each with its shots. `null` is the implicit header. */
function sceneGroups(shots: readonly Shot[]): SceneGroup[] {
  const groups: SceneGroup[] = [];
  const byKey = new Map<string | null, SceneGroup>();
  for (const shot of [...shots].sort((a, b) => a.index - b.index)) {
    const key = shot.scene_id ?? null;
    let group = byKey.get(key);
    if (!group) {
      group = { sceneId: key, shots: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.shots.push(shot);
  }
  return groups;
}

/** Put a shot in a scene, or out of every scene when `sceneId` is null. */
function withScene(shot: Shot, sceneId: string | null): Shot {
  if ((shot.scene_id ?? null) === sceneId) return shot;
  const next = { ...shot };
  if (sceneId === null) {
    delete next.scene_id;
  } else {
    next.scene_id = sceneId;
  }
  return next;
}

/**
 * Finish a structural edit: collect each scene's shots into one run in the
 * order the board already renders them, renumber `0..n-1`, and drop every
 * scene no shot is in. The caller's array order is the intent, so it is
 * stamped before grouping.
 */
function applyStructural(doc: StoryboardDocument, shots: Shot[]): void {
  const proposed = renumberShots(shots);
  doc.shots = renumberShots(
    sceneGroups(proposed).flatMap((group) => group.shots)
  );
  const used = new Set(
    doc.shots.map((shot) => shot.scene_id).filter((id): id is string => !!id)
  );
  const scenes = docScenes(doc);
  const pruned = scenes.filter((scene) => used.has(scene.id));
  if (pruned.length !== scenes.length) {
    setDocScenes(doc, pruned);
  }
}

/**
 * The first scene-creating operation on a board with unscened shots puts them
 * all in one new scene, in index order (PRD § 7.7.3). Returns that scene's id,
 * or null when there was nothing unscened.
 */
function materializeLegacyScene(doc: StoryboardDocument): string | null {
  if (!doc.shots.some((shot) => !shot.scene_id)) return null;
  const scene: Scene = {
    type: "scene",
    id: `scene_${Date.now().toString(36)}_${doc.shots.length}`,
    slugline: ""
  };
  doc.shots = doc.shots.map((shot) =>
    shot.scene_id ? shot : withScene(shot, scene.id)
  );
  setDocScenes(doc, [...docScenes(doc), scene]);
  return scene.id;
}

/** A blank planned shot. `index` is stamped by the reindex that follows. */
function blankShot(id: string, sceneId: string | null): Shot {
  const shot: Shot = {
    type: "shot",
    id,
    index: 0,
    action: "",
    status: "planned"
  };
  return sceneId === null ? shot : withScene(shot, sceneId);
}

/** A shot's stills or takes, oldest first, seeded from a legacy single ref. */
function versionList(
  shot: Shot,
  kind: "keyframe" | "clip"
): (KeyframeVersion | ClipVersion)[] {
  if (kind === "keyframe") {
    return shot.keyframe_versions ?? (shot.keyframe ? [shot.keyframe] : []);
  }
  return shot.clip_versions ?? (shot.clip ? [shot.clip] : []);
}

/** Read `kind` and a 0-based `version` off an op, refusing anything else. */
function readVersionTarget(
  shot: Shot,
  args: Record<string, unknown>
): {
  kind: "keyframe" | "clip";
  index: number;
  versions: (KeyframeVersion | ClipVersion)[];
} {
  const kind = String(args["kind"] ?? "keyframe");
  if (kind !== "keyframe" && kind !== "clip") {
    throw new Error('kind must be "keyframe" or "clip".');
  }
  const index = Number(args["version"] ?? args["index"]);
  const versions = versionList(shot, kind);
  if (!Number.isInteger(index) || index < 0 || index >= versions.length) {
    throw new Error(
      `version must be an integer in [0, ${Math.max(versions.length - 1, 0)}]; shot ${shot.id} holds ${versions.length} ${kind} version(s).`
    );
  }
  return { kind, index, versions };
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
  "covered_by",
  "scene_id",
  "after_shot_id"
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
  if (args["scene_id"] !== undefined) {
    const sceneId = optionalString(args["scene_id"]);
    if (sceneId) {
      next.scene_id = sceneId;
    } else {
      delete next.scene_id;
    }
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

/**
 * Apply one board operation. Returns its summary, or throws with the reason.
 *
 * `entities` is the resolved library `set_style` reads — the document holds
 * ids, and the kinds and descriptors live in the asset rows the caller loaded.
 */
function applyBoardOp(
  doc: StoryboardDocument,
  { op, args }: ParsedBoardOp,
  entities: readonly Entity[] = []
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
      // An explicit anchor is the scene-safe insert: the new shot lands in
      // the anchor's scene, which a bare index cannot say.
      const anchorRef = optionalString(args["after_shot_id"]);
      if (anchorRef !== undefined) {
        const anchor = findShot(doc.shots, anchorRef);
        if (!anchor) throw new Error(`after_shot_id names no shot: "${anchorRef}".`);
        const ordered = [...doc.shots].sort((a, b) => a.index - b.index);
        const at = ordered.findIndex((s) => s.id === anchor.id) + 1;
        ordered.splice(at, 0, withScene(shot, anchor.scene_id ?? null));
        applyStructural(doc, ordered);
        return { id: shot.id, index: at };
      }
      const at =
        isNumber(args["index"])
          ? Math.max(0, Math.min(Math.trunc(args["index"]), doc.shots.length))
          : doc.shots.length;
      const shots = [...doc.shots];
      shots.splice(at, 0, shot);
      applyStructural(doc, shots);
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

    case "move_shot": {
      const target = String(args["target"] ?? "");
      const shot = findShot(doc.shots, target);
      if (!shot) throw new Error(`No shot matches "${target}".`);
      const seeded = materializeLegacyScene(doc);
      const moved = doc.shots.find((s) => s.id === shot.id) as Shot;
      const sceneGiven = args["scene_id"] !== undefined;
      const sceneId = sceneGiven
        ? (optionalString(args["scene_id"]) ?? null)
        : (moved.scene_id ?? seeded ?? null);
      if (sceneId !== null && !docScenes(doc).some((s) => s.id === sceneId)) {
        throw new Error(`move_shot names no scene on this board: "${sceneId}".`);
      }
      const position = Number(args["position"] ?? args["index"]);
      if (!Number.isInteger(position) || position < 0) {
        throw new Error(
          "move_shot needs a `position`: the 0-based place inside the target scene."
        );
      }
      const ordered = sceneGroups(doc.shots).flatMap((g) => g.shots);
      const from = ordered.findIndex((s) => s.id === moved.id);
      const rest = ordered.filter((s) => s.id !== moved.id);
      const run: number[] = [];
      rest.forEach((s, i) => {
        if ((s.scene_id ?? null) === sceneId) run.push(i);
      });
      // A target scene the move empties has no run to count from, so the shot
      // holds its place and only changes scene.
      const at =
        run.length > 0
          ? run[0] + Math.min(position, run.length)
          : Math.min(Math.max(from, 0), rest.length);
      applyStructural(doc, [
        ...rest.slice(0, at),
        withScene(moved, sceneId),
        ...rest.slice(at)
      ]);
      const landed = doc.shots.find((s) => s.id === moved.id) as Shot;
      return { id: landed.id, index: landed.index, scene_id: sceneId };
    }

    case "duplicate_shot": {
      const target = String(args["target"] ?? "");
      const shot = findShot(doc.shots, target);
      if (!shot) throw new Error(`No shot matches "${target}".`);
      const ordered = [...doc.shots].sort((a, b) => a.index - b.index);
      const at = ordered.findIndex((s) => s.id === shot.id);
      const copy: Shot = {
        ...shot,
        id: `shot_${doc.shots.length + 1}_${Date.now().toString(36)}`,
        // The copy covers no script line, so the link fields go with the
        // original and an ERT read off a line is now the user's own.
        duration_source: "manual"
      };
      delete copy.script_line_ids;
      delete copy.script_text_snapshot;
      delete copy.covered_by;
      ordered.splice(at + 1, 0, copy);
      applyStructural(doc, ordered);
      return { id: copy.id, index: at + 1, source: shot.id };
    }

    case "set_setup": {
      const unknown = Object.keys(args).filter(
        (key) => !["brief", "genre", "stage"].includes(key)
      );
      if (unknown.length > 0) {
        throw new Error(
          `set_setup does not take ${unknown.map((k) => `\`${k}\``).join(", ")}. Accepted: brief, genre, stage.`
        );
      }
      if (args["brief"] !== undefined) doc.brief = String(args["brief"]);
      if (args["genre"] !== undefined) doc.genre = String(args["genre"]);
      if (args["stage"] !== undefined) {
        const stage = String(args["stage"]);
        if (!SETUP_STAGES.includes(stage as StoryboardSetupStage)) {
          throw new Error(
            `stage must be one of ${SETUP_STAGES.join(", ")}; got "${stage}".`
          );
        }
        doc.setupStage = stage as StoryboardSetupStage;
      }
      return { brief: doc.brief, genre: doc.genre, stage: doc.setupStage };
    }

    case "update_scene": {
      const sceneId = String(args["scene_id"] ?? "");
      const scenes = docScenes(doc);
      const target = scenes.find((scene) => scene.id === sceneId);
      if (!target) {
        throw new Error(`No scene matches "${sceneId}".`);
      }
      const next: Scene = { ...target };
      if (args["slugline"] !== undefined) next.slugline = String(args["slugline"]);
      if (args["lighting"] !== undefined) next.lighting = String(args["lighting"]);
      setDocScenes(
        doc,
        scenes.map((scene) => (scene.id === sceneId ? next : scene))
      );
      return { id: next.id, slugline: next.slugline, lighting: next.lighting };
    }

    case "create_scene": {
      materializeLegacyScene(doc);
      const scene: Scene = {
        type: "scene",
        id: `scene_${Date.now().toString(36)}_${docScenes(doc).length}`,
        slugline: optionalString(args["slugline"]) ?? ""
      };
      const groups = sceneGroups(doc.shots);
      const afterRef = optionalString(args["after_scene_id"]);
      const after = afterRef
        ? groups.findIndex((g) => g.sceneId === afterRef)
        : -1;
      if (afterRef && after === -1) {
        throw new Error(`after_scene_id names no scene: "${afterRef}".`);
      }
      const ordered = groups.flatMap((g) => g.shots);
      // Right after the last shot of `after_scene_id`, so the new scene lands
      // in the position its first shot's index gives it.
      const at =
        after === -1
          ? ordered.length
          : groups.slice(0, after + 1).reduce((n, g) => n + g.shots.length, 0);
      // A scene with no shot has no position, so it would neither render nor
      // survive the next operation: it opens holding one blank shot.
      const shotId = `shot_${doc.shots.length + 1}_${Date.now().toString(36)}`;
      ordered.splice(at, 0, blankShot(shotId, scene.id));
      setDocScenes(doc, [...docScenes(doc), scene]);
      applyStructural(doc, ordered);
      return { id: scene.id, shot_id: shotId };
    }

    case "merge_scene": {
      const sceneId = String(args["scene_id"] ?? "");
      const groups = sceneGroups(doc.shots);
      const at = groups.findIndex((g) => g.sceneId === sceneId);
      if (at === -1) throw new Error(`No scene matches "${sceneId}".`);
      if (at === 0) {
        throw new Error(
          `Scene ${sceneId} is the first scene; there is nothing before it to merge into.`
        );
      }
      const into = groups[at - 1].sceneId;
      // The emptied scene is dropped by the reindex that follows.
      applyStructural(
        doc,
        groups.flatMap((g) =>
          g === groups[at] ? g.shots.map((s) => withScene(s, into)) : g.shots
        )
      );
      return { merged: sceneId, into };
    }

    case "set_style": {
      const entityId = optionalString(args["entity_id"]);
      if (entityId) {
        const chosen = entities.find((e) => e.id === entityId);
        if (!chosen) {
          throw new Error(
            `No entity "${entityId}" is in the library. Call list_entities, or pass \`style\` instead.`
          );
        }
        if (chosen.kind !== "style") {
          throw new Error(
            `Entity "${entityId}" is a ${chosen.kind}, not a style. Cast it with set_board's entity_ids.`
          );
        }
        const styleIds = new Set(
          entities.filter((e) => e.kind === "style").map((e) => e.id)
        );
        doc.style = chosen.descriptor;
        doc.entityIds = [
          ...(doc.entityIds ?? []).filter((id) => !styleIds.has(id)),
          entityId
        ];
        // A shot's explicit list is its whole selection, so a style missing
        // from it reads as an exclusion. Styles are board-wide.
        doc.shots = doc.shots.map((shot) => {
          if (!shot.entity_ids) return shot;
          return {
            ...shot,
            entity_ids: [
              ...shot.entity_ids.filter((id) => !styleIds.has(id)),
              entityId
            ]
          };
        });
        return {
          style: doc.style,
          style_entity_id: entityId,
          entity_ids: doc.entityIds
        };
      }
      const descriptor = optionalString(args["style"]) ?? optionalString(args["descriptor"]);
      if (descriptor === undefined) {
        throw new Error("set_style needs an `entity_id` or a `style` descriptor.");
      }
      doc.style = descriptor;
      return { style: doc.style, style_entity_id: null };
    }

    case "select_version": {
      const target = String(args["target"] ?? "");
      const shot = findShot(doc.shots, target);
      if (!shot) throw new Error(`No shot matches "${target}".`);
      const { kind, index, versions } = readVersionTarget(shot, args);
      const chosen = versions[index];
      const updated: Shot =
        kind === "keyframe"
          ? { ...shot, keyframe: chosen as KeyframeVersion, keyframe_versions: versions as KeyframeVersion[] }
          : { ...shot, clip: chosen as ClipVersion, clip_versions: versions as ClipVersion[] };
      doc.shots = doc.shots.map((s) => (s.id === shot.id ? updated : s));
      return { id: shot.id, kind, version: index };
    }

    case "delete_version": {
      const target = String(args["target"] ?? "");
      const shot = findShot(doc.shots, target);
      if (!shot) throw new Error(`No shot matches "${target}".`);
      const { kind, index, versions } = readVersionTarget(shot, args);
      const remaining = versions.filter((_, i) => i !== index);
      const selected = kind === "keyframe" ? shot.keyframe : shot.clip;
      const refId = (v: { asset_id?: string | null; uri?: string } | null) =>
        v?.asset_id ?? v?.uri ?? "";
      const removedSelected = !!selected && refId(versions[index]) === refId(selected);
      // The next version at the same position becomes selected, or the last
      // one when the removed version was at the end.
      const next =
        remaining.length === 0
          ? null
          : removedSelected
            ? remaining[Math.min(index, remaining.length - 1)]
            : selected ?? null;
      const updated: Shot = { ...shot };
      if (kind === "keyframe") {
        updated.keyframe = next as KeyframeVersion | null;
        updated.keyframe_versions = remaining as KeyframeVersion[];
        if (remaining.length === 0 && !updated.clip) updated.status = "planned";
      } else {
        updated.clip = next as ClipVersion | null;
        updated.clip_versions = remaining as ClipVersion[];
        if (remaining.length === 0) {
          updated.status = updated.keyframe ? "keyframe_ready" : "planned";
        }
      }
      doc.shots = doc.shots.map((s) => (s.id === shot.id ? updated : s));
      return { id: shot.id, kind, removed: index, remaining: remaining.length };
    }

    case "add_keyframe_version": {
      const target = String(args["target"] ?? "");
      const shot = findShot(doc.shots, target);
      if (!shot) throw new Error(`No shot matches "${target}".`);
      const assetId = optionalString(args["asset_id"]);
      if (!assetId) {
        throw new Error(
          "add_keyframe_version needs an `asset_id` naming a stored image."
        );
      }
      const keyframe: KeyframeVersion = {
        type: "image",
        asset_id: assetId,
        uri: `asset://${assetId}`
      };
      const flipOf = optionalString(args["flip_of"]);
      if (flipOf) {
        // Provenance for a flip or an editor pass. It carries no render
        // record, so the still never reads stale.
        (keyframe as KeyframeVersion & { flip_of: string }).flip_of = flipOf;
      }
      const versions = versionList(shot, "keyframe") as KeyframeVersion[];
      const updated: Shot = {
        ...shot,
        keyframe,
        keyframe_versions: [...versions, keyframe],
        status: shot.status === "planned" ? "keyframe_ready" : shot.status
      };
      doc.shots = doc.shots.map((s) => (s.id === shot.id ? updated : s));
      return { id: shot.id, asset_id: assetId, versions: versions.length + 1 };
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

/**
 * The library `set_style` reads: the board's own cast, plus every entity a
 * `set_style` op names. The named one need not be cast yet — applying a preset
 * is how it gets cast.
 */
async function loadStyleEntities(
  run: CapabilityRun,
  doc: StoryboardDocument,
  ops: readonly ParsedBoardOp[]
): Promise<Entity[]> {
  const named = ops
    .filter((parsed) => parsed.op === "set_style")
    .map((parsed) => optionalString(parsed.args["entity_id"]))
    .filter((id): id is string => !!id);
  if (named.length === 0) return [];
  const cast = await loadBoardEntities(run.context, doc);
  const missing = named.filter((id) => !cast.some((e) => e.id === id));
  if (missing.length === 0) return cast;
  const extra = await loadBoardEntities(run.context, {
    ...doc,
    entityIds: missing
  });
  return [...cast, ...extra];
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
      const entities = await loadStyleEntities(run, doc, ops);
      const resolvedOps: { tool: string; input: Record<string, unknown> }[] = [];
      for (const parsed of ops) {
        try {
          const result = applyBoardOp(doc, parsed, entities) as
            | Record<string, unknown>
            | undefined;
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
          if (
            canonicalId &&
            (parsed.op === "update_shot" ||
              parsed.op === "remove_shot" ||
              parsed.op === "reorder_shot" ||
              parsed.op === "move_shot" ||
              parsed.op === "select_version" ||
              parsed.op === "delete_version" ||
              parsed.op === "add_keyframe_version")
          ) {
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
// direct_storyboard
// ---------------------------------------------------------------------------

const DEFAULT_DIRECTED_SHOTS = 6;

/**
 * The Director, headless. The browser runs the same three protocol functions
 * from `useDirectScreenplay`; keeping the prompt, the schema and the parse in
 * `@nodetool-ai/protocol` is what makes a board directed here and one directed
 * in the editor the same artifact.
 */
const directStoryboard: CapabilityExport = {
  spec: directStoryboardSpec,
  impl: async (run, params) => {
    const context = run.context;
    const board = await loadBoard(run, params["storyboard_id"]);
    if (isError(board)) return board;
    const { row, doc } = board;

    const brief = doc.brief.trim();
    if (!brief) {
      return {
        error: `Storyboard ${row.id} has no brief, so there is nothing to direct. Write one with edit_storyboard's set_setup op.`
      };
    }
    if (doc.shots.length > 0 && params["redirect"] !== true) {
      return {
        error: `Storyboard ${row.id} already has ${doc.shots.length} shots. Pass redirect: true to run the Director over them again — retained shots keep their ids and their rendered media.`
      };
    }

    const model = resolveModel(
      params,
      doc.directorModel,
      "director",
      "generate_text"
    );
    if (isError(model)) return model;

    const {
      DIRECTOR_SYSTEM_PROMPT,
      SCREENPLAY_TOOL_DESCRIPTION,
      SCREENPLAY_TOOL_NAME,
      buildDirectorPrompt,
      buildScreenplaySchema,
      clampShotCount,
      fallbackScreenplay,
      parseScreenplay
    } = await import("@nodetool-ai/protocol");
    const { generateStructured } = await import("@nodetool-ai/runtime");

    const shotCount = clampShotCount(
      isNumber(params["shot_count"])
        ? params["shot_count"]
        : DEFAULT_DIRECTED_SHOTS
    );
    const aspectRatio = doc.aspectRatio || "16:9";
    // The cast reaches the model so the screenplay names entities by their
    // exact names, which is what activates them per shot.
    const entities = await loadBoardEntities(context, doc);
    const castLines = entities.map(
      (e) => `- ${e.name} (${e.kind})${e.descriptor ? `: ${e.descriptor}` : ""}`
    );
    const genre = doc.genre.trim();
    const directedBrief = [
      brief,
      genre ? `Genre: ${genre}` : "",
      castLines.length > 0
        ? `Cast & ingredients — reference these by exact name in the shots:\n${castLines.join("\n")}`
        : ""
    ]
      .filter((part) => part !== "")
      .join("\n\n");

    const provider = await context.getProvider(model.provider);
    const raw = await generateStructured(provider, {
      model: model.model,
      maxTokens: 8192,
      messages: [
        { role: "system", content: DIRECTOR_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildDirectorPrompt(
            directedBrief,
            doc.style,
            shotCount,
            aspectRatio
          )
        }
      ],
      toolName: SCREENPLAY_TOOL_NAME,
      toolDescription: SCREENPLAY_TOOL_DESCRIPTION,
      schema: buildScreenplaySchema(shotCount)
    });
    const parsed = raw
      ? parseScreenplay(raw, { shotCount, aspectRatio, genre: genre || undefined })
      : null;
    // No usable answer — a provider without tool support, or the fake provider
    // — falls back to placeholder shots derived from the brief, the same rule
    // the Director node and the editor apply. A provider error still throws.
    const screenplay =
      parsed && parsed.shots.length > 0
        ? parsed
        : fallbackScreenplay({
            brief,
            style: doc.style,
            shotCount,
            aspectRatio
          });

    const { Storyboard } = await import("@nodetool-ai/models");
    for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
      const current = await loadBoard(run, row.id);
      if (isError(current)) return current;
      const next = current.doc;
      // A screenplay describes direction. Its media can predate renders made
      // while the Director ran, so a retained shot keeps its own.
      const existing = new Map(next.shots.map((shot) => [shot.id, shot]));
      next.shots = screenplay.shots.map((shot, index) => {
        const held = existing.get(shot.id);
        if (!held) return { ...shot, index };
        return {
          ...held,
          ...shot,
          index,
          keyframe: held.keyframe,
          keyframe_versions: held.keyframe_versions,
          clip: held.clip,
          clip_versions: held.clip_versions,
          covered_by: held.covered_by,
          status: held.status
        };
      });
      next.screenplay = screenplay;
      next.style = screenplay.style_bible ?? next.style;
      next.aspectRatio = screenplay.aspect_ratio ?? next.aspectRatio;
      if (screenplay.genre) next.genre = screenplay.genre;

      const saved = await Storyboard.updateFieldsIfUnchanged(
        current.row.id,
        current.row.updated_at,
        { document: JSON.stringify(next) }
      );
      if (!saved) continue;
      return {
        storyboard_id: current.row.id,
        updated_at: saved.updated_at,
        title: screenplay.title,
        genre: next.genre,
        redirected: params["redirect"] === true,
        scenes: (screenplay.scenes ?? []).map((scene) => ({
          id: scene.id,
          slugline: scene.slugline,
          lighting: scene.lighting
        })),
        shots: next.shots.map((shot) => ({
          id: shot.id,
          index: shot.index,
          slug: shot.slug,
          action: shot.action,
          scene_id: shot.scene_id,
          status: shot.status,
          has_keyframe: !!shot.keyframe,
          has_clip: !!shot.clip
        }))
      };
    }

    return {
      error: `Storyboard ${row.id} is being modified concurrently; the screenplay was directed but could not be saved. Retry the call.`
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
  directStoryboard,
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
  directStoryboard,
  extractScriptFromStoryboard,
  deleteStoryboard
};
