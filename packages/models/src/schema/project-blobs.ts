import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Content-addressed files of cloud projects
 * (docs/plans/native-cloud-sync/technical-design.md, "Blob store", WP2.1).
 *
 * The bytes live once under `blobs/<hash>` in the storage adapter. A row says
 * that a project holds those bytes. A row a transfer staged has no
 * `committed_at` and is readable by that transfer only. The commit sets
 * `committed_at`, and from then on the row is a retention root and readable
 * through the project's access. One row per project, hash and transfer.
 */
export const projectBlobs = sqliteTable(
  "project_blobs",
  {
    id: text("id").primaryKey(),
    project_id: text("project_id").notNull(),
    /** The project's owner, for the presence check scoped to one owner. */
    user_id: text("user_id").notNull(),
    /** Lowercase hex SHA-256, the same hash as `nodetool_assets.content_hash`. */
    hash: text("hash").notNull(),
    size: integer("size").notNull(),
    /** The transfer that staged the row. */
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
