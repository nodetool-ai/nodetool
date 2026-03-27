# Supabase Auth Middleware — Design Spec

**Date:** 2026-03-21
**Branch:** feat/ts-backend-migration

---

## Problem

The TypeScript Fastify server (`packages/websocket/src/server.ts`) was migrated from Python without wiring up authentication. The `@nodetool/auth` package contains a fully-implemented `SupabaseAuthProvider`, auth middleware helpers, and token extraction utilities — none of which are registered. All requests fall through to routes that default to `userId = "1"`.

`@nodetool/auth` is already listed as a dependency in `packages/websocket/package.json` — no package.json change is needed.

---

## Goal

Wire `SupabaseAuthProvider` into the Fastify server as a global `onRequest` hook so that:

- **Supabase configured** (`SUPABASE_URL` + `SUPABASE_KEY` both present): all non-public requests must carry a valid JWT, or receive 401.
- **Dev mode** (neither env var set): requests from localhost get `userId = "1"`; remote requests receive 401.

---

## Architecture

### Auth initialization in `server.ts`

At startup, before registering any route plugins:

```typescript
const supabaseUrl = process.env["SUPABASE_URL"];
const supabaseKey = process.env["SUPABASE_KEY"];
const supabaseMode = Boolean(supabaseUrl && supabaseKey);
const supabaseProvider = supabaseMode
  ? new SupabaseAuthProvider({ supabaseUrl: supabaseUrl!, supabaseKey: supabaseKey! })
  : null;
```

### TypeScript type augmentation

Declare the `userId` field on `FastifyRequest`. Place this either at the top of `server.ts` or in a dedicated `fastify.d.ts` file in the websocket package:

```typescript
declare module "fastify" {
  interface FastifyRequest {
    userId: string | null;
  }
}
```

Register the decoration before any `app.register()` calls:

```typescript
app.decorateRequest("userId", null);
```

### The `onRequest` hook

Register once, before all route plugins:

```typescript
app.addHook("onRequest", async (req, reply) => {
  // 1. Public routes — skip auth entirely
  // Split off query string before comparing to avoid /health?foo=bar bypassing the check
  const pathname = req.url.split("?")[0];
  if (pathname === "/health" || req.url.startsWith("/api/oauth/")) {
    return;
  }

  // 2. Determine token source
  const isWs = req.headers["upgrade"]?.toLowerCase() === "websocket";
  let token: string | null = null;

  if (isWs) {
    // Extract from ?api_key= using the provider's built-in utility
    const searchParams = new URLSearchParams(req.url.split("?")[1] ?? "");
    token = (supabaseProvider ?? new LocalAuthProvider()).extractTokenFromWs(
      req.headers as Record<string, string>,
      searchParams
    );
  } else {
    token = (supabaseProvider ?? new LocalAuthProvider()).extractTokenFromHeaders(
      req.headers as Record<string, string>
    );
  }

  // 3. Supabase mode: enforce JWT
  if (supabaseMode) {
    if (!token) {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }
    const result = await supabaseProvider!.verifyToken(token);
    if (!result.ok) {
      reply.status(401).send({ error: result.error ?? "Unauthorized" });
      return;
    }
    req.userId = result.userId ?? null;
    return;
  }

  // 4. Dev mode: localhost-only, no JWT validation
  // Use req.socket.remoteAddress (not req.ip) because trustProxy: true makes
  // req.ip reflect x-forwarded-for, which can be spoofed.
  // Note: when running behind a local reverse proxy (e.g., nginx on the same
  // host), remoteAddress will be 127.0.0.1 even for remote clients — this
  // is a known limitation of dev mode.
  const remoteAddr = req.socket.remoteAddress ?? "";
  const isLocalhost = remoteAddr === "127.0.0.1" || remoteAddr === "::1";
  if (!isLocalhost) {
    reply.status(401).send({ error: "Remote access requires authentication" });
    return;
  }
  req.userId = "1";
  // Token is ignored in dev mode — no Supabase provider to validate it with.
});
```

