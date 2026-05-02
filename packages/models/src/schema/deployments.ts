import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex
} from "drizzle-orm/sqlite-core";

/**
 * Deployment configurations.
 *
 * One row per deployment. `user_id` partitions deployments by owning user
 * (matching the convention used across `nodetool_workspaces`, `nodetool_secrets`,
 * etc.). The unique index on `(user_id, name)` enforces "one deployment with
 * this name per user" while allowing the same name across users.
 *
 * `config_json` holds the full Zod-parsed deployment object minus `state`,
 * which is split out to its own column so we can write state updates without
 * round-tripping the entire config.
 */
export const deployments = sqliteTable(
  "nodetool_deployments",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    config_json: text("config_json").notNull(),
    state_json: text("state_json").notNull().default("{}"),
    etag: text("etag").notNull().default(""),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    uniqueIndex("idx_deployments_user_name").on(table.user_id, table.name),
    index("idx_deployments_user_id").on(table.user_id),
    index("idx_deployments_type").on(table.type)
  ]
);
