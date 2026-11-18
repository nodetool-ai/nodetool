/** PostgreSQL twin of `src/schema/transfer-files.ts`, which describes it. */
import { pgTable, text, bigint, index } from "drizzle-orm/pg-core";

export const transferPlacements = pgTable(
  "transfer_placements",
  {
    id: text("id").primaryKey(),
    project_id: text("project_id").notNull(),
    user_id: text("user_id").notNull(),
    transfer_id: text("transfer_id").notNull(),
    path: text("path").notNull(),
    hash: text("hash"),
    asset_id: text("asset_id"),
    created_at: text("created_at").notNull()
  },
  (table) => [
    index("idx_transfer_placements_project").on(table.project_id, table.path),
    index("idx_transfer_placements_created").on(table.created_at)
  ]
);

/** `size` is BIGINT because a PostgreSQL INTEGER stops at 2 GiB. */
export const recoveryCopies = pgTable(
  "recovery_copies",
  {
    id: text("id").primaryKey(),
    project_id: text("project_id").notNull(),
    user_id: text("user_id").notNull(),
    document_kind: text("document_kind"),
    document_id: text("document_id"),
    workspace_path: text("workspace_path"),
    asset_id: text("asset_id"),
    blob_hash: text("blob_hash"),
    size: bigint("size", { mode: "number" }),
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

export const transferredConversations = pgTable(
  "transferred_conversations",
  {
    id: text("id").primaryKey(),
    project_id: text("project_id").notNull(),
    user_id: text("user_id").notNull(),
    source_thread_id: text("source_thread_id").notNull(),
    thread_id: text("thread_id").notNull(),
    transfer_id: text("transfer_id").notNull(),
    created_at: text("created_at").notNull()
  },
  (table) => [
    index("idx_transferred_conversations_source").on(table.project_id, table.user_id, table.source_thread_id)
  ]
);
