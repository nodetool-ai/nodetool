/**
 * Storyboard nodes — a persisted board as a graph value.
 *
 * A director approves one board in the editor; a graph then re-runs it for a
 * new product, a new actor, a new SKU. These nodes are that loop: read a board
 * (`LoadStoryboard`, `StoryboardShots`), derive a copy for a new cast
 * (`RecastStoryboard`), spend on its frames (`RenderStills`, `RenderClips`),
 * and cut it (`AssembleTimeline`). Design:
 * [docs/graph-resources/design.md](../../../../docs/graph-resources/design.md) §4.2.
 *
 * The derivation, the render plan and the render path itself come from
 * `@nodetool-ai/storyboard`, the same functions the agent capabilities and the
 * board editor call, so a board rendered from a graph matches one rendered from
 * chat.
 *
 * **Write contract.** A `StoryboardRef` is read-only unless it carries
 * `writable: true`, and only a node that created or derived the row in this run
 * sets it. `RenderStills`, `RenderClips` and `AssembleTimeline` refuse a ref
 * without the flag before they read anything, so a picker wired straight into a
 * render node fails before any spend rather than after it.
 */

import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import { isObjectLike, isString } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { loadMediaRefBytes, resolveEntities } from "@nodetool-ai/runtime";
import { shotRenderMode } from "@nodetool-ai/protocol";
import type {
  Entity,
  ImageRef,
  InputMode,
  KeyframeVersion,
  OutputCorrelation,
  Shot,
  StoryboardRef,
  VideoRef
} from "@nodetool-ai/protocol";
import type {
  ScriptSection,
  Speaker
} from "@nodetool-ai/protocol/api-schemas/scripts.js";
import {
  planShotRenders,
  recastStoryboard,
  renderShots,
  type RecastCastEntry,
  type ShotRenderOutcome,
  type ShotRenderPlan,
  type ShotRenderPlanOptions,
  type StoryboardDocument,
  type StoryboardRenderHost
} from "@nodetool-ai/storyboard";
import {
  buildLinkedTimeline,
  buildStoryboardTimeline,
  cloneTimelineForBoard,
  foreignTimelineParts,
  frameSizeForAspect,
  makeSequence,
  scriptLinesById,
  type AssembledTimeline,
  type RetimedShot,
  type TimelineSequence
} from "@nodetool-ai/timeline";
import { tagAsServer } from "@nodetool-ai/nodes-utils";

const storyboardRefDefault = {
  type: "storyboard",
  id: null,
  data: null
} as const;

/** An unset model selection: the picker's "nothing chosen" value. */
const emptyModel = (type: "image_model" | "video_model") =>
  ({
    type,
    provider: "empty",
    id: "",
    name: "",
    path: null,
    supported_tasks: []
  }) as const;

/** Structural view of the `image_model` / `video_model` prop values. */
interface ModelSelectionLike {
  type?: string;
  provider?: string;
  id?: string;
}

interface StoryboardRefLike {
  type?: string;
  id?: string | null;
  data?: unknown;
  writable?: boolean;
}

/** What `getStoryboard` / `createStoryboard` answer with (`StoryboardResponse`). */
interface StoryboardRowLike {
  id: string;
  projectId: string;
  name: string;
  document: StoryboardDocument;
  timelineId?: string;
  updatedAt: string;
}

/** What `getScript` answers with, narrowed to what assembly reads. */
interface ScriptRowLike {
  id: string;
  document: { cast: Speaker[]; sections: ScriptSection[] };
}

/**
 * `RecastStoryboard` finds the copy a previous run made by (project,
 * `templateId`, `recastKey`). A host that wires no `listStoryboards` cannot
 * answer that, and `reuse_existing` says so rather than quietly making a
 * second row — and a second bill — on every run.
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  isObjectLike(value);

/** The board rows a host can list, or null when it cannot list any. */
async function listBoards(
  context: ProcessingContext,
  projectId: string
): Promise<StoryboardRowLike[] | null> {
  if (!context.hasModelInterface("listStoryboards")) return null;
  const rows = await context.listStoryboards({ projectId });
  return rows.filter(
    (row): row is StoryboardRowLike =>
      isRecord(row) && isString(row["id"]) && isRecord(row["document"])
  );
}

// ---------------------------------------------------------------------------
// Board access
// ---------------------------------------------------------------------------

const requireContext = (
  context: ProcessingContext | undefined,
  node: string
): ProcessingContext => {
  if (!context) {
    throw new Error(`${node} requires a processing context`);
  }
  return context;
};

/**
 * The board a ref points at.
 *
 * An inline `data` document is read without touching the database — the shape
 * the debug harness and the node tests use. Anything that writes needs the row,
 * so it calls {@link loadBoardRow} instead.
 */
