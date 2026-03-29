# Supabase Auth Middleware Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `SupabaseAuthProvider` into the Fastify server as a global `onRequest` hook that enforces JWT auth when Supabase env vars are set, and restricts dev mode to localhost-only.

**Architecture:** A single `onRequest` Fastify hook validates tokens before every non-public request, sets `req.userId`, and the `bridge.ts` adapter forwards that value as the `x-user-id` header into all Web API handlers — requiring zero changes to existing route code.

**Tech Stack:** Fastify v5, `@nodetool/auth` (`SupabaseAuthProvider`, `LocalAuthProvider`), Vitest

**Spec:** `docs/superpowers/specs/2026-03-21-supabase-auth-middleware-design.md`

---

## Chunk 1: Inject `userId` into the bridge layer

**Files:**
- Modify: `packages/websocket/src/lib/bridge.ts` (add 3 lines after the header-copy loop)
- Create: `packages/websocket/tests/bridge-auth.test.ts`

The `bridge()` function converts a Fastify `FastifyRequest` into a Web API `Request`. After the existing header-copy loop we inject `x-user-id` from the Fastify `req.userId` decorator. All existing `getUserId(request, "x-user-id")` calls in route handlers then pick it up with no further changes.

### Task 1: Test and implement `x-user-id` injection in `bridge.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/websocket/tests/bridge-auth.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { bridge } from "../src/lib/bridge.js";
import type { FastifyRequest, FastifyReply } from "fastify";

function makeMockReq(overrides: Partial<FastifyRequest> = {}): FastifyRequest {
  return {
    method: "GET",
    url: "/api/something",
    headers: { host: "localhost" },
    body: null,
    userId: null,
    ...overrides,
  } as unknown as FastifyRequest;
}

function makeMockReply(): FastifyReply {
  const headers: Record<string, string> = {};
  return {
    status: () => ({ send: () => {} }),
    header: (k: string, v: string) => { headers[k] = v; },
    send: () => {},
    _headers: headers,
  } as unknown as FastifyReply;
}

