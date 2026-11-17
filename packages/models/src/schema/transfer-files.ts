import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

/**
 * Files a committed transfer still has to place in its project's folder
 * (docs/plans/native-cloud-sync/technical-design.md, "Blob store", Placement).
 * The commit writes one row per file it puts or deletes. A placement task
 * copies `blobs/<hash>` to the path, or deletes the file, and then deletes
 * the row. While the row exists the path is in flux for the folder
 * comparison.
 */
export const transferPlacements = sqliteTable(
  "transfer_placements",
  {
    id: text("id").primaryKey(),
    project_id: text("project_id").notNull(),
    /** The project's owner. */
    user_id: text("user_id").notNull(),
    transfer_id: text("transfer_id").notNull(),
    /** The path relative to the project folder. */
    path: text("path").notNull(),
    /** The bytes to place. Null deletes the file at the path. */
    hash: text("hash"),
    /** The asset whose file this is, for an asset file. */
    asset_id: text("asset_id"),
    created_at: text("created_at").notNull()
  },
  (table) => [
    index("idx_transfer_placements_project").on(table.project_id, table.path),
    index("idx_transfer_placements_created").on(table.created_at)
  ]
);

/**
 * Content a transfer replaced, kept for 30 days where no version table keeps
 * it: workspace files and asset files (technical design, "Operations of a
 * transfer"). `blob_hash` names the replaced bytes in the blob store, and a
 * committed `project_blobs` row keeps them there until the purge.
 */
export const recoveryCopies = sqliteTable(
  "recovery_copies",
  {
    id: text("id").primaryKey(),
    project_id: text("project_id").notNull(),
    /** The project's owner. */
    user_id: text("user_id").notNull(),
    /** The document kind, for a document without a version table. */
    document_kind: text("document_kind"),
    document_id: text("document_id"),
    /** The path relative to the project folder, for a file. */
    workspace_path: text("workspace_path"),
    asset_id: text("asset_id"),
    blob_hash: text("blob_hash"),
    size: integer("size"),
    /** The operation that replaced it: `put_workspace_file`, `put_asset_file` or `delete_workspace_file`. */
    operation: text("operation").notNull(),
    transfer_id: text("transfer_id").notNull(),
    created_at: text("created_at").notNull(),
    purge_at: text("purge_at").notNull()
  },
  (table) => [
    index("idx_recovery_copies_project").on(table.project_id, table.created_at),
    index("idx_recovery_copies_purge").on(table.purge_at)
  ]
);

/**
 * Conversations a transfer added to a cloud project, by the id they had on
 * the sending device (technical design, "Operations of a transfer", Add
 * conversation). A conversation is never merged: once a source id has a row,
 * a later transfer of it changes nothing.
 */
export const transferredConversations = sqliteTable(
  "transferred_conversations",
  {
    id: text("id").primaryKey(),
    project_id: text("project_id").notNull(),
    /** The sender, who owns the conversation. */
    user_id: text("user_id").notNull(),
    source_thread_id: text("source_thread_id").notNull(),
    /** The cloud thread: the source id when it was free, else a new one. */
    thread_id: text("thread_id").notNull(),
    transfer_id: text("transfer_id").notNull(),
    created_at: text("created_at").notNull()
  },
  (table) => [
    index("idx_transferred_conversations_source").on(table.project_id, table.user_id, table.source_thread_id)
  ]
);