async function readBoard(
  ref: unknown,
  context: ProcessingContext | undefined,
  node: string
): Promise<StoryboardRowLike> {
  const boardRef = (ref ?? {}) as StoryboardRefLike;
  if (!boardRef.id) {
    if (isRecord(boardRef.data)) {
      return {
        id: "",
        projectId: "default",
        name: "",
        document: boardRef.data as unknown as StoryboardDocument,
        updatedAt: ""
      };
    }
    throw new Error(
      `${node}: storyboard input is empty — connect a Constant Storyboard node and pick a board`
    );
  }
  const ctx = requireContext(context, node);
  const row = (await ctx.getStoryboard(boardRef.id)) as StoryboardRowLike | null;
  if (!row) {
    throw new Error(`${node}: storyboard not found: ${boardRef.id}`);
  }
  return row;
}

/** The persisted row a write needs; an inline document is not one. */
async function loadBoardRow(
  ref: unknown,
  context: ProcessingContext | undefined,
  node: string
): Promise<{ row: StoryboardRowLike; context: ProcessingContext }> {
  const ctx = requireContext(context, node);
  const row = await readBoard(ref, ctx, node);
  if (!row.id) {
    throw new Error(
      `${node}: an inline storyboard document has no row to write to. Pick a persisted board.`
    );
  }
  return { row, context: ctx };
}

/**
 * Refuse a board this run did not derive.
 *
 * The question is the flag on the ref, never whether a derived row happens to
 * exist: a first run has no copies yet, and a copy picked from the library is
 * as approved as the template it came from. Checked before the board is read,
 * so a miswire costs nothing.
 */
function requireWritable(
  ref: unknown,
  allowWrites: boolean,
  node: string
): void {
  if (allowWrites) return;
  const boardRef = (ref ?? {}) as StoryboardRefLike;
  if (boardRef.writable === true) return;
  throw new Error(
    `${node} will not write a storyboard this run did not derive. Feed it the board from RecastStoryboard, or turn on allow_writes to render the board you picked.`
  );
}

/** The ref this run may keep writing to. */
const writableRef = (id: string): StoryboardRef => ({
  type: "storyboard",
  id,
  writable: true
});

/** The board's cast, read from the library. */
async function loadBoardEntities(
  context: ProcessingContext,
  doc: StoryboardDocument
): Promise<Entity[]> {
  const ids = doc.entityIds ?? [];
  if (ids.length === 0 || !context.hasModelInterface("getEntity")) return [];
  const loaded = await Promise.all(ids.map((id) => context.getEntity(id)));
  return loaded.filter((entity): entity is Entity => !!entity);
}

interface ModelChoice {
  provider: string;
  model: string;
}

/**
 * The model a render uses: the node's override when set, else the board's.
 *
 * Unset is an error, never a default — a board rendered on a model nobody chose
 * is a bill nobody agreed to.
 */
function resolveModel(
  boardModel: Record<string, unknown> | null,
  override: ModelSelectionLike | undefined,
  kind: "still" | "clip",
  capability: string
): ModelChoice {
  const provider =
    override?.provider && override.provider !== "empty"
      ? override.provider
      : isString(boardModel?.["provider"])
        ? (boardModel["provider"] as string)
        : "";
  const model =
    override?.id && override.id !== ""
      ? override.id
      : isString(boardModel?.["id"])
        ? (boardModel["id"] as string)
        : "";
  if (!provider || !model) {
    throw new Error(
      `No ${kind} model is set on this storyboard. Set one on the board, or wire this node's ${
        kind === "still" ? "image_model" : "video_model"
      } input (find_model with capability=${capability} lists the choices).`
    );
  }
  return { provider, model };
}

/**
 * The render path's host seam (`renderShots` in `@nodetool-ai/storyboard`).
 *
 * The same four operations the agent capability implements, over the context's
 * model interfaces instead of the model classes — one render path, whether the
 * board is rendered from a graph or from chat.
 *
 * `videoDurationSeconds` is deliberately absent: the MP4 header probe lives in
 * `@nodetool-ai/agents`, which sits above this package. A clip rendered here
 * therefore carries the length it was directed at, and assembly reports it as
 * retimed only when the board itself says so.
 */
function renderHost(context: ProcessingContext): StoryboardRenderHost {
  return {
    runGeneration: async (request) => {
      const result = await context.runGeneration({
        id: request.id,
        provider: request.provider,
        capability: request.capability,
        model: request.model,
        params: request.params,
        origin: { surface: "workflow" },
        persist: request.persist
      });
      return { output: result.output, assets: result.assets };
    },
    getStoryboard: async (id) => {
      const row = (await context.getStoryboard(id)) as StoryboardRowLike | null;
      return row ? { document: row.document, updatedAt: row.updatedAt } : null;
    },
    updateStoryboard: async ({ id, document, baseUpdatedAt }) => {
      const saved = (await context.updateStoryboard(id, {
        document,
        baseUpdatedAt
      })) as StoryboardRowLike | null;
      return saved ? { document, updatedAt: saved.updatedAt } : null;
    },
    loadMedia: async (ref: KeyframeVersion) => loadMediaRefBytes(ref, context)
  };
}

