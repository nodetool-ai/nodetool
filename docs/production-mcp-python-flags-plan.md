# Plan: MCP over HTTP and the Python bridge on a production server

Status: implemented — 2026-08-22.

## Problem

The Docker image (`ghcr.io/nodetool-ai/nodetool`), `fly.toml`, and
`docker-compose.yml` set `NODETOOL_ENV=production`. Two surfaces turn off in
that mode:

- The `/mcp` streamable-HTTP mount
  (`packages/websocket/src/server.ts`, the `if (!isProduction)` block around
  the `app.all("/mcp", …)` route). An MCP-aware agent cannot reach a
  self-hosted server over HTTP.
- The Python bridge
  (`packages/runtime/src/python-stdio-bridge.ts`, `_assertCanConnect` and
  `hasPython`). Python nodes are unavailable.

A self-hoster asked for an opt-in flag for each, modeled on
`NODETOOL_ENABLE_EXTENSION_BRIDGE=1`
(`packages/websocket/src/plugins/websocket.ts`). Their setup: one shared
instance behind a VPN, humans on the web UI, an agent on MCP with a bearer
token.

## Findings

**The Python flag already exists.** `NODETOOL_ALLOW_PYTHON_BRIDGE_IN_PRODUCTION=1`
lifts the production refusal in `python-stdio-bridge.ts` and is documented in
`docs/configuration.md`. Two things are missing around it:

- The boot log in `server.ts` says "Python bridge disabled in production" and
  does not name the flag, so an operator cannot find it from the log.
- The Docker image ships no Python worker (`nodetool-core`). The flag alone
  does not make Python nodes work in the image.

**The MCP mount cannot be a bare flag flip.** The mount binds every session to
`agentToolsScope: { userId: "1", source: "local-dev-http" }`. In production
that is an anonymous, full-access surface. Two more facts:

- `McpServerOptions.agentToolsScope.source` already has an unused
  `"http-session"` member (`packages/websocket/src/mcp-server.ts`), reserved
  for exactly this: a mount that binds the authenticated user.
- The auth hook's static-asset exemption in `server.ts` skips auth for any
  `GET` outside `/api`, `/ws`, `/v1`, `/trpc` when a static app is served.
  `GET /mcp` is the SSE stream. It would bypass auth.

## Decision

- Add `NODETOOL_ENABLE_MCP=1`. The mount registers in production only with
  the flag, and always binds the user the auth hook resolved — never `"1"`.
- Add no Python flag. Fix the log line and the docs so the existing flag is
  discoverable, and document the worker-image requirement.

## Steps

### 1. `NODETOOL_ENABLE_MCP` — `packages/websocket/src/server.ts`

1. Define `mcpHttpEnabled = !isProduction || process.env["NODETOOL_ENABLE_MCP"] === "1"`,
   next to the other production gates.
2. Register the `/mcp` route when `mcpHttpEnabled`. When disabled in
   production, log one line that names the flag, the same way the extension
   bridge does.
3. Build the scope per request:
   `req.userId ? { userId: req.userId, source: isProduction ? "http-session" : "local-dev-http" } : undefined`.
   A missing scope already returns the 401 `scopeRefusal` from
   `mcp-server.ts` at initialize.
4. Add `/mcp` to the prefix list the static-asset exemption in the auth hook
   does not cover.

### 2. Bind a session to its owner — `packages/websocket/src/mcp-server.ts`

1. Keep `sessionOwners: Map<sessionId, userId>` next to `sessionTransports`.
   Record the owner in `onsessioninitialized`; delete it wherever the
   transport is evicted.
2. On POST, GET, and DELETE with a session id: when the recorded owner
   differs from the request's scope user, answer `404 Session not found`.
   A 404 rather than a 403, so the response does not confirm the id exists.
3. Tests in `packages/websocket/tests/mcp-server.test.ts`:
   - the same user resumes a session;
   - a different user gets 404;
   - initialize with no scope gets 401 (already covered — keep it).

### 3. Python bridge diagnostic — `packages/websocket/src/server.ts`

Replace the production branch of the "Python nodes will not be available"
log with two cases:

- flag unset: name `NODETOOL_ALLOW_PYTHON_BRIDGE_IN_PRODUCTION=1`;
- flag set and no interpreter: "Python not found", the same line the
  non-production branch prints.

No change to `python-stdio-bridge.ts`.

### 4. Docs

1. `docs/configuration.md`: a table row for `NODETOOL_ENABLE_MCP`, mirroring
   the `NODETOOL_ENABLE_EXTENSION_BRIDGE` row. State that the mount inherits
   the server's auth mode and binds the authenticated user.
2. `docs/self-hosted-deployment.md`: a section "MCP over HTTP and Python
   nodes" covering:
   - both flags;
   - how an agent authenticates — a Supabase bearer token when
     `SUPABASE_URL` is set; `NODETOOL_TRUST_LOCAL_NETWORKS=<vpn cidr>` in
     local mode; or a delegated token minted through
     `NODETOOL_INTEGRATION_TOKEN`;
   - that the image ships no Python worker: derive an image that installs
     `nodetool-core`, and set `NODETOOL_PYTHON` to that interpreter.
3. `docker-compose.yml`: commented examples of both flags in the `environment`
   block.

### 5. Verification

1. `npm run test --workspace=packages/websocket`, `npm run typecheck`,
   `npm run lint`.
2. Prove the gate can fail. Boot the image with
   `NODETOOL_ENV=production NODETOOL_ENABLE_MCP=1` and:
   - `POST /mcp` initialize without a token → 401;
   - with a token → a `mcp-session-id`;
   - `GET /mcp` with that session id and no token → 401. This is the check
     for the static-asset exemption fix in step 1.4;
   - `POST /mcp` with the session id and a second user's token → 404.
3. Boot without the flag and confirm `/mcp` answers 404 and the log names
   the flag.

## Out of scope

- The tRPC `mcpConfig` router stays disabled in production. It edits MCP
  client config files on the server's filesystem, which has no meaning on a
  shared host.
- `/ws/download` and the other local-only websocket routes keep their
  production gates.

## Size

About 80 lines of code, 40 of tests, 60 of docs. One PR.
