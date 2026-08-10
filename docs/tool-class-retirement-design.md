# Retiring the `Tool` class: every capability is a pack module behind one action tool

Two decisions are fixed. First, every agent capability becomes a `nodetool` API module
exposed as an ordinary QuickJS pack, and the `Tool` class goes away. Second, the MCP
server exposes exactly two tools, `execute_code` and `view_image`, and everything else
registered in `mcp-server.ts` — the native tools, the frontend renderer bridge, and all
MCP App code — is deleted. This document designs how, and works out what breaks.

## The problem

Every agent step already acts by writing JavaScript in the QuickJS sandbox. PR #4826
(commit `ccb1643`) finished that consolidation: `run_code`, `js`, and script mode are
gone, `execute_code` is the only code path, and the MCP server assembles its surface
from the same `createChatCodeActSession` the chat runner uses
(`packages/websocket/src/mcp-agent-tools.ts:464`).

Two things predate CodeAct and were never reconciled with it.

**Capabilities are still `Tool` classes.** `packages/agents/src/tools/base-tool.ts:31`
defines an abstract class whose reason to exist — `toProviderTool()` at
`base-tool.ts:120`, rendering one JSON-schema tool per capability for a provider loop —
no longer matches how capabilities are reached. A model reaches `list_workflows` as
`nodetool.workflows.list()` inside a sandbox action; the class's schema is rendered
into a prompt catalog at most, and for the ~91 wrapped tools not even that
(`nodetoolApiCoveredToolNames`, `packages/agents/src/codeact/nodetool-api.ts:141`,
filters them out of the catalog). Measured on this tree: `extends Tool` appears **180
times across 77 files**, 68 of them in `packages/agents` (tests included); outside
agents the subclasses are `RunNodeTool` and two UI bridge tools in `websocket`, the
Code-node tool factory in `code-nodes`, `SandboxTool` in `sandbox-tools`, the CLI's
`ExecuteCodeTool` shim (`packages/cli/src/chat-codeact.ts:35`), and two browser-agent
factories in `automation-nodes`. 104 files import the `Tool` symbol; 27 of those import
it purely as a type or for `Tool[]` plumbing without subclassing — executors, the
permission gate, the eval runners, node hydration in `llm-nodes`, the MCP bridge.

**The MCP server still hand-builds a product surface.** `createMcpServer`
(`packages/websocket/src/mcp-server.ts:364`) natively registers: the fifteen
`uiToolSchemas` entries routed to a connected editor over renderer transports
(`mcp-server.ts:384-447`), `list_renderers` (`:449`), `run_workflow` (`:468`),
`get_asset` (`:543`), `get_node_info` (`:593`), `get_job` (`:637`), `get_collection`
(`:705`), `query_collection` (`:745`), and seven `registerAppTool` registrations
(`list_assets`, `list_workflows`, `get_workflow`, `list_jobs`, `list_nodes`,
`search_nodes`, `list_collections` — call sites at `mcp-server.ts:983`, `:1054`,
`:1146`, `:1188`, `:1239`, `:1276`, `:1338`) that attach interactive HTML views from
`packages/websocket/src/mcp-apps/` — 7 files, 1,487 lines. Nothing outside `mcp-apps/`
and `mcp-server.ts` imports `shell.ts` or calls `registerAppTool` (verified by grep),
so Decision 2's deletion is clean at the import graph level. What it deletes in
*capability* is worked out below.

## The blocker: host modules have no per-run context

The pack mechanism that must absorb the capabilities was built for libraries, and
libraries are pure. `loadSandboxHostModule` caches **one implementation per process**
(`packages/agents/src/host-modules/registry.ts:60-75`), and the dispatcher's entry
point is `call(moduleKey, exportName, args)`
(`packages/agents/src/host-modules/dispatcher.ts:50`, validation ladder at
`:101-133`) — the only inputs an implementation ever sees are the guest's arguments.
That contract is exactly right for papaparse and fflate. It cannot serve a single
NodeTool capability, because every one of the 180 needs state that exists only per run:

| Needs | Where it comes from today |
|---|---|
| `ProcessingContext` (user, secrets, workspace, storage, asset interfaces) | passed into `Tool.process(context, params)` (`base-tool.ts:58`) by the executor or router |
| The permission gate and its approval round trip | `GatedTool` wraps every belt tool per turn (`packages/agents/src/tools/tool-permissions.ts:274`, applied at `packages/websocket/src/unified-websocket-runner.ts:5368`) |
| The chat tool router (browser round trip for `ui_*` tools) | `createChatCodeActSession`'s caller-supplied `executeTool` (`packages/agents/src/codeact/chat-codeact.ts:82`) |
| provider + model + parent belt + event forwarding | `RunSubtaskTool`'s constructor options (`packages/agents/src/tools/run-subtask-tool.ts:52`, constructed per turn at `unified-websocket-runner.ts:5403`) |

Today the per-run state arrives by **closure at construction time**: the runner builds
a fresh belt every turn (`unified-websocket-runner.ts:5296-5310`), handing constructors
whatever they need — a registry, a providers map, a `runSingleNode` closure, loaders
for tRPC-only rows (`mcp-agent-tools.ts:340-343`). A process-level pack registry cannot
close over any of that. The design's center is therefore a second dispatcher that can.

## What is verifiably there (and two corrections)

