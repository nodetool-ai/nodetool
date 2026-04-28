# tRPC Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Big-bang replacement of the JSON REST API under `/api/*` with tRPC procedures, excluding `/v1/*`, `/api/oauth/*`, `/mcp`, `/health`/`/ready`, `/admin/*`, binary/stream downloads, and `/api/nodes/metadata`. All five clients (web, mobile, cli, electron main, deploy) migrate to `@trpc/client` with end-to-end typed `AppRouter`.

**Architecture:** tRPC router composed from per-domain sub-routers in `packages/websocket/src/trpc/`, mounted on the existing Fastify instance at `/trpc` via `@trpc/server/adapters/fastify`. Zod input/output schemas live in `@nodetool/protocol/src/api-schemas/`. `AppRouter` type exported from `@nodetool/websocket/trpc` as a type-only subpath. Clients use `httpBatchLink` with `superjson` for native `Date`/`Map`/`Set` over the wire. Existing Fastify auth hook (`req.userId`) is the sole auth source; `ctx.userId` in tRPC reads it.

**Tech Stack:** tRPC v11, `@trpc/server`, `@trpc/client`, `@trpc/react-query`, zod v4, superjson, Fastify v5, TanStack Query v5, TypeScript strict.

**Reference spec:** `docs/superpowers/specs/2026-04-17-trpc-migration-design.md`

---

## File structure (end state)

### New files

```
packages/websocket/src/trpc/
  index.ts                # initTRPC + errorFormatter + procedure exports
  context.ts              # createContextFactory → createContext
  error-formatter.ts      # ApiErrorCode ↔ TRPCError mapping, throwApiError helper
  middleware.ts           # protectedProcedure
  router.ts               # appRouter; export type AppRouter
  routers/
    costs.ts              # pilot domain
    assets.ts
    collections.ts
    files.ts
    jobs.ts
    mcp-config.ts
    messages.ts
    models.ts
    nodes.ts
    settings.ts
    skills.ts
    storage.ts
    threads.ts
    users.ts
    workflows.ts
    workspace.ts
    __tests__/
      <domain>.test.ts     # one test file per router (createCaller-based)
  __tests__/
    integration.test.ts    # app.inject() smoke tests for transport + auth + error formatter

packages/protocol/src/api-schemas/
  index.ts                # re-exports
  costs.ts                # pilot
  assets.ts
  collections.ts
  files.ts
  jobs.ts
  mcp-config.ts
  messages.ts
  models.ts
  nodes.ts
  settings.ts
  skills.ts
  storage.ts
  threads.ts
  users.ts
  workflows.ts
  workspace.ts

web/src/trpc/
  client.ts               # createTRPCReact + createTRPCClient + httpBatchLink + superjson + auth
  Provider.tsx            # TRPCProvider wrapping the app (slots into existing QueryClientProvider)

mobile/src/trpc/
  client.ts
  Provider.tsx
```

### Modified files

- `packages/websocket/package.json` — add `@trpc/server`, `superjson` deps; add `./trpc` subpath export.
- `packages/protocol/package.json` — no new deps (zod already present); re-export `api-schemas/` from `src/index.ts`.
- `packages/websocket/src/server.ts` — register `fastifyTRPCPlugin` after CORS but before the not-found handler; add `/trpc` to the auth-hook bypass list only for routes that should remain unauthenticated (none currently).
- `packages/websocket/src/http-api.ts` — trim to keep only functions serving REST-staying endpoints (binary/stream/metadata/oauth/openai/admin).
- `packages/websocket/src/{collection,cost,file,models,settings,skills,storage,users,workspace}-api.ts` — **deleted** when their endpoints are fully migrated. `oauth-api.ts`, `openai-api.ts` retained.
- `packages/websocket/src/routes/{costs,settings,collections,skills,users,workspace,mcp-config,messages,threads,jobs,files,storage,nodes,models,assets,workflows}.ts` — **deleted** when fully migrated, or **shrunk** to only the binary/stream/metadata routes that stay REST.
- `web/package.json` — add `@trpc/client`, `@trpc/react-query`, `@trpc/server` (peer), `superjson`; remove `openapi-fetch`, `openapi-typescript`; delete the `openapi` script.
- `web/src/api.ts` — **deleted** (14k generated lines).
- `web/src/serverState/*.ts` — rewritten to delegate to tRPC React Query hooks; public hook signatures preserved where practical.
- `web/src/stores/ApiClient.ts` — deleted after all consumers moved to the tRPC client.
- Call sites across `web/src/` that import from `web/src/api.ts`, `@nodetool/websocket`-style URL paths, or `stores/ApiClient` — swept to tRPC.
- `mobile/` — same as web.
- `packages/cli/src/nodetool.ts` — `apiGet`/`apiPost` helpers replaced with a typed tRPC client.
- `electron/src/api.ts` — REST `fetch` replaced with typed tRPC client calls.
- `packages/deploy/src/admin-client.ts`, `packages/deploy/src/api-user-manager.ts` — REST `fetch` replaced with typed tRPC client.

---

## Phase 0 — Branch setup

### Task 0.1: Create feature branch

**Files:** none (git state)

- [ ] **Step 1: Create and switch to feature branch**

Run: `cd /Users/mg/workspace/nodetool && git checkout -b trpc-migration`
Expected: `Switched to a new branch 'trpc-migration'`

- [ ] **Step 2: Verify branch is clean**

Run: `git status`
Expected: `nothing to commit, working tree clean`

---

## Phase 1 — Foundation

### Task 1.1: Install tRPC and superjson dependencies

**Files:**
- Modify: `packages/websocket/package.json`
- Modify: `web/package.json`
- Modify: `mobile/package.json`
- Modify: `packages/cli/package.json`
- Modify: `electron/package.json`
- Modify: `packages/deploy/package.json`

- [ ] **Step 1: Add server dependencies to `packages/websocket/package.json`**

In the `dependencies` block, add (alphabetical order):

```json
"@trpc/server": "^11.0.0",
"superjson": "^2.2.2"
```

- [ ] **Step 2: Add client dependencies to `web/package.json`**

In `dependencies`:

```json
"@trpc/client": "^11.0.0",
"@trpc/react-query": "^11.0.0",
"@trpc/server": "^11.0.0",
"superjson": "^2.2.2"
```

Remove from `dependencies`:

```json
"openapi-fetch": "^0.14.0"
```

Remove from `devDependencies`:

```json
"openapi-typescript": "^7.8.0"
```

Remove the `openapi` script from `scripts`.

- [ ] **Step 3: Add client dependencies to `mobile/package.json`**

Same additions as web. Remove the same openapi entries and the `openapi` script.

- [ ] **Step 4: Add client dependency to `packages/cli/package.json`**

In `dependencies`:

```json
"@trpc/client": "^11.0.0",
"@trpc/server": "^11.0.0",
"@nodetool/websocket": "*",
"superjson": "^2.2.2"
```

Note: `@nodetool/websocket` is a type-only dep (the `./trpc` subpath is type-erased); it's added to `dependencies` because npm workspaces resolve through there. If TypeScript project-references need adjustment, see Task 1.8.

- [ ] **Step 5: Add client dependency to `electron/package.json`**

In `dependencies`:

```json
"@trpc/client": "^11.0.0",
"@trpc/server": "^11.0.0",
"@nodetool/websocket": "*",
"superjson": "^2.2.2"
```

- [ ] **Step 6: Add client dependency to `packages/deploy/package.json`**

In `dependencies`:

```json
"@trpc/client": "^11.0.0",
"@trpc/server": "^11.0.0",
"@nodetool/websocket": "*",
"superjson": "^2.2.2"
```

- [ ] **Step 7: Install**

Run: `cd /Users/mg/workspace/nodetool && npm install`
Expected: completes without errors; `package-lock.json` updates.

- [ ] **Step 8: Commit**

```bash
git add package-lock.json packages/websocket/package.json web/package.json mobile/package.json packages/cli/package.json electron/package.json packages/deploy/package.json
git commit -m "chore: add @trpc/* and superjson deps; drop openapi-fetch/openapi-typescript"
```

---

### Task 1.2: Extend `packages/websocket/package.json` exports with `./trpc` subpath

**Files:**
- Modify: `packages/websocket/package.json`

- [ ] **Step 1: Update the `exports` block**

Replace the `exports` block with:

```json
"exports": {
  ".": {
    "nodetool-dev": "./src/index.ts",
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js",
    "default": "./dist/index.js"
  },
  "./trpc": {
    "nodetool-dev": "./src/trpc/router.ts",
    "types": "./src/trpc/router.ts",
    "import": "./dist/trpc/router.js",
    "default": "./dist/trpc/router.js"
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/websocket/package.json
git commit -m "feat(websocket): add ./trpc subpath export for AppRouter type"
```

---

### Task 1.3: Create tRPC server scaffold (empty router)

**Files:**
- Create: `packages/websocket/src/types/fastify.d.ts` (module augmentation for `req.userId`)
- Create: `packages/websocket/src/trpc/index.ts`
- Create: `packages/websocket/src/trpc/error-formatter.ts`
- Create: `packages/websocket/src/trpc/context.ts`
- Create: `packages/websocket/src/trpc/middleware.ts`
- Create: `packages/websocket/src/trpc/router.ts`
- Modify: `packages/websocket/src/server.ts` (remove inline `declare module "fastify"` block)

