import { pgTable, text, index, uniqueIndex } from "drizzle-orm/pg-core";

export const secrets = pgTable(
  "nodetool_secrets",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    key: text("key").notNull(),
    encrypted_value: text("encrypted_value").notNull(),
    description: text("description").default(""),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    uniqueIndex("idx_secrets_user_key").on(table.user_id, table.key),
    index("idx_secrets_user_id").on(table.user_id)
  ]
);