The `nodetool` object model is already most of the migration. Evaluating
`NODETOOL_API_PRELUDE_FULL` (`nodetool-api.ts:803`) yields **21 top-level members** —
18 namespaces plus the callables `capabilities()`, `batch()`, `graph()` — carrying
**97 methods** over **91 distinct belt tools** (measured by executing the prelude
against a recording `tools` proxy; the namespace map at `nodetool-api.ts:20` lists the
same 91). Each method is a thin wrapper: `__need(name)` resolves the belt tool or
throws naming it (`nodetool-api.ts:161-169`), and `buildNodetoolApiPromptSection`
(`nodetool-api.ts:1086`) documents only namespaces the belt can serve. So the migration
is not "write 180 modules"; it is "move 91 wrappers off `tools.*` name resolution onto
real pack exports, and give their implementations a run context".

**Tools constructed outside the zero-arg catalogs.** Eleven wrapped tools are absent
from `getAgentToolbelt()` + `getAllMcpTools({})` and come from their owning subsystems:

- `vector_index`, `vector_batch_index`, `vector_text_search`, `vector_hybrid_search` —
  constructors take a `VectorCollection`
  (`packages/agents/src/tools/vector-tools.ts:63`, `:117`, `:190`, `:645`).
- `list_provider_models` — constructor takes the configured-providers map
  (`packages/agents/src/tools/model-tools.ts:20`).
- `run_subtask` — provider, model, parent belt, forward callback
  (`run-subtask-tool.ts:52`; `builtin-tools.ts:15-19` documents the exclusion).
- `run_node` — a `runSingleNode` closure
  (`packages/websocket/src/agent/run-node-tool.ts:18`, constructed at
  `unified-websocket-runner.ts:5306`).
- `validate_timeline`, `validate_sketch` — row loaders, because those surfaces are
  tRPC-only (`mcp-agent-tools.ts:143-171`, `:340-343`).
- `list_collections`, `query_collection` — one correction to the brief: these are
  **zero-arg** (`packages/agents/src/tools/collection-tools.ts:17`, `:49`). They sit
  outside the catalogs because they import `@nodetool-ai/vectorstore` at call time
  (`collection-tools.ts:31-33`) and the runner adds them explicitly
  (`unified-websocket-runner.ts:5304-5305`). The conclusion stands — availability
  depends on what the host supplies — but for these two the dependency is a package,
  not a constructor argument.

**Belt tools with no `nodetool.*` method.** Measured against the two catalogs, exactly
ten: `read_file`, `write_file`, `edit_file`, `list_directory`, `glob`, `grep`
(deliberate — the sandbox's own `workspace.*` API is in-process and costs no tool
call), `todo_write`, `view_image` (deliberate — pixels, see below), and the two
stragglers `asset_list` (beside the wrapped `list_assets`) and
`export_workflow_digraph`.

**The graph editor is a second prelude.** The eight workflow-document tools
(`packages/node-sdk/src/workflow-document-tools.ts:8`) reach the guest as
`openWorkflow()` (`packages/agents/src/codeact/graph-model.ts:49`): synchronous
mutators against a local mirror, replayed through the same `ui_*` contract on
`commit()`.

**Correction on inline thumbnails.** The brief said `get_asset`, `get_job` and
`run_workflow` return image blocks. `get_asset` and `get_job` do
(`mcp-server.ts:566-574`, `:680-686`), and so do the App-registered `list_assets`,
`list_workflows` and `get_workflow` (`:1029-1035`, `:1121-1127`, `:1166-1172`). The
native `run_workflow` does **not** — its handler returns JSON text only
(`mcp-server.ts:517-524`).

**The `execute_code` description.** Registered as
`providerTool.description + "\n\n" + systemPromptSection`
(`mcp-agent-tools.ts:491-494`). Measured by building the session over the two
catalogs (86 tools after dedup, 11 direct): **18,048 characters**. The real mount adds
Google Workspace, the media tools, and the two validators, so ~19k is right.

## Design

### What replaces `Tool`

Three pieces: a spec (the schema-shaped identity), an implementation that takes a
run context as its first argument, and a per-run object that carries everything the
table above lists. The class dissolves into data plus a function.

```ts
// packages/agents/src/capabilities/types.ts (new)
export interface CapabilitySpec {
  readonly name: string;                 // wire name, unchanged: "list_workflows"
  readonly description: string;
  readonly inputSchema: JsonSchema;      // rendered for prompts, searchTools(), MCP
  readonly category: PermissionCategory; // REQUIRED — no default-to-external fallback
  userMessage?(args: Record<string, unknown>): string;
}

export type CapabilityImpl = (
  run: CapabilityRun,
  args: Record<string, unknown>
) => Promise<unknown>;

export interface CapabilityRun {
  readonly context: ProcessingContext;
  /** The one gate. decide → (ask ↔ UI) → monitor → run; owns the session allow-set. */
  readonly gate: CapabilityGate;
  /** Browser round trip for ui_* capabilities; absent on headless runs. */
  readonly client?: ClientToolRouter;
  /** provider, model, parentBelt(), forwardMessage — what run_subtask/run_search need. */
  readonly subAgent?: SubAgentRuntime;
  // The injected singletons getAllMcpTools takes today (mcp-tools.ts:2168-2210):
  readonly nodeRegistry?: NodeRegistry;
  readonly providers?: Record<string, BaseProvider>;
  readonly examples?: ExampleWorkflowCatalog;
  readonly exportDsl?: WorkflowDslExporter;
  readonly loaders?: { timeline?: TimelineLoader; sketch?: SketchLoader };
  /** The single choke point: lookup → gate → impl. Every surface calls this. */
  invoke(name: string, args: Record<string, unknown>): Promise<unknown>;
}
```