- [ ] **Step 0: Hoist the Fastify module augmentation**

Create `packages/websocket/src/types/fastify.d.ts`:

```ts
import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    userId: string | null;
  }
}
```

Remove the inline `declare module "fastify"` block near the top of `packages/websocket/src/server.ts` (lines ~68-72). This makes the augmentation visible to all files in the package including tests.

- [ ] **Step 1: Create `error-formatter.ts`**

```ts
// packages/websocket/src/trpc/error-formatter.ts
import { TRPCError } from "@trpc/server";
import type { DefaultErrorShape } from "@trpc/server";
import { ZodError } from "zod";
import { ApiErrorCode } from "../error-codes.js";

export interface TRPCErrorCause {
  apiCode?: ApiErrorCode;
}

export interface ApiErrorShape extends DefaultErrorShape {
  data: DefaultErrorShape["data"] & {
    apiCode: ApiErrorCode | null;
    zodError: Record<string, string[]> | null;
  };
}

export function errorFormatter({
  shape,
  error
}: {
  shape: DefaultErrorShape;
  error: TRPCError;
}): ApiErrorShape {
  const cause = error.cause as TRPCErrorCause | undefined;
  const zodError =
    error.cause instanceof ZodError
      ? (error.cause.flatten().fieldErrors as Record<string, string[]>)
      : null;
  return {
    ...shape,
    data: {
      ...shape.data,
      apiCode: cause?.apiCode ?? null,
      zodError
    }
  };
}

interface ThrowApiErrorCause extends Error {
  apiCode: ApiErrorCode;
}

const TRPC_CODE_BY_API_CODE: Partial<
  Record<ApiErrorCode, TRPCError["code"]>
> = {
  [ApiErrorCode.NOT_FOUND]: "NOT_FOUND",
  [ApiErrorCode.WORKFLOW_NOT_FOUND]: "NOT_FOUND",
  [ApiErrorCode.ASSET_NOT_FOUND]: "NOT_FOUND",
  [ApiErrorCode.ALREADY_EXISTS]: "CONFLICT",
  [ApiErrorCode.INVALID_INPUT]: "BAD_REQUEST",
  [ApiErrorCode.MISSING_REQUIRED_FIELD]: "BAD_REQUEST",
  [ApiErrorCode.UNAUTHORIZED]: "UNAUTHORIZED",
  [ApiErrorCode.FORBIDDEN]: "FORBIDDEN",
  [ApiErrorCode.INTERNAL_ERROR]: "INTERNAL_SERVER_ERROR",
  [ApiErrorCode.SERVICE_UNAVAILABLE]: "INTERNAL_SERVER_ERROR",
  [ApiErrorCode.WORKFLOW_EXECUTION_FAILED]: "INTERNAL_SERVER_ERROR",
  [ApiErrorCode.ASSET_UPLOAD_FAILED]: "INTERNAL_SERVER_ERROR",
  [ApiErrorCode.PYTHON_BRIDGE_UNAVAILABLE]: "INTERNAL_SERVER_ERROR"
};

export function throwApiError(
  apiCode: ApiErrorCode,
  message: string,
  trpcCode?: TRPCError["code"]
): never {
  const resolvedCode = trpcCode ?? TRPC_CODE_BY_API_CODE[apiCode] ?? "INTERNAL_SERVER_ERROR";
  const cause: ThrowApiErrorCause = Object.assign(new Error(message), {
    apiCode,
    name: "ApiError"
  });
  throw new TRPCError({ code: resolvedCode, message, cause });
}
```

- [ ] **Step 2: Create `context.ts`**

```ts
// packages/websocket/src/trpc/context.ts
import type { FastifyRequest } from "fastify";
import type { NodeRegistry } from "@nodetool/node-sdk";
import type { PythonStdioBridge } from "@nodetool/runtime";
import type { HttpApiOptions } from "../http-api.js";

export interface Context {
  userId: string | null;
  registry: NodeRegistry;
  apiOptions: HttpApiOptions;
  pythonBridge: PythonStdioBridge;
  getPythonBridgeReady: () => boolean;
}

export interface ContextFactoryInput {
  registry: NodeRegistry;
  apiOptions: HttpApiOptions;
  pythonBridge: PythonStdioBridge;
  getPythonBridgeReady: () => boolean;
}

export function createContextFactory(
  deps: ContextFactoryInput
): (opts: { req: FastifyRequest }) => Context {
  return ({ req }) => ({
    userId: req.userId,
    registry: deps.registry,
    apiOptions: deps.apiOptions,
    pythonBridge: deps.pythonBridge,
    getPythonBridgeReady: deps.getPythonBridgeReady
  });
}
```

- [ ] **Step 3: Create `index.ts`**

```ts
// packages/websocket/src/trpc/index.ts
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context.js";
import { errorFormatter } from "./error-formatter.js";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter
});

export const router = t.router;
export const mergeRouters = t.mergeRouters;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;
export { TRPCError };
```

- [ ] **Step 4: Create `middleware.ts`**

```ts
// packages/websocket/src/trpc/middleware.ts
import { TRPCError } from "@trpc/server";
import { publicProcedure } from "./index.js";

export const protectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required"
    });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});
```

- [ ] **Step 5: Create `router.ts` with an empty router**

```ts
// packages/websocket/src/trpc/router.ts
import { router } from "./index.js";

export const appRouter = router({});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 6: Verify typecheck passes**

Run: `cd /Users/mg/workspace/nodetool && npm run typecheck --workspace=packages/websocket`
Expected: passes with no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/websocket/src/trpc/
git commit -m "feat(trpc): scaffold server — initTRPC, context, errorFormatter, empty router"
```

---

### Task 1.4: Create `api-schemas/` skeleton in `@nodetool/protocol`

**Files:**
- Create: `packages/protocol/src/api-schemas/index.ts`

Schemas are consumed via the `@nodetool/protocol/api-schemas` subpath (set up in Task 1.6). The main `packages/protocol/src/index.ts` is intentionally *not* modified — schemas are accessed via the subpath, not the root export, to keep the root package tree-shaking friendly.

- [ ] **Step 1: Create the schemas index**

```ts
// packages/protocol/src/api-schemas/index.ts
// Zod input/output schemas for tRPC procedures.
// One file per domain; domain-specific schema modules are re-exported as
// namespaces below as they're added (e.g. `export * as costs from "./costs.js";`).
export {};
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd /Users/mg/workspace/nodetool && npm run typecheck --workspace=packages/protocol`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add packages/protocol/src/api-schemas/
git commit -m "feat(protocol): scaffold api-schemas directory for tRPC zod schemas"
```

---

### Task 1.5: Mount tRPC on Fastify with a healthz smoke procedure

**Files:**
- Modify: `packages/websocket/src/trpc/router.ts`
- Modify: `packages/websocket/src/server.ts`

- [ ] **Step 1: Add a `healthz` procedure to `router.ts` for smoke-testing the mount**

Replace the contents of `packages/websocket/src/trpc/router.ts`:

```ts
import { z } from "zod";
import { router, publicProcedure } from "./index.js";