// ---------------------------------------------------------------------------
// Shot selection
// ---------------------------------------------------------------------------

/** `targets` as the plan reads it: undefined means every shot. */
const asTargets = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const targets = value.map((entry) => String(entry).trim()).filter(Boolean);
  return targets.length > 0 ? targets : undefined;
};

const orderedShots = (doc: StoryboardDocument): Shot[] =>
  [...doc.shots].sort((a, b) => a.index - b.index);

const imageRefOf = (outcome: ShotRenderOutcome): ImageRef => ({
  type: "image",
  uri: outcome.assetUri ?? "",
  asset_id: outcome.assetId ?? null
});

const videoRefOf = (outcome: ShotRenderOutcome): VideoRef => ({
  type: "video",
  uri: outcome.assetUri ?? "",
  asset_id: outcome.assetId ?? null
});

interface RenderSelection {
  plans: ShotRenderPlan[];
  skipped: string[];
}

/** The shots that already carry a take of this kind. */
const shotsWithVersion = (
  doc: StoryboardDocument,
  kind: "keyframe" | "clip"
): Set<string> =>
  new Set(
    doc.shots
      .filter((shot) => (kind === "keyframe" ? !!shot.keyframe : !!shot.clip))
      .map((shot) => shot.id)
  );

/**
 * Drop the plans a gate refuses, keeping the shot ids each gate skipped.
 *
 * `onlyStale` skips a shot the board would render exactly as it already did —
 * which is a question only a shot that *has* a take can answer, so `rendered`
 * bounds it. A never-rendered shot reads `fresh` on the plan (nothing recorded
 * is nothing to be out of date with) and must still be rendered.
 *
 * `max_shots` truncates rather than failing: the cap is a spend gate, and a
 * board bigger than the cap renders its first N and says which it left, rather
 * than refusing the run (design §1, P4).
 */
function applyGates(
  plans: ShotRenderPlan[],
  gates: {
    onlyStale: boolean;
    rendered: ReadonlySet<string>;
    skipShotIds?: ReadonlySet<string>;
    maxShots: number;
  }
): RenderSelection {
  const skipped: string[] = [];
  let kept = plans;
  const refused = gates.skipShotIds;
  if (refused && refused.size > 0) {
    skipped.push(
      ...kept.filter((plan) => refused.has(plan.shotId)).map((plan) => plan.shotId)
    );
    kept = kept.filter((plan) => !refused.has(plan.shotId));
  }
  if (gates.onlyStale) {
    const current = (plan: ShotRenderPlan): boolean =>
      plan.fresh && gates.rendered.has(plan.shotId);
    skipped.push(...kept.filter(current).map((plan) => plan.shotId));
    kept = kept.filter((plan) => !current(plan));
  }
  const limit = Math.max(0, Math.floor(gates.maxShots));
  if (kept.length > limit) {
    skipped.push(...kept.slice(limit).map((plan) => plan.shotId));
    kept = kept.slice(0, limit);
  }
  return { plans: kept, skipped };
}

const clampConcurrency = (value: unknown): number => {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, 8);
};

// ---------------------------------------------------------------------------
// LoadStoryboard
// ---------------------------------------------------------------------------

type LoadStoryboardOutputs = {
  storyboard: StoryboardRef;
  shots: Shot[];
  entities: Entity[];
  style: string;
  aspect_ratio: string;
  name: string;
  image_model: Record<string, unknown> | null;
  video_model: Record<string, unknown> | null;
  shot_count: number;
};

export class LoadStoryboardNode extends BaseNode {
  static readonly nodeType = "nodetool.storyboard.LoadStoryboard";
  static readonly title = "Load Storyboard";
  static readonly description =
    "Read a persisted storyboard's shots, cast and settings.\n    storyboard, board, shots, entities, load\n\n    Use cases:\n    - Feed a board's shots into a batch\n    - Read the cast a board was directed with\n    - Branch a workflow on a board's shot count";
  static readonly metadataOutputTypes = {
    storyboard: "storyboard",
    shots: "list[dict]",
    entities: "list[entity]",
    style: "str",
    aspect_ratio: "str",
    name: "str",
    image_model: "image_model",
    video_model: "video_model",
    shot_count: "int"
  };
  static readonly inlineFields = ["storyboard"];
  static readonly inputFields = ["storyboard"];

  @prop({
    type: "storyboard",
    default: storyboardRefDefault,
    title: "Storyboard",
    description: "The board to read."
  })
  declare storyboard: StoryboardRef;