The registry entry is `(run) => impl` in effect, but flattened: implementations are
registered once per process as `(run, args) => result`, and the run threads through
every call. This moves the per-run closure from **construction time** (today's fresh
belt per turn) to **call time**, which is the property a process-level pack registry
needs. The registry itself mirrors the host-module loader table — one lazy loader per
module, nothing in an entry graph:

```ts
// packages/agents/src/capabilities/registry.ts (new) — same shape as
// host-modules/registry.ts:24-49, one dynamic import per module.
const MODULES: Record<string, () => Promise<CapabilityModule>> = {
  workflows: () => import("./workflows.js").then((m) => m.module),
  models:    () => import("./models.js").then((m) => m.module),
  // ...
};
```

### The dispatcher change: a second dispatcher, not a widened one

`createSandboxHostDispatcher` stays exactly as it is. Its contract — pure functions
over plain data, one implementation per process — is a security property, not a
limitation: a library pack that could see a run context would hold the action's
capabilities, which is the scenario the consent design exists to prevent
(`packages/agents/src/codeact/sandbox-packages.ts:1-13`). Widening it to optionally
carry a `CapabilityRun` would make every third-party pack one registry bug away from
the platform surface.

Instead, a `createCapabilityDispatcher(run, modules)` is built per invocation, in the
same place the tool bridge is built today (`buildToolBridge`,
`packages/agents/src/codeact/tool-api.ts:99`, and the chat session's `callTool`,
`chat-codeact.ts:219`). It runs the same validation ladder as the host-module
dispatcher (declared module, listed export, array args — `dispatcher.ts:101-133`) and
then, where the library dispatcher loads an implementation, it calls `run.invoke`.
Both dispatchers share `generateSandboxHostFacade`'s facade shape
(`packages/protocol/src/sandbox-host.ts:175`) and the private-bridge mechanics
(`sandbox-host.ts:140-165`); only the far side differs.

### Where the permission gate lives

