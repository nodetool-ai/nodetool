import {
  pgTable,
  text,
  boolean,
  index,
  uniqueIndex
} from "drizzle-orm/pg-core";

export const deployments = pgTable(
  "nodetool_deployments",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    enabled: boolean("enabled").notNull().default(true),
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
