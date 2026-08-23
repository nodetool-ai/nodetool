# MCP OAuth — Implementation Tasks

Source design: [docs/mcp-oauth-design.md](docs/mcp-oauth-design.md). Read it first.
Branch: `claude/mcp-oauth-flow-hcxdp3`.

Six tasks in three waves. Tasks in the same wave run in parallel and own
**disjoint file sets** — never edit a file another task owns. Wave N+1 codes
against the contracts pinned here, which wave N implements exactly. Do not
rename anything in a pinned contract; if a contract is wrong, stop and report
instead of improvising.

Rules for every task:

- Do NOT commit or push. Leave changes in the working tree.
- Do NOT edit files outside your ownership list.
- Follow AGENTS.md: no `any`, ES modules with `.js` import extensions in
  compiled output, inter-package imports via `@nodetool-ai/<pkg>`, Vitest in
  `packages/`, tests in `__tests__/` or `tests/` matching the package's
  existing layout.
- Run your package's own tests (`npm run test --workspace=packages/<name>`)
  and fix failures before finishing. Do not run the full repo suite.
- Every new check/test must be seen failing once (invert an assertion, run,
  restore) — say in your report which one you inverted.

## Shared contracts (pinned)

### Token formats

Mirror `packages/models/src/access-token.ts` (`ntk_`) exactly:

| Prefix | Meaning | Shape |
|---|---|---|
| `nta_` | OAuth access token | `nta_<id>_<secret>`, id = 8 random bytes hex, secret = 32 bytes base64url, SHA-256(secret) stored |
| `ntr_` | OAuth refresh token | same shape |
| `ntc_` | Dynamically registered client id | `ntc_<16 bytes hex>`, no secret |

Lifetimes: access 3600 s, refresh 30 days absolute, authorization code 600 s,
pending authorize request 600 s, DCR client rows GC'd after 30 days with no
grant.

### Scope and endpoints

Single scope string: `mcp`. Endpoints (all on the websocket Fastify app):

```
GET  /.well-known/oauth-protected-resource/mcp
GET  /.well-known/oauth-protected-resource
GET  /.well-known/oauth-authorization-server
GET  /oauth/authorize
POST /oauth/token
POST /oauth/register
POST /oauth/revoke
```

Public URL and mount gating come from `packages/websocket/src/lib/mcp-mount.ts`
(`configuredMcpUrl`, `isMcpHttpEnabled`) — never re-derive from env directly.
New env var: `NODETOOL_DISABLE_MCP_OAUTH` ("1" disables challenge + AS routes).

### Model API (implemented by T1, consumed by T3/T4/T6)

New module `packages/models/src/mcp-oauth.ts`, exported from the package index:

```ts
export const MCP_OAUTH_ACCESS_TTL_MS: number;      // 3_600_000
export const MCP_OAUTH_REFRESH_TTL_MS: number;     // 30 days

export class McpOauthClient {
  static create(input: { client_name: string; redirect_uris: string[] }): Promise<{ id: string }>; // ntc_…
  static get(id: string): Promise<{ id: string; client_name: string; redirect_uris: string[] } | null>;
  static touch(id: string): Promise<void>;          // last_used_at, rate-limited like AccessToken.touch
  static gcUnused(olderThanMs: number): Promise<number>; // delete rows with no grant, older than cutoff
}

export class McpOauthGrant {
  static create(input: { user_id: string; client_id: string; client_name: string; scope: string; resource: string }): Promise<{ id: string }>;
  static get(id: string): Promise<McpOauthGrantRow | null>;
  static listForUser(user_id: string): Promise<McpOauthGrantRow[]>;   // active only
  static revoke(user_id: string, id: string): Promise<boolean>;      // sets revoked_at, deletes tokens
}

export class McpOauthToken {
  // Mints an access+refresh pair for a grant. Returns raw tokens (only time they exist in the clear).
  static mintPair(grant_id: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }>;
  // Full verification: parse nta_, hash-compare (timingSafeEqual), expiry, grant not revoked.
  static verifyAccess(token: string): Promise<{ userId: string; grantId: string; resource: string } | null>;
  // Rotation. Old refresh token invalidated. Presenting a rotated-out token
  // (matched via rotated_from lineage) revokes the whole grant and returns
  // { reuseDetected: true }.
  static rotateRefresh(token: string): Promise<
    | { accessToken: string; refreshToken: string; expiresAt: Date; grantId: string }
    | { reuseDetected: true }
    | null>;
  static revokeByRawToken(token: string): Promise<boolean>;          // for /oauth/revoke, nta_ or ntr_
}
```

