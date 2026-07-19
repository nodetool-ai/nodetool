/**
 * @nodetool-ai/protocol – Creative production types
 *
 * Shared shapes for the creative-agent production spine:
 *   - Direction layer: a {@link Screenplay} of {@link Shot}s, the typed artifact
 *     a Director agent produces from a brief and the storyboard/timeline consume.
 *   - Entities ("ingredients"): reusable {@link Entity} objects (character,
 *     location, style, prop) that carry reference images / voice / LoRA and are
 *     injected into generation across shots for consistency.
 *   - Cost governance: {@link WorkflowCostEstimate} and {@link Budget} for
 *     plan-before-spend gating.
 *
 * These are transport/storage shapes only — no runtime behavior. Nodes emit
 * screenplays and shots as `dict` / `list[dict]` values; the interfaces give
 * web, agents, and nodes one contract to share.
 */

import type { ImageRef, VideoRef } from "./api-types.js";

// ---------------------------------------------------------------------------
// Entities ("ingredients")
// ---------------------------------------------------------------------------

export type EntityKind = "character" | "location" | "style" | "prop";

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
  created_at?: string;
  updated_at?: string;
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

// ---------------------------------------------------------------------------
// Direction layer
// ---------------------------------------------------------------------------

/**
 * Lifecycle of a single shot as it moves through plan → cheap still → approval
 * → expensive render. Drives the storyboard card state and cost gating.
 */
export type ShotStatus =
  | "planned" // exists in the direction, nothing generated yet
  | "keyframe_generating"
  | "keyframe_ready" // still rendered — cheap, awaiting approval
  | "approved" // user approved the still; cleared for video spend
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
  /** The selected still anchoring the shot (the storyboard frame). */
  keyframe?: ImageRef | null;
  /** Every generated still for this shot, oldest first. `keyframe` is one of them. */
  keyframe_versions?: ImageRef[];
  /** The selected clip — what assembly/export uses. */
  clip?: VideoRef | null;
  /** Every rendered take for this shot, oldest first. `clip` is one of them. */
  clip_versions?: VideoRef[];
  status: ShotStatus;
  /** Estimated cost to render this shot's clip, for the gate. */
  cost_estimate?: number | null;
  notes?: string;
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

export function isShot(value: unknown): value is Shot {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { type?: unknown }).type === "shot"
  );
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
  /** unit_price * quantity, in {@link WorkflowCostEstimate.currency}. */
  estimated_cost: number;
  confidence: CostConfidence;
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

/** A spend ceiling the agent must respect while planning generation. */
export interface Budget {
  currency: string;
  /** Hard cap; the agent may not plan generation whose estimate exceeds this. */
  cap: number;
  /** Running spend this session/production. */
  spent: number;
}

export function budgetRemaining(budget: Budget): number {
  return Math.max(0, budget.cap - budget.spent);
}

/**
 * Draft mode routes generation to cheap/low-res models first so a plan can be
 * seen before final spend. `off` uses the models as configured.
 */
export type DraftMode = "off" | "draft" | "final";
