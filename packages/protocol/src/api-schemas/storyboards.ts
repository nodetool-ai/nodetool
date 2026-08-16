import { z } from "zod";
import type { Screenplay, Shot } from "../creative.js";

// ── Shot / screenplay ───────────────────────────────────────────────────────
// Mirrors the interfaces in `creative.ts`. Loose objects: the shapes evolve
// with the Director agent, and the storyboard document is a client-owned
// payload — the schema pins the structural keys and lets the rest travel.

const mediaRef = z
  .object({
    type: z.string(),
    uri: z.string().optional(),
    asset_id: z.string().nullable().optional()
  })
  .passthrough();

export const storyboardShot = z
  .object({
    type: z.literal("shot"),
    id: z.string(),
    index: z.number(),
    action: z.string(),
    status: z.string(),
    slug: z.string().optional(),
    motion: z.string().optional(),
    duration_seconds: z.number().optional(),
    keyframe: mediaRef.nullable().optional(),
    clip: mediaRef.nullable().optional()
  })
  .passthrough();
export type StoryboardShot = z.infer<typeof storyboardShot>;

export const storyboardScreenplay = z
  .object({
    type: z.literal("screenplay"),
    id: z.string(),
    title: z.string(),
    shots: z.array(storyboardShot)
  })
  .passthrough();
export type StoryboardScreenplay = z.infer<typeof storyboardScreenplay>;

// ── Normalization ───────────────────────────────────────────────────────────
// The agent tool surface speaks camelCase (`durationSeconds`), the persisted
// wire shape speaks snake_case (`duration_seconds`), and an agent supplies
// neither ids nor indexes. This is the one place that converts between them and
// fills in what the save requires, so a screenplay that reaches the store is a
// screenplay the server accepts. Every `ui_storyboard_*` write path and the
// headless eval bridge call it.

/** Tool-surface shot key → wire key. */
const SHOT_KEY_ALIASES: Readonly<Record<string, string>> = {
  durationSeconds: "duration_seconds",
  entityIds: "entity_ids",
  locationId: "location_id",
  keyframeVersions: "keyframe_versions",
  clipVersions: "clip_versions",
  costEstimate: "cost_estimate"
};

/** Tool-surface screenplay key → wire key. `style` is the Director's alias. */
const SCREENPLAY_KEY_ALIASES: Readonly<Record<string, string>> = {
  styleBible: "style_bible",
  style: "style_bible",
  aspectRatio: "aspect_ratio",
  musicPrompt: "music_prompt",
  entityIds: "entity_ids",
  createdAt: "created_at",
  updatedAt: "updated_at"
};

const DEFAULT_SHOT_STATUS = "planned";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Move each alias onto its wire key. An explicit wire key always wins. */
function applyAliases(
  source: Record<string, unknown>,
  aliases: Readonly<Record<string, string>>
) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    const wireKey = aliases[key] ?? key;
    if (wireKey !== key && source[wireKey] !== undefined) {
      continue;
    }
    if (value !== undefined) {
      out[wireKey] = value;
    }
  }
  return out;
}

/** Options every normalizer takes. */
export interface StoryboardNormalizeOptions {
  /** Mints an id for a screenplay or shot that arrives without one. */
  generateId?: () => string;
}

let idCounter = 0;
const fallbackId = (): string => {
  idCounter += 1;
  return `sb_${Date.now().toString(36)}_${idCounter.toString(36)}`;
};

/**
 * Normalize one agent-supplied shot into the wire shape: camelCase keys become
 * snake_case, `type`/`id`/`index`/`status` are filled in. `action` is the one
 * field nothing can derive — a shot without it throws, naming its position.
 */
