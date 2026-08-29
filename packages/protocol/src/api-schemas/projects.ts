import { z } from "zod";

// ── Project ──────────────────────────────────────────────────────────────────
// A project is a name over documents that already carry `project_id`. `kind` is
// free text ("spot", "trailer", "report") rather than an enum: the taxonomy is
// the user's, not ours.

export const projectResponse = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type ProjectResponse = z.infer<typeof projectResponse>;

export const createProjectInput = z.object({
  id: z.string().optional(),
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

export const projectDocumentSummary = projectDocumentRef.extend({
  status: projectDocumentStatus.nullable(),
  spendUsd: z.number(),
  unpricedCount: z.number(),
  /** Stills the card montages. Empty for the kinds that render none. */
  thumbnails: z.array(projectThumbnail)
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
  /** A lower bound whenever `unpricedCount` is non-zero. */
  totalUsd: z.number(),
  unpricedCount: z.number(),
  byCategory: z.array(categorySpend)
});
export type ProjectSpend = z.infer<typeof projectSpend>;

export const projectDetail = z.object({
  project: projectResponse,
  documents: z.array(projectDocumentSummary),
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
