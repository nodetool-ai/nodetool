import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex
} from "drizzle-orm/sqlite-core";

/**
 * Sharing for project documents other than workflows, which keep their own
 * tables. A row names its document by `(document_type, document_id)`.
 *
 * A person may hold several grants on one document: at most one invitation
 * (`share_id` null) and one per link they redeemed. The options of a link
 * grant are read from its link at every request, so the grant's own option
 * columns are used by invitations only.
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
    created_at: text("created_at").notNull(),
    share_id: text("share_id"),
    allow_history: integer("allow_history", { mode: "boolean" })
      .notNull()
      .default(false),
    allow_download: integer("allow_download", { mode: "boolean" })
      .notNull()
      .default(false),
    allow_duplicate: integer("allow_duplicate", { mode: "boolean" })
      .notNull()
      .default(false)
  },
  (table) => [
    uniqueIndex("idx_dcol_document_user_invitation")
      .on(table.document_type, table.document_id, table.user_id)
      .where(sql`share_id IS NULL`),
    uniqueIndex("idx_dcol_document_user_share")
      .on(table.document_type, table.document_id, table.user_id, table.share_id)
      .where(sql`share_id IS NOT NULL`),
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
    /** Kept for old readers. Equal to `disabled_at` since the link options. */
    revoked_at: text("revoked_at"),
    /** A disabled link admits nobody new. Its options stay live (P3). */
    disabled_at: text("disabled_at"),
    allow_history: integer("allow_history", { mode: "boolean" })
      .notNull()
      .default(false),
    allow_download: integer("allow_download", { mode: "boolean" })
      .notNull()
      .default(false),
    allow_duplicate: integer("allow_duplicate", { mode: "boolean" })
      .notNull()
      .default(false),
    /**
     * A notice the owner has not dismissed yet. `history_off` marks a
     * timeline view link from before the options, whose viewers could read
     * history and no longer can (R7 of the PRD).
     */
    owner_notice: text("owner_notice")
  },
  (table) => [
    uniqueIndex("idx_dshare_token").on(table.token),
    index("idx_dshare_document").on(table.document_type, table.document_id),
    uniqueIndex("idx_dshare_active_role")
      .on(table.document_type, table.document_id, table.role)
      .where(sql`disabled_at IS NULL`)
  ]
);

/**
 * The most a person may receive from redeeming a link, set when the owner
 * lowers their role or removes them. `role` null admits them through no
 * link. Serves documents and workflows: `document_type` is "workflow" or a
 * shared document kind. The owner inviting the person or setting their role
 * to editor deletes the row.
 */
export const shareRoleLimits = sqliteTable(
  "nodetool_share_role_limits",
  {
    id: text("id").primaryKey(),
    document_type: text("document_type").notNull(),
    document_id: text("document_id").notNull(),
    user_id: text("user_id").notNull(),
    role: text("role"),
    set_by: text("set_by").notNull(),
    created_at: text("created_at").notNull()
  },
  (table) => [
    uniqueIndex("idx_srlimit_document_user").on(
      table.document_type,
      table.document_id,
      table.user_id
    ),
    index("idx_srlimit_user_id").on(table.user_id)
  ]
);