  async process(context?: ProcessingContext): Promise<LoadStoryboardOutputs> {
    const row = await readBoard(this.storyboard, context, "LoadStoryboard");
    const doc = row.document;
    const shots = orderedShots(doc);
    const entities = context ? await loadBoardEntities(context, doc) : [];
    // The ref passes through as it arrived: reading a board never earns the
    // right to write it (write contract, design §4.2).
    return {
      storyboard: { type: "storyboard", id: row.id || null },
      shots,
      entities,
      style: doc.style ?? "",
      aspect_ratio: doc.aspectRatio || "16:9",
      name: row.name,
      image_model: doc.imageModel ?? null,
      video_model: doc.videoModel ?? null,
      shot_count: shots.length
    };
  }
}

// ---------------------------------------------------------------------------
// StoryboardShots
// ---------------------------------------------------------------------------

type StoryboardShotsStreamOutputs = {
  shot: Shot | null;
  index: number | null;
  slug: string | null;
  keyframe: ImageRef | null;
  clip: VideoRef | null;
  output?: Shot[];
};

export class StoryboardShotsNode extends BaseNode {
  static readonly nodeType = "nodetool.storyboard.StoryboardShots";
  static readonly title = "Storyboard Shots";
  static readonly description =
    "Fan a persisted storyboard out into one message per shot, with its rendered still and clip.\n    storyboard, shots, iterate, keyframe, clip\n\n    Use cases:\n    - Driving a per-shot pipeline from an approved board\n    - Collecting a board's stills or clips downstream\n    - Iterating over shots without re-directing them";
  static readonly metadataOutputTypes = {
    shot: "dict",
    index: "int",
    slug: "str",
    keyframe: "image",
    clip: "video",
    output: "list[dict]"
  };
  static readonly inlineFields = ["storyboard"];
  static readonly inputFields = ["storyboard"];

  // Emit per-shot output_updates even when the handles are wired onward, so
  // the node shows shots as they stream regardless of downstream connections.
  static readonly alwaysEmitOutputUpdates = true;

  static readonly inputMode: InputMode = "buffered";
  static readonly outputCorrelation = {
    shot: { kind: "iteration", source: "__execution__", group: "items" },
    index: { kind: "iteration", source: "__execution__", group: "items" },
    slug: { kind: "iteration", source: "__execution__", group: "items" },
    keyframe: { kind: "iteration", source: "__execution__", group: "items" },
    clip: { kind: "iteration", source: "__execution__", group: "items" },
    output: { kind: "single", source: "__execution__" }
  } satisfies Record<string, OutputCorrelation>;

  @prop({
    type: "storyboard",
    default: storyboardRefDefault,
    title: "Storyboard",
    description: "The board whose shots to stream."
  })
  declare storyboard: StoryboardRef;

  async process(context?: ProcessingContext): Promise<{ output: Shot[] }> {
    const shots: Shot[] = [];
    for await (const chunk of this.genProcess(context)) {
      if (chunk.shot) shots.push(chunk.shot);
    }
    return { output: shots };
  }

  async *genProcess(
    context?: ProcessingContext
  ): AsyncGenerator<StoryboardShotsStreamOutputs> {
    const row = await readBoard(this.storyboard, context, "StoryboardShots");
    const shots = orderedShots(row.document);
    for (const shot of shots) {
      yield {
        shot,
        index: shot.index,
        slug: shot.slug ?? "",
        keyframe: shot.keyframe
          ? {
              type: "image",
              uri: shot.keyframe.uri ?? "",
              asset_id: shot.keyframe.asset_id ?? null
            }
          : null,
        clip: shot.clip
          ? {
              type: "video",
              uri: shot.clip.uri ?? "",
              asset_id: shot.clip.asset_id ?? null
            }
          : null
      };
    }
    yield {
      shot: null,
      index: null,
      slug: null,
      keyframe: null,
      clip: null,
      output: shots
    };
  }
}

// ---------------------------------------------------------------------------
// RecastStoryboard
// ---------------------------------------------------------------------------

type RecastStoryboardOutputs = {
  storyboard: StoryboardRef;
  invalidated: string[];
  kept: string[];
};

export class RecastStoryboardNode extends BaseNode {
  static readonly nodeType = "nodetool.storyboard.RecastStoryboard";
  static readonly title = "Recast Storyboard";
  static readonly description =
    "Copy an approved storyboard onto a new cast, keeping every frame whose prompt did not change.\n    storyboard, recast, variant, batch, entities\n\n    Use cases:\n    - Re-running an approved board for another product\n    - Swapping the actor or location in a template\n    - Producing one variant per SKU without re-directing";
  static readonly metadataOutputTypes = {
    storyboard: "storyboard",
    invalidated: "list[str]",
    kept: "list[str]"
  };
  static readonly inlineFields = ["storyboard"];
  static readonly inputFields = ["storyboard", "cast"];

  @prop({
    type: "storyboard",
    default: storyboardRefDefault,
    title: "Storyboard",
    description: "The template board to copy. It is never written."
  })
  declare storyboard: StoryboardRef;

  @prop({
    type: "list[entity]",
    default: [],
    title: "Cast",
    description:
      "Entities to put in the copy. Each replaces the board entity named in `replaces`, or the board's single entity of the same kind."
  })
  declare cast: unknown[];

