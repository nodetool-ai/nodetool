import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  index,
  uniqueIndex
} from "drizzle-orm/pg-core";
import type { SearchMetadata } from "@nodetool-ai/protocol";
import { integerBoolean, jsonText } from "./helpers.js";

/** See the SQLite schema for the column semantics. */
export const searchItems = pgTable(
  "nodetool_search_items",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    project_id: text("project_id").notNull().default("default"),
    /** The table the item comes from (`SearchResourceType`). */
    resource_type: text("resource_type").notNull(),
    resource_id: text("resource_id").notNull(),
    /** What the item is (`SearchKind`). */
    kind: text("kind").notNull(),
    title: text("title").notNull().default(""),
    content_type: text("content_type"),
    provider: text("provider"),
    model: text("model"),
    workflow_id: text("workflow_id"),
    favorite: integerBoolean("favorite").notNull().default(sql`0`),
    folder_path: text("folder_path"),
    /** Normalized tags, delimited as `|a|b|` so one tag is a `LIKE` match. */
    tags: text("tags"),
    metadata: jsonText<SearchMetadata>()("metadata"),
    /** The source row's version this item was built from. */
    source_version: text("source_version").notNull().default(""),
    extractor_version: integer("extractor_version").notNull().default(0),
    /** `pending`, `ready`, `failed` or `skipped` (`SearchItemState`). */
    state: text("state").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    next_attempt_at: text("next_attempt_at"),
    priority: integer("priority").notNull().default(0),
    lease_owner: text("lease_owner"),
    lease_expires_at: text("lease_expires_at"),
    lease_version: integer("lease_version").notNull().default(0),
    error: text("error"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
    indexed_at: text("indexed_at"),
    /** `source_version|model` the captions or transcript were made from. */
    enriched_version: text("enriched_version"),
    enrich_attempts: integer("enrich_attempts").notNull().default(0),
    enrich_error: text("enrich_error"),
    /** `source_version|project_id|space` the image vector was made from. */
    image_embedded_version: text("image_embedded_version"),
    image_embed_attempts: integer("image_embed_attempts").notNull().default(0),
    image_embed_error: text("image_embed_error")
  },
  (table) => [
    uniqueIndex("idx_search_items_resource").on(
      table.user_id,
      table.resource_type,
      table.resource_id
    ),
    index("idx_search_items_user_project").on(table.user_id, table.project_id),
    index("idx_search_items_queue").on(table.state, table.next_attempt_at)
  ]
);

/** See the SQLite schema for the column semantics. */
export const searchChunks = pgTable(
  "nodetool_search_chunks",
  {
    id: text("id").primaryKey(),
    item_id: text("item_id")
      .notNull()
      .references(() => searchItems.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull().default(0),
    /** `SearchField`: title, prompt, description, body, caption or transcript. */
    field: text("field").notNull(),
    text: text("text").notNull(),
    locator: jsonText<Record<string, unknown>>()("locator"),
    /** The embedding space of this chunk's vector, null until it has one. */
    embedding_space: text("embedding_space")
  },
  (table) => [index("idx_search_chunks_item").on(table.item_id, table.ordinal)]
);

/** See the SQLite schema for the column semantics. */
export const searchLeases = pgTable("nodetool_search_leases", {
  name: text("name").primaryKey(),
  owner: text("owner").notNull(),
  expires_at: text("expires_at").notNull()
});