describe("bridge: userId propagation", () => {
  it("sets x-user-id header when req.userId is a string", async () => {
    const req = makeMockReq({ userId: "abc-123" });
    const reply = makeMockReply();
    let capturedUserId: string | null = null;

    await bridge(req, reply, async (request) => {
      capturedUserId = request.headers.get("x-user-id");
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    expect(capturedUserId).toBe("abc-123");
  });

  it("does not set x-user-id header when req.userId is null", async () => {
    const req = makeMockReq({ userId: null });
    const reply = makeMockReply();
    let capturedUserId: string | null | undefined = undefined;

    await bridge(req, reply, async (request) => {
      capturedUserId = request.headers.get("x-user-id");
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    expect(capturedUserId).toBeNull();
  });

  it("does not override an existing x-user-id header if userId is null", async () => {
    const req = makeMockReq({
      userId: null,
      headers: { host: "localhost", "x-user-id": "from-header" },
    });
    const reply = makeMockReply();
    let capturedUserId: string | null = null;

    await bridge(req, reply, async (request) => {
      capturedUserId = request.headers.get("x-user-id");
      return new Response("{}", { status: 200 });
    });

    expect(capturedUserId).toBe("from-header");
  });
});
```

- [ ] **Step 2: Run the test — expect it to fail**

```bash
cd /Users/mg/workspace/nodetool/packages/websocket
npx vitest run tests/bridge-auth.test.ts
```

Expected: FAIL — `x-user-id` is never set because bridge doesn't inject it yet.

- [ ] **Step 3: Implement the injection in `bridge.ts`**

In `packages/websocket/src/lib/bridge.ts`, find the header-copy loop (lines 22–29) and add the injection immediately after it:

```typescript
  // Forward authenticated userId as x-user-id header for route handlers
  if ((req as { userId?: string | null }).userId != null) {
    headers.set("x-user-id", (req as { userId: string }).userId);
  }
```

The full updated section looks like:

```typescript
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }
  // Forward authenticated userId as x-user-id header for route handlers
  if ((req as { userId?: string | null }).userId != null) {
    headers.set("x-user-id", (req as { userId: string }).userId);
  }
```

Note: the cast `as { userId?: string | null }` avoids a TypeScript error before the full type augmentation is added in Task 2. Once the augmentation is in place (Task 2 step 3), you can simplify to `if (req.userId != null) { headers.set("x-user-id", req.userId); }`.

- [ ] **Step 4: Run the test — expect it to pass**

```bash
cd /Users/mg/workspace/nodetool/packages/websocket
npx vitest run tests/bridge-auth.test.ts
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Run the full test suite to check for regressions**

```bash
cd /Users/mg/workspace/nodetool/packages/websocket
npx vitest run
```

Expected: same pass/fail ratio as before (no regressions).

- [ ] **Step 6: Commit**

```bash
cd /Users/mg/workspace/nodetool
git add packages/websocket/src/lib/bridge.ts packages/websocket/tests/bridge-auth.test.ts
git commit -m "feat: inject x-user-id from req.userId in bridge adapter"
```

---

## Chunk 2: Auth `onRequest` hook in `server.ts`

**Files:**
- Modify: `packages/websocket/src/server.ts` (add import, type augmentation, decorateRequest, hook — all before the first `app.register()` call)
- Create: `packages/websocket/tests/auth-hook.test.ts`

The hook reads env vars at startup to decide mode (Supabase vs dev). In Supabase mode it validates JWTs. In dev mode it enforces localhost-only.

### Task 2: Test and implement the `onRequest` auth hook

- [ ] **Step 1: Write the failing test**

Create `packages/websocket/tests/auth-hook.test.ts`:

```typescript
/**
 * Tests for the auth onRequest hook behavior.
 * We test the hook logic in isolation by building a minimal Fastify app
 * that registers the same hook and route, then using fastify.inject().
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { SupabaseAuthProvider, LocalAuthProvider } from "@nodetool/auth";

// Helper: build a minimal Fastify app with the auth hook and a protected route
async function buildApp(opts: {
  supabaseMode: boolean;
  mockVerify?: (token: string) => Promise<{ ok: boolean; userId?: string; error?: string }>;
}): Promise<FastifyInstance> {
  const app = Fastify({ trustProxy: true, logger: false });

  // Type augmentation is global, so we just decorate here
  app.decorateRequest("userId", null);

  const provider = opts.supabaseMode
    ? new SupabaseAuthProvider({ supabaseUrl: "http://fake", supabaseKey: "fake" })
    : new LocalAuthProvider();

  if (opts.mockVerify && opts.supabaseMode) {
    vi.spyOn(provider, "verifyToken").mockImplementation(opts.mockVerify as any);
  }

  app.addHook("onRequest", async (req, reply) => {
    const pathname = req.url.split("?")[0];
    if (pathname === "/health" || req.url.startsWith("/api/oauth/")) return;

    const isWs = req.headers["upgrade"]?.toLowerCase() === "websocket";
    const searchParams = new URLSearchParams(req.url.split("?")[1] ?? "");
    const token = isWs
      ? provider.extractTokenFromWs(req.headers as Record<string, string>, searchParams)
      : provider.extractTokenFromHeaders(req.headers as Record<string, string>);

    if (opts.supabaseMode) {
      if (!token) { reply.status(401).send({ error: "Unauthorized" }); return; }
      const result = await provider.verifyToken(token);
      if (!result.ok) { reply.status(401).send({ error: result.error ?? "Unauthorized" }); return; }
      (req as any).userId = result.userId ?? null;
      return;
    }

    // Dev mode
    const remoteAddr = req.socket?.remoteAddress ?? "127.0.0.1";
    const isLocalhost = remoteAddr === "127.0.0.1" || remoteAddr === "::1";
    if (!isLocalhost) { reply.status(401).send({ error: "Remote access requires authentication" }); return; }
    (req as any).userId = "1";
  });

  app.get("/health", async () => ({ ok: true }));
  app.get("/api/oauth/callback", async () => ({ oauth: true }));
  app.get("/api/protected", async (req) => ({ userId: (req as any).userId }));

  await app.ready();
  return app;
}

describe("auth hook — dev mode (no Supabase)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ supabaseMode: false });
  });

  afterEach(async () => {
    await app.close();
  });

  it("allows /health without auth", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
  });

  it("allows /api/oauth/* without auth", async () => {
    const res = await app.inject({ method: "GET", url: "/api/oauth/callback" });
    expect(res.statusCode).toBe(200);
  });

  it("allows localhost requests and sets userId='1'", async () => {
    // fastify.inject() uses 127.0.0.1 as remoteAddress
    const res = await app.inject({ method: "GET", url: "/api/protected" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ userId: "1" });
  });
});

describe("auth hook — Supabase mode", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({
      supabaseMode: true,
      mockVerify: async (token: string) => {
        if (token === "valid-token") return { ok: true, userId: "user-42" };
        return { ok: false, error: "Invalid token" };
      },
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it("allows /health without token", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
  });

  it("returns 401 with no Authorization header", async () => {
    const res = await app.inject({ method: "GET", url: "/api/protected" });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 with invalid token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/protected",
      headers: { authorization: "Bearer bad-token" },
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ error: "Invalid token" });
  });

  it("allows request with valid token and sets userId", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/protected",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ userId: "user-42" });
  });

  it("returns 401 for WS upgrade with no api_key param", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/ws",
      headers: { upgrade: "websocket", connection: "upgrade" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 for WS upgrade with invalid api_key param", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/ws?api_key=bad-token",
      headers: { upgrade: "websocket", connection: "upgrade" },
    });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Run the test — expect it to fail**

```bash
cd /Users/mg/workspace/nodetool/packages/websocket
npx vitest run tests/auth-hook.test.ts
```

Expected: FAIL — `buildApp` is just a local helper, so the hook itself isn't in server.ts yet. The test infrastructure is valid though; some tests may pass (the local helper runs the same logic we'll put in server.ts).

- [ ] **Step 3: Add auth hook to `server.ts`**

At the top of `packages/websocket/src/server.ts`, add the import alongside existing imports:

```typescript
import { SupabaseAuthProvider, LocalAuthProvider } from "@nodetool/auth";
```

Add the TypeScript module augmentation right after the imports (before any runtime code):

```typescript
// Auth: extend FastifyRequest with userId
declare module "fastify" {
  interface FastifyRequest {
    userId: string | null;
  }
}
```

After the Fastify app is created (`const app: FastifyInstance = ...` at line 269) and **before the first `app.register()` call** (which is `app.register(fastifyCors, ...)` at line 278):

> **Critical:** `app.decorateRequest()` in Fastify v5 must be called before any `app.register()` call. Place the entire auth section between the `app` creation and the CORS registration.

Add:

```typescript
// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

const supabaseUrl = process.env["SUPABASE_URL"];
const supabaseKey = process.env["SUPABASE_KEY"];
const supabaseMode = Boolean(supabaseUrl && supabaseKey);
const supabaseProvider = supabaseMode
  ? new SupabaseAuthProvider({ supabaseUrl: supabaseUrl!, supabaseKey: supabaseKey! })
  : null;

app.decorateRequest("userId", null);

app.addHook("onRequest", async (req, reply) => {
  // Public routes — no auth required
  const pathname = req.url.split("?")[0];
  if (pathname === "/health" || req.url.startsWith("/api/oauth/")) {
    return;
  }

  // Extract token from the appropriate source
  const isWs = req.headers["upgrade"]?.toLowerCase() === "websocket";
  const searchParams = new URLSearchParams(req.url.split("?")[1] ?? "");
  const provider = supabaseProvider ?? new LocalAuthProvider();
  const token = isWs
    ? provider.extractTokenFromWs(req.headers as Record<string, string>, searchParams)
    : provider.extractTokenFromHeaders(req.headers as Record<string, string>);

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

  // Dev mode: localhost only
  // Use req.socket.remoteAddress rather than req.ip because trustProxy: true
  // makes req.ip reflect x-forwarded-for (spoofable).
  const remoteAddr = req.socket.remoteAddress ?? "";
  const isLocalhost = remoteAddr === "127.0.0.1" || remoteAddr === "::1";
  if (!isLocalhost) {
    reply.status(401).send({ error: "Remote access requires authentication" });
    return;
  }
  req.userId = "1";
});
```

- [ ] **Step 4: Simplify the cast in `bridge.ts`**

Now that the module augmentation is in place globally, simplify `bridge.ts` (remove the type casts added in Task 1):

```typescript
  // Forward authenticated userId as x-user-id header for route handlers
  if (req.userId != null) {
    headers.set("x-user-id", req.userId);
  }
```

- [ ] **Step 5: Run the auth-hook tests — expect them to pass**

```bash
cd /Users/mg/workspace/nodetool/packages/websocket
npx vitest run tests/auth-hook.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Run the full test suite**

```bash
cd /Users/mg/workspace/nodetool/packages/websocket
npx vitest run
```

Expected: no regressions.

- [ ] **Step 7: TypeScript check**

```bash
cd /Users/mg/workspace/nodetool/packages/websocket
npx tsc --noEmit
```

Expected: no errors. If `req.socket` complaints arise, add `req.socket as import("net").Socket` cast.

- [ ] **Step 8: Commit**

```bash
cd /Users/mg/workspace/nodetool
git add packages/websocket/src/server.ts packages/websocket/src/lib/bridge.ts packages/websocket/tests/auth-hook.test.ts
git commit -m "feat: add Supabase auth onRequest hook to Fastify server"
```

---

## Chunk 3: Pass `userId` into `UnifiedWebSocketRunner`

**Files:**
- Modify: `packages/websocket/src/plugins/websocket.ts` (rename `_req` to `req` in `/ws` handler; pass `userId`)

`UnifiedWebSocketRunner` already accepts `userId?: string` in its constructor options (field added at line 266). The `/ws` route currently ignores the request (`_req`). We rename it and pass the authenticated `userId` from the hook. `/ws/terminal` and `/ws/download` don't use `userId` in their handlers so they need no changes beyond what the hook already provides.

### Task 3: Thread `userId` into the WebSocket runner

There is no simple unit test for this change because `UnifiedWebSocketRunner.run()` opens a live WebSocket connection. The coverage is provided by the existing `unified-websocket-runner.test.ts` suite. We verify correctness by TypeScript type checking and running existing tests.

- [ ] **Step 1: Update `websocket.ts`**

In `packages/websocket/src/plugins/websocket.ts`, find the `/ws` route (line 38):

```typescript
  app.get("/ws", { websocket: true }, (socket, _req) => {
    ...
    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: (node) => {
```

Change `_req` to `req` and add `userId` as the first option:

```typescript
  app.get("/ws", { websocket: true }, (socket, req) => {
    ...
    const runner = new UnifiedWebSocketRunner({
      userId: req.userId ?? "1",
      resolveExecutor: (node) => {
```

Everything else in the handler stays identical.

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/mg/workspace/nodetool/packages/websocket
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run the full test suite**

```bash
cd /Users/mg/workspace/nodetool/packages/websocket
npx vitest run
```

Expected: all tests that were passing before still pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/mg/workspace/nodetool
git add packages/websocket/src/plugins/websocket.ts
git commit -m "feat: pass authenticated userId to UnifiedWebSocketRunner"
```

---

## Verification

After all three chunks are complete:

- [ ] Start the server without `SUPABASE_URL`/`SUPABASE_KEY` set and confirm a request to `http://localhost:7777/health` returns 200.
- [ ] Confirm a request to `http://localhost:7777/api/workflows` (or any protected route) from localhost returns 200 with no auth header.
- [ ] If you have Supabase credentials, set them in `.env` and confirm a request without a `Bearer` token returns 401.