export function normalizeStoryboardShot(
  input: unknown,
  index: number,
  options: StoryboardNormalizeOptions = {}
): Shot {
  const newId = options.generateId ?? fallbackId;
  if (!isPlainObject(input)) {
    throw new Error(`Shot at position ${index} must be an object.`);
  }
  const shot = applyAliases(input, SHOT_KEY_ALIASES);
  const slug = typeof shot.slug === "string" ? shot.slug : undefined;
  const label = slug ? `${index} ("${slug}")` : `${index}`;
  if (typeof shot.action !== "string" || shot.action.trim() === "") {
    throw new Error(
      `Shot at position ${label} needs a non-empty \`action\` — the concrete visual to render.`
    );
  }
  // SAFETY: `status` comes off the wire as a bare string, and the spread
  // carries the record's untyped extras; typing this honestly means giving
  // `storyboardShot` a `ShotStatus` enum and dropping the passthrough, which
  // changes what the save accepts.
  return {
    ...shot,
    type: "shot",
    id: typeof shot.id === "string" && shot.id ? shot.id : newId(),
    index: typeof shot.index === "number" ? shot.index : index,
    status: typeof shot.status === "string" ? shot.status : DEFAULT_SHOT_STATUS
  } as unknown as Shot;
}

/**
 * Normalize an agent-supplied screenplay into the exact shape the storyboard
 * save accepts, then validate it against {@link storyboardScreenplay} — the
 * schema `storyboards.update` uses. Throws with the failing paths when the
 * result still does not validate, so an unsavable screenplay never reaches the
 * store.
 */
export function normalizeStoryboardScreenplay(
  input: unknown,
  options: StoryboardNormalizeOptions = {}
): Screenplay {
  const newId = options.generateId ?? fallbackId;
  if (!isPlainObject(input)) {
    throw new Error(
      "`screenplay` must be a Screenplay object ({ type: 'screenplay', title, shots: [...] })."
    );
  }
  if (!Array.isArray(input.shots)) {
    throw new Error(
      "`screenplay.shots` must be an array of shots, each with an `action`."
    );
  }
  const play = applyAliases(input, SCREENPLAY_KEY_ALIASES);
  const candidate = {
    ...play,
    type: "screenplay",
    id: typeof play.id === "string" && play.id ? play.id : newId(),
    title: typeof play.title === "string" ? play.title : "",
    shots: (play.shots as unknown[]).map((shot, index) =>
      normalizeStoryboardShot(shot, index, options)
    )
  };
  const parsed = storyboardScreenplay.safeParse(candidate);
  if (!parsed.success) {
    const paths = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "screenplay"}: ${issue.message}`)
      .join("; ");
    throw new Error(`\`screenplay\` is not savable — ${paths}`);
  }
  // SAFETY: the schema's passthrough output types `shots` as `StoryboardShot`
  // (whose `status` is a bare string), not `Shot` — same gap as
  // `normalizeStoryboardShot`.
  return parsed.data as unknown as Screenplay;
}

/** A model selection (language/image/video) as the pickers emit it. */
const modelSelection = z
  .object({
    type: z.string(),
    id: z.string(),
    provider: z.string(),
    name: z.string().optional()
  })
  .passthrough();

// ── Document ────────────────────────────────────────────────────────────────

export const storyboardDocument = z.object({
  screenplay: storyboardScreenplay.nullable(),
  shots: z.array(storyboardShot),
  brief: z.string(),
  style: z.string(),
  /** Library entity (asset) ids whose descriptors season every shot prompt. */
  entityIds: z.array(z.string()).default([]),
  aspectRatio: z.string(),
  directorModel: modelSelection.nullable(),
  imageModel: modelSelection.nullable(),
  videoModel: modelSelection.nullable()
});
export type StoryboardDocumentSchema = z.infer<typeof storyboardDocument>;

// ── API shapes ──────────────────────────────────────────────────────────────

export const storyboardResponse = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  document: storyboardDocument,
  timelineId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type StoryboardResponse = z.infer<typeof storyboardResponse>;

export const storyboardListItem = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  shotCount: z.number(),
  updatedAt: z.string()
});
export type StoryboardListItem = z.infer<typeof storyboardListItem>;

export const createStoryboardInput = z.object({
  /** Client-supplied id: lets a tab-ref'd local board upsert itself. */
  id: z.string().optional(),
  name: z.string().min(1).default("Untitled storyboard"),
  projectId: z.string().default("default"),
  document: storyboardDocument.optional()
});
export type CreateStoryboardInput = z.infer<typeof createStoryboardInput>;

export const patchStoryboardInput = z
  .object({
    name: z.string().min(1).optional(),
    document: storyboardDocument.optional(),
    timelineId: z.string().nullable().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });
export type PatchStoryboardInput = z.infer<typeof patchStoryboardInput>;
