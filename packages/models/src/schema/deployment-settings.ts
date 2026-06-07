import { sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Per-user deployment settings: quota only.
 *
 * One row per user. `quota_json` holds the user's deployment quota
 * (max_deployments, allowed_providers, etc.). Provider credentials are NOT
 * stored here — they live in the per-user `nodetool_secrets` table, keyed by
 * their environment-variable name. The user concept here is the same one used
 * by all other user-scoped tables (workspaces, secrets, jobs).
 */
export const deploymentSettings = sqliteTable(
  "nodetool_deployment_settings",
  {
    user_id: text("user_id").primaryKey(),
    quota_json: text("quota_json").notNull().default("{}"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  }
);
