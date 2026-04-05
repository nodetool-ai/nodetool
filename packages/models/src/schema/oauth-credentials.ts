import { sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";

export const oauthCredentials = sqliteTable(
  "nodetool_oauth_credentials",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    provider: text("provider").notNull(),
    account_id: text("account_id").notNull(),
    encrypted_access_token: text("encrypted_access_token").notNull(),
    encrypted_refresh_token: text("encrypted_refresh_token"),
    username: text("username"),
    token_type: text("token_type").notNull().default("Bearer"),
    scope: text("scope"),
    received_at: text("received_at").notNull(),
    expires_at: text("expires_at"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    index("idx_oauth_user_id").on(table.user_id),
    index("idx_oauth_user_provider").on(table.user_id, table.provider),
    uniqueIndex("idx_oauth_user_provider_account").on(
      table.user_id,
      table.provider,
      table.account_id
    )
  ]
);
