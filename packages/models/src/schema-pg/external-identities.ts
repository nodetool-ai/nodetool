import { pgTable, text, index, uniqueIndex } from "drizzle-orm/pg-core";

/** PostgreSQL twin of `schema/external-identities.ts`. */
export const externalIdentities = pgTable(
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