  @prop({
    type: "list[str]",
    default: [],
    title: "Replaces",
    description:
      "Board entity id or name each cast member stands in for, in cast order. Leave an entry empty to infer it from the entity's kind."
  })
  declare replaces: string[];

  @prop({
    type: "str",
    default: "",
    title: "Name",
    description: "Name for the copy. Defaults to the template's name plus the new cast."
  })
  declare name: string;

  @prop({
    type: "bool",
    default: true,
    title: "Reuse Existing",
    description:
      "Re-derive the copy this mapping made last time instead of creating a second one, so a re-run pays only for what changed."
  })
  declare reuse_existing: boolean;

  async process(
    context?: ProcessingContext
  ): Promise<RecastStoryboardOutputs> {
    const { row, context: ctx } = await loadBoardRow(
      this.storyboard,
      context,
      "RecastStoryboard"
    );
    const doc = row.document;
    const entities = await resolveEntities(this.cast, ctx);
    if (entities.length === 0) {
      throw new Error(
        "RecastStoryboard: cast is empty — connect the entities that replace the template's."
      );
    }
    const replaces = Array.isArray(this.replaces) ? this.replaces : [];
    const cast: RecastCastEntry[] = entities.map((entity, index) => {
      const target = String(replaces[index] ?? "").trim();
      return target ? { entity, replaces: target } : { entity };
    });
    const boardEntities = await loadBoardEntities(ctx, doc);

    // The mapping this cast resolves to. `recastKey` depends on which board
    // entity each cast member ended up replacing, which only the derivation
    // works out — so the copy is derived once to learn the key, and again
    // against the copy that key finds. Both passes are pure.
    const probe = recastStoryboard({
      document: doc,
      sourceId: row.id,
      boardEntities,
      cast
    });
    const existing = this.reuse_existing
      ? await this.findExisting(ctx, row, probe.recastKey)
      : null;

    const result = existing
      ? recastStoryboard({
          document: doc,
          sourceId: row.id,
          boardEntities,
          cast,
          existing: existing.document
        })
      : probe;

    const name = this.copyName(row, result.substitutions.map((s) => s.to));
    const saved = existing
      ? ((await ctx.updateStoryboard(existing.id, {
          document: result.document
        })) as StoryboardRowLike | null)
      : ((await ctx.createStoryboard({
          name,
          projectId: row.projectId,
          document: result.document
        })) as StoryboardRowLike | null);
    if (!saved) {
      throw new Error(
        `RecastStoryboard: could not save the copy of ${row.name || row.id}.`
      );
    }

    return {
      storyboard: writableRef(saved.id),
      invalidated: result.invalidatedShotIds,
      kept: result.keptShotIds
    };
  }

  /** The copy this mapping made last time, when the host can look one up. */
  private async findExisting(
    context: ProcessingContext,
    row: StoryboardRowLike,
    recastKey: string
  ): Promise<StoryboardRowLike | null> {
    const boards = await listBoards(context, row.projectId);
    if (boards === null) {
      throw new Error(
        "RecastStoryboard: this host cannot look up the copy a previous run made, so reuse_existing would create a second board (and a second bill) every run. Turn reuse_existing off to make a fresh copy each time."
      );
    }
    return (
      boards.find(
        (board) =>
          board.id !== row.id &&
          board.document.templateId === row.id &&
          board.document.recastKey === recastKey
      ) ?? null
    );
  }

  private copyName(row: StoryboardRowLike, cast: readonly Entity[]): string {
    const given = String(this.name ?? "").trim();
    if (given) return given;
    const names = cast.map((entity) => entity.name).filter(Boolean);
    const base = row.name || "Storyboard";
    return names.length > 0 ? `${base} — ${names.join(", ")}` : `${base} (recast)`;
  }
}

// ---------------------------------------------------------------------------
// RenderStills / RenderClips
// ---------------------------------------------------------------------------

type RenderStillsOutputs = {
  storyboard: StoryboardRef;
  keyframes: ImageRef[];
  rendered: string[];
  skipped: string[];
  failed: string[];
};

export class RenderStillsNode extends BaseNode {
  static readonly nodeType = "nodetool.storyboard.RenderStills";
  static readonly title = "Render Stills";
  static readonly description =
    "Render the keyframe of every stale shot on a storyboard and save it onto the board.\n    storyboard, keyframe, still, render, batch\n\n    Use cases:\n    - Filling a recast board's frames before the clips\n    - Re-rendering only the shots a template edit changed\n    - Stopping a batch at the stills to review the spend";
  static readonly metadataOutputTypes = {
    storyboard: "storyboard",
    keyframes: "list[image]",
    rendered: "list[str]",
    skipped: "list[str]",
    failed: "list[str]"
  };
  static readonly inlineFields = ["storyboard"];
  static readonly inputFields = ["storyboard", "targets"];

