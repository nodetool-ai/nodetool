import { pgTable, text, index, uniqueIndex } from "drizzle-orm/pg-core";

export const appSettings = pgTable(
  "nodetool_settings",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    description: text("description").default(""),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    uniqueIndex("idx_settings_user_key").on(table.user_id, table.key),
    index("idx_settings_user_id").on(table.user_id)
  ]
);
