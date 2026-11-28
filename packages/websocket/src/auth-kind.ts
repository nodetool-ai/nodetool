/**
 * Which credential authenticated a request. The auth hook in `server.ts` sets
 * it next to `userId`, and `interactiveProcedure` reads it: a procedure that
 * creates a credential accepts only an interactive sign-in.
 *
 * - `local`: the trusted local user, by loopback or a trusted local network.
 * - `session`: a browser sign-in session, Supabase or SSO (`nts_`).
 * - `server_token`: the `SERVER_AUTH_TOKEN` a local-mode deployment starts with.
 * - `api_user`: a token of a user in `USERS_FILE`, local mode only.
 * - `access_token`: a personal access token (`ntk_`).
 * - `native`: a native device session access token (`ntd_`).
 * - `mcp`: an MCP OAuth access token (`nta_`).
 * - `app_session`: a deployed mini app's session token (`nda_`).
 * - `delegated`: a messaging bridge acting as a linked user.
 */
export type AuthKind =
  | "local"
  | "session"
  | "server_token"
  | "api_user"
  | "access_token"
  | "native"
  | "mcp"
  | "app_session"
  | "delegated";

/**
 * The credentials a person signs in with directly. `server_token` and
 * `api_user` are the sign-in credential of a local-mode deployment, the way
 * `session` is under Supabase or SSO. Every other kind was created from one
 * of these and may not create further credentials.
 */
const INTERACTIVE_AUTH_KINDS: ReadonlySet<AuthKind> = new Set<AuthKind>([
  "local",
  "session",
  "server_token",
  "api_user"
]);

export function isInteractiveAuthKind(kind: AuthKind | null | undefined): boolean {
  return kind != null && INTERACTIVE_AUTH_KINDS.has(kind);
}