Today the gate is `GatedTool`, a wrapper class whose `process()` runs
decide → session-allow → approval → monitor before the inner tool
(`tool-permissions.ts:274-409`), applied by `gateTools` at
`tool-permissions.ts:412`. With no `Tool.process` left to wrap, the gate moves into
`CapabilityRun.invoke` — the one place lookup already happens. The dispatcher does
**not** gate on its own; it delegates to `invoke`, and so does every other entry path
(a direct MCP registration, a core provider tool, `run_subtask`'s child loop). That
keeps the current invariant — a direct call and an in-sandbox call run the same code
(`runBridgedTool`, `mcp-agent-tools.ts:412`) — and strengthens it: today the invariant
holds because both paths call the same `Tool` instance; after, it holds because there
is only one call site.

What this costs:

- The decide/ask/block matrix (`decidePermission`, `tool-permissions.ts:220`) and the
  monitor consult move verbatim; the read-class fast path (`tool-permissions.ts:319`)
  must be preserved in `invoke`, with a test.
- Classification changes ownership. `TOOL_PERMISSION_CATEGORIES`
  (`tool-permissions.ts:41-209`) dissolves into each `CapabilitySpec.category`, which
  is **required**. The current default — anything unlisted is `external`
  (`tool-permissions.ts:212-214`) — is a good fail-closed rule for a string-keyed map
  and a bad one for a typed registry: a required field plus a registry drift test (the
  analog of `sandboxHostModuleDrift`, `host-modules/registry.ts:86`) is stricter than a
  silent conservative default, because a *misclassification* becomes a reviewable diff
  instead of a runtime surprise.
- Approval prompts suspend the sandbox clock. The runner already owns this
  (`createSandboxClock` wired around `requestApproval`,
  `unified-websocket-runner.ts:5356-5367`); the suspension moves inside the gate so
  every host gets it, not just the chat runner.

### `ui_*` capabilities: in the pack surface, outside its implementation

`ui_*` tools are schemas, not host functions — the chat runner routes them over the
ToolBridge to a browser (`chat-codeact.ts:1-18`), and the MCP mount routes the eight
document tools to a live renderer when one is connected (`mcp-server.ts:794-807`). They
stay that way. Their pack exports are one-line implementations:

```ts
impl: (run, args) => {
  if (!run.client) throw new Error("ui_sketch_stroke needs a connected editor");
  return run.client.execute("ui_sketch_stroke", args);
}
```

The guest-side graph object model (`openWorkflow`, `graph-model.ts`) is untouched by
this: it is already plain guest JS over `tools.ui_*`, and becomes plain guest JS over
the pack's `ui` exports. The alternative — leaving `ui_*` outside the pack as a
residual `tools.*` namespace — would keep two calling conventions alive forever and is
rejected.

### Import or global? Import.

`nodetool.*` is a global today, which contradicts the rule that killed `data.*`:
libraries are imports, never globals (`docs/sandbox-package-design.md` §M6,
`packages/sandbox-packs/README.md:8`). The counter-argument is real: `nodetool` is a
capability surface, not a library, and the consent mechanism exists to keep a *model*
from handing third-party pack code the action's capabilities
(`sandbox-packages.ts:1-13`) — a concern that does not apply to the platform's own
surface, whose availability the host already decides by composing the belt.

Decide it anyway: **the platform becomes
`import { workflows } from "@nodetool-ai/sandbox-nodetool"`**, for three reasons.

1. One module system. Two conventions (imports for libraries, a global for the
   platform) is a permanent tax on the prompt, the static analyzer
   (`code-analysis.ts` already validates import specifiers), and every future surface.
2. Availability becomes visible where code is checked. Today a missing capability
   surfaces when `__need` throws mid-action (`nodetool-api.ts:161-169`). An undeclared
   import is refused before the action runs, with the module named
   (`mountActionModules`, `sandbox-packages.ts:75`).
3. The session story unifies. What a session can do = the modules mounted for it.

With one carve-out: the platform pack does **not** go through the model-facing consent
allowlist. Consent gates third-party code; the platform modules are mounted by the
host, per session, for exactly the namespaces its `CapabilityRun` can serve — the same
decision the host makes today when it assembles the belt. A session whose host mounts
nothing imports nothing, and the import fails naming the module. During migration the
`nodetool` global stays as a generated shim over the imports for at least one release,
then dies.

### Pack layout: one pack, one module per namespace

`@nodetool-ai/sandbox-nodetool`, with submodule specifiers per namespace:
`@nodetool-ai/sandbox-nodetool/workflows`, `/models`, `/media`, and so on, following
the boundaries already drawn by `NODETOOL_API_NAMESPACE_TOOLS` (`nodetool-api.ts:20`).
One pack, because availability is decided per session and documented per namespace —
several packs would multiply manifests without adding a boundary anyone checks.
Module-per-namespace, because:

- the prompt tier already documents per namespace and drops namespaces the run cannot
  serve (`buildNodetoolApiPromptSection`, `nodetool-api.ts:1086-1118`) — mounting per
  namespace makes that real instead of advisory;
- lazy loading holds per namespace: the registry's loader table means a run that never
  touches `storyboards` never loads `storyboard-render-tools`' dependency cone;
- the eleven subsystem-dependent capabilities map onto mount decisions: a host that has
  no vector store simply does not mount `/collections`, and the failure mode is an
  import error naming the module instead of a `__need` throw naming a tool.

Like the host-module table pins each id to one pack (`SANDBOX_HOST_MODULES`,
`sandbox-host.ts:47`; foreign claims refused at `dispatcher.ts:87-91`), the capability
module table is first-party only: a third-party pack cannot declare a capability
module, for the same reason it cannot declare a host module.

`batch()` and the graph DSL core are guest-side helpers with no host call of their own
(`nodetool-api.ts:273-310`, `graph-dsl-core`); they ship as guest code inside the pack,
not as dispatched exports.

### Lazy loading and the two bundlers

Nothing new enters an entry graph. The capability registry copies the host-module
pattern exactly: lazy loader per module (`host-modules/registry.ts:24-49`), each
implementation importing its heavy dependencies inside itself
(`collection-tools.ts:31-33` is already the model). The packaged Electron backend
needs no `PACKAGE_RUNTIME_ASSETS` entry — capability modules are code, and esbuild
inlines dynamic imports into `server.mjs` the way it already inlines the host-module
implementations (`host-modules/registry.ts:8-12`). The browser runner is unaffected:
capability dispatch exists only where a `CapabilityRun` exists (server, CLI, tests);
the generated facades are text served like any sandbox module, and a browser session's
tool calls already execute server-side.

### What stays schema-shaped, and where it lives

Two provider tools survive, and neither needs the class:

- `execute_code` is already constants, not a `Tool`: `EXECUTE_CODE_TOOL_NAME` and
  `EXECUTE_CODE_INPUT_SCHEMA` (`packages/agents/src/codeact/codeact-executor.ts:110`,
  `:195`). The CLI's `ExecuteCodeTool` wrapper (`cli/src/chat-codeact.ts:35`) and the
  MCP registration consume the session's `providerTool` record
  (`chat-codeact.ts:447-457`); both become plain records.
- `view_image` becomes a `CapabilitySpec` + impl with `category: "read"`
  (today `packages/agents/src/tools/view-image-tool.ts:96`). Hosts register it as a
  direct provider tool because pixels cannot ride the JSON observation envelope —
  the runner strips image payloads from sandbox results and hands pixels only through
  the direct path (`chat-codeact.ts:277-281`, `unified-websocket-runner.ts:5738-5762`,
  `mcp-agent-tools.ts:456-459`). That rule is unchanged.

`CapabilitySpec` also feeds everything else that consumes schemas today: prompt
signature rendering (`toolSignature`, `tool-api.ts:351`), in-sandbox `searchTools()`
(`chat-codeact.ts:299-328`), and the chat direct-tool set (`CORE_TOOL_NAMES` members
offered as plain provider tools, `tool-api.ts:204`, `:223`). The core set is a chat
concern and is not touched by Decision 2 — see the MCP section.

## What Decision 2 deletes, item by item

Decision 2 leaves the `/mcp` mount with `execute_code` and `view_image`. Note this is
narrower than today's post-#4826 surface, which also registers the ~11 core tools as
direct MCP tools (`mcp-agent-tools.ts:516-525`): those registrations go too. An MCP
caller that wants to read a file in the session workspace writes a one-line action.
That is an acceptable cost on MCP — callers are agents with their own file tools —
and it is the decision's stated shape.

**Inline thumbnails: partially regress, say so.** The native `get_asset` and `get_job`
put real image blocks in the tool response (`mcp-server.ts:566-574`, `:680-686`), and
the App-registered list tools attach thumbnails (`:1021-1035`, `:1113-1127`). Those
channels die with the native registrations. `view_image` covers the load-bearing case —
inspect one image by asset id, region and detail included — because it stays a direct
tool whose result carries image content. What it does not cover is *browsing*: a
gallery of twenty thumbnails in one response has no equivalent, since a sandbox action
can only return handles. This is a real regression for Claude Desktop-style hosts and
should be listed in the release notes, not smoothed over. If it turns out to matter,
the recovery path is an MCP resource serving thumbnails by asset id, not a third tool.

**The frontend renderer bridge: route the survivors through the belt.** Removing the
native `uiToolSchemas` loop deletes two different things. The eight workflow-document
tools survive unchanged for scoped sessions — they are on the bridged belt and already
route to a live renderer through `executeFrontendDocumentTool`
(`mcp-server.ts:794-807`, `mcp-agent-tools.ts:421-424`). The seven editor-steering
tools (`ui_open_workflow`, `ui_run_workflow`, `ui_switch_tab`, `ui_copy`, `ui_paste`,
`ui_search_nodes`, `ui_search_models` — `packages/protocol/src/toolSchemas.ts:185`)
exist **only** as native registrations and would vanish. Keep the capability: they
become exports of the pack's `ui` module, implemented as `run.client.execute(...)`,
so a scoped MCP caller steers a connected editor from inside an action. What is
dropped outright is `list_renderers` as a tool; it becomes a `ui.renderers()` export
backed by the same transport map (`mcp-server.ts:101-127`). The multi-renderer
`renderer_id` parameter survives as an argument on those exports.

**MCP Apps: dropped outright.** The seven modules render interactive HTML galleries in
App-aware hosts; `shell.ts` is their shared chrome and nothing else imports it. A user
of an App-aware host loses the asset gallery, workflow gallery, graph viewer, jobs
dashboard, node catalog, and collections browser as inline surfaces. The data all
remains reachable through actions; the *views* are gone, with no planned replacement.
If NodeTool wants inline views again, the right vehicle is whatever succeeds MCP Apps
upstream, not a parallel maintenance of 1,487 lines behind two tools.

**Unscoped sessions: the concept goes away.** Today a session without
`agentToolsScope` gets no bridged tools (`mcp-agent-tools.ts:385-391`) and lives on
the native registrations plus the renderer bridge kept for backwards compatibility
(`mcp-server.ts:385-390`). Under Decision 2 that session would hold zero tools, which
is a server that answers and cannot act — worse than an error. Make the scope
required: `stdio-local` and `local-dev-http` already bind one
(`mcp-server.ts:63-75`), and an HTTP mount that cannot bind an authenticated user
refuses the session at initialize with a message naming the fix. The
backwards-compatibility renderer path dies with the bridge.

**Discovery: the description is the contract, plus one cheap channel.** A client that
lists two tools learns what NodeTool does from the `execute_code` description —
measured at 18,048 characters over the two-catalog belt (`~19k` on the full mount),
carrying the action contract, the direct-tool list, the namespace docs, and the
sandbox summary (`mcp-agent-tools.ts:486-494`). That is sufficient for a model and
poor for everything else (token cost on every list, no structure for tooling). Two
additions, both cheap: keep `capabilities()` as a guest call reporting the mounted
namespaces (`nodetool-api.ts:256-265` already does this), and publish the same catalog
as an MCP **resource** (`nodetool://capabilities`, JSON: modules, exports, one-line
descriptions, categories). Resources cost nothing at list time and give non-model
clients something to render. Do not shorten the description below what the action
contract needs; it is the only channel every client is guaranteed to show the model.

## Worked example: `nodetool.workflows`

**Today.** `list_workflows` is a class (`packages/agents/src/tools/mcp-tools.ts:396`),
constructed per belt with an injected example catalog (`mcp-tools.ts:2214`), wrapped in
`GatedTool` per turn (`unified-websocket-runner.ts:5368`), name-resolved by the guest
prelude, and documented by a hand-maintained namespace doc (`nodetool-api.ts:823`):

```ts
// packages/agents/src/tools/mcp-tools.ts:396 (abridged)
export class ListWorkflowsTool extends Tool {
  readonly name = "list_workflows";
  readonly description = "List workflows (id, name, description, tags only — ...)";
  readonly jsonSchema = { type: "object", properties: { workflow_type: {...}, ... } };
  constructor(private readonly examples?: ExampleWorkflowCatalog) { super(); }
  async process(context: ProcessingContext, params: Record<string, unknown>) {
    // ... Workflow.paginate(userIdOf(context), ...) / this.examples.list(...)
  }
  userMessage(params) { return `Listing ${params["workflow_type"] ?? "user"} workflows`; }
}
```

```js
// guest side, nodetool-api.ts:357 — name resolution against the belt
workflows: {
  list: (opts) => __need("list_workflows")(__merge(opts)),
  ...
}
```

**After.** One module in the capability registry; the guest imports a generated facade
whose dispatcher is the per-run `invoke`:

```ts
// packages/agents/src/capabilities/workflows.ts (new)
export const module: CapabilityModule = {
  module: "workflows",
  exports: [
    {
      spec: {
        name: "list_workflows",
        description: "List workflows (id, name, description, tags only — ...)",
        inputSchema: { type: "object", properties: { workflow_type: {...}, ... } },
        category: "read",
        userMessage: (a) => `Listing ${a["workflow_type"] ?? "user"} workflows`
      },
      impl: async (run, args) => {
        const { Workflow } = await import("@nodetool-ai/models");
        if (args["workflow_type"] === "example") {
          return run.examples ? lightList(await run.examples.list(...)) : NO_EXAMPLES;
        }
        const [workflows, next] = await Workflow.paginate(run.context.userId, {...});
        return lightList({ workflows: workflows.map(workflowRecord), next });
      }
    },
    // get_workflow, create_workflow (category: "write"),
    // run_workflow (category: "execute", impl reads run.nodeRegistry), ...
  ]
};
```

```js
// guest side — the model writes this in an action
import { workflows } from "@nodetool-ai/sandbox-nodetool/workflows";
const { workflows: mine } = await workflows.list({ limit: 20 });
const report = await workflows.run(mine[0].id, { prompt: "hi" });
```

The facade behind that import is generated the way host-module facades are
(`sandbox-host.ts:175-190`): one async export per spec, each forwarding
`(moduleKey, exportName, args)` — but to the capability dispatcher, which calls
`run.invoke("list_workflows", args)`: gate first (read-class fast path), then the
registered impl with the run threaded in. The example catalog that was a constructor
argument is now `run.examples`, built by the same host code that builds it today
(`packages/websocket/src/mcp-tool-deps.ts`).

## Migration

### Mapping

| Pack module | Wraps today (source) | Run needs beyond `context`+`gate` |
|---|---|---|
| `/workflows` | 9 tools in `mcp-tools.ts` (list/get/create/run/debug/validate/escalation/example/start) | `nodeRegistry`, `examples`, `workflowEnvironment` |
| `/nodes` | `local-{list,search,get-node-info}` + `run_node` | `nodeRegistry`, single-node runner |
| `/models` | `find-model-tool.ts`, `list-models-tool.ts`, `model-tools.ts` | `providers` |
| `/media` | `media-tools.ts`, `creative-critique-tools.ts` | `providers` |
| `/assets`, `/jobs` | `mcp-tools.ts` asset/job tools, `asset-library-tools.ts`, `view-image-tool.ts` | storage interfaces on `context` |
| `/web` | `search-tools.ts`, `browser-tools.ts`, `http-tools.ts` | — |
| `/documents` | `pdf-tools.ts` | — |
| `/memory`, `/email`, `/style` | `thread-memory-tools.ts`, `email-tools.ts`, critique-style pair | — |
| `/collections` | `collection-tools.ts`, `vector-tools.ts` | vector provider / collection |
| `/apps` | `build_app`, `debug_app` (`mcp-tools.ts`) | `nodeRegistry` |
| `/timelines`, `/sketches`, `/scripts`, `/storyboards` | version/edit/voice/render tool files | `loaders` |
| `/agents` | `run-subtask-tool.ts`, `run-search-tool.ts` | `subAgent` |
| `/ui` | `ui_*` schemas (`toolSchemas.ts:185`) + graph model prelude | `client` |
| `/files` *(or none)* | the ten unwrapped: file set stays `workspace.*`; `todo_write` stays a direct tool; fold `asset_list` into `/assets`, `export_workflow_digraph` into `/workflows` | — |

### PR order

Each step merges and reverts independently.

**PR 1 — the MCP reduction. Ships first; needs none of the pack work.** The reduced
surface is assembled from machinery that already exists: `registerAgentMcpTools`
already builds the session and registers `execute_code` + `view_image`
(`mcp-agent-tools.ts:375-534`). The PR deletes: `packages/websocket/src/mcp-apps/`
(7 files), every native registration and `register*App` helper in `mcp-server.ts`
(everything from the `uiToolSchemas` loop at `:384` through `registerCollectionsApp`
at `:1337`, plus the App imports), the renderer-bridge fallback for unscoped sessions,
and the direct core-set registration loop in `mcp-agent-tools.ts:516-525` (keep
`view_image`). It adds: belt entries for the seven editor-steering `ui_*` schemas
routed through the frontend executor, the `nodetool://capabilities` resource, and the
scope-required initialize error. Tests: rewrite
`packages/websocket/tests/mcp-server.test.ts` and `mcp-server-coverage.test.ts` to pin
the two-tool surface; delete `mcp-apps-coverage.test.ts`. Someone can start this
Monday.

**PR 2 — capability types, registry, adapters.** `capabilities/types.ts`,
`registry.ts`, `toolFromCapability` (a `Tool` subclass wrapping a spec+impl so
existing belts consume capabilities unchanged) and `capabilityFromTool` (the reverse,
for the long tail during migration). The gate-parity test lands here (see
Verification). No caller changes.

**PR 3 — pilot namespace: `workflows`.** Port the nine workflow tools from
`mcp-tools.ts` to `capabilities/workflows.ts`; `getAllMcpTools` returns them via
`toolFromCapability`, so every consumer — runner, MCP, CLI, evals — is untouched.
Tests that must stay green: `packages/agents/tests/nodetool-api.test.ts`,
`tool-permissions*.test.ts`, `chat-codeact.test.ts`, and the websocket MCP suites.

**PRs 4–9 — remaining namespaces**, grouped as in the mapping table, including the
subsystem-constructed eleven (their constructor arguments become `CapabilityRun`
fields, built where the constructors are called today: the runner, `mcp-agent-tools`,
`mcp-tool-deps`).

**PR 10 — hosts build `CapabilityRun`; the gate moves into `invoke`.** The runner,
MCP mount, CLI, and executors construct runs instead of belts; `gateTools` becomes a
shim over `invoke` and `GatedTool` is deleted. This is the riskiest PR; it is also the
first one where a capability *cannot* be reached ungated, because there is no other
call path left.

**PR 11 — the guest pack.** Generated facades per module, the capability dispatcher,
prompt sections switch to import form, the `nodetool` global becomes a shim over the
imports. `codeact-prompt-drift.test.ts` and the `codeact` eval cases are the
regression net for the prompt change.

**PR 12 — deletion.** The `nodetool` global shim, `base-tool.ts`, the tool registry
and `llm-nodes` hydration shims, `capabilityFromTool`. `extends Tool` count reaches
zero.

## What breaks, and what each costs

**`llm-nodes` node hydration.** `agent-tool-hydration.ts` holds a registry of zero-arg
`Tool` constructors (`STATIC_TOOL_CLASSES`,
`packages/llm-nodes/src/nodes/agent-tool-hydration.ts:45-61`) plus load-time class
registration from `sandbox.ts`, and hydrates name-stubs into instances for
`runAgentLoop` and the AgentNode. The concept dissolves: a name-stub becomes a
capability name resolved against the registry, and "hydration" becomes binding a name
to `run.invoke`. Cost: mechanical rewrites of `agent-tool-hydration.ts`,
`agent-loop.ts`, `agents.ts` (`normalizeTools`), plus a capability-module equivalent
for the load-time `browser_*` registration pattern. The stub contract ("not executable
until hydrated") goes away entirely, which deletes a documented footgun.

**Eval surfaces.** The offline suites instrument fake `Tool` subclasses —
`evals/planner-tools.ts`, `evals/subtask-cases.ts` (shared instances that record
`SUBTASK_DEPTH_KEY`), `evals/codeact-api-core.ts` / `codeact-api-surfaces.ts` (fakes
named like real belt tools so the object-model prelude lights up). They keep working
through PR 11 via `capabilityFromTool`, then convert to fake capability modules in
PR 12. The tool-loop suites are unaffected — they already drive schemas against
headless bridges, not `Tool` instances. Cost: one mechanical pass over
`packages/agents/src/evals/`, with `codeact-api-coverage.test.ts` guarding that no
namespace loses its last case in the shuffle.

**`getAllMcpTools` dependency injection.** The `registry` / `examples` / `exportDsl`
options (`mcp-tools.ts:2168-2210`) become `CapabilityRun` fields. The three builders
in `packages/websocket/src/mcp-tool-deps.ts` survive unchanged; what changes is the
consumer: instead of spreading them into a tool-constructor call, the host puts them
on the run. `getAllMcpTools` itself shrinks to a compatibility shim in PR 3 and is
deleted in PR 12. Cost: every `getAllMcpTools` call site (runner, MCP bridge, CLI)
touches once.

## Verification

**Existing suites that cover this seam, per step:**
`packages/agents/tests/tool-permissions.test.ts` (+ `-hardening`, `-monitor`) pin the
gate matrix and monitor behavior; `chat-codeact.test.ts` and
`codeact-executor.test.ts` pin the bridge, the observation envelope, and the image
strip; `nodetool-api.test.ts` and `nodetool-api-*.test.ts` drive every namespace
against a real sandbox with scripted providers; `codeact-prompt-drift.test.ts` pins
the prompt surface; `packages/websocket/tests/mcp-server*.test.ts` pin the MCP
surface; the offline `codeact` eval cases exercise the full object model end to end.
Each migration PR's definition of done is: these pass unmodified, except where the PR
explicitly rewrites a pinned surface (PR 1 rewrites the MCP suites; PR 11 rewrites the
prompt-drift snapshots).

**The new test that fails if a capability silently loses its gate.** Two parts, landing
in PR 2:

1. *Classification drift.* A registry walk asserting every registered export carries a
   `category`, plus a checked-in snapshot of `name → category`. Moving
   `create_workflow` from `write` to `read` becomes a one-line diff a reviewer sees,
   instead of a behavior change nobody does. This replaces the protection the
   `external` default gives today, and unlike the default it also catches the
   *wrong-direction* change.
2. *Gate parity through the real path.* For one canary capability per category, drive
   an `execute_code` action through the real prelude and dispatcher with a scripted
   approver in `default` mode, and assert: `read` ran without a prompt, `write` and
   `execute` round-tripped an approval, a denied call returned the
   `permission_denied` payload without running the impl, and `plan` mode blocked.
   Run the same four assertions through a direct `invoke` call — if the two transcripts
   ever differ, the one-implementation invariant broke. Today's equivalent coverage
   lives in `tool-permissions.test.ts` but only at the `GatedTool` unit level; the
   parity test covers the seam this migration moves.

For the MCP reduction, one integration test pins the surface: initialize a scoped
session, list tools, assert exactly `execute_code` and `view_image`, and assert an
unscoped initialize is refused.

## What this buys, and what it costs

Bought:

- One shape for every capability. The 180-subclass inventory, the wrapper prelude, the
  hand-maintained namespace map, and the classification map collapse into one registry
  where spec, implementation, category, and documentation cannot drift apart — the
  drift *tests* this repo keeps writing (`sandboxHostModuleDrift`,
  `codeact-api-coverage`, prompt-drift) become structural.
- The gate becomes unbypassable by construction. Today gating is a wrapper applied
  where someone remembered `gateTools`; `Agent` applies it (`agent.ts:427`), the
  runner applies it, but any new host that assembles a raw belt gets ungated tools.
  After PR 10 there is no ungated call path to forget.
- The MCP surface stops being a second product. 120 registrations became 34 in #4826;
  this takes it to 2, deletes 1,487 lines of App code, and ends the drift class where
  a native handler reimplements a run path and rots (the `run_workflow` handler's own
  comment records exactly that happening, `mcp-server.ts:482-485`).
- Session capability becomes declarative and inspectable: mounted modules, not belt
  composition spread across a 5,000-line runner method.

Costs, stated plainly:

- MCP hosts lose thumbnails-in-lists and every MCP App view, and light MCP clients
  lose one-call reads (`get_asset` as a plain tool call becomes a two-line action).
  Nothing replaces the gallery experience.
- The migration crosses every executor, both bridges, the MCP mount, the CLI, node
  hydration, and the eval fakes. The adapter strategy keeps each PR small, but PR 10
  (the gate move) is a genuine risk concentration and needs the parity test in place
  two PRs before it lands.
- Two dispatchers and two module kinds (library, capability) is more machinery than
  one. The alternative — one dispatcher with an optional run — was rejected for a
  security reason, not a taste one, but the cost is real: the facade generator, the
  loader table, and the drift tests exist twice.

One part of the current design should survive on the merits: the chat runner's
direct-tool split (`splitCoreTools`, core tools as plain provider calls) and the
`view_image` pixel path are not `Tool`-class artifacts, they are provider-interface
facts, and nothing here changes them. And one honest reservation: if MCP App-style
inline views turn out to matter to desktop users, Decision 2 removed them with no
successor, and the right response will be a new surface — not quietly re-growing
native tool registrations behind the two-tool contract.

## Status (2026-08-10)

PRs 1–11 landed on this branch, in this order:

- `agents: add capability types, registry, adapters, and gated invoke (PR 2 of tool-class retirement)`
- `websocket: reduce the MCP surface toward the two-tool contract (PR 1 of tool-class retirement, in progress)`
- `agents: begin porting the workflows namespace onto the capability registry (PR 3 of tool-class retirement, in progress)`
- `agents: workflows namespace runs on the capability registry (PR 3 of tool-class retirement)`
- `agents: models, media and style namespaces run on the capability registry (PR 4 of tool-class retirement)`
- `agents: collections and nodes namespaces run on the capability registry (PR 7 of tool-class retirement)`
- `agents: jobs, assets and apps namespaces run on the capability registry (PR 5 of tool-class retirement)`
- `agents: web, documents, memory and email namespaces run on the capability registry (PR 6 of tool-class retirement)`
- `agents: files, agents and google namespaces run on the capability registry (PR 9 of tool-class retirement)`
- `agents: timelines, sketches, scripts and storyboards namespaces run on the capability registry (PR 8 of tool-class retirement)`
- `agents+websocket: the permission gate moves into CapabilityRun.invoke (PR 10 of tool-class retirement)`
- `agents+protocol+websocket: the platform is importable in the sandbox (PR 11 of tool-class retirement)`
- `agents: break the tool-permissions/capabilities import cycle that deadlocked the bundled backend`

### The esbuild async-cycle lesson

`gateTools` was written beside the classification map it reads, in
`tools/tool-permissions.ts`, and importing `capabilities/adapters.ts` from there
closed a cycle: `tool-permissions` → `adapters` → `tool-permissions`. Node's ESM
breaks a synchronous cycle by handing back a partly-initialized namespace, so
`vitest`, `tsc` and the dev server all stayed green. The packaged backend does
not run ESM — `scripts/bundle-backend.mjs` gives esbuild one `server.mjs` whose
modules are `__esm` wrappers, and a wrapper that awaits its own cycle never
settles. `init_tool_permissions` awaited `init_adapters`, which awaited
`init_tool_permissions`, and the process hung on a top-level await before
serving `/health`. The fix was direction, not ordering: `gateTools` moved to
`capabilities/gate-tools.ts`, whose header states the rule it now enforces —
capabilities import `tool-permissions`, never the reverse. Two lessons for the
rest of this migration: an import cycle across the `tools/`↔`capabilities/`
seam is a bundle-only failure, and `npm run backend:smoke` is the only check in
the repo that sees it.

### What PR 12 did not delete, and why

The PR-12 sketch above describes an end state this tree cannot reach yet. PR 12
as executed deletes what is provably dead, pins the coverage the migration won,
and records the rest as named debt:

- **The deprecated thin `CapabilityTool` subclasses stay.** `getBuiltinTools`
  and `getAgentToolbelt` are synchronous and every caller assembles a belt
  synchronously, while capability modules load through `import()`. A belt
  cannot be built from the registry alone until either the belt assembly turns
  async or the registry gains eager specs. That is its own PR, with its own
  callers to touch.
- **The `nodetool` global stays.** The design gives the generated shim over the
  imports at least one release before it dies; PR 11 shipped the import form,
  and this is that release.
- **`capabilityFromTool` stays.** It is load-bearing in `gateTools`: the shim
  turns each `Tool` into a capability view so `invoke` can run the one ladder
  over it. It goes when belts stop being `Tool[]`, not before.
- **`base-tool.ts` stays.** `SubAgentTool`, `SandboxTool`
  (`packages/sandbox-tools`), the Code-node tool factory
  (`packages/code-nodes`), and the two browser-agent factories
  (`packages/automation-nodes`) still subclass `Tool`, as do the websocket UI
  bridges and the CLI's `execute_code` shim.

### Measured `extends Tool`

Before (recorded above): **180 occurrences across 77 files**. After PR 12:
**84 across 52 files** (64 of them in `packages/agents`, tests included), plus
**88 `extends CapabilityTool` across 30 files** — the deprecated subclasses that
now carry no implementation of their own. Outside `packages/agents` the
remaining `Tool` subclasses are the ones listed above, and the fake tools in the
`chat` and `code-nodes` test suites.

`packages/agents/tests/capabilities-coverage.test.ts` is what keeps the count
from growing back: everything `getBuiltinTools()` and `getAllMcpTools({})`
assemble must resolve through `findCapability`, and the seventeen that do not
are pinned by name with a reason — the eight workflow-document `ui_*` schemas,
which route to a renderer or a direct registry write rather than to a host
function, and the nine provider-specific duplicates in
`AGENT_TOOLBELT_EXCLUDED`, each of which a routed capability already covers.
