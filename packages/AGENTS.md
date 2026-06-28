# TypeScript Backend Packages

**Navigation**: [Root AGENTS.md](../AGENTS.md) | [CLAUDE.md](../CLAUDE.md) → **TypeScript Backend Packages**

> **Read [docs/DEVELOPMENT_STANDARDS.md](../docs/DEVELOPMENT_STANDARDS.md) first.** It is the canonical source for TypeScript, ES modules, Fastify, Drizzle, Zod, testing, error handling, and security standards. The rules below are the area-specific overlay for `packages/`.

The `packages/` directory contains the TypeScript backend — a set of npm workspace packages that implement the NodeTool workflow runtime, API server, CLI, and supporting libraries.

## Package Overview

| Package | Description |
|---------|-------------|
| `@nodetool-ai/protocol` | Shared message types, Zod schemas, protocol definitions |
| `@nodetool-ai/config` | Configuration loading and logging utilities |
| `@nodetool-ai/security` | Secret storage and encryption |
| `@nodetool-ai/auth` | Authentication middleware and utilities |
| `@nodetool-ai/storage` | File storage adapters (local, S3) |
| `@nodetool-ai/models` | Data models via Drizzle ORM — SQLite (local/Electron) and PostgreSQL/Supabase (cloud) |
| `@nodetool-ai/node-sdk` | BaseNode class, NodeRegistry, node authoring API, type system |
| `@nodetool-ai/runtime` | ProcessingContext, LLM providers (Anthropic, OpenAI, Gemini, Ollama, etc.), message queue |
| `@nodetool-ai/kernel` | Workflow graph model, NodeInbox, ActorRuntime, WorkflowRunner |
| `@nodetool-ai/agents` | Planning agent system — TaskPlanner, TaskExecutor, StepExecutor, Tool registry |
| `@nodetool-ai/chat` | Chat message processing and token counting |
| `@nodetool-ai/base-nodes` | Core workflow nodes (text, image, LLM, agents, math, etc.) |
| `@nodetool-ai/fal-nodes` | FAL AI integration nodes |
| `@nodetool-ai/fal-codegen` | Code generator for FAL AI node definitions |
| `@nodetool-ai/replicate-nodes` | Replicate integration nodes |
| `@nodetool-ai/elevenlabs-nodes` | ElevenLabs TTS integration nodes |
| `@nodetool-ai/minimax-nodes` | MiniMax TTS, music, image, and video nodes |
| `@nodetool-ai/code-runners` | Secure code execution (Docker + subprocess sandboxing) |
| `@nodetool-ai/huggingface` | HuggingFace model discovery and downloads |
| `@nodetool-ai/vectorstore` | SQLite-vec vector store for RAG |
| `@nodetool-ai/websocket` | Fastify HTTP + WebSocket server (main API, port 7777) |
| `@nodetool-ai/cli` | Command-line interface (`nodetool` command) |
| `@nodetool-ai/deploy` | Cloud deployment utilities |
| `@nodetool-ai/dsl` | Workflow DSL for programmatic workflow creation |

## Build Commands

All packages use TypeScript and are built with `tsc`. The recommended way to build is:

```bash
# From repo root — builds all packages in dependency order (ALWAYS use this)
npm run build:packages

# Build a single package (only when its dependencies are already built)
npm run build --workspace=packages/websocket
```

## Development

```bash
# Start the API server in development mode (tsx --watch, auto-restart)
npm run dev:watch:server

# Start both server and web frontend
npm run dev:watch
npm run dev

# Start backend only
npm run dev:watch:server
npm run dev:server
```

**Important**: The dev server uses `tsx --watch` which runs TypeScript directly. However, `base-nodes`, `node-sdk`, `fal-nodes`, `replicate-nodes`, `elevenlabs-nodes`, and `minimax-nodes` use decorators and load from `dist/`. If you change these packages, run `npm run build:packages` first.

## Testing

Each package has its own test suite using **Vitest**:

```bash
# Run tests for all packages
npm run test:packages

# Run tests for a single package
npm run test --workspace=packages/kernel

# Watch mode for a single package
npm run test:watch --workspace=packages/kernel
```

The in-browser workflow harness exercises the full backend end-to-end via `packages/websocket/src/e2e-server.ts` (real runner, in-memory DB, scripted-provider fallback). Run it from `web` with `npm run test:e2e-runner`. See **[web/src/e2e_runner/README.md](../web/src/e2e_runner/README.md)**.

## Package Dependency Order