`McpOauthGrantRow` = `{ id, user_id, client_id, client_name, scope, resource, created_at, revoked_at: Date | null }`.

### OAuth core lib API (implemented by T2, consumed by T3/T6)

New directory `packages/websocket/src/oauth/`:

```ts
// metadata.ts
export function buildProtectedResourceMetadata(publicUrl: string): ProtectedResourceMetadata;
export function buildAuthServerMetadata(publicUrl: string): AuthServerMetadata;
// exactly the JSON documents in the design doc §"Protected resource metadata"
// and §"Authorization server metadata"; resource/issuer derived from publicUrl
// with trailing slash stripped and lowercase scheme+host.

// www-authenticate.ts
export function buildBearerChallenge(input: { publicUrl: string; error?: "invalid_token" }): string;
// → `Bearer resource_metadata="<publicUrl>/.well-known/oauth-protected-resource/mcp", scope="mcp"`
//   plus `, error="invalid_token"` when set.

// validate.ts
export function isAllowedRedirectUri(uri: string): boolean;   // https://…, or http on 127.0.0.1/localhost
export function canonicalResource(publicUrl: string): string; // "<publicUrl>/mcp", normalized
export function resourceMatches(requested: string | undefined, publicUrl: string): boolean; // absent = ok
export function validateScope(scope: string | undefined): { ok: true; scope: "mcp" } | { ok: false };

// pkce.ts — thin wrapper over PKCEHelper from @nodetool-ai/runtime
export function verifyS256(codeVerifier: string, codeChallenge: string): boolean; // constant-time

// pending-store.ts — in-memory, TTL-swept (model on oauthStateStore in ../oauth-api.ts)
export interface PendingAuthorizeRequest {
  id: string;                       // request_id handed to the SPA
  clientId: string; clientName: string; redirectUri: string;
  codeChallenge: string; scope: "mcp"; resource: string;
  state?: string; redirectHostIsLoopbackOnly: boolean;
  createdAt: number;
}
export class PendingStore {
  putRequest(r: Omit<PendingAuthorizeRequest, "id" | "createdAt">): string;   // returns id
  takeRequestForApproval(id: string): PendingAuthorizeRequest | null;         // read w/o consuming
  consumeRequest(id: string): PendingAuthorizeRequest | null;                 // approve/deny consumes
  putCode(input: { request: PendingAuthorizeRequest; userId: string }): string; // returns code (32B base64url)
  consumeCode(code: string): { request: PendingAuthorizeRequest; userId: string; consumedBefore: boolean } | null;
  // consumedBefore=true → caller must revoke tokens issued from this code (replay rule)
}
export const pendingStore: PendingStore;  // module singleton, 600s TTLs

// cimd.ts
export function isClientIdUrl(clientId: string): boolean;  // https URL with a path
export function fetchClientMetadata(clientIdUrl: string): Promise<
  | { ok: true; clientName: string; redirectUris: string[] }
  | { ok: false; error: string }>;
// via safeFetch from @nodetool-ai/runtime; 64KB cap, 5s timeout;
// document.client_id must equal clientIdUrl exactly; requires client_id,
// client_name, redirect_uris; in-memory cache respecting Cache-Control
// max-age (default 300s, cap 3600s).
```

### tRPC contract (implemented by T4, consumed by T5)

Procedures on the existing `agentAccess` router
(`packages/websocket/src/trpc/routers/agent-access.ts`), Zod schemas in
`@nodetool-ai/protocol` beside the existing agent-access schemas:

```
agentAccess.getOauthRequest    query  { request_id } → { client_name, redirect_host, scope,
                                                          loopback_only: boolean } | null
agentAccess.approveOauthRequest mutation { request_id } → { redirect_url }  // code+state+iss appended
agentAccess.denyOauthRequest    mutation { request_id } → { redirect_url }  // error=access_denied+state+iss
agentAccess.listOauthGrants     query  {} → { grants: [{ id, client_name, client_id,
                                                          created_at, scope }] }
agentAccess.revokeOauthGrant    mutation { grant_id } → { ok: boolean }
```

All five require an authenticated user (existing tRPC auth context); approve
records that user as the grant's `user_id`.

### Route plugin (implemented by T3, registered by T6)

`packages/websocket/src/routes/oauth-as.ts` exporting a `FastifyPluginAsync`
named `oauthAsRoutes` that registers ALL seven endpoints above. It must be
self-contained: no edits to `server.ts`. `GET /oauth/authorize` validates and
302s to `/oauth/consent?request_id=<id>` (SPA route). Token endpoint error
bodies per OAuth 2.1: `{ error, error_description }` with 400/401.

---

## Wave 1 (parallel)

### T1 — models: tables + token model

