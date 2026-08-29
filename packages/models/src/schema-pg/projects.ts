import { pgTable, text, index } from "drizzle-orm/pg-core";

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    name: text("name").notNull(),
    /** Free text — "spot", "trailer", "report", whatever the user calls it. */
    kind: text("kind").notNull().default(""),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    index("idx_project_user").on(table.user_id),
    index("idx_project_updated").on(table.updated_at)
  ]
);
