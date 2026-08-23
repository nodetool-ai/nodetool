import { pgTable, text, index } from "drizzle-orm/pg-core";

/** PostgreSQL twin of `schema/access-tokens.ts`. */
export const accessTokens = pgTable(
  "access_tokens",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    name: text("name").notNull(),
    secret_hash: text("secret_hash").notNull(),
    created_at: text("created_at").notNull(),
    expires_at: text("expires_at"),
    last_used_at: text("last_used_at")
  },
  (table) => [index("idx_access_token_user").on(table.user_id)]
);
