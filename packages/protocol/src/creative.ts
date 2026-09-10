/**
 * @nodetool-ai/protocol – Creative production types
 *
 * Shared shapes for the creative-agent production spine:
 *   - Direction layer: a {@link Screenplay} of {@link Shot}s, the typed artifact
 *     a Director agent produces from a brief and the storyboard/timeline consume.
 *   - Entities ("ingredients"): reusable {@link Entity} objects (character,
 *     location, style, prop) that carry reference images / voice / LoRA and are
 *     injected into generation across shots for consistency.
 *   - Cost governance: {@link WorkflowCostEstimate} for the plan-before-spend
 *     view.
 *
 * These are transport/storage shapes only — no runtime behavior. Nodes emit
 * screenplays and shots as `dict` / `list[dict]` values; the interfaces give
 * web, agents, and nodes one contract to share.
 */

import { z } from "zod";

import type { ImageRef, VideoRef } from "./api-types.js";
import { ENTITY_METADATA_KEY } from "./style-presets.js";

// ---------------------------------------------------------------------------
// Entities ("ingredients")
// ---------------------------------------------------------------------------

export type EntityKind = "character" | "location" | "style" | "prop";

/**
 * Where a graph-created entity came from. `key` is the upsert identity the run
 * used (a SKU, say), so a re-run finds its own entity even after the name
 * changed.
 */
export interface EntitySource {
  workflow_id?: string;
  key?: string;
}

/**
 * A reusable production entity. One shape, discriminated by {@link kind}, so it
 * maps to a single storage row and a single picker UI. Kind-specific fields are
 * optional and only meaningful for their kind (e.g. `voice_id` for characters,
 * `palette` for styles).
 */
export interface Entity {
  type: "entity";
  id: string;
  kind: EntityKind;
  /** Display name, unique within a project (used to reference from shot text). */
  name: string;
  /**
   * The canonical visual descriptor pasted verbatim into every shot prompt that
   * uses this entity — the mechanism that holds a character/look consistent.
   */
  descriptor: string;
  /** Longer free-form notes not injected into prompts. */
  description?: string;
  /** Reference images anchoring the look (first is treated as primary). */
  reference_images?: ImageRef[];
  /** Optional trained LoRA weight ref (character or style). */
  lora?: { url?: string; asset_id?: string | null; scale?: number } | null;
  /** Character voice id for TTS (provider-specific), when kind === "character". */
  voice_id?: string | null;
  /** Style palette as name+hex swatches, when kind === "style". */
  palette?: Array<{ name?: string; hex: string }> | null;
  tags?: string[];
  /**
   * The project this entity belongs to, `"default"` for none. Membership lives
   * on the entity's asset row, the same column every document table carries.
   */
  project_id?: string;
  created_at?: string;
  updated_at?: string;
  /** Set only on an entity a graph created or derived. */
  source?: EntitySource;
}

/** The kinds an entity marker may declare. Anything else is not an entity. */
export const ENTITY_KINDS: ReadonlySet<string> = new Set<EntityKind>([
  "character",
  "location",
  "style",
  "prop"
]);

/**
 * What an entity's asset carries under `metadata.nodetool_entity` — an
 * {@link Entity} minus everything derived from the asset row itself (the id,
 * the reference image, the timestamps, the project).
 */
export interface EntityMarker {
  kind: EntityKind;
  name: string;
  descriptor: string;
  description?: string;
  voice_id?: string | null;
  tags?: string[];
  lora?: Entity["lora"];
  palette?: Entity["palette"];
  /**
   * The image asset the entity shows, when it is not the marker asset's own
   * bytes. Swapping the picture writes this rather than moving the marker: an
   * entity's id is its asset's, and boards and scripts store that id, so an
   * entity that changed asset would leave every one of them dangling.
   */
  reference_asset_id?: string;
  /** Set only on an entity a graph created or derived. */
  source?: EntitySource;
}

/**
 * The stored marker, parsed. Each field falls back rather than failing the
 * whole read: a marker whose `name` went missing is still an entity with a
 * blank name, and the library shows it instead of losing it. `kind` is the one
 * field with no fallback — it is what makes the asset an entity at all.
 */
