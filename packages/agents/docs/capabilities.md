# Capabilities and tool sources

**Navigation**: [Agents package rules](../AGENTS.md) → **Capabilities and tool sources**

Paths are relative to `packages/agents/` unless they name another package.

## Capability registry (`src/capabilities/`)

A capability is what replaced the `Tool` class: a **spec** (wire name,
description, input schema, and a required `PermissionCategory`), an **impl**
`(run, args) => result`, and a **`CapabilityRun`** that carries everything only
a run knows — the `ProcessingContext`, the permission gate, the browser router
for `ui_*`, the sub-agent runtime, and the injected singletons
(`nodeRegistry`, `providers`, `examples`, `exportDsl`, loaders). Per-run state
arrives at *call* time, not at construction time, which is what lets one
process-level registry serve every host. Design:
[docs/tool-class-retirement-design.md](../../../docs/tool-class-retirement-design.md).

[`metadata.ts`](../src/capabilities/metadata.ts) owns the eager
`CAPABILITY_SPECS` table and synchronous spec lookups. Each namespace imports
its data-only sibling (`workflows.specs.ts`, `media.specs.ts`, …), which holds
wire names, descriptions, schemas, categories and message templates without
loading implementations. Use `capabilitySpec(name)` and `listCapabilitySpecs()`
from this module when only metadata is needed.

[`registry.ts`](../src/capabilities/registry.ts) owns the lazy
`CAPABILITY_MODULES` loaders and their process-level cache. Each entry refers
to its namespace in `CAPABILITY_SPECS`. TypeScript checks the loader keys
against the metadata keys. The registry reexports the metadata lookup APIs.
`capabilityForName(name)` returns the shared eager spec and a lazy
implementation. Chat and MCP catalogs use specs, with provider declarations
built by `capabilityProviderTool(spec)`. Dependencies belong to the host
`CapabilityRun`.

`toolFromLazyCapability(spec, run)`, `toolForCapabilityName(name, run)`, and
`toolFromCapability(spec, impl, run)` remain compatibility adapters for
executors and provider loops that require `Tool[]`. Their calls use the
permission and validation machinery in `invoke.ts`. Native capabilities must
never pass through `capabilityFromTool`.

A module imports its own specs back and attaches each to an implementation, so
one spec *object* stands behind both halves, and `eagerSpecDrift` compares them
by identity — a module that copied its spec would pass a field check and still
be two things to keep in step. `CapabilitySpec.zodSchema` carries the Zod schema
for the capabilities whose identity is one (`view_image`, `list_images`, the
`ui_*` document tools, the `settings` and `packs` namespaces). It is checked
once, by `validateCapabilityArgs` (`capabilities/args.ts`) at the invocation
seam. Compatibility wrappers forward to that same seam. The reserved
`_tool_call_id` survives validation, and approval prompts preserve `_message`.

What the registry deliberately does *not* serve is written down where the API
it mirrors lives: `packages/websocket/src/trpc/sandbox-coverage.ts` classifies
every tRPC procedure as covered by a capability, reachable through a
differently-shaped one, withheld with the risk stated, or a recorded gap.
`packages/websocket/tests/sandbox-api-coverage.test.ts` walks the live router
and fails in both directions, so a new procedure cannot land unclassified and a
stale verdict cannot outlive what it judged. The rule the withheld set follows:
a run may act on the rows its own user owns, and may not touch credentials,
billing, other tenants, host control, the transcript of its own behaviour, or
anything that grants a third party access.

`DECLARED_CAPABILITY_MODULES` is derived from `CAPABILITY_MODULES`. The
TypeScript key check requires a loader for every metadata namespace and
rejects undeclared loader keys. `capabilityModuleDrift()` reports an export
missing its name, description, schema, category or implementation
(`capabilityModuleIssues`), a spec object rebuilt instead of imported from
its `.specs.ts` sibling (`eagerSpecDrift`), and one name owned by multiple
modules. [`tests/capabilities-registry.test.ts`](../tests/capabilities-registry.test.ts)
also pins a checked-in `name → category` snapshot.
[`tests/capabilities-coverage.test.ts`](../tests/capabilities-coverage.test.ts)
requires everything `getBuiltinTools()` and `getAllMcpTools({})` assemble
to resolve through `findCapability`, or appear in its exception list with a
reason.

[`invoke.ts`](../src/capabilities/invoke.ts) holds the permission and validation
sequence. Chat, MCP, sandbox imports, and headless evals invoke their owned
`CapabilityRun` directly. A child context needs its own run because its memory,
workspace, and delegation depth can differ, while sharing the host's gate.

`capabilityRunForTools` ([`legacy-tools.ts`](../src/capabilities/legacy-tools.ts))
builds the belt run. Native compatibility wrappers contribute their original
spec and implementation, preserving injected dependencies while taking the
belt's gate, signal, and invocation function. Only actual legacy implementations
use `capabilityFromTool`. `gateLegacyTools` caches that run per belt and context
for consumers that still require `Tool[]`. Sandbox bridges take tool metadata
and an invocation function. The Code node supplies its host's gate. The sandbox
belt retains its explicit ungated run.
Tests in `capabilities-headless-permission.test.ts` cover direct invocation,
headless permissions, metadata, validation, and the compatibility boundary.

