import { pgTable, text, index } from "drizzle-orm/pg-core";

export const deploymentAudit = pgTable(
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
