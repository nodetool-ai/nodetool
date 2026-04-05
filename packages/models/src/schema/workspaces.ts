import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const workspaces = sqliteTable(
  "nodetool_workspaces",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    name: text("name").notNull().default(""),
    path: text("path").notNull().default(""),
    is_default: integer("is_default", { mode: "boolean" }).default(false),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [index("idx_workspaces_user_id").on(table.user_id)]
);
