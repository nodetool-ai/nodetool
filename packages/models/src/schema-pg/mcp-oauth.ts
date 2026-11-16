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
    revoked_at: text("revoked_at"),
    /**
     * `mcp` for an MCP client connection, `native` for a device session of the
     * native apps. A grant holds exactly one scope, and `kind` repeats it so
     * the Settings lists can filter without parsing scopes.
     */
    kind: text("kind", { enum: ["mcp", "native"] }).notNull().default("mcp"),
    /** The native app that signed in (`node-editor` or `timeline`). */
    app_name: text("app_name"),
    /** The device name the native app sent, shown in Settings. */
    device_name: text("device_name"),
    /** When a token of this grant last authenticated a request, at most once a minute. */
    last_used_at: text("last_used_at"),
    /**
     * SHA-256 of the native session's revocation handle (`nth_…`). The
     * handle ends this grant without any other credential.
     */
    revocation_handle_hash: text("revocation_handle_hash")
  },
  (table) => [
    index("idx_mcp_oauth_grant_user").on(table.user_id),
    uniqueIndex("idx_mcp_oauth_grant_revocation_handle").on(
      table.revocation_handle_hash
    )
  ]
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

export const oauthPendingEntries = pgTable(
  "oauth_pending_entries",
  {
    id: text("id").primaryKey(),
    entry_type: text("entry_type", { enum: ["request", "code"] }).notNull(),
    /** The approving user of a code row, null for a request row. */
    user_id: text("user_id"),
    payload: jsonText<Record<string, unknown>>()("payload").notNull(),
    created_at: text("created_at").notNull(),
    consumed_at: text("consumed_at")
  },
  (table) => [index("idx_oauth_pending_created").on(table.created_at)]
);
