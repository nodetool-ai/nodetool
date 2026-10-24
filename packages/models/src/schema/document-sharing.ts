import { sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Sharing for project documents other than workflows, which keep their own
 * tables. A row names its document by `(document_type, document_id)`.
 */
export const documentCollaborators = sqliteTable(
  "nodetool_document_collaborators",
  {
    id: text("id").primaryKey(),
    document_type: text("document_type").notNull(),
    document_id: text("document_id").notNull(),
    user_id: text("user_id").notNull(),
    role: text("role").notNull().default("viewer"),
    invited_by: text("invited_by").notNull(),
    created_at: text("created_at").notNull()
  },
  (table) => [
    uniqueIndex("idx_dcol_document_user").on(
      table.document_type,
      table.document_id,
      table.user_id
    ),
    index("idx_dcol_user_id").on(table.user_id)
  ]
);

export const documentShares = sqliteTable(
  "nodetool_document_shares",
  {
    id: text("id").primaryKey(),
    document_type: text("document_type").notNull(),
    document_id: text("document_id").notNull(),
    token: text("token").notNull(),
    role: text("role").notNull().default("viewer"),
    created_by: text("created_by").notNull(),
    created_at: text("created_at").notNull(),
    revoked_at: text("revoked_at")
  },
  (table) => [
    uniqueIndex("idx_dshare_token").on(table.token),
    index("idx_dshare_document").on(table.document_type, table.document_id)
  ]
);
