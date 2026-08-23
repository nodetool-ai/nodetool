import { sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { jsonText } from "./helpers.js";

/**
 * A dynamically registered MCP OAuth client (RFC 7591). `id` is `ntc_…` and
 * doubles as the public `client_id` — DCR issues no secret, so there is
 * nothing else to store credential-wise. A client identified by a
 * `https://…` URL (CIMD) is never a row here; its identity is the URL itself.
 */
export const mcpOauthClients = sqliteTable("mcp_oauth_clients", {
  id: text("id").primaryKey(),
  client_name: text("client_name").notNull(),
  redirect_uris: jsonText<string[]>()("redirect_uris").notNull(),
  created_at: text("created_at").notNull(),
  /** Null until the client completes an authorization or token request. */
  last_used_at: text("last_used_at")
});

/**
 * One consent per (user, client): what a user approved, and the unit the
 * settings UI revokes. `client_id` is either a `ntc_…` row id or a CIMD URL;
 * `client_name` is denormalized so the UI never has to resolve it back.
 */
export const mcpOauthGrants = sqliteTable(
  "mcp_oauth_grants",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    client_id: text("client_id").notNull(),
    client_name: text("client_name").notNull(),
    scope: text("scope").notNull(),
    resource: text("resource").notNull(),
    created_at: text("created_at").notNull(),
    /** Null while the grant is active. */
    revoked_at: text("revoked_at")
  },
  (table) => [index("idx_mcp_oauth_grant_user").on(table.user_id)]
);

/**
 * An access or refresh token minted for a grant. Only `secret_hash` is
 * stored — same scheme as `access_tokens` — so a row cannot be turned back
 * into the plaintext token. `rotated_from` links a refresh token to the one
 * it replaced, which is what makes presenting an already-rotated-out token
 * detectable as reuse.
 */
export const mcpOauthTokens = sqliteTable(
  "mcp_oauth_tokens",
  {
    id: text("id").primaryKey(),
    grant_id: text("grant_id").notNull(),
    kind: text("kind", { enum: ["access", "refresh"] }).notNull(),
    secret_hash: text("secret_hash").notNull(),
    expires_at: text("expires_at").notNull(),
    /** Id of the refresh token this one replaced, when it is a rotation. */
    rotated_from: text("rotated_from"),
    last_used_at: text("last_used_at")
  },
  (table) => [
    index("idx_mcp_oauth_token_grant").on(table.grant_id),
    uniqueIndex("idx_mcp_oauth_token_rotated_from").on(table.rotated_from)
  ]
);
