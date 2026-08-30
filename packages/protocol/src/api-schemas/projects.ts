import { z } from "zod";

// ── Project ──────────────────────────────────────────────────────────────────
// A project is a name over documents that already carry `project_id`. `kind` is
// free text ("spot", "trailer", "report") rather than an enum: the taxonomy is
// the user's, not ours.

export const projectResponse = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  /** The conversation that builds it, or null while nobody has asked for one. */
  threadId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type ProjectResponse = z.infer<typeof projectResponse>;

/**
 * The loose bucket's id. It names no project row, so a client may not claim it
 * — a project holding it would swallow every unassigned document.
 */
const LOOSE_PROJECT_ID = "default";

export const createProjectInput = z.object({
  /**
   * A client-chosen id, for a create that must be idempotent. Re-creating with
   * an id the caller already owns answers with the existing row and discards
   * the `name` and `kind` sent with the repeat — a create is not a rename.
   *
   * The id is trimmed first, so `" abc"` cannot store a row addressable only by
   * a string with a space in it. Blank ids and the loose bucket's id are
   * refused: the first slips past the model's `??=` default and stores a row
   * nothing can address, the second is reserved.
   */
  id: z
    .string()
    .max(128)
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, {
      message: "Project id must not be blank"
    })
    .refine((value) => value !== LOOSE_PROJECT_ID, {
      message: `"${LOOSE_PROJECT_ID}" is reserved for documents in no project`
    })
    .optional(),
  name: z.string().min(1).max(200),
  kind: z.string().max(64).default("")
});
export type CreateProjectInput = z.infer<typeof createProjectInput>;

export const patchProjectInput = z
  .object({
    name: z.string().min(1).max(200).optional(),
    kind: z.string().max(64).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });
export type PatchProjectInput = z.infer<typeof patchProjectInput>;

// ── Documents ────────────────────────────────────────────────────────────────
// Spelled as the workspace tab type that opens each one, so a ref opens a tab
// with no translation table in between.

export const projectDocumentType = z.enum([
  "storyboard",
  "script",
  "timeline",
  "sketch",
  "application",
  "jsscript"
]);
export type ProjectDocumentType = z.infer<typeof projectDocumentType>;

export const projectDocumentRef = z.object({
  type: projectDocumentType,
  ref: z.string(),
  name: z.string(),
  updatedAt: z.string()
});
export type ProjectDocumentRef = z.infer<typeof projectDocumentRef>;

/**
 * Derived from the stored document on every read. A timeline reports its size
 * but not whether it has been rendered — nothing on the sequence row records
 * that, and an omitted fact beats an invented one.
 */
export const projectDocumentStatus = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("storyboard"),
    shots: z.number(),
    stills: z.number(),
    clips: z.number()
  }),
  z.object({
    kind: z.literal("script"),
    lines: z.number(),
    voiced: z.number(),
    stale: z.number()
  }),
  z.object({
    kind: z.literal("timeline"),
    clips: z.number(),
    durationMs: z.number()
  })
]);
export type ProjectDocumentStatus = z.infer<typeof projectDocumentStatus>;

/**
 * A stored media locator a card renders through `ResponsiveImage`. `asset://`
 * is an identifier, not a URL — the client resolves it.
 */
export const projectThumbnail = z.object({
  uri: z.string().optional(),
  asset_id: z.string().nullable().optional()
});
export type ProjectThumbnail = z.infer<typeof projectThumbnail>;

/**
 * What a document card draws above its name, for the kinds whose glance is not
 * a picture: a script's opening lines with their voicing state, and a cut's
 * tracks reduced to bars. Both are already-stored facts sliced down to what a
 * 120px card can show, so the card renders without fetching the document.
 */
export const projectDocumentPreview = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("script"),
    lines: z.array(
      z.object({
        speaker: z.string(),
        text: z.string(),
        /** `voiced` matches its take; `stale` drifted from it; `draft` has none. */
        state: z.enum(["voiced", "stale", "draft"])
      })
    )
  }),
  z.object({
    kind: z.literal("timeline"),
    /** Total span the bars are laid out against, in milliseconds. */
    durationMs: z.number(),
    tracks: z.array(
      z.object({
        type: z.enum(["video", "audio", "overlay", "subtitle"]),
        name: z.string(),
        clips: z.array(
          z.object({ startMs: z.number(), durationMs: z.number() })
        )
      })
    )
  })
]);
export type ProjectDocumentPreview = z.infer<typeof projectDocumentPreview>;

export const projectDocumentSummary = projectDocumentRef.extend({
  status: projectDocumentStatus.nullable(),
  spendUsd: z.number(),
  unpricedCount: z.number(),
  /** Stills the card montages. Empty for the kinds that render none. */
  thumbnails: z.array(projectThumbnail),
  /** What the card draws when it has no stills. Null when there is nothing. */
  preview: projectDocumentPreview.nullable()
});
export type ProjectDocumentSummary = z.infer<typeof projectDocumentSummary>;

// ── Spend ────────────────────────────────────────────────────────────────────

export const spendCategory = z.enum(["stills", "clips", "voice", "pipeline"]);
export type SpendCategory = z.infer<typeof spendCategory>;

export const categorySpend = z.object({
  category: spendCategory,
  usd: z.number(),
  /** Calls in this category no catalog priced. They are not summed as zero. */
  unpricedCount: z.number()
});
export type CategorySpend = z.infer<typeof categorySpend>;

export const projectSpend = z.object({
  /** A lower bound whenever `unpricedCount` or `partial` says so. */
  totalUsd: z.number(),
  unpricedCount: z.number(),
  /** True when the ledger read hit its cap, so rows are missing from the sum. */
  partial: z.boolean().optional(),
  byCategory: z.array(categorySpend)
});
export type ProjectSpend = z.infer<typeof projectSpend>;

export const projectDetail = z.object({
  project: projectResponse,
  documents: z.array(projectDocumentSummary),
  /** True when a document table hit its per-type cap, so documents are missing. */
  documentsPartial: z.boolean().optional(),
  spend: projectSpend
});
export type ProjectDetail = z.infer<typeof projectDetail>;

/**
 * Move one document into a project, or — with {@link LOOSE_PROJECT_ID} — back
 * out of every project.
 */
export const assignDocumentInput = z.object({
  projectId: z.string(),
  type: projectDocumentType,
  ref: z.string()
});
export type AssignDocumentInput = z.infer<typeof assignDocumentInput>;