export const appRouter = router({
  healthz: publicProcedure.output(z.object({ ok: z.literal(true) })).query(() => ({
    ok: true as const
  }))
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 2: Register the Fastify tRPC plugin in `server.ts`**

Near the top with other imports, add:

```ts
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from "@trpc/server/adapters/fastify";
import { appRouter, type AppRouter } from "./trpc/router.js";
import { createContextFactory } from "./trpc/context.js";
```

Placement: the tRPC plugin must be registered **after** the `apiOptions` block is constructed (currently around line ~492) and **before** the per-domain REST route plugins start registering (line ~569). Specifically, insert the block below right after the existing `apiOptions` declaration and before the first `await app.register(websocketPlugin, ...)`:

```ts
const createContext = createContextFactory({
  registry,
  apiOptions,
  pythonBridge,
  getPythonBridgeReady: () => pythonBridgeReady
});

await app.register(fastifyTRPCPlugin, {
  prefix: "/trpc",
  trpcOptions: {
    router: appRouter,
    createContext,
    onError({ path, error }) {
      log.error(
        `tRPC error on ${path}`,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  } satisfies FastifyTRPCPluginOptions<AppRouter>["trpcOptions"]
});
```

This placement ensures: (1) the Fastify `onRequest` auth hook (registered earlier) runs first and sets `req.userId`; (2) CORS and the raw buffer body parser are already in place; (3) the tRPC adapter handles `/trpc/*` before any `/api/*` REST route matches.

- [ ] **Step 3: Write an integration test for the mount**

Create `packages/websocket/src/trpc/__tests__/integration.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { appRouter } from "../router.js";
import { createContextFactory } from "../context.js";

function buildTestApp() {
  const app = Fastify({ logger: false });
  app.decorateRequest("userId", null);
  app.addHook("onRequest", async (req) => {
    req.userId = "test-user";
  });
  const stubBridge = { hasPython: () => false, close: () => {} } as never;
  const stubRegistry = {} as never;
  const stubApiOptions = { metadataRoots: [], registry: stubRegistry } as never;
  const createContext = createContextFactory({
    registry: stubRegistry,
    apiOptions: stubApiOptions,
    pythonBridge: stubBridge,
    getPythonBridgeReady: () => false
  });
  void app.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: { router: appRouter, createContext }
  });
  return app;
}

describe("tRPC Fastify mount", () => {
  it("serves the healthz query at /trpc/healthz", async () => {
    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/trpc/healthz" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // tRPC v11 returns { result: { data: { json: ..., meta: ... } } } when superjson is active.
    const data = body.result?.data?.json ?? body.result?.data;
    expect(data).toEqual({ ok: true });
    await app.close();
  });
});
```

- [ ] **Step 4: Run the test**

Run: `cd /Users/mg/workspace/nodetool/packages/websocket && npm test -- src/trpc/__tests__/integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify typecheck passes**

Run: `cd /Users/mg/workspace/nodetool && npm run typecheck --workspace=packages/websocket`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add packages/websocket/src/trpc/ packages/websocket/src/server.ts
git commit -m "feat(trpc): mount tRPC on Fastify at /trpc with healthz smoke test"
```

---

### Task 1.6: Add `isTRPCErrorWithCode` client helper to protocol schemas package

**Files:**
- Create: `packages/protocol/src/api-schemas/error-helpers.ts`
- Modify: `packages/protocol/src/api-schemas/index.ts`

- [ ] **Step 1: Create the client helper**

```ts
// packages/protocol/src/api-schemas/error-helpers.ts
import { ApiErrorCode } from "./api-error-code.js";

/**
 * Shape of the `error.data` object attached to TRPCClientError when the server
 * uses the errorFormatter from @nodetool/websocket/src/trpc/error-formatter.
 * Re-declared here so clients don't depend on server internals.
 */
export interface NodetoolTRPCErrorData {
  apiCode: ApiErrorCode | null;
  zodError: Record<string, string[]> | null;
  code?: string;
  httpStatus?: number;
  path?: string;
}

export interface NodetoolTRPCClientError {
  data?: NodetoolTRPCErrorData | null;
  message: string;
}

export function isTRPCErrorWithCode(
  err: unknown,
  code: ApiErrorCode
): err is NodetoolTRPCClientError {
  if (err == null || typeof err !== "object") return false;
  const candidate = err as { data?: { apiCode?: unknown } };
  return candidate.data?.apiCode === code;
}
```

- [ ] **Step 2: Hoist `ApiErrorCode` into protocol**

Because `ApiErrorCode` currently lives in `packages/websocket/src/error-codes.ts` and the client helper can't depend on the server package, copy the enum into protocol:

Create `packages/protocol/src/api-schemas/api-error-code.ts`:

```ts
export enum ApiErrorCode {
  NOT_FOUND = "NOT_FOUND",
  ALREADY_EXISTS = "ALREADY_EXISTS",
  INVALID_INPUT = "INVALID_INPUT",
  MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  INTERNAL_ERROR = "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  WORKFLOW_NOT_FOUND = "WORKFLOW_NOT_FOUND",
  WORKFLOW_EXECUTION_FAILED = "WORKFLOW_EXECUTION_FAILED",
  ASSET_NOT_FOUND = "ASSET_NOT_FOUND",
  ASSET_UPLOAD_FAILED = "ASSET_UPLOAD_FAILED",
  PYTHON_BRIDGE_UNAVAILABLE = "PYTHON_BRIDGE_UNAVAILABLE"
}

export interface ApiErrorResponse {
  code: ApiErrorCode;
  detail: string;
}

export function apiError(code: ApiErrorCode, detail: string): ApiErrorResponse {
  return { code, detail };
}
```

Replace the contents of `packages/websocket/src/error-codes.ts`:

```ts
export { ApiErrorCode, apiError } from "@nodetool/protocol/api-schemas/api-error-code.js";
export type { ApiErrorResponse } from "@nodetool/protocol/api-schemas/api-error-code.js";
```

This preserves existing imports at all call sites while moving the canonical definition to protocol.

- [ ] **Step 3: Update the schemas index**

Replace the contents of `packages/protocol/src/api-schemas/index.ts`:

```ts
export * from "./api-error-code.js";
export * from "./error-helpers.js";
```

- [ ] **Step 4: Expose the subpath from protocol**

In `packages/protocol/package.json`, replace the `exports` block with:

```json
"exports": {
  ".": {
    "nodetool-dev": "./src/index.ts",
    "types": "./src/index.ts",
    "import": "./dist/index.js",
    "default": "./dist/index.js"
  },
  "./api-schemas": {
    "nodetool-dev": "./src/api-schemas/index.ts",
    "types": "./src/api-schemas/index.ts",
    "import": "./dist/api-schemas/index.js",
    "default": "./dist/api-schemas/index.js"
  },
  "./api-schemas/*": {
    "nodetool-dev": "./src/api-schemas/*.ts",
    "types": "./src/api-schemas/*.ts",
    "import": "./dist/api-schemas/*.js",
    "default": "./dist/api-schemas/*.js"
  }
}
```

- [ ] **Step 5: Verify typecheck passes across workspaces**

Run: `cd /Users/mg/workspace/nodetool && npm run typecheck`
Expected: passes. (If protocol isn't built, run `npm run build:packages` first.)

- [ ] **Step 6: Commit**

```bash
git add packages/protocol/ packages/websocket/src/error-codes.ts
git commit -m "feat(protocol): host ApiErrorCode + client tRPC error helpers under api-schemas subpath"
```

---

### Task 1.7: Add web-side tRPC client scaffold (no domains yet)

**Files:**
- Create: `web/src/trpc/client.ts`
- Create: `web/src/trpc/Provider.tsx`

- [ ] **Step 1: Create `client.ts`**

```tsx
// web/src/trpc/client.ts
import { createTRPCReact } from "@trpc/react-query";
import {
  createTRPCClient,
  httpBatchLink,
  loggerLink,
  type TRPCClientErrorLike
} from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@nodetool/websocket/trpc";
import { BASE_URL } from "../stores/BASE_URL";
import { supabase } from "../lib/supabaseClient";
import { isLocalhost } from "../stores/ApiClient";

export const trpc = createTRPCReact<AppRouter>();

async function authHeaders(): Promise<Record<string, string>> {
  if (isLocalhost) return {};
  const {
    data: { session }
  } = await supabase.auth.getSession();
  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export function createTRPCHttpClient() {
  return createTRPCClient<AppRouter>({
    links: [
      loggerLink({
        enabled: (opts) =>
          (typeof window !== "undefined" &&
            import.meta.env.DEV &&
            typeof window !== "undefined") ||
          (opts.direction === "down" && opts.result instanceof Error)
      }),
      httpBatchLink({
        url: `${BASE_URL}/trpc`,
        transformer: superjson,
        async headers() {
          return authHeaders();
        }
      })
    ]
  });
}

export type TRPCClientError = TRPCClientErrorLike<AppRouter>;
```

- [ ] **Step 2: Create `Provider.tsx`**

```tsx
// web/src/trpc/Provider.tsx
import { useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, loggerLink } from "@trpc/client";
import superjson from "superjson";
import { trpc } from "./client";
import { queryClient } from "../queryClient";
import type { AppRouter } from "@nodetool/websocket/trpc";
import { BASE_URL } from "../stores/BASE_URL";
import { supabase } from "../lib/supabaseClient";
import { isLocalhost } from "../stores/ApiClient";

async function authHeaders(): Promise<Record<string, string>> {
  if (isLocalhost) return {};
  const {
    data: { session }
  } = await supabase.auth.getSession();
  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export function TRPCProvider({ children }: { children: ReactNode }) {
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        loggerLink({
          enabled: (opts) =>
            (import.meta.env.DEV && typeof window !== "undefined") ||
            (opts.direction === "down" && opts.result instanceof Error)
        }),
        httpBatchLink({
          url: `${BASE_URL}/trpc`,
          transformer: superjson,
          async headers() {
            return authHeaders();
          }
        })
      ]
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
```

- [ ] **Step 3: Wire `TRPCProvider` into the app root**

Find where `QueryClientProvider` is currently mounted in `web/src/index.tsx` (or the closest app root). Replace the outer `QueryClientProvider` with `TRPCProvider` — `TRPCProvider` composes both:

```tsx
// in web/src/index.tsx
import { TRPCProvider } from "./trpc/Provider";
// ... remove direct QueryClientProvider wrapper; wrap the app in <TRPCProvider> instead
<TRPCProvider>
  <App />
</TRPCProvider>
```

(If `QueryClientProvider` wraps more than just the app root, keep the existing structure and add `TRPCProvider` as a parent — it only needs to be *above* any component that uses `trpc.xyz.useQuery`. The inner `QueryClientProvider` can remain; duplicates are harmless because they use the same `queryClient` instance.)

- [ ] **Step 4: Typecheck**

Run: `cd /Users/mg/workspace/nodetool/web && npm run typecheck`
Expected: passes.

- [ ] **Step 5: Boot the dev server and verify no runtime errors**

Run: `cd /Users/mg/workspace/nodetool && npm run dev`
In another terminal: `curl http://127.0.0.1:7777/trpc/healthz`
Expected: JSON response containing `{"result":{"data":{"json":{"ok":true}}}}`. Kill the dev server.

- [ ] **Step 6: Commit**

```bash
git add web/src/trpc/ web/src/index.tsx
git commit -m "feat(web): scaffold tRPC client + TRPCProvider"
```

---

## Phase 2 — Pilot domain: costs

### Task 2.1: Write zod schemas for costs

**Files:**
- Create: `packages/protocol/src/api-schemas/costs.ts`
- Modify: `packages/protocol/src/api-schemas/index.ts`

- [ ] **Step 1: Create `costs.ts` schemas**

Mirror the current `cost-api.ts` inputs/outputs:

```ts
// packages/protocol/src/api-schemas/costs.ts
import { z } from "zod";

export const listPredictionsInput = z.object({
  provider: z.string().optional(),
  model: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(50),
  startKey: z.string().optional()
});

export const aggregateInput = z.object({
  provider: z.string().optional(),
  model: z.string().optional()
});

export const aggregateByModelInput = z.object({
  provider: z.string().optional()
});

export const predictionResponse = z.object({
  id: z.string(),
  user_id: z.string(),
  node_id: z.string(),
  provider: z.string(),
  model: z.string(),
  workflow_id: z.string().nullable(),
  cost: z.number().nullable(),
  input_tokens: z.number().nullable(),
  output_tokens: z.number().nullable(),
  total_tokens: z.number().nullable(),
  cached_tokens: z.number().nullable(),
  reasoning_tokens: z.number().nullable(),
  created_at: z.union([z.string(), z.date()]),
  metadata: z.record(z.string(), z.unknown()).nullable()
});

export const listPredictionsOutput = z.object({
  calls: z.array(predictionResponse),
  next_start_key: z.string().nullable()
});

export const aggregateOutput = z.object({
  total_cost: z.number(),
  total_tokens: z.number(),
  count: z.number()
});

export const aggregateByProviderOutput = z.record(z.string(), aggregateOutput);

export const aggregateByModelOutput = z.record(z.string(), aggregateOutput);

export const summaryOutput = z.object({
  overall: aggregateOutput,
  by_provider: aggregateByProviderOutput,
  by_model: aggregateByModelOutput,
  recent_calls: z.array(predictionResponse)
});

export type ListPredictionsInput = z.infer<typeof listPredictionsInput>;
export type PredictionResponse = z.infer<typeof predictionResponse>;
```

Note: inspect the exact shape of `Prediction.aggregateByUser()` and friends in `packages/models` before finalizing `aggregateOutput` keys. If the live shape differs, update the schema to match the true return shape, preserving snake_case keys for wire compatibility with downstream consumers.

- [ ] **Step 2: Re-export from `index.ts`**

Append to `packages/protocol/src/api-schemas/index.ts`:

```ts
export * as costs from "./costs.js";
```

- [ ] **Step 3: Typecheck**

Run: `cd /Users/mg/workspace/nodetool && npm run typecheck --workspace=packages/protocol`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add packages/protocol/src/api-schemas/
git commit -m "feat(protocol): add costs api-schemas"
```

---

### Task 2.2: Write failing costs router tests

**Files:**
- Create: `packages/websocket/src/trpc/routers/__tests__/costs.test.ts`

- [ ] **Step 1: Write the test file**

```ts
// packages/websocket/src/trpc/routers/__tests__/costs.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { appRouter } from "../../router.js";
import { createCallerFactory } from "../../index.js";
import type { Context } from "../../context.js";

// Seam for mocking the Prediction model
vi.mock("@nodetool/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool/models")>();
  return {
    ...actual,
    Prediction: {
      paginate: vi.fn(),
      aggregateByUser: vi.fn(),
      aggregateByProvider: vi.fn(),
      aggregateByModel: vi.fn()
    }
  };
});

import { Prediction } from "@nodetool/models";

const createCaller = createCallerFactory(appRouter);

function makeCtx(overrides: Partial<Context> = {}): Context {
  return {
    userId: "user-1",
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false,
    ...overrides
  };
}

describe("costs router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("list returns predictions + next_start_key", async () => {
    (Prediction.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
      [
        {
          id: "p1",
          user_id: "user-1",
          node_id: "n1",
          provider: "openai",
          model: "gpt-4",
          workflow_id: null,
          cost: 0.01,
          input_tokens: 100,
          output_tokens: 50,
          total_tokens: 150,
          cached_tokens: null,
          reasoning_tokens: null,
          created_at: "2026-04-17T00:00:00Z",
          metadata: null
        }
      ],
      "next-key"
    ]);
    const caller = createCaller(makeCtx());
    const result = await caller.costs.list({ limit: 10 });
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0].id).toBe("p1");
    expect(result.next_start_key).toBe("next-key");
    expect(Prediction.paginate).toHaveBeenCalledWith("user-1", {
      provider: undefined,
      model: undefined,
      limit: 10,
      startKey: undefined
    });
  });

  it("list with filters forwards provider + model", async () => {
    (Prediction.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([[], null]);
    const caller = createCaller(makeCtx());
    await caller.costs.list({ provider: "anthropic", model: "claude", limit: 50 });
    expect(Prediction.paginate).toHaveBeenCalledWith("user-1", {
      provider: "anthropic",
      model: "claude",
      limit: 50,
      startKey: undefined
    });
  });

  it("aggregate returns aggregateByUser result", async () => {
    const agg = { total_cost: 1.23, total_tokens: 1000, count: 5 };
    (Prediction.aggregateByUser as ReturnType<typeof vi.fn>).mockResolvedValue(agg);
    const caller = createCaller(makeCtx());
    await expect(caller.costs.aggregate({})).resolves.toEqual(agg);
  });

  it("aggregateByProvider returns the grouped map", async () => {
    const grouped = { openai: { total_cost: 1, total_tokens: 10, count: 1 } };
    (Prediction.aggregateByProvider as ReturnType<typeof vi.fn>).mockResolvedValue(grouped);
    const caller = createCaller(makeCtx());
    await expect(caller.costs.aggregateByProvider()).resolves.toEqual(grouped);
  });

  it("aggregateByModel forwards provider filter", async () => {
    (Prediction.aggregateByModel as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const caller = createCaller(makeCtx());
    await caller.costs.aggregateByModel({ provider: "openai" });
    expect(Prediction.aggregateByModel).toHaveBeenCalledWith("user-1", {
      provider: "openai"
    });
  });

  it("summary aggregates everything in parallel", async () => {
    (Prediction.aggregateByUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      total_cost: 2,
      total_tokens: 200,
      count: 2
    });
    (Prediction.aggregateByProvider as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (Prediction.aggregateByModel as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (Prediction.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([[], null]);
    const caller = createCaller(makeCtx());
    const result = await caller.costs.summary();
    expect(result.overall.total_cost).toBe(2);
    expect(result.recent_calls).toEqual([]);
  });

  it("rejects unauthenticated callers", async () => {
    const caller = createCaller(makeCtx({ userId: null }));
    await expect(caller.costs.list({ limit: 10 })).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    });
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd /Users/mg/workspace/nodetool/packages/websocket && npm test -- src/trpc/routers/__tests__/costs.test.ts`
Expected: FAIL with `caller.costs is undefined` (the router doesn't exist yet).

---

### Task 2.3: Implement the costs router

**Files:**
- Create: `packages/websocket/src/trpc/routers/costs.ts`
- Modify: `packages/websocket/src/trpc/router.ts`

- [ ] **Step 1: Write `costs.ts`**

```ts
// packages/websocket/src/trpc/routers/costs.ts
import { Prediction } from "@nodetool/models";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import {
  listPredictionsInput,
  listPredictionsOutput,
  aggregateInput,
  aggregateOutput,
  aggregateByProviderOutput,
  aggregateByModelInput,
  aggregateByModelOutput,
  summaryOutput,
  type PredictionResponse
} from "@nodetool/protocol/api-schemas/costs.js";

function toPredictionResponse(pred: Prediction): PredictionResponse {
  return {
    id: pred.id,
    user_id: pred.user_id,
    node_id: pred.node_id ?? "",
    provider: pred.provider,
    model: pred.model,
    workflow_id: pred.workflow_id ?? null,
    cost: pred.cost ?? null,
    input_tokens: pred.input_tokens ?? null,
    output_tokens: pred.output_tokens ?? null,
    total_tokens: pred.total_tokens ?? null,
    cached_tokens: pred.cached_tokens ?? null,
    reasoning_tokens: pred.reasoning_tokens ?? null,
    created_at: pred.created_at,
    metadata: pred.metadata ?? null
  };
}

export const costsRouter = router({
  list: protectedProcedure
    .input(listPredictionsInput)
    .output(listPredictionsOutput)
    .query(async ({ ctx, input }) => {
      const [calls, nextKey] = await Prediction.paginate(ctx.userId, {
        provider: input.provider,
        model: input.model,
        limit: input.limit,
        startKey: input.startKey
      });
      return {
        calls: calls.map(toPredictionResponse),
        next_start_key: nextKey || null
      };
    }),

  aggregate: protectedProcedure
    .input(aggregateInput)
    .output(aggregateOutput)
    .query(async ({ ctx, input }) => {
      return Prediction.aggregateByUser(ctx.userId, {
        provider: input.provider,
        model: input.model
      });
    }),

  aggregateByProvider: protectedProcedure
    .output(aggregateByProviderOutput)
    .query(async ({ ctx }) => {
      return Prediction.aggregateByProvider(ctx.userId);
    }),

  aggregateByModel: protectedProcedure
    .input(aggregateByModelInput)
    .output(aggregateByModelOutput)
    .query(async ({ ctx, input }) => {
      return Prediction.aggregateByModel(ctx.userId, {
        provider: input.provider
      });
    }),

  summary: protectedProcedure.output(summaryOutput).query(async ({ ctx }) => {
    const [overall, byProvider, byModel, paginated] = await Promise.all([
      Prediction.aggregateByUser(ctx.userId),
      Prediction.aggregateByProvider(ctx.userId),
      Prediction.aggregateByModel(ctx.userId),
      Prediction.paginate(ctx.userId, { limit: 10 })
    ]);
    const [recentCalls] = paginated;
    return {
      overall,
      by_provider: byProvider,
      by_model: byModel,
      recent_calls: recentCalls.map(toPredictionResponse)
    };
  })
});
```

- [ ] **Step 2: Mount it in the root router**

Replace `packages/websocket/src/trpc/router.ts`:

```ts
import { z } from "zod";
import { router, publicProcedure } from "./index.js";
import { costsRouter } from "./routers/costs.js";

export const appRouter = router({
  healthz: publicProcedure.output(z.object({ ok: z.literal(true) })).query(() => ({
    ok: true as const
  })),
  costs: costsRouter
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 3: Run the tests**

Run: `cd /Users/mg/workspace/nodetool/packages/websocket && npm test -- src/trpc/routers/__tests__/costs.test.ts`
Expected: all tests PASS.

- [ ] **Step 4: Typecheck**

Run: `cd /Users/mg/workspace/nodetool && npm run typecheck --workspace=packages/websocket`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add packages/websocket/src/trpc/
git commit -m "feat(trpc): implement costs router + unit tests"
```

---

### Task 2.4: Integration smoke test for costs over Fastify

**Files:**
- Modify: `packages/websocket/src/trpc/__tests__/integration.test.ts`

- [ ] **Step 1: Add a costs integration test**

Append to the existing file:

```ts
import { Prediction } from "@nodetool/models";

describe("tRPC /trpc/costs.list over Fastify", () => {
  it("returns an empty list for a user with no predictions", async () => {
    vi.spyOn(Prediction, "paginate").mockResolvedValue([[], null]);
    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: `/trpc/costs.list?input=${encodeURIComponent(
        JSON.stringify({ json: { limit: 10 } })
      )}`,
      headers: { "content-type": "application/json" }
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const data = body.result?.data?.json ?? body.result?.data;
    expect(data.calls).toEqual([]);
    expect(data.next_start_key).toBeNull();
    await app.close();
  });
});
```

Note: when superjson is enabled, tRPC wraps inputs/outputs in `{ json: ..., meta: ... }`. The GET query-string input format is `?input=<urlencoded JSON>`. Verify by consulting `@trpc/server/adapters/fastify` docs if the format differs in v11.

- [ ] **Step 2: Run**

Run: `cd /Users/mg/workspace/nodetool/packages/websocket && npm test -- src/trpc/__tests__/integration.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/websocket/src/trpc/__tests__/integration.test.ts
git commit -m "test(trpc): integration smoke test for costs over Fastify"
```

---

### Task 2.5: Migrate the web costs consumer to tRPC

**Files:**
- Inspect to identify web consumers: `web/src/**`
- Create: `web/src/serverState/useCosts.ts` (if not already tRPC-shaped)
- Modify or delete: any existing web file that fetches from `/api/costs`

- [ ] **Step 1: Find current consumers**

Run: `cd /Users/mg/workspace/nodetool && grep -rn "/api/costs" web/src electron/src mobile/src packages/cli packages/deploy`
Record the list — these are the call sites to migrate.

- [ ] **Step 2: For each consumer, replace the REST call with a tRPC call**

Example: a hook currently using `openapi-fetch`:

```ts
// before
import { client } from "../stores/ApiClient";
const { data, error } = useQuery({
  queryKey: ["costs"],
  queryFn: async () => {
    const { data, error } = await client.GET("/api/costs/summary");
    if (error) throw error;
    return data;
  }
});
```

becomes:

```ts
// after
import { trpc } from "../trpc/client";
const { data, error } = trpc.costs.summary.useQuery();
```

For listing with filters:

```ts
const { data } = trpc.costs.list.useQuery({
  limit: 50,
  provider: "openai"
});
```

- [ ] **Step 3: Typecheck web**

Run: `cd /Users/mg/workspace/nodetool/web && npm run typecheck`
Expected: passes. If the server package's dist doesn't exist yet, run `npm run build:packages` first.

- [ ] **Step 4: Run web tests**

Run: `cd /Users/mg/workspace/nodetool/web && npm test`
Expected: passes. Any tests that mocked `/api/costs` via MSW should be rewritten to mock the tRPC HTTP endpoint. The MSW v2 pattern for a tRPC batch GET is:

```ts
import { http, HttpResponse } from "msw";
import superjson from "superjson";

http.get("http://localhost:7777/trpc/costs.list", () =>
  HttpResponse.json({
    result: {
      data: superjson.serialize({ calls: [], next_start_key: null })
    }
  })
);
```

For mutations (POST with JSON body): `http.post("http://localhost:7777/trpc/<proc>", ...)` with the same response shape. Alternatively, use `msw-trpc` if it's added as a devDependency — it wraps the path construction automatically.

- [ ] **Step 5: Commit**

```bash
git add web/src/
git commit -m "feat(web): migrate costs consumers to tRPC"
```

---

### Task 2.6: Delete old REST costs route and cost-api.ts

**Files:**
- Delete: `packages/websocket/src/routes/costs.ts`
- Delete: `packages/websocket/src/cost-api.ts`
- Modify: `packages/websocket/src/server.ts`

- [ ] **Step 1: Remove the route registration**

In `server.ts`, delete:

```ts
import costsRoutes from "./routes/costs.js";
// ...
await app.register(costsRoutes, routeOpts);
```

- [ ] **Step 2: Delete the files**

Run:
```bash
cd /Users/mg/workspace/nodetool
rm packages/websocket/src/routes/costs.ts packages/websocket/src/cost-api.ts
```

- [ ] **Step 3: Typecheck**

Run: `cd /Users/mg/workspace/nodetool && npm run typecheck --workspace=packages/websocket`
Expected: passes (no other file imports from `cost-api.ts` or `routes/costs.ts` — confirm with grep if in doubt).

- [ ] **Step 4: Run all websocket tests**

Run: `cd /Users/mg/workspace/nodetool/packages/websocket && npm test`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add -A packages/websocket/
git commit -m "refactor(websocket): remove REST costs route (migrated to tRPC)"
```

---

## Phase 3 — Per-domain migration (15 remaining domains)

### Per-domain playbook

Every remaining domain follows the same seven-step pattern. The playbook is given once; each domain task below references it and provides the domain-specific parameters.

For domain `<D>` (examples: `settings`, `workflows`, `assets`, ...):

1. **Zod schemas** — Create `packages/protocol/src/api-schemas/<D>.ts` with one zod schema per input and output shape, matching the handler signatures in `packages/websocket/src/<D>-api.ts` (or its equivalent source). Re-export from `api-schemas/index.ts`.
2. **Failing tests** — Create `packages/websocket/src/trpc/routers/__tests__/<D>.test.ts`. For each endpoint, write a `createCaller` test that mocks the underlying model(s) and asserts the result shape matches the schema. Include an authentication test (`userId: null` should throw UNAUTHORIZED).
3. **Router** — Create `packages/websocket/src/trpc/routers/<D>.ts` with one `protectedProcedure` per endpoint. Body logic is lifted from the matching handler in `<D>-api.ts` (or `http-api.ts` for workflows/assets/etc.). Use `throwApiError(ApiErrorCode.X, "message")` for error paths instead of returning `Response` objects.
4. **Wire into appRouter** — Add `<D>: <D>Router` to `packages/websocket/src/trpc/router.ts`.
5. **Integration smoke** — Add one `app.inject` test exercising the most-used procedure.
6. **Client migration** — Find consumers with `grep -rn "/api/<D>" web/src mobile/src electron/src packages/cli/src packages/deploy/src`. Replace each call site with `trpc.<D>.<op>.useQuery()` / `useMutation()` for web+mobile, or `client.<D>.<op>.query()` / `mutate()` for vanilla-client cases (cli/electron/deploy).
7. **Delete old REST code** — Remove `packages/websocket/src/routes/<D>.ts`, the matching functions from `packages/websocket/src/<D>-api.ts` (or delete the whole file if empty), and the import + `app.register(<D>Routes)` line in `server.ts`. If any routes in the file serve binary/stream/metadata responses that must stay REST, shrink the file instead of deleting.

Each domain must end on a `git commit` and `npm run typecheck` + relevant `npm test` must pass.

### Domain parameters

Before each domain task, consult this table. Entries marked "†" have binary/stream/metadata endpoints that must remain REST — shrink `routes/<D>.ts` instead of deleting.

| Domain | Handler source | Routes file | Core model(s) | Endpoints | Binary/REST-retained |
|---|---|---|---|---|---|
| `settings` | `settings-api.ts` | `routes/settings.ts` | `Setting`, `Secret` | get/list/update/delete | none |
| `collections` | `collection-api.ts` | `routes/collections.ts` | `Collection` (vectorstore) | list/get/create/update/delete/index | none |
| `skills` | `skills-api.ts` | `routes/skills.ts` | in-memory skill registry | list/get/run | none |
| `users` | `users-api.ts` | `routes/users.ts` | `User` | list/create/delete/reset-token | none |
| `workspace` | `workspace-api.ts` | `routes/workspace.ts` | workspace filesystem | list/read/write/mkdir/rm | † (binary read) |
| `mcp-config` | `routes/mcp-config.ts` (inline) | `routes/mcp-config.ts` | mcp config file | get/update | none |
| `messages` | `http-api.ts` (handleMessages*) | `routes/messages.ts` | `Message` | list/get/create/delete | none |
| `threads` | `http-api.ts` (handleThreads*) | `routes/threads.ts` | `Thread` | list/get/create/update/delete | none |
| `jobs` | `http-api.ts` (handleJobs*) | `routes/jobs.ts` | `Job` | list/get/cancel/delete | none |
| `files` | `file-api.ts` | `routes/files.ts` | filesystem + `File` | list/metadata/rename/delete | † (binary read/write) |
| `storage` | `storage-api.ts` | `routes/storage.ts` | `Storage` (local/S3) | list/metadata/delete | † (binary PUT/GET) |
| `nodes` | `http-api.ts` (handleNodes*) + `routes/nodes.ts` | `routes/nodes.ts` | registry | search/list-by-namespace | † (`/metadata` stays REST) |
| `models` | `models-api.ts` | `routes/models.ts` | provider registry | list/get/search | none |
| `assets` | `http-api.ts` (handleAssets*) | `routes/assets.ts` | `Asset` | list/get/create/update/delete/children/recursive/search/by-filename | † (thumbnails, package asset files) |
| `workflows` | `http-api.ts` (handleWorkflow*) | `routes/workflows.ts` | `Workflow`, `WorkflowVersion` | list/get/create/update/delete/run/autosave/versions/tools/examples/public/generate-name | † (dsl-export, gradio-export) |

### Task 3.1 — Migrate `settings` domain

Apply the playbook with these specifics:

- **Schemas** — read `settings-api.ts` to enumerate endpoints. Typical inputs: `key` (string), `value` (unknown), pagination cursor. Output: settings records with `{ key, value, updated_at }`. Write schemas and tests.
- **Router tests** — mock the `Setting` and `Secret` models (seam via `vi.mock("@nodetool/models")`); verify list/get/update/delete round-trip.
- **Router** — each operation calls the corresponding model method with `ctx.userId`; errors mapped via `throwApiError(ApiErrorCode.NOT_FOUND, ...)` etc.
- **Wire into appRouter** — add `settings: settingsRouter` to `router.ts`.
- **Integration** — smoke one GET via `app.inject`.
- **Client migration** — `grep -rn "/api/settings" web/src mobile/src electron/src packages/cli/src packages/deploy/src`; replace each.
- **Delete REST code** — remove `routes/settings.ts`, `settings-api.ts`, and the `settingsRoutes` import/register in `server.ts`.

- [ ] **Step 1:** Write schemas + index re-export. Commit: `feat(protocol): add settings api-schemas`.
- [ ] **Step 2:** Write failing router tests. Run: `npm test -- routers/__tests__/settings.test.ts` — expect FAIL.
- [ ] **Step 3:** Implement `routers/settings.ts` + add to `appRouter`. Run tests — expect PASS. Commit: `feat(trpc): implement settings router + tests`.
- [ ] **Step 4:** Add integration smoke test. Commit: `test(trpc): integration smoke for settings`.
- [ ] **Step 5:** Migrate web consumers. Typecheck + test web. Commit: `feat(web): migrate settings consumers to tRPC`.
- [ ] **Step 6:** Delete REST code. Typecheck + test. Commit: `refactor: remove REST settings route`.

### Task 3.2 — Migrate `collections` domain

Apply the playbook:

- **Endpoints** (from `collection-api.ts`): list collections, get by name, create, update (name/metadata), delete, index documents. Indexing may take a large body — validate carefully.
- **Special consideration:** vectorstore operations live in `@nodetool/vectorstore`. Router imports from there via the registry/handle pattern already in `collection-api.ts`.

- [ ] **Step 1–6:** follow the playbook. Commit messages: `feat(protocol): add collections api-schemas` → `feat(trpc): implement collections router + tests` → `test(trpc): integration smoke for collections` → `feat(web): migrate collections consumers to tRPC` → `refactor: remove REST collections route`.

### Task 3.3 — Migrate `skills` domain

- **Endpoints** (from `skills-api.ts`): list skills, get by name, run. `run` may stream or take non-trivial time — if it streams, keep it REST and document the exception in the PR description; otherwise migrate.
- **Auth:** same as the rest — `protectedProcedure`.

- [ ] **Step 1–6:** follow the playbook.

### Task 3.4 — Migrate `users` domain

- **Endpoints** (from `users-api.ts`): list users, create user, delete by username, reset-token.
- **Special:** consumed by `packages/deploy/src/api-user-manager.ts`. Migrate deploy in the client step.

- [ ] **Step 1–6:** follow the playbook. Include `packages/deploy/src/api-user-manager.ts` in Step 5's grep and migration.

### Task 3.5 — Migrate `workspace` domain

- **Endpoints** (from `workspace-api.ts`): list entries, read (JSON metadata or small text), write (text), mkdir, remove.
- **REST retained:** binary read (files that return bytes, large files). Shrink `routes/workspace.ts` to keep only the binary-read route; everything else goes tRPC.

- [ ] **Step 1–6:** follow the playbook. In Step 6, shrink `routes/workspace.ts` instead of deleting.

### Task 3.6 — Migrate `mcp-config` domain

- **Endpoints** (from `routes/mcp-config.ts`, the handler is inline not a separate `*-api.ts`): get, update.
- **Special:** only available in non-production. Wrap the router mount with an environment check in `router.ts` or expose the procedures but have them throw `SERVICE_UNAVAILABLE` in prod — follow whichever pattern the existing code uses.

- [ ] **Step 1–6:** follow the playbook.

### Task 3.7 — Migrate `messages` domain

- **Endpoints** (from `http-api.ts`): list (with thread filter, pagination), get by id, create, delete.
- **Handler lift:** `handleMessages*` lives in `http-api.ts` — extract the logic into the router, don't re-use the Response-returning handler.

- [ ] **Step 1–6:** follow the playbook. In Step 6, remove the messages handlers from `http-api.ts` (keep the file; it still has other REST-staying handlers).

### Task 3.8 — Migrate `threads` domain

- **Endpoints** (from `http-api.ts`): list, get, create, update (rename/metadata), delete.

- [ ] **Step 1–6:** follow the playbook.

### Task 3.9 — Migrate `jobs` domain

- **Endpoints** (from `http-api.ts`): list (with workflow filter, pagination), get, cancel, delete.
- **Special:** cancelling a running job may involve cross-cutting concerns with the kernel actor runtime. Ensure the cancel procedure keeps the same semantic as the current REST handler.

- [ ] **Step 1–6:** follow the playbook.

### Task 3.10 — Migrate `files` domain (JSON ops only)

- **Endpoints** (from `file-api.ts`): list, metadata, rename, delete.
- **REST retained:** binary read and write. Shrink `routes/files.ts` to keep those; remove JSON ops.

- [ ] **Step 1–6:** follow the playbook. Shrink, don't delete, in Step 6.

### Task 3.11 — Migrate `storage` domain (JSON ops only)

- **Endpoints** (from `storage-api.ts`): list, metadata, delete.
- **REST retained:** binary PUT/GET. Shrink `routes/storage.ts`.

- [ ] **Step 1–6:** follow the playbook. Shrink, don't delete, in Step 6.

### Task 3.12 — Migrate `nodes` domain (JSON ops only)

- **Endpoints** (from `http-api.ts` + `routes/nodes.ts`): search by query, list-by-namespace, any other JSON read endpoints.
- **REST retained:** `/api/nodes/metadata` (public, unauth, consumed at boot). Shrink `routes/nodes.ts` to keep only that.

- [ ] **Step 1–6:** follow the playbook. Shrink, don't delete. **Important:** do NOT migrate `/api/nodes/metadata` — it stays REST and must remain unauth (see the auth-hook bypass in `server.ts`).

### Task 3.13 — Migrate `models` domain

- **Endpoints** (from `models-api.ts`): list available models, get model details, search. `registerPythonProviders` is server-internal and not exposed over HTTP — don't touch.

- [ ] **Step 1–6:** follow the playbook.

### Task 3.14 — Migrate `assets` domain (JSON ops only)

- **Endpoints** (from `http-api.ts`): list root/by-id, create, update, delete, children, recursive, search, by-filename (metadata lookup), packages list.
- **REST retained:** thumbnail (binary), package asset file (binary stream), `by-filename/:filename` if it returns binary. Shrink `routes/assets.ts` to keep only binary routes.
- **This is large.** The asset handlers in `http-api.ts` are the biggest chunk of the file. Read them carefully before writing schemas.

- [ ] **Step 1–6:** follow the playbook. Expect this task alone to be ~400 LOC of server changes.

### Task 3.15 — Migrate `workflows` domain (JSON ops only)

- **Endpoints** (from `http-api.ts`): list, get, create, update, delete, run, autosave (POST/PUT), versions list/get/restore/delete, tools, examples (list, search), public (list, get), generate-name, app metadata.
- **REST retained:** `dsl-export` (returns `.ts` file as download), `gradio-export` (returns file). Shrink `routes/workflows.ts` to keep these.
- **Largest domain.** Read the current `handleWorkflow*` handlers carefully — versions and autosave have subtle semantics.

- [ ] **Step 1–6:** follow the playbook. Expect this task alone to be the biggest single chunk of the migration.

---

## Phase 4 — Client sweep

### Task 4.1: Web — delete `web/src/api.ts` and purge openapi consumers

**Files:**
- Delete: `web/src/api.ts`
- Delete: `web/src/stores/ApiClient.ts` (if it's no longer imported anywhere)
- Modify: call sites that still import from either

- [ ] **Step 0: Move env helpers out of ApiClient**

Before deleting `stores/ApiClient.ts`, move its env exports (`isLocalhost`, `isDevelopment`, `isProduction`, `isElectron`, `setForceLocalhost`) into a dedicated file so they survive the deletion.

Create `web/src/lib/env.ts`:

```ts
import { isElectron as browserIsElectron } from "../utils/browser";
import log from "loglevel";

const getForcedLocalhost = (): boolean | null => {
  if (typeof window === "undefined") return null;
  const envForce = import.meta.env.VITE_FORCE_LOCALHOST;
  if (envForce === "true" || envForce === "1") return true;
  if (envForce === "false" || envForce === "0") return false;
  const urlParams = new URLSearchParams(window.location.search);
  const queryForce = urlParams.get("forceLocalhost");
  if (queryForce === "true" || queryForce === "1") return true;
  if (queryForce === "false" || queryForce === "0") return false;
  try {
    const stored = localStorage.getItem("forceLocalhost");
    if (stored === "true" || stored === "1") return true;
    if (stored === "false" || stored === "0") return false;
  } catch {}
  return null;
};

export const isLocalhost = ((): boolean => {
  const forced = getForcedLocalhost();
  if (forced !== null) return forced;
  return (
    typeof window !== "undefined" &&
    (window.location.hostname.includes("dev.") ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "localhost")
  );
})();

export const isDevelopment = isLocalhost;
export const isProduction = !isLocalhost;
export const isElectron = browserIsElectron;

export const setForceLocalhost = (force: boolean | null): void => {
  if (typeof window === "undefined") return;
  try {
    if (force === null) localStorage.removeItem("forceLocalhost");
    else localStorage.setItem("forceLocalhost", force ? "true" : "false");
    window.location.reload();
  } catch (error) {
    log.warn("Failed to set forceLocalhost preference:", error);
  }
};

if (typeof window !== "undefined") {
  window.isProduction = isProduction;
  window.isLocalhost = isLocalhost;
  window.isElectron = isElectron;
  window.setForceLocalhost = setForceLocalhost;
}
```

Update Task 1.7's `trpc/client.ts` and `trpc/Provider.tsx` to import `isLocalhost` from `../lib/env` instead of `../stores/ApiClient`. Do the same sweep across the web codebase for any other import of these symbols from `ApiClient`.

- [ ] **Step 1: Find remaining consumers**

Run: `cd /Users/mg/workspace/nodetool && grep -rn "from \"../api\"\|from \"../../api\"\|stores/ApiClient\|openapi-fetch" web/src`
Expected: empty (Phase 3 migrations plus Step 0 above should have removed every consumer).

- [ ] **Step 2: If any remain, migrate them**

Each should either move to tRPC (if it's a migrated endpoint) or stay on `fetch()` (if it's a REST-retained endpoint). For REST-retained (binary downloads, OpenAI `/v1/*`, OAuth), write a thin `fetch`-based helper in `web/src/lib/rest-fetch.ts` and import that instead of `stores/ApiClient`.

Example helper:

```ts
// web/src/lib/rest-fetch.ts
import { supabase } from "./supabaseClient";
import { isLocalhost } from "../stores/ApiClient";
import { BASE_URL } from "../stores/BASE_URL";

export async function restFetch(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!isLocalhost) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) headers.set("Authorization", `Bearer ${session.access_token}`);
  }
  const url = typeof input === "string" ? `${BASE_URL}${input}` : input;
  return fetch(url, { ...init, headers });
}
```

- [ ] **Step 3: Delete the files**

```bash
rm web/src/api.ts
# Only if ApiClient is no longer imported:
git grep "stores/ApiClient" web/src || rm web/src/stores/ApiClient.ts
```

- [ ] **Step 4: Typecheck + build + test web**

Run:
```
cd /Users/mg/workspace/nodetool/web && npm run typecheck && npm test && npm run build
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A web/
git commit -m "refactor(web): remove generated api.ts and openapi-fetch client"
```

---

### Task 4.2: Mobile — mirror web changes

**Files:**
- Create: `mobile/src/trpc/client.ts`, `mobile/src/trpc/Provider.tsx`
- Delete: `mobile/src/api.ts`
- Modify: every call site that imported from `mobile/src/api.ts`

- [ ] **Step 1: Build mobile protocol dependency**

Run: `cd /Users/mg/workspace/nodetool && cd packages/protocol && npm run build` (mobile's typecheck requires protocol built — per root CLAUDE.md).

- [ ] **Step 2: Create `mobile/src/trpc/client.ts`**

```tsx
// mobile/src/trpc/client.ts
import {
  createTRPCClient,
  httpBatchLink,
  type TRPCClientErrorLike
} from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@nodetool/websocket/trpc";
// Adjust to mobile's auth source
import { getAuthToken, getBaseUrl } from "../services/auth";

export function createMobileTRPCClient() {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${getBaseUrl()}/trpc`,
        transformer: superjson,
        async headers() {
          const token = await getAuthToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        }
      })
    ]
  });
}

export type TRPCClientError = TRPCClientErrorLike<AppRouter>;
```

(If mobile uses TanStack Query + hooks, mirror `web/src/trpc/Provider.tsx` with mobile-appropriate auth.)

- [ ] **Step 3: Migrate every mobile consumer of `mobile/src/api.ts`**

Grep, migrate call site by call site, same pattern as Phase 3 step 5.

- [ ] **Step 4: Delete `mobile/src/api.ts`**

```bash
rm mobile/src/api.ts
```

- [ ] **Step 5: Typecheck mobile**

Run: `cd /Users/mg/workspace/nodetool/mobile && npm run typecheck`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add -A mobile/
git commit -m "refactor(mobile): migrate to @trpc/client; delete generated api.ts"
```

---

### Task 4.3: CLI — migrate `packages/cli/src/nodetool.ts`

**Files:**
- Modify: `packages/cli/src/nodetool.ts`

- [ ] **Step 1: Add a trpc client factory at the top of `nodetool.ts`**

```ts
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@nodetool/websocket/trpc";

function createClient(apiUrl: string) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${apiUrl}/trpc`,
        transformer: superjson
      })
    ]
  });
}
```

- [ ] **Step 2: Replace each `apiGet`/`apiPost` call**

Example — the workflows list command currently does:

```ts
const data = await apiGet(opts.apiUrl, `/api/workflows?limit=${opts.limit}`);
```

becomes:

```ts
const client = createClient(opts.apiUrl);
const data = await client.workflows.list.query({ limit: opts.limit });
```

Apply to the ~10 sites (the grep in Phase 3 covers them).

- [ ] **Step 3: Delete the `apiGet`/`apiPost` helpers**

They're now unused. Remove the `fetch`-based helpers at the top of `nodetool.ts`.

- [ ] **Step 4: Typecheck + test CLI**

Run:
```
cd /Users/mg/workspace/nodetool && npm run typecheck --workspace=packages/cli && npm test --workspace=packages/cli
```
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/
git commit -m "refactor(cli): migrate nodetool command to @trpc/client"
```

---

### Task 4.4: Electron main — migrate `electron/src/api.ts`

**Files:**
- Modify: `electron/src/api.ts`

- [ ] **Step 1: Replace the fetch-based client with tRPC**

```ts
// electron/src/api.ts
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@nodetool/websocket/trpc";
import { Workflow } from "./types";
import { logMessage } from "./logger";
import { getServerUrl } from "./utils";

export let isConnected = false;

function makeClient() {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${getServerUrl("")}/trpc`,
        transformer: superjson
      })
    ]
  });
}

export async function fetchWorkflows(): Promise<Workflow[]> {
  logMessage("Fetching workflows from server...");
  try {
    const client = makeClient();
    const data = await client.workflows.list.query({});
    logMessage(`Successfully fetched ${data.workflows?.length ?? 0} workflows`);
    return data.workflows ?? [];
  } catch (error) {
    if (error instanceof Error) {
      logMessage(`Failed to fetch workflows: ${error.message}`, "error");
    }
    return [];
  }
}
```

Migrate any other fetch-based helpers in the file the same way.

- [ ] **Step 2: Typecheck + test electron**

Run:
```
cd /Users/mg/workspace/nodetool/electron && npm run typecheck && npm test
```
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add electron/src/api.ts
git commit -m "refactor(electron): migrate main-process api client to @trpc/client"
```

---

### Task 4.5: Deploy — migrate `admin-client.ts` and `api-user-manager.ts`

**Files:**
- Modify: `packages/deploy/src/admin-client.ts`
- Modify: `packages/deploy/src/api-user-manager.ts`

- [ ] **Step 1: Add tRPC client factory**

In each file, replace the `fetch`-based request method with a tRPC client. Example `admin-client.ts`:

```ts
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@nodetool/websocket/trpc";

export class AdminClient {
  private client: ReturnType<typeof createTRPCClient<AppRouter>>;

  constructor(private baseUrl: string, token: string) {
    this.client = createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: `${baseUrl}/trpc`,
          transformer: superjson,
          headers: { Authorization: `Bearer ${token}` }
        })
      ]
    });
  }

  async listWorkflows() {
    return this.client.workflows.list.query({});
  }
  // ...
}
```

- [ ] **Step 2: Same treatment for `api-user-manager.ts`**

- [ ] **Step 3: Typecheck + test deploy**

Run:
```
cd /Users/mg/workspace/nodetool && npm run typecheck --workspace=packages/deploy && npm test --workspace=packages/deploy
```
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add packages/deploy/
git commit -m "refactor(deploy): migrate admin-client and api-user-manager to @trpc/client"
```

---

## Phase 5 — Server cleanup + final verification

### Task 5.1: Shrink `http-api.ts` to only REST-staying functions

**Files:**
- Modify: `packages/websocket/src/http-api.ts`

- [ ] **Step 1: Grep for which `handleXxx` functions are still imported**

Run: `cd /Users/mg/workspace/nodetool && grep -rn "handle[A-Z]" packages/websocket/src/routes`

The remaining handlers should be for: binary asset routes, binary storage routes, binary file routes, binary workspace read, workflow dsl/gradio export, nodes metadata. Everything else is dead code.

- [ ] **Step 2: Delete unreferenced exports**

For each `handleXxx` function that no `routes/*.ts` imports anymore, delete it along with any helpers used only by it.

Keep:
- `getUserId` (still used by REST-staying routes)
- `parseLimit`
- the specific `handleXxx` functions still imported

- [ ] **Step 3: Typecheck**

Run: `cd /Users/mg/workspace/nodetool && npm run typecheck --workspace=packages/websocket`
Expected: passes.

- [ ] **Step 4: Run websocket tests**

Run: `cd /Users/mg/workspace/nodetool/packages/websocket && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/websocket/src/http-api.ts
git commit -m "refactor(websocket): shrink http-api.ts to REST-staying handlers only"
```

---

### Task 5.2: Delete fully-migrated `*-api.ts` helpers

**Files:**
- Delete: `packages/websocket/src/{collection,cost,file,models,settings,skills,storage,users,workspace}-api.ts` — whichever files are fully migrated and have no remaining exports. `oauth-api.ts` and `openai-api.ts` are retained.

- [ ] **Step 1: For each file, verify no imports remain**

Run: `cd /Users/mg/workspace/nodetool && for f in collection-api cost-api file-api models-api settings-api skills-api storage-api users-api workspace-api; do echo "=== $f ==="; grep -rn "\"../$f\"\|\"./$f\"\|from .*$f" packages/websocket/src; done`
Expected: each file has zero remaining imports from the rest of the codebase.

- [ ] **Step 2: Delete each file with no imports**

```bash
cd /Users/mg/workspace/nodetool
rm packages/websocket/src/cost-api.ts  # already deleted in Phase 2
# Repeat for each file with no remaining imports
```

- [ ] **Step 3: For files with partial remaining exports (e.g. `file-api.ts` still has the binary handler):**

Keep the file but remove the functions now served by tRPC.

- [ ] **Step 4: Typecheck + test**

Run:
```
cd /Users/mg/workspace/nodetool && npm run typecheck --workspace=packages/websocket && npm test --workspace=packages/websocket
```
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add -A packages/websocket/src/
git commit -m "refactor(websocket): delete fully-migrated REST handler files"
```

---

### Task 5.3: Audit every remaining route in `routes/*.ts`

**Files:**
- Modify: `packages/websocket/src/routes/*.ts` (each remaining file)
- Modify: `packages/websocket/src/server.ts` (remove register calls for deleted route plugins)

- [ ] **Step 1: List the surviving routes**

Run: `cd /Users/mg/workspace/nodetool && ls packages/websocket/src/routes/`

For each file still present, verify it only exposes endpoints from the "stays REST" list:
- `health.ts` ✓
- `oauth.ts` ✓
- `openai.ts` ✓
- `assets.ts` — only binary (thumbnail, package asset, `by-filename/:filename`)
- `workflows.ts` — only dsl/gradio export
- `nodes.ts` — only `/metadata`
- `files.ts` — only binary read/write
- `storage.ts` — only binary PUT/GET
- `workspace.ts` — only binary read

If a file is empty (no routes declared), delete it and remove the `app.register(...)` line in `server.ts`.

- [ ] **Step 2: Remove empty routes files from `server.ts`**

For every deleted file, delete its import and its `await app.register(...)` line.

- [ ] **Step 3: Typecheck + run all websocket tests**

Run:
```
cd /Users/mg/workspace/nodetool && npm run typecheck --workspace=packages/websocket && npm test --workspace=packages/websocket
```
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add -A packages/websocket/
git commit -m "refactor(websocket): audit and clean up surviving REST routes"
```

---

### Task 5.4: Verify the `/trpc` auth bypass list in `server.ts`

**Files:**
- Modify: `packages/websocket/src/server.ts`

- [ ] **Step 1: Inspect the auth-hook public-routes list**

In the auth `onRequest` hook near line ~417, confirm the public-routes list contains only:
- `/health`
- `/ready`
- `/api/oauth/*`
- `/api/assets/packages` and `/api/assets/packages/*` (still public)
- `/api/nodes/metadata`

**Not** `/trpc/*` — all tRPC procedures should go through the standard auth flow and get a userId. Individual procedures use `publicProcedure` if they want to allow anonymous access (the `healthz` example is one).

- [ ] **Step 2: If anything is off, fix it**

- [ ] **Step 3: Test that unauthenticated tRPC calls work in dev (localhost→userId=1)**

Run dev server locally and: `curl http://127.0.0.1:7777/trpc/healthz`
Expected: 200 with `ok: true`.

Also try a protected procedure: `curl http://127.0.0.1:7777/trpc/costs.summary`
Expected: 200 with summary data (localhost dev user).

- [ ] **Step 4: Commit if changes made**

```bash
git add packages/websocket/src/server.ts
git commit -m "chore(websocket): verify auth hook public-route list is correct post-migration"
```

---

### Task 5.5: Full repo check

**Files:** none

- [ ] **Step 1: Root check**

Run: `cd /Users/mg/workspace/nodetool && npm run check`
Expected: typecheck + lint + test all pass across all workspaces.

- [ ] **Step 2: Build every package**

Run: `cd /Users/mg/workspace/nodetool && npm run build:packages`
Expected: all packages build successfully.

- [ ] **Step 3: Boot the dev server and smoke-test each client**

```bash
# In terminal 1:
cd /Users/mg/workspace/nodetool && npm run dev

# In terminal 2:
cd /Users/mg/workspace/nodetool/web && npm start
# Navigate to http://localhost:3000, verify the app loads data correctly
```

Then close everything.

- [ ] **Step 4: If anything breaks, fix and repeat**

- [ ] **Step 5: Commit any fixes discovered**

---

### Task 5.6: PR preparation

- [ ] **Step 1: Write PR description with a migration table**

Template for the PR body:

```markdown
## Summary
Big-bang migration of the JSON REST API under `/api/*` to tRPC. The OpenAI-compatible `/v1/*`, OAuth, MCP, health, admin, binary/stream downloads, and `/api/nodes/metadata` remain REST.

## Domains migrated
| Domain | Procedures | Server LOC delta | Client call sites migrated |
|---|---|---|---|
| costs | 5 | -128 (deleted) | N |
| settings | K | -S | M |
...

## Test plan
- [ ] All per-router unit tests pass (`createCaller` based)
- [ ] Integration smoke tests pass (`app.inject`)
- [ ] Web app loads, lists workflows, opens a workflow, runs a node
- [ ] Mobile app launches and lists workflows
- [ ] `nodetool workflows list` and `nodetool workflows run` work
- [ ] Electron desktop app launches and lists workflows
- [ ] Deploy package `admin-client` smoke-tested against a running server

## Out of scope
- WebSocket `/ws` protocol unchanged
- `/agent` socket unchanged
- OpenAI `/v1/*` unchanged
- OAuth, MCP, health, admin, binary downloads unchanged
```

- [ ] **Step 2: Open the PR (manual — user decides when)**

`gh pr create --draft` when ready.

---

## Notes for implementers

- **Read before writing.** Every router task requires reading the source handler(s) carefully. The REST handlers in `http-api.ts` have accumulated subtleties (pagination cursors, optional filters, default values) that the zod schemas and router procedures must reproduce.
- **Wire compatibility.** Keep snake_case keys in outputs. The current Python-derived OpenAPI schema uses snake_case (`next_start_key`, `total_tokens`, `workflow_id`), and external consumers (deploy, cli) rely on these shapes. tRPC + superjson doesn't force camelCase; preserve the existing keys.
- **Commit hygiene.** Each task ends with one commit. Commits should be small enough to revert individually if a domain turns out to have an unforeseen wrinkle.
- **Typecheck often.** Run `npm run typecheck --workspace=packages/websocket` after every router change. The `AppRouter` type surface changes on every new router, and downstream clients will see the change immediately.
- **Don't skip tests.** The `createCaller` unit tests are the safety net. If you find yourself wanting to skip them for a "trivial" procedure, the procedure is fetching something that could regress — write the test.
- **Stream/binary sanity check.** Before implementing each domain's router, verify the endpoint list. If any response is binary, streaming, or content-negotiated in a way tRPC doesn't handle well (base64-in-JSON is not "handled well"), keep that endpoint REST and document it in the PR description.