The packages have a strict dependency hierarchy. Lower packages are dependencies of higher ones:

```
protocol → config → security → auth → storage
                             ↓
                          runtime → kernel → node-sdk → base-nodes
                                          ↓
                                       models → agents → chat
                                                         ↓
                                                      websocket ← cli
```

**This order determines build order.** `npm run build:packages` builds in this order automatically. If you build a single package, its dependencies must already be built.

## Key Packages

### `@nodetool-ai/websocket` — API Server

The main entry point for the backend. Provides:
- REST API endpoints (`/api/workflows`, `/api/jobs`, `/api/assets`, etc.)
- WebSocket endpoint (`/ws`) for streaming workflow execution (MsgPack serialization)
- OpenAI-compatible endpoint (`/v1/chat/completions`)
- MCP server integration
- Health check endpoint (`/health`)

```bash
PORT=7777 HOST=127.0.0.1 node packages/websocket/dist/server.js
```

### `@nodetool-ai/kernel` — Workflow Runtime

Implements the workflow execution engine:
- `WorkflowRunner` — executes workflow graphs
- `NodeInbox` / `ActorRuntime` — actor-model message passing
- Graph traversal and topological ordering

### `@nodetool-ai/runtime` — LLM Providers

Provides adapters for AI providers:
- `AnthropicProvider`, `OpenAIProvider`, `GeminiProvider`
- `OllamaProvider`, `MistralProvider`, `GroqProvider`
- `ClaudeAgentProvider` — Claude Agent SDK integration (uses Claude subscription, not API key)
- `PythonStdioBridge` — calls Python-based nodes (HuggingFace, MLX) via local stdio subprocess
- `ProcessingContext` — execution context with secret resolution

### `@nodetool-ai/agents` — Agent System

Multi-step planning agent with:
- `TaskPlanner` — decomposes objectives into a DAG of Steps
- `TaskExecutor` / `StepExecutor` — walks the DAG with tool-calling loops
- `Tool` base class and registry — 100+ built-in tools
- Skills system — SKILL.md files inject domain-specific instructions
- See [docs/AGENTS.md](../docs/AGENTS.md) for full architecture documentation

### `@nodetool-ai/node-sdk` — Node Authoring

Base classes and registry for building workflow nodes:
- `BaseNode` — abstract base class for all nodes
- `NodeRegistry` — registers and resolves node types
- Type system for node inputs/outputs (connections enforce compatible types)

### `@nodetool-ai/cli` — CLI & Agent Harnesses

The `nodetool` command-line interface (`packages/cli/src/commands/`). Beyond
server/jobs/assets/secrets management, it ships the harnesses an agent uses to
close the build→verify loop. Run from source with `npm run dev:nodetool -- <cmd>`
(no build) or from `dist` with `npm run nodetool -- <cmd>`. Full flags in
[CLI documentation](../docs/cli.md) and [CLAUDE.md](../CLAUDE.md).

| Command | Harness | When |
|---|---|---|
| `validate <id\|file>` (`validate.ts`) | Static graph check — unknown nodes, missing props, unselected models, dangling/mis-typed edges | **Cheap pre-flight before any run.** Sub-second; no DB for file/DSL targets. Core: `validateGraph` in `node-sdk` |
| `debug <id\|file>` (`debug.ts`) | Run a workflow end-to-end on the headless kernel and bundle every message/log/output/error/trace; `--browser` adds a real Playwright surface, `--stages` per-stage shots, `--watch` a per-save verdict diff | Run-and-inspect; iterative troubleshooting |
| `node run <type> --props '{…}'` (`node.ts`) | Single-node harness — instantiate one node, feed a prop bag, print what it emits; `--no-secrets` skips the DB | Isolate one node without authoring a graph |
| `run <file>` / `workflows run <id>` | Execute a workflow (id, JSON, or DSL `.ts`) | Quick run by id/file |
| `affected [--base main]` (`affected.ts`) | Map changed files → minimal workspaces to rebuild/test (owning package + downstream + `build:packages` only if a decorator package is hit) | Before reflexively running the full 1–2 min build |
| `deploy …` (`deploy.ts`) | Docker/SSH/RunPod/GCP/Supabase deployments + remote workflow sync/run, DB rows, vector collections | Self-host / cloud ops |
| `--trace-file` / `--trace-stdout` | OTel span tree (timing, tokens, cost) on any run | Profiling agents/workflows |