  @prop({
    type: "storyboard",
    default: storyboardRefDefault,
    title: "Storyboard",
    description: "The board whose stills to render."
  })
  declare storyboard: StoryboardRef;

  @prop({
    type: "list[str]",
    default: [],
    title: "Targets",
    description:
      "Shot ids, indices or slugs to render. Empty renders every shot the gates allow."
  })
  declare targets: string[];

  @prop({
    type: "int",
    default: 24,
    title: "Max Shots",
    description:
      "Most shots this call renders. The rest are reported as skipped, not rendered.",
    min: 1,
    max: 200
  })
  declare max_shots: number;

  @prop({
    type: "int",
    default: 2,
    title: "Concurrency",
    description: "Renders in flight at once.",
    min: 1,
    max: 8
  })
  declare concurrency: number;

  @prop({
    type: "bool",
    default: true,
    title: "Only Stale",
    description:
      "Skip a shot whose still already matches what the board would render."
  })
  declare only_stale: boolean;

  @prop({
    type: "image_model",
    default: emptyModel("image_model"),
    title: "Image Model",
    description: "Overrides the board's still model for this call."
  })
  declare image_model: ModelSelectionLike;

  @prop({
    type: "bool",
    default: false,
    title: "Allow Writes",
    description:
      "Render the board as it was picked, rather than only one this run derived."
  })
  declare allow_writes: boolean;

  async process(context?: ProcessingContext): Promise<RenderStillsOutputs> {
    requireWritable(this.storyboard, this.allow_writes, "RenderStills");
    const { row, context: ctx } = await loadBoardRow(
      this.storyboard,
      context,
      "RenderStills"
    );
    const doc = row.document;
    const model = resolveModel(
      doc.imageModel,
      this.image_model,
      "still",
      "text_to_image"
    );
    const entities = await loadBoardEntities(ctx, doc);
    const targets = asTargets(this.targets);
    const options: ShotRenderPlanOptions = {
      provider: model.provider,
      model: model.model
    };
    const plans = planShotRenders(doc, entities, "keyframe", targets, options);
    // A direct-mode shot renders its clip from the prompt and needs no still —
    // unless it was named, where a board frame to look at is worth having.
    const direct = new Set(
      targets
        ? []
        : doc.shots
            .filter((shot) => shotRenderMode(shot) === "direct")
            .map((shot) => shot.id)
    );
    const selection = applyGates(plans, {
      onlyStale: this.only_stale,
      rendered: shotsWithVersion(doc, "keyframe"),
      skipShotIds: direct,
      maxShots: this.max_shots
    });
    const outcomes = await renderShots(
      renderHost(ctx),
      { id: row.id },
      selection.plans,
      { concurrency: clampConcurrency(this.concurrency) }
    );

    return {
      storyboard: writableRef(row.id),
      keyframes: outcomes.filter((o) => o.ok).map(imageRefOf),
      rendered: outcomes.filter((o) => o.ok).map((o) => o.shotId),
      skipped: selection.skipped,
      failed: outcomes.filter((o) => !o.ok).map((o) => o.shotId)
    };
  }
}

type RenderClipsOutputs = {
  storyboard: StoryboardRef;
  clips: VideoRef[];
  rendered: string[];
  skipped: string[];
  failed: string[];
};

export class RenderClipsNode extends BaseNode {
  static readonly nodeType = "nodetool.storyboard.RenderClips";
  static readonly title = "Render Clips";
  static readonly description =
    "Animate every stale shot on a storyboard and save the clip onto the board.\n    storyboard, clip, video, render, batch\n\n    Use cases:\n    - Turning approved stills into shots\n    - Re-rendering only the clips a recast invalidated\n    - Bounding what one run spends on video";
  static readonly metadataOutputTypes = {
    storyboard: "storyboard",
    clips: "list[video]",
    rendered: "list[str]",
    skipped: "list[str]",
    failed: "list[str]"
  };
  static readonly inlineFields = ["storyboard"];
  static readonly inputFields = ["storyboard", "targets"];

  @prop({
    type: "storyboard",
    default: storyboardRefDefault,
    title: "Storyboard",
    description: "The board whose clips to render."
  })
  declare storyboard: StoryboardRef;

  @prop({
    type: "list[str]",
    default: [],
    title: "Targets",
    description:
      "Shot ids, indices or slugs to render. Empty renders every shot the gates allow."
  })
  declare targets: string[];

  @prop({
    type: "int",
    default: 8,
    title: "Max Shots",
    description:
      "Most shots this call renders. The rest are reported as skipped, not rendered.",
    min: 1,
    max: 100
  })
  declare max_shots: number;

  @prop({
    type: "bool",
    default: true,
    title: "Require Keyframe",
    description:
      "Skip a keyframe-mode shot that has no selected still, instead of spending on a clip with nothing to animate."
  })
  declare require_keyframe: boolean;

