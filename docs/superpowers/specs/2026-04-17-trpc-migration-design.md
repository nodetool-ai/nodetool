# tRPC Migration Design

**Date:** 2026-04-17
**Status:** Approved (brainstorm)
**Scope:** Replace the JSON REST API under `/api/*` with tRPC procedures. Keep the OpenAI-compatible `/v1/*` chat server, OAuth, MCP, health probes, admin, binary/stream downloads, and `/api/nodes/metadata` as REST.

## Goals

- End-to-end type safety between the server and all four clients (`web`, `mobile`, `cli`, `electron` main).
- Automatic runtime input validation at the server boundary via zod.
- Delete the 14k-line generated `web/src/api.ts` and the `openapi-typescript`/`openapi-fetch` toolchain.
- Consolidate the current server-side split (`http-api.ts` + `*-api.ts` helpers + `routes/*.ts` plugins) into one file per domain.

## Non-goals

- No changes to the `/ws` MsgPack workflow kernel protocol.
- No changes to the `/agent` WebSocket route.
- No tRPC subscriptions.
- No rewrite of the OpenAI-compatible `/v1/*` endpoints.
- No migration of binary/stream file responses (thumbnails, asset downloads, package assets, storage GETs, DSL/Gradio export downloads).

## Scope

### In scope (migrate to tRPC)

JSON request/response endpoints under:

- `/api/assets/*` — list, CRUD, search, metadata. Binary download and thumbnail endpoints stay REST.
- `/api/workflows/*` — list, CRUD, run, autosave, versions, generate-name, tools, examples, public lookup. `dsl-export` and `gradio-export` stay REST (file download responses).
- `/api/jobs/*`
- `/api/messages/*`
- `/api/threads/*`
- `/api/nodes/*` JSON search/enumeration. `/api/nodes/metadata` stays REST (public, unauth, boot-time).
- `/api/settings/*`
- `/api/storage/*` — JSON operations only. Binary PUT/GET stay REST.
- `/api/users/*`
- `/api/workspace/*`
- `/api/files/*` — JSON ops only.
- `/api/costs/*`
- `/api/skills/*`
- `/api/collections/*`
- `/api/models/*`
- `/api/mcp-config/*`

### Stays REST (unchanged)

- `/v1/*` — OpenAI-compatible chat server.
- `/api/oauth/*` — browser redirects, third-party callbacks.
- `/mcp` — Model Context Protocol.
- `/health`, `/ready` — infra probes.
- `/admin/secrets/*` — out-of-band deploy tooling with shared master key.
- `/api/nodes/metadata` — public, unauth, consumed before client boots.
- All binary/stream responses inside `/api/*` (asset download, thumbnail, package asset file, storage GET/PUT of bytes, DSL export, Gradio export).
- Static frontend via `fastifyStatic`.

## Architecture

### Server

Router code lives in `packages/websocket/src/trpc/`:

```
trpc/
  index.ts              # initTRPC with superjson transformer + errorFormatter; exports publicProcedure/protectedProcedure
  context.ts            # createContext({ req, apiOptions, registry, pythonBridge }) → Context
  error-formatter.ts    # TRPCError ↔ ApiErrorCode mapping
  middleware.ts         # protectedProcedure enforcing ctx.userId !== null
  router.ts             # appRouter composing sub-routers; export type AppRouter
  routers/
    workflows.ts
    assets.ts
    jobs.ts
    messages.ts
    threads.ts
    nodes.ts
    settings.ts
    users.ts
    workspace.ts
    files.ts
    costs.ts
    skills.ts
    collections.ts
    models.ts
    mcp-config.ts
    storage.ts
```

Each router file absorbs both the current `routes/<domain>.ts` plugin and the logic from the matching `*-api.ts` helper. The 2.9k-line `http-api.ts` is decomposed across these files; functions that still serve REST-staying routes (binary/stream/metadata) remain in a slimmed-down `http-api.ts`.

Mounted onto the existing Fastify instance at prefix `/trpc` via `@trpc/server/adapters/fastify`:

```ts
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
await app.register(fastifyTRPCPlugin, {
  prefix: "/trpc",
  trpcOptions: { router: appRouter, createContext }
});
```

The existing `onRequest` auth hook runs before tRPC and sets `req.userId`. `createContext` simply reads it — no duplicate auth logic.

### Schemas

