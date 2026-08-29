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
 * The MCP OAuth 2.1 authorization-server + resource-metadata surface
 * (`docs/mcp-oauth-design.md`, `routes/oauth-as.ts`). Every one of these
 * paths authenticates on its own terms — well-known documents carry no
 * per-caller state, and `/oauth/authorize|token|register|revoke` validate a
 * client, a PKCE verifier, or a bearer token, never a session. The two
 * well-known prefixes are matched with `startsWith` so the path-aware form
 * (`…/oauth-protected-resource/mcp`) and the root form
 * (`…/oauth-protected-resource`) both clear under one entry, same as the
 * file's other prefix rules.
 *
 * `/oauth/consent` is deliberately absent: it is an SPA page, not an API
 * route, and its data comes from an authenticated tRPC call
 * (`agentAccess.getOauthRequest`) that goes through the normal auth hook.
 * Exempting it here would serve the page's HTML shell to a caller with no
 * session, which is fine, but the shell carries no data — the tRPC calls it
 * makes still require login, so there is nothing to gain and a naming
 * collision with the four API paths to avoid.
 */
export function isPublicMcpOauthAsRequest(pathname: string): boolean {
  return (
    pathname.startsWith("/.well-known/oauth-protected-resource") ||
    pathname.startsWith("/.well-known/oauth-authorization-server") ||
    pathname === "/oauth/authorize" ||
    pathname === "/oauth/token" ||
    pathname === "/oauth/register" ||
    pathname === "/oauth/revoke"
  );
}

/**
 * The two routes a deployed mini app is served from: read the app, and mint
 * the short-lived session its runs go through. Both take the deployment token
 * from the path, and that token is the credential — an unguessable 24-byte
 * secret its owner minted and can revoke.
 *
 * The prefix is exact and shallow (`/api/apps/`, not `/api/applications/`) so
 * it can never widen onto the owner-scoped application routes, which read the
 * caller's own library and stay behind auth. Nothing here reads a caller's
 * identity: both handlers resolve everything from the token, and both refuse
 * outside production, where the surface does not exist at all.
 */
export function isPublicAppDeploymentRequest(
  pathname: string,
  method: string
): boolean {
  if (!pathname.startsWith("/api/apps/")) return false;
  const rest = pathname.slice("/api/apps/".length);
  if (rest === "") return false;
  if (method === "GET") return !rest.includes("/");
  if (method === "POST") return rest.endsWith("/session");
  return false;
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
    isPublicWorkflowMetadataRequest(pathname, method) ||
    isPublicAppDeploymentRequest(pathname, method) ||
    isPublicMcpOauthAsRequest(pathname)
  );
}
