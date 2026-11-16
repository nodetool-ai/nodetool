/**
 * Constants of native device sessions: the `native` OAuth scope that the
 * node editor and the timeline app sign in with
 * (docs/plans/native-cloud-sync/technical-design.md, "Sign-in protocol").
 */

/** What a grant was approved for. */
export type OauthGrantKind = "mcp" | "native";

/** The seeded public client the native apps sign in as. Never a table row. */
export const NATIVE_CLIENT_ID = "nodetool-native";
/** Display name of the seeded native client. */
export const NATIVE_CLIENT_NAME = "NodeTool desktop apps";
/** The scope of a native device session. */
export const NATIVE_SCOPE = "native";

/** What marks a native access token. Accepted on the API, refused on `/mcp`. */
export const NATIVE_ACCESS_TOKEN_PREFIX = "ntd_";
/**
 * What marks a native session's revocation handle. The design draft named it
 * `ntr_`, which is already the refresh token prefix, so the handle uses
 * `nth_`. The authentication chain never accepts it.
 */
export const NATIVE_REVOCATION_HANDLE_PREFIX = "nth_";

/** A native access token lives 15 minutes. */
export const NATIVE_ACCESS_TTL_MS = 15 * 60_000;
/**
 * A native refresh chain ends after 90 days without a refresh. Unlike the
 * absolute 30-day MCP chain, each rotation restarts the period.
 */
export const NATIVE_REFRESH_IDLE_TTL_MS = 90 * 24 * 60 * 60_000;
