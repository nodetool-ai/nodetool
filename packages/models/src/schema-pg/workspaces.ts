import { pgTable, text, integer, index } from "drizzle-orm/pg-core";

export const workspaces = pgTable(
  "nodetool_workspaces",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    name: text("name").notNull().default(""),
    path: text("path").notNull().default(""),
    is_default: integer("is_default").default(0),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [index("idx_workspaces_user_id").on(table.user_id)]
);
