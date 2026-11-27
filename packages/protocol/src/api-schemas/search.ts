import { z } from "zod";
import { SearchField, SearchKind, SearchResourceType } from "../search-metadata.js";

// Library search over tRPC (docs/plans/library-search.md, D23): the command
// palette, the settings status panel and the search setup card call these.

export const searchMode = z.enum(["auto", "keyword", "semantic"]);
export type SearchMode = z.infer<typeof searchMode>;

export const searchFilter = z.object({
  createdAfter: z.string().optional(),
  createdBefore: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  workflowId: z.string().optional(),
  /** Every tag must be present. */
  tags: z.array(z.string()).optional(),
  favorite: z.boolean().optional(),
  /** Folder path prefix, such as `Home/Renders`. */
  folder: z.string().optional(),
  /** Content type prefix, such as `image/`. */
  contentType: z.string().optional()
});
export type SearchFilter = z.infer<typeof searchFilter>;

// ── query ─────────────────────────────────────────────────────────
export const queryInput = z.object({
  /** Words or a phrase. Empty lists matching items, newest first. */
  query: z.string().max(1000),
  kinds: z.array(SearchKind).optional(),
  /** Restrict to one project. Omitted searches every project. */
  project_id: z.string().optional(),
  filter: searchFilter.optional(),
  mode: searchMode.default("auto"),
  limit: z.number().int().min(1).max(200).default(20),
  cursor: z.string().nullable().optional(),
  /** An item or resource id: rank by nearness in meaning to it. `query` is not used then. */
  similar_to: z.string().optional()
});
export type QueryInput = z.infer<typeof queryInput>;

export const searchMatch = z.object({
  field: SearchField,
  snippet: z.string(),
  locator: z.record(z.string(), z.unknown()).nullable()
});
export type SearchMatch = z.infer<typeof searchMatch>;

export const searchHit = z.object({
  item_id: z.string(),
  resource_type: SearchResourceType,
  resource_id: z.string(),
  kind: SearchKind,
  title: z.string(),
  project_id: z.string(),
  folder_path: z.string().nullable(),
  content_type: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  /** Why the item matched, best passage first. Empty for an empty query. */
  matches: z.array(searchMatch)
});
export type SearchHit = z.infer<typeof searchHit>;

export const indexState = z.object({
  /** The layers this answer used. */
  mode: z.enum(["hybrid", "semantic", "keyword"]),
  pending: z.number(),
  failed: z.number(),
  /** Why the answer matched words only although search by meaning is set up. */
  note: z.string().optional()
});
export type IndexState = z.infer<typeof indexState>;

export const queryOutput = z.object({
  hits: z.array(searchHit),
  next_cursor: z.string().nullable(),
  /** Every item that matches, across pages. */
  total: z.number(),
  index: indexState
});
export type QueryOutput = z.infer<typeof queryOutput>;

// ── read ──────────────────────────────────────────────────────────
export const readInput = z.object({
  /** An item id, or a resource id from a hit. */
  id: z.string(),
  /** The locator of a match; omitted reads from the start. */
  locator: z.record(z.string(), z.unknown()).nullable().optional(),
  before: z.number().int().min(0).max(20).default(1),
  after: z.number().int().min(0).max(20).default(1)
});
export type ReadInput = z.infer<typeof readInput>;

export const readOutput = z.object({
  item: z.object({
    item_id: z.string(),
    resource_type: z.string(),
    resource_id: z.string(),
    kind: SearchKind,
    title: z.string()
  }),
  passages: z.array(
    z.object({
      ordinal: z.number(),
      field: SearchField,
      text: z.string(),
      locator: z.record(z.string(), z.unknown()).nullable()
    })
  ),
  /** Index of the matched passage in `passages`. */
  matched: z.number(),
  /** Body passages the item has in all. */
  total: z.number()
});
export type ReadOutput = z.infer<typeof readOutput>;

// ── status ────────────────────────────────────────────────────────
export const statusOutput = z.object({
  items: z.object({
    ready: z.number(),
    pending: z.number(),
    failed: z.number(),
    skipped: z.number(),
    total: z.number()
  }),
  chunks: z.number(),
  semantic: z.object({
    /** `provider:model`, or null when search by meaning is off. */
    space: z.string().nullable(),
    /** `unset` until someone turns search by meaning on or off. */
    choice: z.enum(["on", "off", "unset"]),
    embedded: z.number(),
    remaining: z.number(),
    collections: z.array(z.string()),
    /** Image vectors: `provider:model` of the image model, or null when off. */
    images: z.object({
      space: z.string().nullable(),
      embedded: z.number(),
      remaining: z.number()
    })
  }),
  failures: z.array(
    z.object({ item_id: z.string(), title: z.string(), error: z.string().nullable() })
  ),
  /** Whether this server lets the caller change the search setup. */
  can_set_up: z.boolean(),
  /** The default local model, which runs on this machine. */
  local_model: z.object({
    provider: z.string(),
    model: z.string(),
    download_megabytes: z.number()
  })
});
export type StatusOutput = z.infer<typeof statusOutput>;

// ── rebuild ───────────────────────────────────────────────────────
export const rebuildInput = z.object({
  /** `vectors` embeds every passage again; `all` also extracts every item again. */
  scope: z.enum(["vectors", "all"]).default("all")
});
export type RebuildInput = z.infer<typeof rebuildInput>;

export const rebuildOutput = z.object({
  /** Items queued. */
  items: z.number()
});
export type RebuildOutput = z.infer<typeof rebuildOutput>;

// ── setup ─────────────────────────────────────────────────────────
export const setupInput = z.object({
  /** The embedding model, or null to turn search by meaning off. */
  model: z
    .object({ provider: z.string().min(1), model: z.string().min(1) })
    .nullable()
});
export type SetupInput = z.infer<typeof setupInput>;

export const setupOutput = z.object({
  /** `provider:model`, or null when search by meaning is off. */
  space: z.string().nullable()
});
export type SetupOutput = z.infer<typeof setupOutput>;
