import { pgTable, text, index, uniqueIndex } from "drizzle-orm/pg-core";

export const workflowCollaborators = pgTable(
  "nodetool_workflow_collaborators",
  {
    id: text("id").primaryKey(),
    workflow_id: text("workflow_id").notNull(),
    user_id: text("user_id").notNull(),
    role: text("role").notNull().default("viewer"),
    invited_by: text("invited_by").notNull(),
    created_at: text("created_at").notNull()
  },
  (table) => [
    uniqueIndex("idx_wcol_workflow_user").on(table.workflow_id, table.user_id),
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
    revoked_at: text("revoked_at")
  },
  (table) => [
    uniqueIndex("idx_wshare_token").on(table.token),
    index("idx_wshare_workflow_id").on(table.workflow_id)
  ]
);