**Owns:** `packages/models/src/mcp-oauth.ts`,
`packages/models/src/schema/mcp-oauth*.ts`,
`packages/models/src/schema-pg/mcp-oauth*.ts`, the package's schema index /
export barrel entries for these, migration files if the package generates
them, `packages/models/**/__tests__/mcp-oauth*` (or `tests/`, matching the
package layout).

Implement the three tables from the design doc §"Token model and storage" and
the Model API contract above. Copy the mechanics of
`packages/models/src/access-token.ts` (random id/secret, SHA-256 +
`timingSafeEqual`, `touch` rate limiting, expired-row deletion on verify) and
`schema/access-tokens.ts` + `schema-pg/access-tokens.ts` for both dialects.
Check how existing tables register (schema index, drizzle migrations — follow
whatever `access_tokens` did, including any migration-generation npm script in
the package).

Tests (Vitest, in-memory/temp sqlite like the existing model tests): mint →
verify roundtrip; wrong secret fails; expired access token fails and is
deleted; revoke(grant) kills both tokens; rotateRefresh invalidates the old
token; presenting the rotated-out token returns `{ reuseDetected: true }` and
the grant's remaining tokens stop verifying; `gcUnused` deletes only
grant-less old clients.

### T2 — websocket: OAuth core lib

