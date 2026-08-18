import { sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * A messaging-platform account bound to a NodeTool user.
 *
 * `provider` is a column rather than a table per platform, so a second
 * adapter (Discord after Telegram) adds a string and no schema.
 */
export const externalIdentities = sqliteTable(
  "external_identities",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    external_id: text("external_id").notNull(),
    user_id: text("user_id").notNull(),
    linked_at: text("linked_at").notNull()
  },
  (table) => [
    uniqueIndex("idx_external_identity_provider_external").on(
      table.provider,
      table.external_id
    ),
    index("idx_external_identity_user").on(table.user_id)
  ]
);
