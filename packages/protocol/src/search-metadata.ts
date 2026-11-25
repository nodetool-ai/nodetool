/**
 * The library index's description of one item: an asset, a document of any
 * kind, or an entity. Every item gets the same shape, so one filter and one
 * hit format serve every kind. See `docs/plans/library-search.md` (D5).
 */

import { z } from "zod";

/** What an indexed item is, as a filter and on a hit. */
export const SEARCH_KINDS = [
  "image",
  "video",
  "audio",
  "model_3d",
  "document",
  "workflow",
  "application",
  "sketch",
  "script",
  "storyboard",
  "timeline",
  "jsscript",
  "game",
  "entity",
  "file"
] as const;

export const SearchKind = z.enum(SEARCH_KINDS);
export type SearchKind = z.infer<typeof SearchKind>;

/**
 * The table an item comes from. Assets and entities share `asset`. A
 * `project_file` is a file in a project folder that no row names, with the
 * resource id `<project id>:<path>`.
 */
export const SEARCH_RESOURCE_TYPES = [
  "asset",
  "workflow",
  "application",
  "image_document",
  "script",
  "storyboard",
  "timeline_sequence",
  "js_script",
  "game",
  "project_file"
] as const;

export const SearchResourceType = z.enum(SEARCH_RESOURCE_TYPES);
export type SearchResourceType = z.infer<typeof SearchResourceType>;

/** The part of an item a chunk of text came from. */
export const SEARCH_FIELDS = [
  "title",
  "prompt",
  "description",
  "body",
  "caption",
  "transcript"
] as const;

export const SearchField = z.enum(SEARCH_FIELDS);
export type SearchField = z.infer<typeof SearchField>;

/** How an item came to exist. */
export const SearchOrigin = z.enum([
  "generated",
  "imported",
  "external",
  "folder_file"
]);
export type SearchOrigin = z.infer<typeof SearchOrigin>;

/**
 * Where an indexed item stands in the indexing queue. `pending` items wait
 * for the indexer to extract their content. `failed` and `skipped` items
 * could not be extracted, and stay findable by name and metadata. An
 * `excluded` row is not a library item, such as a shipped entity preset, and
 * no query returns it.
 */
export const SearchItemState = z.enum(["pending", "ready", "failed", "skipped", "excluded"]);
export type SearchItemState = z.infer<typeof SearchItemState>;

/** Normalize asset tags: trimmed, lower case, no empties, no duplicates, in order. */
export function normalizeSearchTags(tags: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const tag of tags) {
    // Stored metadata is JSON a caller wrote, so a tag may be anything.
    const parsed = z.string().safeParse(tag);
    if (!parsed.success) continue;
    const normalized = parsed.data.trim().toLowerCase();
    if (normalized && !out.includes(normalized)) out.push(normalized);
  }
  return out;
}

/**
 * The metadata document stored on every item row. Fields that do not apply to
 * a kind are absent. The groups follow the plan's D5 table: identity, media,
 * provenance, usage, entity and time. Derived fields (caption, languages)
 * arrive with enrichment and are not part of this shape yet.
 */
export const SearchMetadata = z.object({
  // Identity
  kind: SearchKind,
  title: z.string(),
  content_type: z.string().optional(),
  project_id: z.string(),
  folder_path: z.string().optional(),
  uri: z.string().optional(),
  // Media
  width: z.number().optional(),
  height: z.number().optional(),
  duration: z.number().optional(),
  size: z.number().optional(),
  page_count: z.number().optional(),
  // Provenance
  origin: SearchOrigin.optional(),
  prompt: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  capability: z.string().optional(),
  workflow_id: z.string().optional(),
  node_type: z.string().optional(),
  job_id: z.string().optional(),
  // Usage
  favorite: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  // Entity
  entity_kind: z.string().optional(),
  descriptor: z.string().optional(),
  // Time
  created_at: z.string(),
  updated_at: z.string()
});
export type SearchMetadata = z.infer<typeof SearchMetadata>;
