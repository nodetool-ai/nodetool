import { sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Per-user deployment settings: quotas and encrypted provider credentials.
 *
 * One row per user. `quota_json` holds the user's deployment quota
 * (max_deployments, allowed_providers, etc.). `credentials_json` is a JSON
 * map of `{ [envName]: { ciphertext, updated_at } }` — ciphertexts are
 * encrypted with `encrypt(masterKey, user_id, plaintext)` so each user has
 * their own derived key. The user concept here is the same one used by all
 * other user-scoped tables (workspaces, secrets, jobs).
 */
export const deploymentSettings = sqliteTable(
  "nodetool_deployment_settings",
  {
    user_id: text("user_id").primaryKey(),
    quota_json: text("quota_json").notNull().default("{}"),
    credentials_json: text("credentials_json").notNull().default("{}"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  }
);