Zod schemas live in `@nodetool-ai/protocol/src/api-schemas/` (zod is already a dep of the protocol package), one file per domain. Each file exports the input and output schemas for that domain's procedures. Server procedures import them for validation; client code imports them for form validation where useful.

```
packages/protocol/src/api-schemas/
  workflows.ts
  assets.ts
  jobs.ts
  ...
  index.ts  # re-exports
```

Complex entity types (Workflow, Asset, Job) already have TypeScript types in `@nodetool-ai/protocol` or `@nodetool-ai/models`. Zod schemas may reference these via `z.custom<T>()` where full runtime parsing is overkill, or be defined from scratch where input shape differs from the entity.

### Transport and serialization

- `@trpc/server/adapters/fastify` on the server.
- `httpBatchLink` on the clients. Batches simultaneous queries into one HTTP request.
- `superjson` as the tRPC transformer. Preserves `Date`, `Map`, `Set`, `BigInt`, `undefined` across the wire — removes the current JSON-over-HTTP string-date workarounds.

### Error handling

Custom `errorFormatter` on the server extends `shape.data` with:

- `apiCode`: a string from the existing `ApiErrorCode` enum (`WORKFLOW_NOT_FOUND`, `ASSET_NOT_FOUND`, `INVALID_INPUT`, etc.) so clients can discriminate between error types that share a TRPCError code.
- `zodError`: structured field-path errors for input validation failures (auto-populated by tRPC when zod throws).

Procedure bodies call `throwApiError(ApiErrorCode.X, "message", trpcCode?)` — a small helper that constructs a `TRPCError` with the `apiCode` attached to `cause`. The tRPC `errorFormatter` reads `cause.apiCode` and surfaces it on `shape.data.apiCode`. This is a helper-at-call-site pattern (not a middleware) — explicit at the point the error is raised, no magic error-to-code translation layer.

Client helper `isTRPCErrorWithCode(err, ApiErrorCode.X)` for call sites that branch on specific errors.

### Context

```ts
interface Context {
  userId: string | null;
  registry: NodeRegistry;
  apiOptions: HttpApiOptions;
  pythonBridge: PythonStdioBridge;
  getPythonBridgeReady: () => boolean;
}
```

- `userId` comes from the Fastify auth hook (`req.userId`) — single source of truth. The existing `getUserId(request, headerName)` helper is retained only for the REST-staying handlers that read it directly; new tRPC procedures read `ctx.userId`.
- Other fields are the same objects currently passed through `apiOptions`/closures to the REST handlers. The existing construction in `server.ts` is lifted into a `createContextFactory` that closes over them and returns `createContext`.

### Client integration

**Web (`web/src/trpc/`):**

- `client.ts` — `createTRPCReact<AppRouter>()` + `createTRPCClient` with `httpBatchLink({ url: BASE_URL + "/trpc" })` + `superjson` + auth middleware (Supabase JWT on production, no-op on localhost).
- `Provider.tsx` — wraps the app with `trpc.Provider` and `QueryClientProvider`. Replaces nothing (TanStack Query is already set up) — the new provider slots in alongside the existing `QueryClient`.
- `web/src/serverState/*.ts` — existing hooks (`useWorkflow`, `useAssets`, etc.) are rewritten on top of tRPC's `useQuery`/`useMutation`/`useInfiniteQuery`. Same public hook signatures where possible so component call sites don't change; internal implementation delegates to tRPC.
- Deletes: `web/src/api.ts`, `openapi-fetch` + `openapi-typescript` deps, the `openapi` npm script.

**Mobile (`mobile/src/trpc/`):** same pattern as web. Deletes mirror web's.

**CLI (`packages/cli`):**

- `createTRPCClient<AppRouter>({ links: [httpBatchLink({ url })] })`, URL from `--api-url` option.
- ~10 `fetch()` call sites in `nodetool.ts` migrate to typed tRPC procedure calls.

**Electron main (`electron/src/api.ts`):** vanilla `createTRPCClient` same as CLI. ~5 call sites migrate.

### AppRouter type export

`packages/websocket/package.json` exposes a subpath for the router, following the repo's existing export-condition pattern (`nodetool-dev` for source, `types` for declarations, `import`/`default` for built dist):

```json
"exports": {
  ".": { ... current ... },
  "./trpc": {
    "nodetool-dev": "./src/trpc/router.ts",
    "types": "./src/trpc/router.ts",
    "import": "./dist/trpc/router.js",
    "default": "./dist/trpc/router.js"
  }
}
```

