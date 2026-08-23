import { pgTable, text, index, uniqueIndex } from "drizzle-orm/pg-core";
import { jsonText } from "./helpers.js";

/** PostgreSQL twin of `schema/mcp-oauth.ts`. */
export const mcpOauthClients = pgTable("mcp_oauth_clients", {
  id: text("id").primaryKey(),
  client_name: text("client_name").notNull(),
  redirect_uris: jsonText<string[]>()("redirect_uris").notNull(),
  created_at: text("created_at").notNull(),
  last_used_at: text("last_used_at")
});

export const mcpOauthGrants = pgTable(
  "mcp_oauth_grants",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    client_id: text("client_id").notNull(),
    client_name: text("client_name").notNull(),
    scope: text("scope").notNull(),
    resource: text("resource").notNull(),
    created_at: text("created_at").notNull(),
    revoked_at: text("revoked_at")
  },
  (table) => [index("idx_mcp_oauth_grant_user").on(table.user_id)]
);

export const mcpOauthTokens = pgTable(
  "mcp_oauth_tokens",
  {
    id: text("id").primaryKey(),
    grant_id: text("grant_id").notNull(),
    kind: text("kind", { enum: ["access", "refresh"] }).notNull(),
    secret_hash: text("secret_hash").notNull(),
    expires_at: text("expires_at").notNull(),
    rotated_from: text("rotated_from"),
    last_used_at: text("last_used_at")
  },
  (table) => [
    index("idx_mcp_oauth_token_grant").on(table.grant_id),
    uniqueIndex("idx_mcp_oauth_token_rotated_from").on(table.rotated_from)
  ]
);