The guest reaches a namespace by import, never by a global:

```js
import { list_workflows } from "@nodetool-ai/sandbox-nodetool/workflows";
const { workflows } = await list_workflows({ limit: 20 });
```

Exports carry the wire name — `list_workflows`, not `listWorkflows` — so the
prompt, the MCP surface and the belt all say one string. The facade generator
and specifier shape live in `@nodetool-ai/protocol`
(`sandbox-capability.ts`); the module list stays in the registry here, and the
*host* decides which modules a session mounts. A third-party pack can never
declare one. `createCapabilityDispatcher` validates module key, export name and
argument list on every call, then delegates to `invoke` — it never gates on its
own, so the import path and the belt bridge reach one implementation past one
gate.

`coerceCapabilityArgs` (`capabilities/args.ts`) is the argument half of that
check, and it both folds and refuses. It folds camelCase onto snake_case, a
lone string onto the first required string field, and a bare `id` onto the one
required `*_id` key — only when there is exactly one, so nothing is guessed.
Then it refuses a call that brought arguments but not the required ones,
naming the call, the missing keys and what was passed instead. Before that,
`get_workflow({ id })` reached the implementation as `workflow_id: undefined`
and answered **"Workflow undefined was not found"** — a report about a missing
workflow for what was a misspelled argument, and one an agent read as a broken
database. It cost six calls and three wrong theories in one session. A call
with *no* arguments is still passed through: `{}` is the documented shape for
the capabilities that require nothing, and for the rest the implementation's own
"x is required" already names the field. The flat `tools.<name>()` global is gone: every capability is an import,
and what a session added at its own call site is grafted onto `.../session`
(client `ui_*` tools onto `.../ui`) so one import shape covers everything. The
`nodetool` object model stays a global.

**Import direction is one-way: `capabilities/` imports
`tools/tool-permissions.ts`, never the reverse.** That is why `gateLegacyTools` sits
in `capabilities/` and not beside the classification map it uses. The reverse
edge made the bundled backend's module wrappers an async cycle —
`init_tool_permissions` awaiting `init_adapters` awaiting
`init_tool_permissions` — which esbuild's `__esm` cannot break the way real ESM
breaks a synchronous cycle, and `server.mjs` died on an unsettled top-level
await before it served `/health`. `npm run backend:smoke` is the check that
catches it; a passing `vitest` run will not.

## Capability coverage — every capability names its check

