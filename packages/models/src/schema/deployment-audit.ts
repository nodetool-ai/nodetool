import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";

/**
 * Append-only audit log of deployment activity. One row per action.
 * Partitioned by `user_id` (the owning user / tenant) so deletion of a user
 * naturally scopes its log pruning. `meta_json` is optional free-form JSON.
 */
export const deploymentAudit = sqliteTable(
  "nodetool_deployment_audit",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    deployment_name: text("deployment_name"),
    actor: text("actor").notNull().default(""),
    action: text("action").notNull(),
    status: text("status").notNull(),
    error: text("error"),
    meta_json: text("meta_json"),
    ts: text("ts").notNull()
  },
  (table) => [
    index("idx_deployment_audit_user_ts").on(table.user_id, table.ts),
    index("idx_deployment_audit_action").on(table.action)
  ]
);
