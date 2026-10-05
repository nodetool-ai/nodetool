import { sql } from "drizzle-orm";
import { pgTable, text, index } from "drizzle-orm/pg-core";
import { integerBoolean } from "./helpers.js";

export const workspaces = pgTable(
  "nodetool_workspaces",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    name: text("name").notNull().default(""),
    path: text("path").notNull().default(""),
    project_id: text("project_id").notNull().default("default"),
    // Drizzle Kit does not apply custom encoders when rendering DDL defaults.
    is_default: integerBoolean("is_default").default(sql`0`),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    index("idx_workspaces_user_id").on(table.user_id),
    index("idx_workspaces_user_project").on(table.user_id, table.project_id)
  ]
);