const entityMarkerSchema = z.object({
  kind: z.enum(["character", "location", "style", "prop"]),
  name: z.string().catch(""),
  descriptor: z.string().catch(""),
  description: z.string().optional().catch(undefined),
  voice_id: z.string().nullable().optional().catch(null),
  // A stray non-string entry loses itself, not the whole list: a marker with
  // one bad tag still has its good ones, and dropping them all would take a
  // label off the library for a typo in the one beside it.
  tags: z
    .array(z.unknown())
    .transform((items) =>
      items.flatMap((item) => {
        const tag = z.string().safeParse(item);
        return tag.success ? [tag.data] : [];
      })
    )
    .optional()
    .catch(undefined),
  lora: z
    .object({
      url: z.string().optional(),
      asset_id: z.string().nullable().optional(),
      scale: z.number().optional()
    })
    .nullable()
    .optional()
    .catch(null),
  palette: z
    .array(z.object({ name: z.string().optional(), hex: z.string() }))
    .nullable()
    .optional()
    .catch(null),
  reference_asset_id: z.string().optional().catch(undefined),
  source: z
    .object({
      workflow_id: z.string().optional(),
      key: z.string().optional()
    })
    .optional()
    .catch(undefined)
});

/**
 * Read the entity marker off an asset's metadata, or null when it carries
 * none. An unknown `kind` reads as no marker: an asset with a malformed one is
 * not an entity, and every surface that lists the library agrees on that.
 *
 * Shared because three of them ask — the agent capabilities, the project
 * rollup, and the browser's library — and a marker that reads as an entity in
 * one place and not in another is the library disagreeing with itself.
 */
export function readEntityMarker(
  metadata: Record<string, unknown> | null | undefined
): EntityMarker | null {
  const parsed = entityMarkerSchema.safeParse(metadata?.[ENTITY_METADATA_KEY]);
  if (!parsed.success) return null;
  const marker: EntityMarker = {
    kind: parsed.data.kind,
    name: parsed.data.name,
    descriptor: parsed.data.descriptor,
    voice_id: parsed.data.voice_id ?? null,
    lora: parsed.data.lora ?? null,
    palette: parsed.data.palette ?? null
  };
  if (parsed.data.description !== undefined) {
    marker.description = parsed.data.description;
  }
  if (parsed.data.tags !== undefined) {
    marker.tags = parsed.data.tags;
  }
  const swapped = parsed.data.reference_asset_id?.trim();
  if (swapped) {
    marker.reference_asset_id = swapped;
  }
  if (parsed.data.source !== undefined) {
    marker.source = parsed.data.source;
  }
  return marker;
}

/** Lightweight pointer to a persisted {@link Entity}, safe to embed in shots. */
export interface EntityRef {
  type: "entity_ref";
  entity_id: string;
  /** Denormalized name/kind for display without a lookup. */
  name?: string;
  kind?: EntityKind;
}

export function isEntity(value: unknown): value is Entity {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { type?: unknown }).type === "entity"
  );
}

/** What {@link injectEntities} adds to a prompt. */
export interface EntityInjection {
  /** The prompt with a "Consistency references" block appended, when any applied. */
  prompt: string;
  /** Asset ids of the applied entities' reference images, in order. */
  referenceAssetIds: string[];
  /** The entities that applied, so a caller can report what it seasoned with. */
  applied: Entity[];
}

/**
 * Paste entity descriptors into a prompt, the mechanism that holds a character
 * or a look steady across shots.
 *
 * An entity applies when its id is in `entityIds` (an explicit selection), or —
 * with no ids given — when its name appears in the text. Empty text means every
 * entity applies, which is what the pickers rely on when seasoning a prompt the
 * user has not written yet.
 *
 * Pure and shared: the browser's `ui_entity_apply` tool, the `apply_entities`
 * capability and the Director node all season a prompt through this, so what a
 * model sees does not depend on which surface asked.
 */
