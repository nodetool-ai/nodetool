/**
 * PostgreSQL twin of `src/schema/revision-sets.ts`, which describes it.
 * `size` is BIGINT because a PostgreSQL INTEGER stops at 2 GiB.
 */
import { pgTable, text, bigint, index } from "drizzle-orm/pg-core";

export const revisionSets = pgTable(
  "revision_sets",
  {
    id: text("id").primaryKey(),
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

export const revisionSetEntries = pgTable(
  "revision_set_entries",
  {
    id: text("id").primaryKey(),
    set_id: text("set_id").notNull(),
    user_id: text("user_id").notNull(),
    project_id: text("project_id").notNull(),
    document_kind: text("document_kind").notNull(),
    document_id: text("document_id").notNull(),
    revision_id: text("revision_id").notNull(),
    fields: text("fields").notNull(),
    content_hash: text("content_hash").notNull()
  },
  (table) => [index("idx_revision_set_entries_set").on(table.set_id, table.document_kind, table.document_id)]
);

export const revisionSetFiles = pgTable(
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
    size: bigint("size", { mode: "number" }).notNull()
  },
  (table) => [
    index("idx_revision_set_files_set").on(table.set_id, table.hash),
    index("idx_revision_set_files_hash").on(table.hash)
  ]
);

export const revisionSetWorkspaceFiles = pgTable(
  "revision_set_workspace_files",
  {
    id: text("id").primaryKey(),
    set_id: text("set_id").notNull(),
    user_id: text("user_id").notNull(),
    project_id: text("project_id").notNull(),
    path: text("path").notNull(),
    hash: text("hash").notNull(),
    size: bigint("size", { mode: "number" }).notNull()
  },
  (table) => [
    index("idx_revision_set_workspace_files_set").on(table.set_id, table.hash),
    index("idx_revision_set_workspace_files_hash").on(table.hash)
  ]
);
