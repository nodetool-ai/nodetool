import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";

/**
 * A long-lived bearer token an external agent presents instead of a session.
 *
 * Only the hash of the secret half is stored, so a database read cannot
 * reconstruct a token — the plaintext exists once, in the response that mints
 * it. `id` is the token's public half and the lookup key, which is what keeps
 * verification a single indexed read rather than a scan over every row's hash.
 */
export const accessTokens = sqliteTable(
  "access_tokens",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    name: text("name").notNull(),
    secret_hash: text("secret_hash").notNull(),
    created_at: text("created_at").notNull(),
    /** Null means the token does not expire on its own. */
    expires_at: text("expires_at"),
    /** Null until the token authenticates a request. */
    last_used_at: text("last_used_at")
  },
  (table) => [index("idx_access_token_user").on(table.user_id)]
);