Clients use `import type { AppRouter } from "@nodetool-ai/websocket/trpc"` — type-only import, no runtime coupling (TypeScript erases type-only imports at build). The router module is structured so nothing at its top level executes on import; all procedures and sub-routers are declared as values inside the `appRouter` builder, which is tree-shakable.

## Data flow

```
client hook (useQuery)
  → httpBatchLink (batches sibling queries into one POST /trpc/…)
  → superjson encode
  → Fastify onRequest hook → sets req.userId from token
  → @trpc/server/adapters/fastify
  → createContext({ req, apiOptions, registry, pythonBridge })
  → zod .input() parse (400 on failure, with zodError in data)
  → procedure body
  → result
  → superjson encode
  → client: typed result, Date/Map/Set preserved
```

## Migration ordering (within the big-bang branch)

1. **Foundation** — add `@trpc/*` deps, create `trpc/` skeleton, `createContext`, `errorFormatter`, Fastify mount, protocol `api-schemas/` skeleton, superjson.
2. **Pilot domain (`costs`)** end-to-end — smallest server-side surface (`cost-api.ts` is 128 lines). Server router, protocol schemas, one web hook, one web call site. Verify transport, auth, error formatter, superjson, TanStack Query integration all work. This is the pattern the rest follows.
3. **Remaining 15 domains** — server-side routers + schemas.
4. **Rewrite `web/src/serverState/`** onto tRPC hooks. Delete `web/src/api.ts`. Remove `openapi-fetch` from `web/`.
5. **Mobile migration** — mirror web.
6. **CLI + Electron main migration**.
7. **Deletion sweep** — every REST route and `*-api.ts` helper that only served a migrated endpoint is removed. `http-api.ts` keeps only what still serves REST-staying routes.
8. **Test pass** — every router has vitest coverage via `appRouter.createCaller(ctx)`; a small e2e suite exercises the Fastify transport + auth + error formatter via `app.inject()`.

## Testing strategy

- **Unit (per router):** `appRouter.createCaller({ ctx })` invokes procedures in-process. Fast, no HTTP. Replaces the current handler-level tests in `http-api.test.ts`.
- **Integration (transport):** a small suite uses `app.inject({ method: "POST", url: "/trpc/…", payload })` to verify the Fastify adapter, auth hook, and error formatter wire together correctly.
- **Client:** existing web/mobile tests that mock REST endpoints get replaced with tRPC-specific mocks (MSW with tRPC adapter, or `createTRPCMsw`).

## Deletion list (end-of-branch)

Server:
- `packages/websocket/src/http-api.ts` — shrunk to cover only REST-staying endpoints.
- `packages/websocket/src/{collection,cost,file,models,oauth,openai,settings,skills,storage,users,workspace}-api.ts` — the parts feeding migrated endpoints deleted; OAuth and OpenAI helpers kept.
- `packages/websocket/src/routes/{workflows,assets,jobs,messages,threads,nodes,settings,users,workspace,files,costs,skills,collections,models,mcp-config,storage}.ts` — shrunk to REST-staying paths or deleted outright.

Client:
- `web/src/api.ts` (14k lines).
- `openapi-fetch`, `openapi-typescript` deps + `openapi` script in `web/` and `mobile/`.

## Open questions to resolve during implementation planning

- Exact test-mock strategy for mobile screen tests: MSW tRPC adapter vs. `createCaller` harness.
- Whether to introduce a typed `ApiError` discriminated union as a secondary return type on the client (enabling exhaustive switch on error codes), or stay with the current "throw and branch" style.
- Whether any currently-under-`/api/*` endpoint that returns streaming JSON (e.g. progressive workflow generation) should move to tRPC with an async iterator return, or stay REST.

## Risks

- **Unknown semantics in the 120 endpoints** — streaming, content negotiation, or multipart behaviour can surface late. Mitigation: audit the REST handler list domain-by-domain during foundation phase, flag any non-JSON before committing to tRPC for it.
- **Big PR review pain** — big-bang means one giant merge. Mitigation: commit by domain within the branch so reviewers can step through the history; provide a per-file "what moved where" mapping in the PR description.
- **Client bundle change** — replacing `openapi-fetch` with `@trpc/client` + `@trpc/react-query` + `superjson` may net-add bundle size. Needs measurement before merge.
- **Superjson overhead** — superjson encodes/decodes on every request. For hot paths this is negligible but worth measuring on the workflow list endpoint which can return large payloads.
