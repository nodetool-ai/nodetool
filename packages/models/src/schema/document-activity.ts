import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

/**
 * What happened to a document beyond its content
 * (docs/plans/native-cloud-sync/technical-design.md, `document_activity`).
 * A row records one accepted change, such as a rename with both names (V6)
 * or a move with both projects (V8). `seq` orders the rows of one document.
 * No document write changes this table.
 */
export const documentActivity = sqliteTable(
  "document_activity",
  {
    id: text("id").primaryKey(),
    document_kind: text("document_kind").notNull(),
    document_id: text("document_id").notNull(),
    seq: integer("seq").notNull(),
    /** `rename` or `move`, and later `restore`, `resolution` and `suggestion_removed`. */
    type: text("type").notNull(),
    /** The person whose change was accepted. */
    user_id: text("user_id").notNull(),
    /** JSON with what the type records, such as `{ "from": …, "to": … }`. */
    payload: text("payload").notNull(),
    created_at: text("created_at").notNull()
  },
  (table) => [
    index("idx_document_activity_document").on(table.document_kind, table.document_id, table.seq),
    index("idx_document_activity_user").on(table.user_id)
  ]
);
