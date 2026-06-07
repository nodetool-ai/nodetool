import { pgTable, text } from "drizzle-orm/pg-core";

export const deploymentSettings = pgTable("nodetool_deployment_settings", {
  user_id: text("user_id").primaryKey(),
  quota_json: text("quota_json").notNull().default("{}"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull()
});