The same `validate`/`debug` capabilities are exposed to in-product agents as the
`validate_workflow` / `debug_workflow` MCP tools in
`packages/agents/src/tools/mcp-tools.ts` (alongside `run_workflow`,
`create_workflow`, `search_nodes`, `get_node_info`, job/asset tools). See the
[root harness index](../AGENTS.md#agent-harnesses--tooling) and
[docs/AGENTS.md](../docs/AGENTS.md).

## Rules

Baseline rules (see [DEVELOPMENT_STANDARDS](../docs/DEVELOPMENT_STANDARDS.md) for the full set):

- All packages use ES modules (`"type": "module"` in package.json).
- TypeScript strict mode is enabled in all packages.
- Test files go in `tests/` or `src/__tests__/`.
- Each package exports a clean public API via `src/index.ts`.
- Inter-package imports use workspace references (`@nodetool-ai/...`).
- Never import from `dist/` directories in source code.
- Use Vitest for all package tests (not Jest).
- Throw `Error` objects, not strings. Comment intentionally empty catch blocks.

Backend-specific standards (full detail in `DEVELOPMENT_STANDARDS.md`):

- **Fastify routes** declare a `schema` for body/query/params/response — unvalidated payloads are bugs. See [§9](../docs/DEVELOPMENT_STANDARDS.md#9-fastify-http--websocket-server).
- **Drizzle** schemas live in `models/src/schema/`; migrations are generated, not hand-written. No raw SQL when a builder works. See [§10](../docs/DEVELOPMENT_STANDARDS.md#10-drizzle-orm).
- **Zod** is the canonical validator. Schemas and types are co-located: `export const Foo = z.object({...}); export type Foo = z.infer<typeof Foo>;`. See [§11](../docs/DEVELOPMENT_STANDARDS.md#11-zod-validation).
- **`AbortController`** is mandatory for cancellable async (LLM calls, fetches, subprocesses). Plumb the signal through.
- **OpenTelemetry spans** wrap every external call, every workflow step, every IPC handler. Use `gen_ai.*`, `http.*`, `db.*`, `rpc.*` semantic attributes. No PII in spans. See [§17](../docs/DEVELOPMENT_STANDARDS.md#17-observability).
- **WebSocket** payloads on `/ws` are MsgPack, not JSON. Heartbeats every 30s. Backpressure via `bufferedAmount` checks. See [§13](../docs/DEVELOPMENT_STANDARDS.md#13-websocket-protocol).
- **No `console.log`** in committed `packages/*/src/`. Use the structured logger.
- **Native `fetch`** (Node 22) — no `node-fetch`/`axios` in new code without justification.
- **Errors at boundaries** return discriminated `Result` types when expected; throws are for bugs.

`packages/*` currently has `@typescript-eslint/no-explicit-any` disabled (transitional). **target**: zero `any` in `packages/protocol`, `packages/kernel`, `packages/runtime`, `packages/agents`, `packages/node-sdk`. New code must use `unknown` + narrowing or proper generics.

## Node Authoring — Bug Patterns to Avoid

Most `*-nodes` packages have **no** AGENTS.md of their own, so these
cross-cutting rules — distilled from shipped bug fixes — apply to **every** node
you write or edit. Package-specific overlays (e.g. `audio-nodes`, `image-nodes`,
`llm-nodes`) add to, not replace, this list.

### Output contract

- **Every key your `process()`/`genProcess()` returns must be a declared output
  slot** in `metadataOutputTypes`. The graph editor only exposes declared slots
  as connectable handles, so a returned key that isn't declared (a stray `name`,
  `output`, `row_id`, …) is **unreachable downstream** — the data silently
  vanishes. This bit automation-, image-, and audio-nodes.
- **Test that each declared output port is actually populated, and never test a
  node only as a terminal sink** — sinks collect every returned value regardless
  of slot name, so they hide slot-name mismatches. Assert the invariant
  "every returned key is a declared slot" (see
  `automation-nodes/tests/output-slots-and-fixes.test.ts`).
- **A streaming output handle (`chunk`) must be produced by an `async *genProcess`
  generator**, and `outputCorrelation` must match: `iteration` for streamed
  chunks, `single` for the final aggregate. Declaring a `chunk` output on a node
  whose `process()` only returns a final value leaves it permanently empty.
- **Implement every prop you declare.** A declared-but-unwired prop (filter
  `extensions`, `include_subdirectories`, `timeout_seconds`, `gain_db`) is a
  silent no-op. If you delegate to a shared loader, make sure it honors those props.

### Media refs (ImageRef / VideoRef / AudioRef / Model3DRef)

- **`data` carries RAW base64 or a `Uint8Array` — never a `data:` URI.** The hot
  consumers (`decodeAssetBytes` in websocket, `asUint8Array` in openai-provider)
  do `Buffer.from(data, "base64")` with no prefix stripping, so a
  `data:image/png;base64,` prefix corrupts every saved/forwarded asset. Put the
  MIME type in `content_type`, not inline in `data`.
- **Always include the `type` discriminator** (`"image"`/`"audio"`/`"video"`/
  `"model3d"`) on every ref you emit — `isAssetLikeValue`, asset auto-save, and
  downstream type detection all key off it. A bare `Uint8Array` output is an
  untyped value; wrap it as `{ type, data }`.
- **Use your package's `*Ref`/`*RefFromBytes` helper** (`imageRef`/`videoRef`,
  `audioRefFromBytes`/`audioRefFromWav`, the minimax `*RefFromBytes`) instead of
  hand-rolling the object literal — the helper sets `type` and raw-base64 `data`
  correctly.
- **Read input media bytes with the async, context-aware resolver**
  (`loadMediaRefBytes(value, context)` in runtime, or `audioBytesAsync` /
  `videoBytesAsync`). The sync readers (`audioBytes`) see only inline `data` and
  return empty for `asset://`/`file://`/`http`/storage refs — a node that uses
  them silently drops media supplied as an asset or URL.
- **Choosing inline `data` vs `uri`: check `.length > 0`, never bare
  truthiness.** A zero-length `Uint8Array` is truthy, so `if (ref.data)` shadows
  a perfectly good `uri`. Guard `data.length > 0` and fall through to URI/asset
  resolution.

### Indices, bounds, and numeric guards

- **No `if (end < 0) end = length` catch-all.** Pick exactly one documented
  sentinel (e.g. `-1` = "through the end") and count *other* negatives from the
  end Python-style (`len + end`). Always clamp indices and crop/extract boxes to
  the valid range before slicing — downstream libs (sharp) throw on out-of-range,
  and wrappers may swallow the error and silently return the un-cropped input.
- **Never write `Number(x) !== null` / `Number(x) !== undefined`.** `Number()`
  returns a number or `NaN`, never null — the guard is always true and the branch
  is dead. Use `Number.isFinite(x)`, or treat the prop default (usually `0`) as
  "unset". Test *both* branches of every bound check.
- **Evaluate any divisor derived from a prop at the prop's declared `min` and
  `max`.** If it can reach `0` or non-finite (e.g. `2^(bitDepth-1)-1` at
  `bitDepth=1`), floor/clamp it. Test the boundary values, not just the default.
- **Generate evenly-spaced float series as `i * step`, not repeated `+= step`** —
  accumulation drifts for fractional steps (frame ticks at `1000/30`).
- **Track "did X happen" with an explicit boolean set at the decision point**, not
  by inferring `result !== input` — that's wrong when the result legitimately
  equals the input (a snap landing exactly on the cursor).

### Defaults, dead code, and parsing

- **Apply defaults as `{ ...options, key: options?.key ?? DEFAULT }` — spread
  first, default last.** Spreading `...options` *after* a default lets an explicit
  `key: undefined` clobber it (an explicit `undefined` is a present key).
- **A prop default lives in exactly one place (the descriptor).** Inline
  `?? literal` fallbacks must reference that same value, never a hardcoded copy
  that drifts. Collapse any `a ?? a`. A default filename's extension must match
  the bytes actually written.
- **Treat a logically-unreachable branch as a bug, not dead weight** — it almost
  always means the intended behavior was silently never executed (e.g. a dead
  `else if` inside an outer truthy `if` dropped conditional fields). When a
  runtime factory mirrors a codegen reference, keep the branch structure identical.
- **Parse structured binary/markup by structure, not fixed offsets.** Walk RIFF
  chunks honoring word-alignment padding (`offset += 8 + size + (size & 1)`);
  validate the full magic signature *and* minimum byte length before indexing;
  check both byte orders for endian-sensitive formats (TIFF `II*`/`MM\0*`); never
  trust a declared length field from external/streamed data — clamp to bytes
  present. Read feed fields by element/attribute, not RSS-only assumptions.
- **Treat empty-string and whitespace-only input as a valid empty case**, not just
  `null`/`undefined` — `.trim()` before `JSON.parse`/`new RegExp`/numeric parse.
- **Never build an expression evaluator with `new Function`/`with` or naive
  substring `.replace()` of keywords** (it corrupts string literals and makes
  chained comparisons always-true). Tokenize and parse; throw on invalid input
  instead of silently returning an empty result.
- **Release native/GPU handles in a `finally` block, never on the trailing happy
  path.** Allocate as `let h: T | undefined`, `h?.destroy()` in `finally`, so a
  throw during encode/submit/`mapAsync` can't leak the handle.

## External-API Wrapper Nodes

Packages that wrap third-party AI APIs (`atlascloud-nodes`, `topaz-nodes`,
`replicate-nodes`, `kie-nodes`, `fal-nodes`, `minimax-nodes`, …) share a billing
and transport surface where transient errors cost real money. Rules from shipped
fixes:

- **Never retry a non-idempotent request (job-creating `POST`, state-transition
  `PATCH`) on 5xx** — the server may have already acted (and billed) before the
  error. Retry only `GET`/`HEAD` and idempotent `PUT`s (presigned uploads).
- **Always retry the *download* of a billed result** (429/5xx with backoff) — once
  a job is submitted and billed, a transient CDN blip must not discard the
  paid-for output. Also retry *thrown* network errors (ECONNRESET/timeout) for
  idempotent requests, and drain a discarded response body before retrying so the
  keep-alive connection is reusable.
- **Parse `Retry-After` as either delay-seconds *or* an HTTP-date**, clamp to
  `>= 0`, and fall back to exponential backoff when unparseable. Never feed a raw
  `Number(header)` into `sleep` — an HTTP-date yields `NaN` and fires immediately.
- **Centralize terminal poll states in shared SUCCESS/FAILURE sets covering all
  synonyms** (`fail`/`failed`, `cancel`/`canceled`/`cancelled`,
  `complete`/`completed`/`done`/`succeeded`). A terminal status a poll loop
  doesn't recognize must never silently degrade into a timeout. Don't sleep after
  the final poll attempt.
- **Harden SSRF checks on every URL you download**: normalize the host to numeric
  octets using full `inet_aton` semantics (decimal `2130706433`, hex `0x7f...`,
  octal, short-form `127.1`) and unwrap IPv4-mapped IPv6 (`[::ffff:127.0.0.1]`)
  *before* range-checking private/loopback/link-local/metadata; block `localhost`
  and `*.localhost`. A dotted-quad regex is not enough (the
  `169.254.169.254` metadata IP has many encodings). `atlascloud-base.ts` has the
  hardened reference.
- **Extract output URLs by recursively scanning** string / `FileOutput`
  (`.url()`/`.url`) / array / named-key-object shapes; accept a *nested* string
  only if it matches `^(https?:|data:)`. Don't assume the URL sits under a fixed
  key. Don't advertise an API option that produces an extra output the node's
  single-output extractor can't surface.
- **Detect all-numeric enums and register numeric values + numeric default**, and
  coerce the API arg back to a number — a `String()` cast sends `"768"` and fails
  the model's integer schema.
- **Prune empty args by stripping only top-level `null`/`undefined`/`""` keys** —
  never recurse into user-supplied `dict[...]` inputs (you'd mutate their intended
  shape) and never strip `0`/`false`. Return `null` (so arg-cleanup drops it) for
  an asset that can't be turned into a publicly reachable URL — never hand a remote
  API a local/relative path.
- **AssetRefs**: read both snake_case `mime_type` *and* camelCase `mimeType` (prompt
  @-mention injection uses camelCase); model a multi-asset input as
  `list[image]`/`list[video]`/`list[audio]`, not a single asset type with
  `array: true`.
- **Multipart upload**: stop chunking once the source is fully consumed (no
  zero-byte trailing parts) and echo correlation IDs (`uploadId`) from the
  accept/initiate step into the complete call.
- **Wire `AbortSignal` into the runtime's cooperative cancellation hook** (e.g.
  transformers.js `InterruptableStoppingCriteria`), not just a post-hoc
  `signal.aborted` check, and surface `AbortError` (not the internal interrupt
  error). Clean up the listener.

## Adding a New Package

1. Create directory under `packages/<name>/` with `package.json`, `tsconfig.json`, `src/index.ts`.
2. Set `"name": "@nodetool-ai/<name>"` and `"type": "module"` in package.json.
3. Add the workspace path to the root `package.json` `workspaces` array.
4. Add the build step in the correct position in `npm run build:packages` script (respecting dependency order).
5. Run `npm install` from the repo root to link the workspace.
