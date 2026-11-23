import { pgTable, text, bigint, index, uniqueIndex } from "drizzle-orm/pg-core";
import { jsonText } from "./helpers.js";

/**
 * PostgreSQL twins of `src/schema/project-file-lists.ts`, which describes
 * them. Sizes are BIGINT because a PostgreSQL INTEGER stops at 2 GiB.
 */
export const projectErasedFiles = pgTable(
  "project_erased_files",
  {
    id: text("id").primaryKey(),
    project_id: text("project_id").notNull(),
    user_id: text("user_id").notNull(),
    hash: text("hash").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    asset_ids: jsonText<string[]>()("asset_ids").notNull(),
    erased_at: text("erased_at").notNull()
  },
  (table) => [
    uniqueIndex("idx_project_erased_files_entry").on(table.project_id, table.hash),
    index("idx_project_erased_files_user").on(table.user_id)
  ]
);

export const projectMissingFiles = pgTable(
  "project_missing_files",
  {
    id: text("id").primaryKey(),
    project_id: text("project_id").notNull(),
    user_id: text("user_id").notNull(),
    asset_id: text("asset_id").notNull(),
    hash: text("hash"),
    size: bigint("size", { mode: "number" }),
    reason: text("reason").notNull(),
    transfer_id: text("transfer_id").notNull(),
    created_at: text("created_at").notNull()
  },
  (table) => [
    uniqueIndex("idx_project_missing_files_entry").on(table.project_id, table.asset_id),
    index("idx_project_missing_files_user").on(table.user_id)
  ]
);

export const projectWorkspaceHashes = pgTable(
  "project_workspace_hashes",
  {
    id: text("id").primaryKey(),
    project_id: text("project_id").notNull(),
    user_id: text("user_id").notNull(),
    path: text("path").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    mtime_ms: bigint("mtime_ms", { mode: "number" }).notNull(),
    hash: text("hash").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    uniqueIndex("idx_project_workspace_hashes_path").on(table.project_id, table.path),
    index("idx_project_workspace_hashes_user").on(table.user_id)
  ]
);
