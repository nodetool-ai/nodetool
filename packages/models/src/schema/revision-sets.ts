import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

/**
 * Revision sets of a receive (docs/plans/native-cloud-sync/
 * technical-design.md, "Receiving: revision set, stage, check, apply",
 * WP2.5). A set fixes, for one reader, the revision of each document a
 * receive downloads and the files each revision needs. It is rows, not
 * copies: an entry names the saved version that holds the captured content,
 * and a file row names a hash of the blob store.
 *
 * A set lives until the reader releases it or `expires_at` passes, seven days
 * after capture. While it lives, its file hashes are retention roots of the
 * blob store (Y1). Every row names the reader and the project, so an account
 * erase and a project erase remove them.
 */
export const revisionSets = sqliteTable(
  "revision_sets",
  {
    id: text("id").primaryKey(),
    /** The reader who captured the set. */
    user_id: text("user_id").notNull(),
    project_id: text("project_id").notNull(),
    created_at: text("created_at").notNull(),
    expires_at: text("expires_at").notNull()
  },
  (table) => [
    index("idx_revision_sets_user").on(table.user_id),
    index("idx_revision_sets_expires").on(table.expires_at)
  ]
);

/** One document of a set and the revision captured for it. */
export const revisionSetEntries = sqliteTable(
  "revision_set_entries",
  {
    id: text("id").primaryKey(),
    set_id: text("set_id").notNull(),
    user_id: text("user_id").notNull(),
    project_id: text("project_id").notNull(),
    document_kind: text("document_kind").notNull(),
    document_id: text("document_id").notNull(),
    /** The saved version that holds the captured content. */
    revision_id: text("revision_id").notNull(),
    /**
     * JSON with the fields of the captured payload that the version does not
     * hold, such as a workflow's tags or a timeline's current name.
     */
    fields: text("fields").notNull(),
    /** The transfer hash of the captured payload. */
    content_hash: text("content_hash").notNull()
  },
  (table) => [index("idx_revision_set_entries_set").on(table.set_id, table.document_kind, table.document_id)]
);

/** One file a captured revision needs, as the reader's role may read it. */
export const revisionSetFiles = sqliteTable(
  "revision_set_files",
  {
    id: text("id").primaryKey(),
    set_id: text("set_id").notNull(),
    user_id: text("user_id").notNull(),
    project_id: text("project_id").notNull(),
    document_kind: text("document_kind").notNull(),
    document_id: text("document_id").notNull(),
    asset_id: text("asset_id").notNull(),
    hash: text("hash").notNull(),
    size: integer("size").notNull()
  },
  (table) => [
    index("idx_revision_set_files_set").on(table.set_id, table.hash),
    index("idx_revision_set_files_hash").on(table.hash)
  ]
);
