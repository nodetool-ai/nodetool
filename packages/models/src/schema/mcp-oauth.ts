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

/**
 * Short-lived authorize-flow state shared by every server process: a parked
 * `/oauth/authorize` request while the user is on the consent page, and the
 * authorization code minted on approval. A row lives at most 10 minutes. The
 * id of a request row is the `request_id` handed to the consent page; the id
 * of a code row is the SHA-256 of the code, so a database read cannot redeem
 * one. `user_id` names who approved a code, so an erasure request reaches
 * it. `consumed_at` marks a spent code, which is what makes a replay
 * detectable while the row lives.
 */
export const oauthPendingEntries = sqliteTable(
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
