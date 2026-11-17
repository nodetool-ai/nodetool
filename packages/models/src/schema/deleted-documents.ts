import { sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * A deleted document kept for its restore period
 * (docs/plans/native-cloud-sync/technical-design.md, "Deletion, restore and
 * storage", WP2.2). `payload` is the JSON the model wrote when it deleted the
 * document: its row and the rows that belong to it, such as versions and
 * sharing rows, so a restore puts back the same document under the same id.
 * One row per document: deleting it again after a restore replaces the row.
 */
export const deletedDocuments = sqliteTable(
  "nodetool_deleted_documents",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    document_id: text("document_id").notNull(),
    /** The owner, who alone may restore it or end its restore period. */
    user_id: text("user_id").notNull(),
    project_id: text("project_id"),
    name: text("name").notNull(),
    payload: text("payload").notNull(),
    deleted_at: text("deleted_at").notNull(),
    /** When the purge job deletes the row for good. */
    purge_at: text("purge_at").notNull(),
    /** Set when a purge claimed the row. A restore then refuses it. */
    purging_since: text("purging_since")
  },
  (table) => [
    uniqueIndex("idx_deleted_documents_document").on(table.kind, table.document_id),
    index("idx_deleted_documents_user").on(table.user_id, table.deleted_at),
    index("idx_deleted_documents_purge").on(table.purge_at)
  ]
);
