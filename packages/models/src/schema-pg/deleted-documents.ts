import { pgTable, text, index, uniqueIndex } from "drizzle-orm/pg-core";

/** PostgreSQL twin of `src/schema/deleted-documents.ts`, which describes it. */
export const deletedDocuments = pgTable(
  "nodetool_deleted_documents",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    document_id: text("document_id").notNull(),
    user_id: text("user_id").notNull(),
    project_id: text("project_id"),
    name: text("name").notNull(),
    payload: text("payload").notNull(),
    deleted_at: text("deleted_at").notNull(),
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
