import { sql } from "drizzle-orm";
import { pgTable, text, index, uniqueIndex } from "drizzle-orm/pg-core";
import { integerBoolean } from "./helpers.js";

/*
 * The same model as schema-pg/document-sharing.ts, keyed by workflow id. A
 * person holds at most one invitation (`share_id` null) and one grant per
 * redeemed link.
 */

export const workflowCollaborators = pgTable(
  "nodetool_workflow_collaborators",
  {
    id: text("id").primaryKey(),
    workflow_id: text("workflow_id").notNull(),
    user_id: text("user_id").notNull(),
    role: text("role").notNull().default("viewer"),
    invited_by: text("invited_by").notNull(),
    created_at: text("created_at").notNull(),
    share_id: text("share_id"),
    allow_history: integerBoolean("allow_history")
      .notNull()
      .default(sql`0`),
    allow_download: integerBoolean("allow_download")
      .notNull()
      .default(sql`0`),
    allow_duplicate: integerBoolean("allow_duplicate")
      .notNull()
      .default(sql`0`)
  },
  (table) => [
    uniqueIndex("idx_wcol_workflow_user_invitation")
      .on(table.workflow_id, table.user_id)
      .where(sql`share_id IS NULL`),
    uniqueIndex("idx_wcol_workflow_user_share")
      .on(table.workflow_id, table.user_id, table.share_id)
      .where(sql`share_id IS NOT NULL`),
    index("idx_wcol_user_id").on(table.user_id)
  ]
);

export const workflowShares = pgTable(
  "nodetool_workflow_shares",
  {
    id: text("id").primaryKey(),
    workflow_id: text("workflow_id").notNull(),
    token: text("token").notNull(),
    role: text("role").notNull().default("viewer"),
    created_by: text("created_by").notNull(),
    created_at: text("created_at").notNull(),
    /** Kept for old readers. Equal to `disabled_at` since the link options. */
    revoked_at: text("revoked_at"),
    disabled_at: text("disabled_at"),
    allow_history: integerBoolean("allow_history")
      .notNull()
      .default(sql`0`),
    allow_download: integerBoolean("allow_download")
      .notNull()
      .default(sql`0`),
    allow_duplicate: integerBoolean("allow_duplicate")
      .notNull()
      .default(sql`0`),
    owner_notice: text("owner_notice")
  },
  (table) => [
    uniqueIndex("idx_wshare_token").on(table.token),
    index("idx_wshare_workflow_id").on(table.workflow_id),
    uniqueIndex("idx_wshare_active_role")
      .on(table.workflow_id, table.role)
      .where(sql`disabled_at IS NULL`)
  ]
);
