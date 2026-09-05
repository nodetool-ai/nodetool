import { z } from "zod";
import type { Screenplay, Shot } from "../creative.js";
import {
  isNonEmptyString,
  isNumber,
  isString
} from "../predicates.js";

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
    clip: mediaRef.nullable().optional(),
    /** Ordered ids of the linked script's lines this shot covers. */
    script_line_ids: z.array(z.string()).optional(),
    /** Linked line texts as last projected, joined "\n" — drift only. */
    script_text_snapshot: z.string().optional(),
    duration_source: z.enum(["audio", "manual"]).optional(),
    /** Animate the shot's still, or generate the clip straight from text. */
    render_mode: z.enum(["keyframe", "direct"]).optional(),
    /** The scene this shot belongs to. Absent on legacy, unscened shots. */
    scene_id: z.string().optional()
  })
  .passthrough();
export type StoryboardShot = z.infer<typeof storyboardShot>;

export const storyboardScene = z
  .object({
    type: z.literal("scene"),
    id: z.string(),
    /** "INT. SOPHIA'S FLAT - HALLWAY - EARLY MORNING". */
    slugline: z.string(),
    lighting: z.string().optional()
  })
  .passthrough();
export type StoryboardScene = z.infer<typeof storyboardScene>;

export const storyboardScreenplay = z
  .object({
    type: z.literal("screenplay"),
    id: z.string(),
    title: z.string(),
    shots: z.array(storyboardShot),
    /** The linked script resource, when this board's words come from one. */
    script_id: z.string().nullable().optional(),
    /** The board's genre as it stood when this screenplay was directed. */
    genre: z.string().optional(),
    /** The authoritative scene list. Order is derived from `shot.index`. */
    scenes: z.array(storyboardScene).optional()
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
  costEstimate: "cost_estimate",
  scriptLineIds: "script_line_ids",
  scriptTextSnapshot: "script_text_snapshot",
  durationSource: "duration_source",
  renderMode: "render_mode",
  sceneId: "scene_id"
};

// A scene has no multi-word key, so there is no scene alias table: `slugline`
// and `lighting` are spelled the same on both surfaces.

/** Tool-surface screenplay key → wire key. `style` is the Director's alias. */
const SCREENPLAY_KEY_ALIASES: Readonly<Record<string, string>> = {
  styleBible: "style_bible",
  style: "style_bible",
  aspectRatio: "aspect_ratio",
  musicPrompt: "music_prompt",
  entityIds: "entity_ids",
  scriptId: "script_id",
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
interface StoryboardNormalizeOptions {
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
  const slug = isString(shot.slug) ? shot.slug : undefined;
  const label = slug ? `${index} ("${slug}")` : `${index}`;
  if (!isString(shot.action) || shot.action.trim() === "") {
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
    id: isNonEmptyString(shot.id) ? shot.id : newId(),
    index: isNumber(shot.index) ? shot.index : index,
    status: isString(shot.status) ? shot.status : DEFAULT_SHOT_STATUS
  } as unknown as Shot;
}

/**
 * Normalize one agent-supplied scene into the wire shape: `type` and `id` are
 * filled in. Unlike a shot's `action`, a missing `slugline` does not throw — the
 * CSV import path names an unrecognised scene value `Scene N`, and a scene the
 * agent under-specified is still a usable grouping, so the same fallback applies
 * here.
 */
export function normalizeStoryboardScene(
  input: unknown,
  index: number,
  options: StoryboardNormalizeOptions = {}
): StoryboardScene {
  const newId = options.generateId ?? fallbackId;
  if (!isPlainObject(input)) {
    throw new Error(`Scene at position ${index} must be an object.`);
  }
  const slugline =
    isString(input.slugline) && input.slugline.trim() !== ""
      ? input.slugline
      : `Scene ${index + 1}`;
  return {
    ...input,
    type: "scene",
    id: isNonEmptyString(input.id) ? input.id : newId(),
    slugline
  };
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
  const candidate: Record<string, unknown> = {
    ...play,
    type: "screenplay",
    id: isNonEmptyString(play.id) ? play.id : newId(),
    title: isString(play.title) ? play.title : "",
    shots: (play.shots as unknown[]).map((shot, index) =>
      normalizeStoryboardShot(shot, index, options)
    )
  };
  // Only overwrite `scenes` when the payload carried one, so a screenplay
  // without scenes stays without the key rather than gaining an empty one.
  if (Array.isArray(play.scenes)) {
    candidate.scenes = (play.scenes as unknown[]).map((scene, index) =>
      normalizeStoryboardScene(scene, index, options)
    );
  }
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

/** Where a board sits in the guided setup. A board built before it reads "done". */
export const storyboardSetupStage = z.enum([
  "idea",
  "genre",
  "review",
  "look",
  "done"
]);
export type StoryboardSetupStage = z.infer<typeof storyboardSetupStage>;

export const storyboardDocument = z.object({
  screenplay: storyboardScreenplay.nullable(),
  shots: z.array(storyboardShot),
  brief: z.string(),
  style: z.string(),
  /** Library entity (asset) ids whose descriptors season every shot prompt. */
  entityIds: z.array(z.string()).default([]),
  aspectRatio: z.string(),
  setupStage: storyboardSetupStage.default("done"),
  /** Genre sits on the board, not the screenplay: it is picked before one exists. */
  genre: z.string().default(""),
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

// ── Shipped example boards ──────────────────────────────────────────────────
// An example storyboard ships as a file, the way an example workflow does: a
// name, a description, and one complete document whose shots already carry
// their text, still, and clip. The media are `package://` assets, so the file
// is the whole board — installing it writes one row and copies no bytes.

export const STORYBOARD_BUNDLE_SCHEMA_VERSION = 1;

export const storyboardBundle = z.object({
  schemaVersion: z.number().default(STORYBOARD_BUNDLE_SCHEMA_VERSION),
  name: z.string().min(1),
  description: z.string().default(""),
  tags: z.array(z.string()).default([]),
  document: storyboardDocument
});
export type StoryboardBundle = z.infer<typeof storyboardBundle>;

/**
 * Parse a shipped bundle file. Returns null for anything that is not one — a
 * malformed file is skipped rather than taking the whole listing down — and
 * for a file written against a newer schema than this build understands.
 */
export function parseStoryboardBundle(value: unknown): StoryboardBundle | null {
  const parsed = storyboardBundle.safeParse(value);
  if (!parsed.success) return null;
  if (parsed.data.schemaVersion > STORYBOARD_BUNDLE_SCHEMA_VERSION) return null;
  return parsed.data;
}

/** What the list endpoint returns per example — no document, no shots. */
export const exampleStoryboardSummary = z.object({
  /** The bundle's file name without its suffix; installs address it. */
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  /**
   * The board's own one-sentence idea — its brief. What a creator would type
   * to get this board, so step 1 of the storyboard flow offers it as an
   * inspiration chip (PRD § 7.1).
   */
  logline: z.string().default(""),
  tags: z.array(z.string()),
  shotCount: z.number(),
  /** How many of those shots already have a rendered clip. */
  clipCount: z.number(),
  aspectRatio: z.string(),
  /** First shot's still, as a URL this server serves. Null when it has none. */
  thumbnailUrl: z.string().nullable()
});
export type ExampleStoryboardSummary = z.infer<typeof exampleStoryboardSummary>;

export const installExampleStoryboardInput = z.object({
  slug: z.string().min(1),
  projectId: z.string().default("default"),
  /** Overrides the bundle's own name for the installed board. */
  name: z.string().min(1).optional()
});
export type InstallExampleStoryboardInput = z.infer<
  typeof installExampleStoryboardInput
>;