`SurfaceEntry.paths` in the harness registry is coarse on purpose:
`packages/agents/` is one path, so a diff that *adds* a capability lights up
exactly the checks a diff that renames a local variable does. Five capabilities
shipped through that hole before anyone noticed nothing exercised them
(#5095, #5100, #5103, #5105, #5107).

So there is a second table one rung down:
**`packages/cli-harness/src/harness/capability-table.ts`**. One entry per exported
capability, naming the file that implements it, the checked-in suites a
selfcheck runs over it, the eval cases whose `expect.requiredTools` demand it,
and — where nothing does yet — a written gap note. The invariant is the
registry's: **no capability without a check or a documented gap.**

Everything mechanical is derived, so the table cannot rot:

```bash
npm run capabilities:sync     # rewrite the table from the live registry
npm run capabilities:check    # fail if it is stale (the Quality Gate's typecheck leg)
npm run dev:nodetool -- harness capabilities [--json] [--strict]
```

`name`, `module`, `contract`, `suites` and `evals` come from
`scripts/sync-capability-coverage.mjs`, which reads the live specs, scans the
agent suites, and imports the eval case files. The one hand-written field is
`gap`, and the sync preserves it. A capability that names every other
capability by construction — the category snapshot in
`capabilities-registry.test.ts`, the belt walk in `capabilities-coverage.test.ts`
— is excluded from suite attribution; counting them would make everything look
covered.

**Adding a capability means adding its check.** Write the eval case or the
suite first; `npm run capabilities:check` fails on a new capability with
neither, and it will not accept a gap note that still says TODO. Changing what
a capability *declares* — its description, input schema, category, or
`needsToolCallId` — moves its `contract` fingerprint, and
`nodetool harness gate --base <ref>` then refuses a diff that left the coverage
mapping untouched: say which case covers the new contract, or write down why
there isn't one. A refactor that leaves the contract alone demands nothing and
runs the mapped checks as usual.

## The core API is in-process (`src/tools/mcp-tools.ts`)

The workflow/node/job/asset tools call NodeTool's own code, never HTTP. There
is no `NODETOOL_API_URL`, no `fetch`, and no server that has to be listening:

| Concern | Where it comes from |
|---|---|
| Workflows, jobs, assets | `@nodetool-ai/models` (`Workflow`, `Job`, `Asset`) |
| Running / debugging a workflow | `runWorkflow` in `@nodetool-ai/execution/service` |
| Interactive escalations | `submitEscalationVerdict` + the `debugSessions` registry, same module |
| Debugging an app | `runApplicationDebug`, same module |
| Building an app | `runApplicationBuild` (`src/app-build/build-service.ts`) |

`@nodetool-ai/execution/service` is the layer the REST routes call too, so a
tool result and the endpoint's response are one function's answer and cannot
drift. `packages/websocket` keeps the Fastify routes, auth and WS transport as
thin adapters over it.

Three things live above this package in the dependency order and arrive by
injection through `getAllMcpTools(options)`:

- `registry` — a `NodeRegistry`. Node discovery needs it, and so does anything
  that executes. Without one those tools answer with a "no node registry in
  this process" error instead of reaching for a network fallback.
- `examples` — the shipped example-workflow catalog (JSON inside the installed
  node packages; only the server walks the metadata roots).
- `exportDsl` — `workflowToDsl` from `@nodetool-ai/dsl`.

The server builds all three in `packages/websocket/src/mcp-tool-deps.ts` and
spreads `mcpToolHostDeps()` into every `getAllMcpTools` call site.

A fourth, `providers`, adds `find_model` and `list_models` — and only those.
They enumerate the injected map, so without one they can say nothing but "no
providers configured". The media tools (`generate_image`, `generate_speech`, …)
used to be added beside them and are built-ins now: each reaches a provider
through `context.runProviderPrediction` and reads nothing off the run, so the
map was never their dependency. Gating them on it meant a host that injects
none — a Code node, a JS script — got a belt that could `critique_image` and
`score_image_adherence` but had no way to make an image, and
`nodetool.media.generateImage` threw `tool "generate_image" is not in this
toolbelt` after the run had paid for the prompt that produced its argument.
Pinned by `tests/sandbox-belt-reach.test.ts`.

## External MCP servers (`src/tools/external-mcp-tools.ts`)

A user's own MCP servers — Blender, Hugging Face, a local script — join the
belt as ordinary `Tool`s named `mcp_<server>_<tool>`. That one shape is why
every loop reaches them the same way: the base provider loop and the OpenAI
Responses loop (Codex included) dispatch through the harness `executeTool`,
the Claude Agent provider serves the belt to the CLI as an MCP server, and a
CodeAct guest imports them from `@nodetool-ai/sandbox-nodetool/mcp`
(`graftedModuleFor` in `codeact/capability-modules.ts`). No provider knows
they are remote.

`McpClientPool` keeps one client per server config: `sync(configs)` opens,
replaces or closes connections as the list changes, `discover()` caches each
server's `listTools`, and a server that refuses is skipped for the turn and
retried on the next sync. Stdio servers spawn with the parent's environment
plus the config's `env`; HTTP servers try Streamable HTTP and fall back to
SSE. `${SECRET_NAME}` in an env var or header resolves inline through the
pool's `getSecret`; the server's persistence moves every literal value into
an encrypted secret named `MCP_<SERVER>_<KEY as hex>` and stores the reference, and
resolves references from the user's own secrets only, never the process
environment. Under the cloud profile HTTP servers fetch through `safeFetch`,
so a private or loopback URL is refused on save and on every redirect. A tool
result's text and structured content come back as the tool's answer, its
`resource_link` blocks as `resource_links` (a file the tool produced rather
than inlined), and its image blocks ride `image_contents` like any other belt
tool's pixels.

**Opening a connection is bounded, and dropping one cancels it.**
`Client.connect` awaits `transport.start()` before it sends the timed
`initialize` request, so a server that accepts the socket and then says
nothing — an HTTP server refusing the Streamable POST and opening an SSE
stream with no `endpoint` event — leaves that first await pending forever.
Each entry therefore carries a deadline (`connectTimeoutMs`, 30s; the settings
probe uses 15s) and an `AbortController` whose abort closes the transport.
`sync` cancels the entries its list drops **before** it queues, because
`discover()` holds the pool's queue while it waits and disabling the offending
server is how the user recovers — a cancellation queued behind that discovery
would be one the user has to wait out. Every transport starts through
`startTransport`, which refuses a start the entry has already cancelled:
resolving secrets and importing the SDK module are awaited, so the server can
be deleted while a connection is still being prepared, and closing an
unstarted stdio transport does not stop a later `start()` from spawning the
command.

**Redaction is per resolved value, not per header.** `resolveSecretReferences`
reports every value an expansion produced, at every level, so an entry blanks
both `Bearer <tok>` and `<tok>` — an upstream `Invalid token <tok>` quotes the
token, not the header it arrived in. Values under four characters are left
alone; nothing authenticates with one, and blanking it would eat unrelated
text.

The config shape (`McpServerConfig`, `@nodetool-ai/protocol`) is shared with
the server's persistence (`packages/websocket/src/external-mcp.ts`, one
`Setting` row per user, the `externalMcp` tRPC router) and the settings UI
(`web/src/components/menus/ExternalMcpServersSection.tsx`). The cloud
profile refuses stdio servers, since a command runs on the machine the server
owns. A remote tool has no capability entry, so `gateLegacyTools` classifies it
`external`. Tests: `tests/external-mcp-tools.test.ts` (a real MCP server over
an in-memory transport), `packages/websocket/tests/external-mcp.test.ts`.