export function injectEntities(
  text: string,
  entities: readonly Entity[],
  entityIds?: readonly string[]
): EntityInjection {
  const base = text ?? "";
  const lower = base.toLowerCase();
  const empty = base.trim().length === 0;
  const explicit = entityIds && entityIds.length > 0 ? new Set(entityIds) : null;

  const lines: string[] = [];
  const referenceAssetIds: string[] = [];
  const applied: Entity[] = [];
  const seen = new Set<string>();

  for (const entity of entities) {
    const descriptor = (entity.descriptor ?? "").trim();
    if (!descriptor) {
      continue;
    }
    const name = (entity.name ?? "").trim();
    const matches = explicit
      ? explicit.has(entity.id)
      : empty || (name.length > 0 && lower.includes(name.toLowerCase()));
    if (!matches) {
      continue;
    }

    const key = `${name}: ${descriptor}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    applied.push(entity);
    lines.push(name ? `- ${name}: ${descriptor}` : `- ${descriptor}`);
    for (const image of entity.reference_images ?? []) {
      if (image.asset_id) {
        referenceAssetIds.push(image.asset_id);
      }
    }
  }

  return {
    prompt:
      lines.length > 0
        ? `${base}\n\nConsistency references:\n${lines.join("\n")}`
        : base,
    referenceAssetIds,
    applied
  };
}

// ---------------------------------------------------------------------------
// Direction layer
// ---------------------------------------------------------------------------

/**
 * Lifecycle of a single shot as it moves through plan → cheap still →
 * expensive render. Drives the storyboard card state and cost gating: the
 * user picks the still they like (`keyframe`), and the clip render animates
 * that selection.
 */
export type ShotStatus =
  | "planned" // exists in the direction, nothing generated yet
  | "keyframe_generating"
  | "keyframe_ready" // still rendered — cheap; pick one, then spend on video
  | "approved" // legacy (pre-selection approval step); treated as keyframe_ready
  | "clip_generating"
  | "rendered" // final clip generated
  | "failed";

/** Camera direction for a shot, kept structured so a router/UI can reason on it. */
export interface CameraDirection {
  /** e.g. "wide", "medium", "close-up", "extreme close-up", "establishing". */
  framing?: string;
  /** e.g. "35mm", "85mm", "anamorphic". */
  lens?: string;
  /** e.g. "low angle", "eye level", "overhead". */
  angle?: string;
  /** e.g. "static", "slow push in", "handheld", "crane up". */
  movement?: string;
  /**
   * What the camera is on: handheld, tripod, steadicam, gimbal, dolly, slider,
   * crane, drone. Kept separate from {@link movement} because the rig is what a
   * video model reads for the texture of the motion, not its direction.
   */
  equipment?: string;
}

// ---------------------------------------------------------------------------
// Render record
// ---------------------------------------------------------------------------

/**
 * What a version was rendered from, written when the job is enqueued and stored
 * on the version when the asset lands — so a render that finishes after a style
 * change still carries the inputs it was actually given.
 *
 * Staleness is the comparison of this record against the inputs the same shot
 * would use now, derived at render time and never persisted as a flag. A
 * version with no record (legacy, upload, flip, image-editor edit) is never
 * stale.
 */
export interface RenderInputs {
  kind: "keyframe" | "clip";
  /** sha-256 of the composed prompt (PRD 7.7.5). */
  prompt_hash: string;
  /** provider/model id. */
  model: string;
  aspect_ratio: string;
  style_entity_id: string | null;
  /** The still a keyframe-mode clip animated. */
  source_version_id?: string;
  reference_asset_ids?: string[];
  render_mode?: ShotRenderMode;
  recorded_at: string;
}

/**
 * A media ref carrying its render record. The record rides on the ref itself
 * (the storyboard schemas are passthrough, so it survives a round trip) rather
 * than in a parallel array that a reorder or a delete could desynchronize.
 */
export type VersionRef<T> = T & { render_inputs?: RenderInputs };

export type KeyframeVersion = VersionRef<ImageRef>;
export type ClipVersion = VersionRef<VideoRef>;

/**
 * Field-by-field equality of two render records, ignoring `recorded_at` — a
 * timestamp is not an input, and every re-render would otherwise read as
 * different.
 */
export function renderInputsMatch(a: RenderInputs, b: RenderInputs): boolean {
  return (
    a.kind === b.kind &&
    a.prompt_hash === b.prompt_hash &&
    a.model === b.model &&
    a.aspect_ratio === b.aspect_ratio &&
    a.style_entity_id === b.style_entity_id &&
    JSON.stringify(a.reference_asset_ids ?? []) ===
      JSON.stringify(b.reference_asset_ids ?? []) &&
    a.render_mode === b.render_mode &&
    a.source_version_id === b.source_version_id
  );
}

/** One shot in a {@link Screenplay}. */
export interface Shot {
  type: "shot";
  id: string;
  /** 0-based order within the screenplay. */
  index: number;
  /** Short human label, e.g. "Lighthouse at dusk". */
  slug?: string;
  /** The concrete visual: subject + setting, reusing entity descriptors. */
  action: string;
  camera?: CameraDirection;
  /** What moves in the shot (and how the camera moves). */
  motion?: string;
  /** Spoken line delivered in-shot, if any. */
  dialogue?: string;
  /** Voiceover narration timed to this shot. */
  narration?: string;
  /** Target clip length in seconds. */
  duration_seconds?: number;
  /** Entities appearing in this shot (characters, props). */
  entity_ids?: string[];
  /** Location entity for this shot. */
  location_id?: string | null;
  /**
   * The {@link Scene} this shot belongs to. Absent on legacy shots, which
   * render under one implicit header until a scene-creating operation runs.
   */
  scene_id?: string;
  /** The selected still anchoring the shot (the storyboard frame). */
  keyframe?: KeyframeVersion | null;
  /** Every generated still for this shot, oldest first. `keyframe` is one of them. */
  keyframe_versions?: KeyframeVersion[];
  /** The selected clip — what assembly/export uses. */
  clip?: ClipVersion | null;
  /** Every rendered take for this shot, oldest first. `clip` is one of them. */
  clip_versions?: ClipVersion[];
  status: ShotStatus;
  /** Estimated cost to render this shot's clip, for the gate. */
  cost_estimate?: number | null;
  notes?: string;
  /**
   * Ordered ids of the linked script's lines this shot covers. Only meaningful
   * on a board whose {@link Screenplay.script_id} is set; a line belongs to at
   * most one shot.
   */
  script_line_ids?: string[];
  /**
   * The linked line texts joined with "\n" as they were last projected into
   * this shot. Compared against the live texts to detect drift — never read as
   * content.
   */
  script_text_snapshot?: string;
  /**
   * Where {@link duration_seconds} comes from. `"audio"` (the default on a
   * linked shot) derives it from the linked lines' takes; `"manual"` pins the
   * user's own value and keeps audio from touching it.
   */
  duration_source?: ShotDurationSource;
  /**
   * How this shot's clip is produced. Defaults to {@link ShotRenderMode}
   * `"keyframe"`.
   */
  render_mode?: ShotRenderMode;
  /**
   * The clip this shot's picture is cut out of, when one generation covers
   * several shots. Null or absent means the shot renders its own.
   */
  covered_by?: ShotCoverage | null;
}

/**
 * A shot whose picture is a slice of another shot's clip.
 *
 * Video models return a fixed window — one returns 5.184s whatever the shot
 * was directed at — so a cut whose beats run 1.5-2.2s is rendered as one
 * generation spanning several of them and split on the timeline. The
 * generation attaches to the first shot of the run; each of the others names
 * it here with the window it uses. Without this the siblings sat at
 * `has_clip: false` for the rest of the session and read as unrendered, and
 * the default `render_storyboard_clips` selection offered to generate them
 * again.
 *
 * One level only: the shot named by {@link shot_id} must own its clip. A chain
 * would let a window be measured against a window, and the second hop has no
 * source length of its own to measure against.
 */
export interface ShotCoverage {
  /** The shot whose `clip` holds this shot's picture. */
  shot_id: string;
  /** Where this shot begins inside that clip, in seconds. Defaults to 0. */
  start_seconds?: number;
  /**
   * Where it ends, in seconds. When set it is the shot's length on the
   * timeline; without it the shot takes its own `duration_seconds`, capped at
   * what is left of the covering clip.
   */
  end_seconds?: number;
}

/** A shot's coverage, or null when it renders its own picture. */
export const shotCoverage = (
  shot: Pick<Shot, "covered_by">
): ShotCoverage | null => shot.covered_by ?? null;

/** Whether a shot's length follows its linked audio or a pinned user value. */
export type ShotDurationSource = "audio" | "manual";

/**
 * Where a shot's clip comes from.
 *
 * `"keyframe"` (the default) renders a still first and animates it with
 * image_to_video. The still is the cheap iteration unit and the anchor that
 * holds a character, a palette and a lighting setup steady from shot to shot.
 *
 * `"direct"` skips the still and generates the clip from the prompt with
 * text_to_video. Worth it where first-frame conditioning is the wrong trade:
 * first-frame latents bias the sampler toward the reference appearance, so
 * heavy-motion shots come out stiffer than the same model's text_to_video, and
 * the native-audio models (dialogue, synced sound) are weakest on their
 * image path.
 */
export type ShotRenderMode = "keyframe" | "direct" | "reference";

/** A shot's render mode, with the default applied. */
export const shotRenderMode = (
  shot: Pick<Shot, "render_mode">
): ShotRenderMode =>
  shot.render_mode === "direct" || shot.render_mode === "reference"
    ? shot.render_mode
    : "keyframe";

/** The provider tasks a board's clip model must support for its shot modes. */
export function requiredVideoTasksForShots(
  shots: readonly Pick<Shot, "render_mode" | "covered_by">[]
): ("image_to_video" | "text_to_video" | "reference_to_video")[] {
  const tasks = new Set<
    "image_to_video" | "text_to_video" | "reference_to_video"
  >();
  for (const shot of shots) {
    if (shot.covered_by) {
      continue;
    }
    const mode = shotRenderMode(shot);
    tasks.add(
      mode === "reference"
        ? "reference_to_video"
        : mode === "direct"
          ? "text_to_video"
          : "image_to_video"
    );
  }
  return [...tasks];
}

/**
 * A scene: the set of shots sharing its id. Those shots are contiguous in
 * `shot.index`, which is the one global order — so a scene needs no index, its
 * position is the index of its first shot. A scene left with no shots is
 * dropped by the next structural operation.
 */
export interface Scene {
  type: "scene";
  id: string;
  /** "INT. SOPHIA'S FLAT — HALLWAY — EARLY MORNING" */
  slugline: string;
  /** Lighting for every shot in the scene, pasted into still prompts. */
  lighting?: string;
}

/**
 * The direction artifact: a full screenplay a Director agent produces from a
 * brief. The single source of truth the storyboard surface renders and the
 * assembly pipeline consumes.
 */
export interface Screenplay {
  type: "screenplay";
  id: string;
  title: string;
  logline?: string;
  /** What the piece is for, in the director's own words. */
  brief?: string;
  /** Palette, light, lens, texture — the look applied to every shot. */
  style_bible?: string;
  aspect_ratio?: string;
  shots: Shot[];
  /** Full voiceover script for the piece. */
  narration?: string;
  /** Score direction as a music-generation prompt. */
  music_prompt?: string;
  /** Entities referenced anywhere in the screenplay. */
  entity_ids?: string[];
  /** Copy of the board's genre, taken when the Director ran. */
  genre?: string;
  /**
   * The board's scenes. Authoritative list, but not an ordering: scene order is
   * derived from the index of each scene's first shot, so a {@link Scene}
   * carries no index of its own.
   */
  scenes?: Scene[];
  /**
   * The script resource this board's words come from. The board references the
   * script, never the reverse: line↔shot membership lives in the shots'
   * {@link Shot.script_line_ids}.
   */
  script_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export function isScreenplay(value: unknown): value is Screenplay {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { type?: unknown }).type === "screenplay" &&
    Array.isArray((value as { shots?: unknown }).shots)
  );
}

/**
 * The board entities that apply to `shot`.
 *
 * A shot with an explicit `entity_ids` override uses exactly that selection
 * (an empty array means "none" — the user removed them all). Otherwise the
 * default rule: styles and locations shape every shot, while characters and
 * props apply when their name appears in the shot's text (action, motion,
 * dialogue, narration, or slug), so a cast member only seasons the shots they
 * are actually in.
 *
 * Pure, and shared: the editor's generation path and the server-side
 * storyboard render tools season prompts with the same set.
 */
export function entitiesForShot(shot: Shot, boardEntities: Entity[]): Entity[] {
  if (shot.entity_ids) {
    const chosen = new Set(shot.entity_ids);
    return boardEntities.filter((e) => chosen.has(e.id));
  }
  const text = [shot.action, shot.motion, shot.dialogue, shot.narration, shot.slug]
    .filter((part): part is string => !!part)
    .join("\n")
    .toLowerCase();
  return boardEntities.filter((entity) => {
    if (entity.kind === "style" || entity.kind === "location") {
      return true;
    }
    const name = entity.name.trim().toLowerCase();
    return name.length > 0 && text.includes(name);
  });
}

/**
 * The board's cast, widened to hold every entity its shots reference.
 *
 * A shot's `entity_ids` is a selection out of the board's cast:
 * {@link entitiesForShot} filters the board's entities by it, so an id cast on
 * a shot but never on the board resolves to nothing — the chip is on the shot,
 * the entity is not in the board's library, and the prompt is not seasoned with
 * it. Agents writing shots hit this routinely. Reconciling on read keeps the
 * two in step: board cast first, in order, then each shot's unseen ids in shot
 * order.
 *
 * Returns `entityIds` itself when nothing is missing, so a caller can compare
 * by identity and skip a write.
 */
export function boardEntityIdsWithShots(
  entityIds: readonly string[],
  shots: readonly Shot[]
): readonly string[] {
  const seen = new Set(entityIds);
  const added: string[] = [];
  for (const shot of shots) {
    for (const id of shot.entity_ids ?? []) {
      if (!seen.has(id)) {
        seen.add(id);
        added.push(id);
      }
    }
  }
  return added.length === 0 ? entityIds : [...entityIds, ...added];
}

// ---------------------------------------------------------------------------
// Cost governance
// ---------------------------------------------------------------------------

/** How trustworthy a single node's cost figure is. */
export type CostConfidence = "exact" | "estimate" | "unknown";

/** Estimated cost of running one node once. */
export interface NodeCostEstimate {
  node_id: string;
  node_type: string;
  provider?: string | null;
  model?: string | null;
  /** Per-call price from the provider pricing bundle. */
  unit_price?: number;
  billing_unit?: string;
  /** How many times this node is expected to run (fan-out multiplies this). */
  quantity: number;
  /**
   * unit_price * quantity, in {@link WorkflowCostEstimate.currency}.
   * A **lower bound** whenever {@link NodeCostEstimate.warnings} is non-empty:
   * a cost we know exists but cannot price is left out rather than guessed.
   */
  estimated_cost: number;
  confidence: CostConfidence;
  /** How the figure was reached — "5 s × $0.205/s at 720p". */
  breakdown?: string;
  /**
   * What the estimate filled in because the node did not state it ("resolution
   * not set — priced at the base spec 720p"). On an `unknown` item this carries
   * the reason the catalog refused to price the step.
   */
  assumptions?: string[];
  /** Costs known to be missing from `estimated_cost`, making it a lower bound. */
  warnings?: string[];
}

/** Pre-run estimate for a whole workflow/timeline — the plan-before-spend view. */
export interface WorkflowCostEstimate {
  currency: string;
  /** Sum of `items[].estimated_cost` for items with a known price. */
  total: number;
  items: NodeCostEstimate[];
  /** Nodes whose price could not be determined (surfaced, never hidden). */
  unknown_count: number;
}