**Owns:** `packages/websocket/src/oauth/**` (new),
`packages/websocket/tests/oauth-core*.test.ts` (or the package's test dir).

Implement the OAuth core lib API contract above. Read
`packages/websocket/src/oauth-api.ts` for the TTL-store pattern and
`packages/runtime/src/providers/oauth/pkce-helper.ts` before writing
`pkce.ts`. `cimd.ts` uses `safeFetch` from `@nodetool-ai/runtime` — read its
signature first; on any fetch/parse/validation failure return
`{ ok: false, error }`, never throw. Pure functions take `publicUrl` as a
parameter — nothing in this lib reads env.

Tests: metadata documents match the design doc JSON byte-for-byte (given a
fixed publicUrl, including trailing-slash and uppercase-host normalization);
challenge string format; redirect-uri allowlist (https ok, `http://127.0.0.1:8080/cb`
ok, `http://evil.com` no, `myapp://cb` no); resource matching (absent ok,
exact ok, other-host no); PKCE S256 vector (RFC 7636 appendix B); pending
store TTL expiry, single-consume, and `consumedBefore` on double code
consumption; CIMD with an injected fetch double — client_id mismatch,
missing fields, oversize body, and the happy path.

Note: this package has no DB access in these files — do not import
`@nodetool-ai/models` here.

## Wave 2 (parallel, after wave 1 lands)

### T3 — websocket: AS + well-known route plugin

**Owns:** `packages/websocket/src/routes/oauth-as.ts` (new),
`packages/websocket/tests/oauth-as-routes*.test.ts`.

Implement the Route plugin contract using T1's models and T2's lib. Model the
plugin file on an existing plugin in `src/routes/` (e.g. `health.ts` /
`oauth.ts`). Behavior:

- Well-known endpoints: 200 JSON via T2 builders when `configuredMcpUrl()`
  resolves, 404 otherwise. `Cache-Control: public, max-age=3600`.
- `GET /oauth/authorize`: validate client (CIMD fetch for URL client_ids /
  `McpOauthClient.get` for `ntc_`), redirect_uri ∈ registered set,
  `code_challenge` present with `code_challenge_method=S256`, scope, resource.
  Pre-redirect-validation failures render a plain-text/HTML 400 — never
  redirect. Valid → `pendingStore.putRequest` → 302 to
  `/oauth/consent?request_id=…`.
- `POST /oauth/token` (urlencoded): the two grants per design doc §"Token
  endpoint", including code replay → revoke issued tokens, and refresh reuse →
  grant revoked. Errors: `invalid_grant`, `invalid_request`,
  `unsupported_grant_type` with correct status codes.
- `POST /oauth/register`: validate redirect_uris via T2, create `ntc_` row,
  return RFC 7591 response (`client_id`, `client_id_issued_at`, echo
  metadata, `token_endpoint_auth_method: "none"`). Reject confidential-client
  requests (`token_endpoint_auth_method` other than "none") with
  `invalid_client_metadata`.
- `POST /oauth/revoke`: `McpOauthToken.revokeByRawToken`, always 200 (RFC
  7009).

Tests: fastify.inject-based route tests covering the happy path end to end
(register → authorize → consume request via pendingStore directly to fake
approval → token with correct verifier) plus every rejection: bad
redirect_uri, missing/plain PKCE, wrong verifier, expired code, code replay
revokes tokens, refresh rotation + reuse, resource mismatch, unknown client.

### T4 — tRPC + protocol schemas

**Owns:** `packages/websocket/src/trpc/routers/agent-access.ts` (extend),
its test file, and the agent-access schema module in `packages/protocol`
(find it via the existing import in that router; extend in place).

Implement the tRPC contract. `approveOauthRequest`:
`pendingStore.consumeRequest` → `McpOauthGrant.create` (user from ctx) →
`pendingStore.putCode` → build redirect URL with `code`, echoed `state`, and
`iss` = public URL (from `configuredMcpUrl()`'s origin). `denyOauthRequest`:
consume + redirect URL with `error=access_denied`, `state`, `iss`. Null/expired
request_id → TRPCError NOT_FOUND. Follow the router's existing patterns for
auth context and error shape. Tests mirror the router's existing test style;
cover approve happy path (URL contains code+state+iss), deny, expired request,
revoke grant, and that list excludes revoked grants.

### T5 — web UI: consent page + connected clients

**Owns:** `web/src/components/oauth/**` (new),
the consent route registration in web's router file (smallest possible diff),
`web/src/components/menus/AgentAccessSection.tsx` (extend),
matching `__tests__` files.

Consent page at SPA route `/oauth/consent` (query `request_id`): fetch via
`agentAccess.getOauthRequest`; render client_name, redirect host, scope, and a
warning banner when `loopback_only`; Approve/Deny buttons call the mutations
and `window.location.assign(redirect_url)`. Null request → "request expired"
state. Use ui_primitives only (no raw MUI), design tokens per docs/DESIGN.md,
TanStack Query per repo rules. In `AgentAccessSection.tsx` add a "Connected
MCP clients" list (name, created date, revoke button with confirm) from
`listOauthGrants`, invalidating the query after revoke. Jest + RTL tests:
consent renders fields and warning, approve navigates to returned URL, expired
state, grant list renders and revoke calls mutation.

## Wave 3 (single agent, after wave 2)

### T6 — wiring, integration, docs

**Owns:** `packages/websocket/src/server.ts`,
`packages/websocket/src/lib/ws-upgrade.ts`,
`packages/websocket/src/lib/public-routes.ts`,
`packages/websocket/src/mcp-server.ts`,
`packages/websocket/src/lib/mcp-mount.ts` (if a helper is needed),
`docs/mcp-production.md`, `docs/url-egress-inventory.md`, `AGENTS.md` (env
var table only), integration test file.

1. Register `oauthAsRoutes` beside the other route plugins in `server.ts`.
2. `public-routes.ts`: exempt `/.well-known/oauth-protected-resource`,
   `/.well-known/oauth-authorization-server`, `/oauth/authorize`,
   `/oauth/token`, `/oauth/register`, `/oauth/revoke` (prefix-safe, per the
   file's own doc-comment rules).
3. SPA-fallback exclusion list in `server.ts`: add `/.well-known/` and
   `/oauth/` (but NOT `/oauth/consent` — that one must reach the SPA).
4. `ws-upgrade.ts` `denyUnauthorized`: optional challenge param; `server.ts`
   auth hook passes `buildBearerChallenge(...)` for `/mcp` requests when the
   flow is enabled (mcp mounted, `configuredMcpUrl()` non-null,
   `NODETOOL_DISABLE_MCP_OAUTH !== "1"`).
5. Auth hook: before the `ntk_` branch, an `nta_` branch —
   `McpOauthToken.verifyAccess`; valid AND `req.url` startsWith `/mcp` AND
   stored resource === `canonicalResource(publicUrl)` → set `req.userId`;
   valid but wrong path/resource → deny with `invalid_token` challenge.
6. `scopeRefusal()` path in `mcp-server.ts`: attach the challenge header to
   its 401.
7. Integration test (fastify.inject against a built test server, modeled on
   existing server tests): unauthenticated `/mcp` POST carries the
   WWW-Authenticate header with the right resource_metadata URL; full flow
   register→authorize→approve(tRPC)→token→authenticated `/mcp` initialize
   succeeds; the same `nta_` token on `/api/workflows` is 401; `ntk_` on
   `/mcp` still works; `NODETOOL_DISABLE_MCP_OAUTH=1` removes header and
   routes.
8. Docs: rewrite `docs/mcp-production.md` around browser connect (token paste
   demoted to fallback); add the CIMD fetch row to
   `docs/url-egress-inventory.md`; add `NODETOOL_DISABLE_MCP_OAUTH` wherever
   env vars are tabled.
9. Final gate: `npm run test:affected`, `npm run typecheck`, `npm run lint`
   all green; report exact outputs.
