/**
 * The auth-exemption allowlist predicates used by the server's `onRequest`
 * hook.
 *
 * These live in their own module so they are testable without booting the
 * server (`server.ts` is an entry point: importing it opens the database and
 * binds a port). Getting an entry wrong here is an unauthenticated read of
 * someone's data, so each predicate is deliberately an allowlist of exact
 * paths or prefixes that carry no per-caller state.
 */

/**
 * Read-only workflow GETs that carry no per-user data: the shipped example
 * templates and workflows the owner explicitly marked `access: "public"`.
 *
 * Nothing that reads the *caller's* library belongs here. The REST handlers
 * resolve identity from the (server-set) `x-user-id` header and fall back to
 * user "1" when it is absent, so an auth-exempt route serves the local user's
 * private workflows — full graph included — to anyone who can reach the port.
 * That is exactly the disclosure the "Remote access requires authentication"
 * 401 exists to prevent, so `/api/workflows`, `/api/workflows/:id`,
 * `/api/workflows/names`, `/api/workflows/tools`, and `:id/dsl-export` all
 * stay behind auth. A genuinely public workflow is still reachable
 * unauthenticated at `/api/workflows/public/:id`.
 */
export function isPublicWorkflowMetadataRequest(
  pathname: string,
  method: string
): boolean {
  if (method !== "GET") return false;
  return (
    pathname === "/api/workflows/public" ||
    pathname.startsWith("/api/workflows/public/") ||
    pathname === "/api/workflows/examples" ||
    pathname.startsWith("/api/workflows/examples/")
  );
}

/**
 * OAuth paths reachable without a session. Only the two browser redirect
 * targets qualify: the identity provider sends the user back with no
 * `Authorization` header, and the handlers authenticate the callback through
 * the single-use PKCE `state` they minted at `/start`.
 *
 * Every other `/api/oauth/*` path reads or mutates stored credentials for the
 * caller's user id, so exempting the whole prefix let an unauthenticated
 * caller enumerate linked accounts (`/tokens`), pull the linked third-party
 * profile and email (`/hf/whoami`, `/github/user`), force token refreshes, and
 * delete credentials (`/openai/disconnect`) as user "1". The OpenAI (Codex)
 * flow needs no entry: it redirects to a loopback listener this process binds,
 * not to a server route.
 */
export function isPublicOAuthRequest(pathname: string): boolean {
  return (
    pathname === "/api/oauth/hf/callback" ||
    pathname === "/api/oauth/github/callback"
  );
}

/**
 * Paths that skip session auth in the server's `onRequest` hook. Every entry
 * must carry no per-caller private state, or authenticate on its own (webhook
 * secret, OAuth PKCE state, KIE webhook signature). All of these are still
 * covered by the global `@fastify/rate-limit` plugin registered before auth.
 */
export function isPublicAuthExemptRoute(
  pathname: string,
  method: string
): boolean {
  return (
    pathname === "/health" ||
    pathname === "/ready" ||
    pathname === "/api/health" ||
    pathname === "/api/config" ||
    isPublicOAuthRequest(pathname) ||
    pathname === "/api/assets/packages" ||
    pathname.startsWith("/api/assets/packages/") ||
    pathname === "/api/nodes/metadata" ||
    pathname.startsWith("/api/kie/webhook") ||
    pathname.startsWith("/api/webhooks/") ||
    // Messaging-integration identity routes. Like the webhook routes, they
    // authenticate themselves — every handler requires the server's
    // NODETOOL_INTEGRATION_TOKEN, compared in constant time — and they carry
    // no per-caller session. Without that env var they are not registered at
    // all, so the exemption reaches a 404.
    pathname.startsWith("/api/integrations/") ||
    isPublicWorkflowMetadataRequest(pathname, method)
  );
}