  @prop({
    type: "int",
    default: 1,
    title: "Concurrency",
    description: "Renders in flight at once.",
    min: 1,
    max: 8
  })
  declare concurrency: number;

  @prop({
    type: "bool",
    default: true,
    title: "Only Stale",
    description:
      "Skip a shot whose clip already matches what the board would render."
  })
  declare only_stale: boolean;

  @prop({
    type: "video_model",
    default: emptyModel("video_model"),
    title: "Video Model",
    description: "Overrides the board's clip model for this call."
  })
  declare video_model: ModelSelectionLike;

  @prop({
    type: "bool",
    default: false,
    title: "Allow Writes",
    description:
      "Render the board as it was picked, rather than only one this run derived."
  })
  declare allow_writes: boolean;

  async process(context?: ProcessingContext): Promise<RenderClipsOutputs> {
    requireWritable(this.storyboard, this.allow_writes, "RenderClips");
    const { row, context: ctx } = await loadBoardRow(
      this.storyboard,
      context,
      "RenderClips"
    );
    const doc = row.document;
    const model = resolveModel(
      doc.videoModel,
      this.video_model,
      "clip",
      doc.shots.every((shot) => shotRenderMode(shot) === "direct")
        ? "text_to_video"
        : "image_to_video"
    );
    const entities = await loadBoardEntities(ctx, doc);
    const targets = asTargets(this.targets);
    // A linked board times its shots from the words they cover, so a clip is
    // rendered long enough to hold its voiceover.
    const script = await loadLinkedScript(ctx, doc);
    const options: ShotRenderPlanOptions = {
      provider: model.provider,
      model: model.model,
      scriptLines: scriptLinesById(script?.document.sections ?? [])
    };
    const plans = planShotRenders(doc, entities, "clip", targets, options);
    // A shot whose picture is a window into another's clip has nothing of its
    // own to render, and a keyframe-mode shot with no still has nothing to
    // animate — refusing that one is what `require_keyframe` buys.
    const covered = new Set(
      doc.shots.filter((shot) => shot.covered_by?.shot_id).map((shot) => shot.id)
    );
    const unrenderable = new Set([
      ...covered,
      ...(this.require_keyframe
        ? plans
            .filter((plan) => plan.mode === "keyframe" && !plan.sourceKeyframe)
            .map((plan) => plan.shotId)
        : [])
    ]);
    const selection = applyGates(plans, {
      onlyStale: this.only_stale,
      rendered: shotsWithVersion(doc, "clip"),
      skipShotIds: unrenderable,
      maxShots: this.max_shots
    });
    const outcomes = await renderShots(
      renderHost(ctx),
      { id: row.id },
      selection.plans,
      { concurrency: clampConcurrency(this.concurrency) }
    );

    return {
      storyboard: writableRef(row.id),
      clips: outcomes.filter((o) => o.ok).map(videoRefOf),
      rendered: outcomes.filter((o) => o.ok).map((o) => o.shotId),
      skipped: selection.skipped,
      failed: outcomes.filter((o) => !o.ok).map((o) => o.shotId)
    };
  }
}

// ---------------------------------------------------------------------------
// AssembleTimeline
// ---------------------------------------------------------------------------

/** The script a board links, when it links one that can still be read. */
async function loadLinkedScript(
  context: ProcessingContext,
  doc: StoryboardDocument
): Promise<ScriptRowLike | null> {
  const scriptId = doc.screenplay?.script_id;
  if (!scriptId || !context.hasModelInterface("getScript")) return null;
  const row = (await context.getScript(scriptId)) as ScriptRowLike | null;
  return row ?? null;
}

type AssembleTimelineOutputs = {
  timeline: { type: "timeline"; id: string };
  skipped_shots: string[];
  retimed: RetimedShot[];
};

export class AssembleTimelineNode extends BaseNode {
  static readonly nodeType = "nodetool.storyboard.AssembleTimeline";
  static readonly title = "Assemble Timeline";
  static readonly description =
    "Cut a storyboard's rendered shots into a timeline, inheriting the template's cut when the board is a copy.\n    storyboard, timeline, assemble, cut, edit\n\n    Use cases:\n    - Turning a finished board into an editable sequence\n    - Giving every recast copy the approved cut, titles and music\n    - Re-cutting a board after re-rendering some shots";
  static readonly metadataOutputTypes = {
    timeline: "timeline",
    skipped_shots: "list[str]",
    retimed: "list[dict]"
  };
  static readonly inlineFields = ["storyboard"];
  static readonly inputFields = ["storyboard"];

  @prop({
    type: "storyboard",
    default: storyboardRefDefault,
    title: "Storyboard",
    description: "The board to cut."
  })
  declare storyboard: StoryboardRef;

  @prop({
    type: "str",
    default: "",
    title: "Name",
    description: "Name for the sequence. Defaults to the board's name."
  })
  declare name: string;

