import { pgTable, text, index } from "drizzle-orm/pg-core";

export const threads = pgTable(
  "nodetool_threads",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    title: text("title").notNull().default(""),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [index("idx_threads_user_id").on(table.user_id)]
);
