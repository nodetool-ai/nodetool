/** PostgreSQL twin of `src/schema/document-activity.ts`, which describes it. */
import { pgTable, text, integer, index } from "drizzle-orm/pg-core";

export const documentActivity = pgTable(
  "document_activity",
  {
    id: text("id").primaryKey(),
    document_kind: text("document_kind").notNull(),
    document_id: text("document_id").notNull(),
    seq: integer("seq").notNull(),
    type: text("type").notNull(),
    user_id: text("user_id").notNull(),
    payload: text("payload").notNull(),
    created_at: text("created_at").notNull()
  },
  (table) => [
    index("idx_document_activity_document").on(table.document_kind, table.document_id, table.seq),
    index("idx_document_activity_user").on(table.user_id)
  ]
);
