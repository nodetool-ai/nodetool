import { pgTable, text, bigint, index, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * PostgreSQL twin of `src/schema/project-blobs.ts`, which describes it.
 * `size` is BIGINT because a PostgreSQL INTEGER stops at 2 GiB.
 */
export const projectBlobs = pgTable(
  "project_blobs",
  {
    id: text("id").primaryKey(),
    project_id: text("project_id").notNull(),
    user_id: text("user_id").notNull(),
    hash: text("hash").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    transfer_id: text("transfer_id").notNull(),
    committed_at: text("committed_at"),
    created_at: text("created_at").notNull()
  },
  (table) => [
    uniqueIndex("idx_project_blobs_row").on(table.project_id, table.hash, table.transfer_id),
    index("idx_project_blobs_owner_hash").on(table.user_id, table.hash),
    index("idx_project_blobs_hash").on(table.hash),
    index("idx_project_blobs_staged").on(table.committed_at, table.created_at)
  ]
);