**Key points:**
- `req.userId` is always a string (`"1"` or a real UUID) for any request that reaches a route handler. Null stays null only for public routes where handlers don't need it.
- `trustProxy: true` is already set at line 271 of `server.ts`, so `req.ip` would reflect `x-forwarded-for`. Using `req.socket.remoteAddress` avoids this.

### Propagating `userId` into Web API Request handlers

`bridge.ts` constructs a Web API `Request` by copying all Fastify request headers. All route handlers read `userId` via local `getUserId(request, "x-user-id")` helpers (there are at least four private copies: `http-api.ts`, `workspace-api.ts`, `users-api.ts`, `cost-api.ts`).

**Solution**: After the header-copy loop in `bridge.ts`, inject the authenticated `userId` as the `x-user-id` header:

```typescript
// After the existing header-copy loop:
if (req.userId != null) {
  headers.set("x-user-id", req.userId);
}
```

Because all allowed requests exit the hook with `req.userId` set to a non-null string, this injection always fires for protected routes. All existing `getUserId()` implementations continue to work without changes.

### Propagating `userId` into WebSocket routes

`UnifiedWebSocketRunner` already accepts `userId?: string` in its constructor options (line 266 of `unified-websocket-runner.ts`). The constructor stores `this.userId = options.userId ?? null`, and `connect()` applies `this.userId = this.userId ?? "1"` as a final fallback.

Update `/ws` in `plugins/websocket.ts` to pass the authenticated userId:

```typescript
app.get("/ws", { websocket: true }, (socket, req) => {
  const runner = new UnifiedWebSocketRunner({
    userId: req.userId ?? "1",
    resolveExecutor: ...,
    // other options unchanged
  });
  void runner.run(new WsAdapter(socket)).catch(...);
});
```

`/ws/terminal` and `/ws/download` don't use `userId` in their business logic — the `onRequest` hook handles authentication for them; no further changes needed to those handlers.

---

## Public routes

| Route | Match | Reason |
|---|---|---|
| `/health` | `req.url.split("?")[0] === "/health"` (pathname exact) | Load balancer / monitoring health checks |
| `/api/oauth/*` | `req.url.startsWith("/api/oauth/")` (prefix) | OAuth callback/initiation must be reachable unauthenticated |

The trailing slash in `/api/oauth/` ensures `/api/oauth-anything` is not accidentally bypassed.

---

## Error handling

All 401 responses: `Content-Type: application/json`.

| Scenario | Status | Body |
|---|---|---|
| No token on protected HTTP route | 401 | `{ "error": "Unauthorized" }` |
| No `?api_key=` on protected WS upgrade | 401 | `{ "error": "Unauthorized" }` |
| Malformed Authorization header (not Bearer format) | 401 | `{ "error": "Unauthorized" }` |
| Invalid or expired JWT | 401 | `{ "error": "<supabase error message>" }` |
| Remote request in dev mode (no Supabase) | 401 | `{ "error": "Remote access requires authentication" }` |

---

## Files to change

| File | Change |
|---|---|
| `packages/websocket/src/server.ts` | Add type augmentation, `decorateRequest`, instantiate `SupabaseAuthProvider`, register `onRequest` hook |
| `packages/websocket/src/lib/bridge.ts` | Inject `req.userId` as `x-user-id` header before building Web API `Request` |
| `packages/websocket/src/plugins/websocket.ts` | Pass `req.userId ?? "1"` to `UnifiedWebSocketRunner` constructor; rename `_req` to `req` in `/ws` handler |

No route files, no `getUserId` implementations, and no `package.json` need to change.

---

## Out of scope

- Frontend changes to pass `?api_key=` on WebSocket connections
- Token refresh logic (handled by Supabase client on frontend)
- Role-based access control (RBAC)
- Consolidating the four private `getUserId` copies (separate cleanup task)