  @prop({
    type: "int",
    default: 30,
    title: "FPS",
    description: "Frame rate of the assembled sequence.",
    min: 1,
    max: 120
  })
  declare fps: number;

  @prop({
    type: "bool",
    default: false,
    title: "Allow Writes",
    description:
      "Cut the board as it was picked, rather than only one this run derived."
  })
  declare allow_writes: boolean;

  async process(
    context?: ProcessingContext
  ): Promise<AssembleTimelineOutputs> {
    requireWritable(this.storyboard, this.allow_writes, "AssembleTimeline");
    const { row, context: ctx } = await loadBoardRow(
      this.storyboard,
      context,
      "AssembleTimeline"
    );
    const doc = row.document;
    const script = await loadLinkedScript(ctx, doc);
    const scriptId = script ? doc.screenplay?.script_id ?? null : null;
    const assembled: AssembledTimeline = script
      ? buildLinkedTimeline({
          boardId: row.id,
          shots: doc.shots,
          musicPrompt: doc.screenplay?.music_prompt,
          script: {
            scriptId: script.id,
            cast: script.document.cast,
            sections: script.document.sections
          }
        })
      : buildStoryboardTimeline({
          boardId: row.id,
          shots: doc.shots,
          narration: doc.screenplay?.narration,
          musicPrompt: doc.screenplay?.music_prompt
        });
    if (assembled.clips.length === 0) {
      throw new Error(
        "AssembleTimeline: no shot has a rendered clip, so there is nothing to assemble. Run RenderStills, then RenderClips."
      );
    }

    const { width, height } = frameSizeForAspect(doc.aspectRatio);
    const fps = Math.max(1, Math.min(Math.floor(Number(this.fps) || 30), 120));
    const name = String(this.name ?? "").trim() || row.name;

    // The cut this board writes into: its own, else the one it inherits from
    // the template it was recast from, else a fresh sequence. Only the board's
    // own sequence already exists as a row; the other two are created below.
    const owned = await this.loadOwnSequence(ctx, row);
    const base = owned ?? (await this.templateCut(ctx, row));
    const previous = base
      ? foreignTimelineParts(base, (clip) =>
          clip.storyboardBoardId === row.id ||
          (!!scriptId && clip.scriptId === scriptId)
        )
      : { tracks: [], clips: [] };

    const tracks = [...assembled.tracks, ...previous.tracks];
    const clips = [...assembled.clips, ...previous.clips];
    const durationMs = clips.reduce(
      (end, clip) => Math.max(end, clip.startMs + clip.durationMs),
      0
    );
    const sequence: TimelineSequence = {
      ...(base ??
        makeSequence({ projectId: row.projectId, name })),
      name,
      fps,
      width,
      height,
      durationMs,
      tracks,
      clips,
      markers: base?.markers ?? []
    };
    const saved = (owned
      ? await ctx.updateTimelineSequence(sequence.id, sequence)
      : await ctx.createTimelineSequence(sequence)) as { id: string } | null;
    if (!saved) {
      throw new Error(
        `AssembleTimeline: could not save the sequence for ${row.name || row.id}.`
      );
    }
    if (row.timelineId !== saved.id) {
      await ctx.updateStoryboard(row.id, { timelineId: saved.id });
    }

    return {
      timeline: { type: "timeline", id: saved.id },
      skipped_shots: assembled.skippedShotIds,
      retimed: assembled.retimedShots
    };
  }

  /** The sequence this board already owns, when it still exists. */
  private async loadOwnSequence(
    context: ProcessingContext,
    row: StoryboardRowLike
  ): Promise<TimelineSequence | null> {
    if (!row.timelineId) return null;
    return (await context.getTimelineSequence(
      row.timelineId
    )) as TimelineSequence | null;
  }

  /**
   * The template's cut, cloned for this copy.
   *
   * A copy inherits the approved edit rather than a bare assembly: the
   * template's shot clips are re-stamped to this board (and refilled from its
   * own renders by the assemble above), while the text overlay, the music bed
   * and every other track come across untouched. The clone is returned
   * unsaved — the assemble writes it as one row, so a failure part way leaves
   * no half-built sequence behind.
   */
  private async templateCut(
    context: ProcessingContext,
    row: StoryboardRowLike
  ): Promise<TimelineSequence | null> {
    const templateId = row.document.templateId;
    if (!templateId) return null;
    const template = (await context.getStoryboard(
      templateId
    )) as StoryboardRowLike | null;
    if (!template?.timelineId) return null;
    const source = (await context.getTimelineSequence(
      template.timelineId
    )) as TimelineSequence | null;
    if (!source) return null;
    return cloneTimelineForBoard(
      source,
      { boardId: templateId },
      { boardId: row.id }
    );
  }
}

export const STORYBOARD_NODES = tagAsServer([
  LoadStoryboardNode,
  StoryboardShotsNode,
  RecastStoryboardNode,
  RenderStillsNode,
  RenderClipsNode,
  AssembleTimelineNode
]);
