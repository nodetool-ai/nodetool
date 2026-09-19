/**
 * The document index — what a project navigator lists.
 *
 * One payload for every kind of document a project holds, carrying only the
 * identity a row in the panel draws. The richer per-kind list endpoints stay
 * where they are; this exists so opening the panel is one request over three
 * columns rather than eight requests over whole documents.
 */

import { z } from "zod";

/**
 * The kinds the navigator opens, spelled as the workspace tab type where one
 * exists. `entity` has no tab — it opens an editor in place.
 */
export const documentIndexType = z.enum([
  "workflow",
  "application",
  "sketch",
  "script",
  "storyboard",
  "timeline",
  "jsscript",
  "entity"
]);
export type DocumentIndexType = z.infer<typeof documentIndexType>;

/**
 * An entity as its editor needs it. Entities are tagged image assets rather
 * than document rows, and a marker is small, so the index carries the whole
 * thing instead of making the editor read it again on open.
 */
export const documentIndexEntity = z.object({
  type: z.literal("entity"),
  id: z.string(),
  project_id: z.string().optional(),
  kind: z.enum(["character", "location", "style", "prop"]),
  name: z.string(),
  descriptor: z.string(),
  description: z.string().optional(),
  voice_id: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  lora: z
    .object({
      url: z.string().optional(),
      asset_id: z.string().nullable().optional(),
      scale: z.number().optional()
    })
    .nullable()
    .optional(),
  palette: z
    .array(z.object({ name: z.string().optional(), hex: z.string() }))
    .nullable()
    .optional(),
  reference_images: z
    .array(
      z.object({
        type: z.literal("image"),
        uri: z.string().optional(),
        asset_id: z.string().nullable().optional()
      })
    )
    .optional(),
  created_at: z.string().optional()
});
export type DocumentIndexEntity = z.infer<typeof documentIndexEntity>;

export const documentIndexEntry = z.object({
  id: z.string(),
  type: documentIndexType,
  name: z.string(),
  updatedAt: z.string(),
  /** Set only on `entity` rows. */
  entity: documentIndexEntity.optional()
});
export type DocumentIndexEntry = z.infer<typeof documentIndexEntry>;

export const documentIndex = z.object({
  /** Every document in the project, newest first. */
  documents: z.array(documentIndexEntry),
  /** True when a kind hit its cap, so documents are missing from this index. */
  partial: z.boolean()
});
export type DocumentIndex = z.infer<typeof documentIndex>;

export const documentIndexInput = z.object({ projectId: z.string() });
export type DocumentIndexInput = z.infer<typeof documentIndexInput>;
