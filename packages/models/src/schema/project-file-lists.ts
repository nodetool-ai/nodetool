import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { jsonText } from "./helpers.js";

/**
 * The erased list of a cloud project
 * (docs/plans/native-cloud-sync/technical-design.md, "Deletion, restore and
 * storage", WP2.9, PRD FR79). The owner erased the stored bytes of the file
 * with `hash`. Entries that refer to it stay in the documents and show File
 * erased. A file on the list is not required by a transfer, not staged
 * again and not served, until the owner takes it off. One row per project
 * and hash.
 */
export const projectErasedFiles = sqliteTable(
  "project_erased_files",
  {
    id: text("id").primaryKey(),
    project_id: text("project_id").notNull(),
    /** The project's owner, the only person who may erase. */
    user_id: text("user_id").notNull(),
    hash: text("hash").notNull(),
    size: integer("size").notNull(),
    /** The assets with this content that the project's documents referred to. */
    asset_ids: jsonText<string[]>()("asset_ids").notNull(),
    erased_at: text("erased_at").notNull()
  },
  (table) => [
    uniqueIndex("idx_project_erased_files_entry").on(table.project_id, table.hash),
    index("idx_project_erased_files_user").on(table.user_id)
  ]
);

/**
 * The Incomplete list of a cloud project
 * (technical design, "Sending: capture, stage, commit attempt", X7). A
 * committed attempt confirmed that a required file was missing, too large
 * or over the allowance. A later transfer that supplies the file removes
 * its row, and the project is Incomplete while any row remains. One row
 * per project and asset.
 */
export const projectMissingFiles = sqliteTable(
  "project_missing_files",
  {
    id: text("id").primaryKey(),
    project_id: text("project_id").notNull(),
    /** The project's owner. */
    user_id: text("user_id").notNull(),
    asset_id: text("asset_id").notNull(),
    /** The hash and size the sender knew, when it knew them. */
    hash: text("hash"),
    size: integer("size"),
    /** `missing_locally`, `too_large` or `over_allowance`. */
    reason: text("reason").notNull(),
    /** The transfer whose committed attempt confirmed the file missing last. */
    transfer_id: text("transfer_id").notNull(),
    created_at: text("created_at").notNull()
  },
  (table) => [
    uniqueIndex("idx_project_missing_files_entry").on(table.project_id, table.asset_id),
    index("idx_project_missing_files_user").on(table.user_id)
  ]
);

/**
 * The hashes the server read from the workspace files of a cloud project's
 * folder (technical design, "Receiving workspace files", RW3). A file whose
 * size and modification time match its row is not read again. One row per
 * project and path.
 */
export const projectWorkspaceHashes = sqliteTable(
  "project_workspace_hashes",
  {
    id: text("id").primaryKey(),
    project_id: text("project_id").notNull(),
    /** The project's owner. */
    user_id: text("user_id").notNull(),
    path: text("path").notNull(),
    size: integer("size").notNull(),
    mtime_ms: integer("mtime_ms").notNull(),
    hash: text("hash").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    uniqueIndex("idx_project_workspace_hashes_path").on(table.project_id, table.path),
    index("idx_project_workspace_hashes_user").on(table.user_id)
  ]
);
