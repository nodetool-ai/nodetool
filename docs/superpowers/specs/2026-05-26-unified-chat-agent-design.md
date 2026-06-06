# Unified Chat / Agent Design

**Status:** Draft — revised after first review round
**Date:** 2026-05-26
**Author:** mg (with Claude)

## Summary

Replace the current dual-path chat architecture (regular chat vs. `agent_mode`
→ forced planning) with a single unified loop: an LLM-with-tools agent that
decides for itself whether to answer directly, make a single tool call, or
decompose work into recursive subtasks. Planning becomes a primitive
(`run_subtask`), not a hardcoded mode.

The UI surface collapses to one chat composer with no mode selector and no
tool picker. The websocket runner exposes one **chat-agent** route (alongside
the existing workflow-run and media-generation routes). The CLI deprecates
its agent-mode flag. Toolbelt composition is **context- and policy-driven**
on the server, not configuration-driven from the client.

This document is the **destination**. The implementation will be staged
across multiple PRs (see *Staging* below).

## Motivation

Today the chat UI forces a choice between two architecturally different paths:

- **Plain chat** — LLM + tool loop, no planner. Fast, direct. Tools come
  from the client's selection.
- **Agent mode** — always runs `MultiModeAgent` in `"plan"` mode: the LLM
  produces a `TaskPlan`, `ParallelTaskExecutor` runs it, `CompilerAgent`
  synthesizes a final answer. Even for "what is 2+2", users get a multi-step
  plan + execution.

This is overkill for trivial questions and forces users to predict ahead of
time which mode a task needs. It also hard-codes a control flow around the
model — the opposite of what we want per Sutton's bitter lesson. The model
should decide whether to decompose.

The fix: give the model **primitives**, let it pick the shape.

## Design choices

The design was settled through brainstorming. The key forks and the chosen
options:

| Fork | Choice | Why |
|---|---|---|
| Granularity of "planning" | **Primitives** (not an atomic `plan_and_execute`) | Bitter-lesson: give the model real building blocks, not a renamed mode. |
| Recursion | **Recursive with `max_depth = 3`** | Honest tree-of-thought at any level; bounded by depth + global budgets. |
| Execution model | **Sync only.** Parallelism via the LLM's native parallel tool calls. | No id juggling; runtime fans out parallel calls. |
| UX rendering | **Nested, collapsed-by-default tool-call cards.** | Recursive UI mirrors recursive execution. Main thread stays clean. |
| Workflow editor | **`build_workflow` is gated on an explicit `chat_context: "editor"` wire flag**, not on `NodeRegistry` presence. | Registry availability is a server capability; editor context is a UI fact. They are not the same thing. |
| Toolbelt policy | **Server-side permission classes**, not client-driven tool lists. | The UI sends no tool list, but trivial chat still can't get destructive tools unless the session policy allows it. |
| Migration | **Deprecate, don't delete.** `agent_mode` and `--agent` become no-ops first; removal is a later PR. | Honest staging; doesn't break scripts/docs on day 1. |

## Architecture

### Routing

`handleChatMessage` keeps its precedence but the third branch is now the
unified chat-agent path, and the editor context is read from a new explicit
field:

```
1. workflow_target === "workflow"  →  handleWorkflowMessage  (run saved workflow)
2. media_generation.mode !== "chat" →  handleMediaGenerationMessage
3. ALL OTHER CHAT                   →  runChatAgent (NEW)
   ├─ chat_context.kind === "editor"  → toolbelt includes build_workflow + ui_*
   ├─ chat_context.kind === "thread"  → standard chat toolbelt
   └─ chat_context omitted            → defaults to "thread"
```

**Important:** today the route fires on `workflow_id` alone, which conflates
"run this saved workflow" with "I'm chatting from inside the editor of this
workflow." This spec splits them:

- Running a saved workflow against a prompt → caller sets
  `workflow_target: "workflow"` (existing behavior — unchanged).
- Chatting inside the workflow editor → caller sets
  `chat_context: { kind: "editor", workflowId }`. `workflow_target` is **not**
  set. Route 3 takes the message.

The web composer in the editor sets `chat_context.kind = "editor"`. Outside
the editor (Global Chat, mobile), it's `"thread"` or omitted.

### Components

#### `ChatAgentRunner` (new — `packages/websocket/src/agent/chat-agent-runner.ts`)

Replaces both the regular-chat branch and `handleAgentMessage`. One entry point:

```ts
async function runChatAgent(args: {
  threadId: string;
  userId: string;
  provider: BaseProvider;
  model: string;
  chatContext: ChatContext;            // { kind: "thread" | "editor", workflowId? }
  registry: NodeRegistry | null;        // server capability; required by editor context
  content: MessageContent;
  collections: string[];
  memoryEnabled: boolean;
  requestSeq: number;
  sendMessage: (m: Message) => Promise<void>;
}): Promise<void>;
```

Responsibilities:

- Load `chatHistory` from DB.
- Build toolbelt via `composeToolbelt(ctx, policy)`.
- Build root system prompt via `buildRootSystemPrompt(ctx)`.
- Run RAG (`queryCollections`) and LTM (`createDefaultLongTermMemory`) — both
  unchanged from current chat path.
- Create per-turn `ProcessingContext` with a fresh `AgentMemory` and a
  fresh `TurnBudget` (see *Global budgets*).
- Invoke `runUnifiedAgentLoop({ depth: 0, ... })`.
- On stream end, **also persist a compact `ExecutionTreeSnapshot`** alongside
  the assistant message (see *Persistence*).

#### `runUnifiedAgentLoop` (new — `packages/agents/src/unified-loop.ts`)

The single agent loop, used at every depth. Pseudocode:

```ts
async function* runUnifiedAgentLoop(opts: {
  provider: BaseProvider;
  model: string;
  systemPrompt: string;
  history: ProviderMessage[];
  tools: Tool[];                      // pre-filtered to allowed set
  ctx: ProcessingContext;             // shared AgentMemory + TurnBudget
  depth: number;                      // 0 at root; 0..MAX_DEPTH
  maxIterations: number;
  parentSubtaskId: string | null;     // for event nesting
  signal: AbortSignal;
}): AsyncIterable<ProcessingMessage>;
```

Loop body (one iteration):

1. **Check budgets** (`ctx.budget`). If exhausted, terminate with budget error.
2. Stream a model turn (`provider.generateMessages`). Yield `chunk`s with
   `parent_id = parentSubtaskId`.
3. If the assistant turn has **no** tool calls → loop ends. Last assistant
   text becomes this level's result.
4. Else collect all tool calls. Partition them by safety class
   (`Tool.parallelSafe`):
   - **Parallel-safe** group: run concurrently via `Promise.allSettled`.
     Each rejected promise becomes a `tool_result` with `is_error: true`.
   - **Serial** group (workspace-write, editor-mutate, anything marked
     `requiresExclusiveLock`): run sequentially, in the order the model
     emitted them.
   - Cap parallel fan-out at `MAX_PARALLEL_PER_TURN` (8). Surplus go to the
     serial queue at the end.
5. For each tool call:
   - **`run_subtask`** and `depth < MAX_DEPTH` and `ctx.budget.canSpawnSubtask()`:
     recurse into `runUnifiedAgentLoop` with `depth+1`, new subtask id,
     isolated history (just the instructions), filtered toolset. Stream
     nested events upward with `parent_id`. Write the subtask result to
     `memory.set(task:<id>, result)`.
   - **`run_subtask`** at depth limit or over budget: return a tool error.
   - **`finish_subtask`**: terminate this loop with the structured payload as
     the result. Only included in the toolset when `outputSchema` is set.
   - Other tools: invoke normally with the shared `ctx`.
6. Append all tool results to history. Yield `tool_call_update`s with
   `status: "end"` for each.
7. After `maxIterations` without a clean exit → terminate with iteration-limit
   error.

#### `run_subtask` tool (new — `packages/agents/src/tools/run-subtask-tool.ts`)

Input schema:

```ts
{
  title: string;                  // short label for the UI card
  instructions: string;           // what the subtask should accomplish
  tools?: string[];               // optional: restrict to a subset of parent's toolbelt
  output_schema?: JSONSchema;     // optional: JSON schema for structured result
}
```

Structured output (when `output_schema` is set):

- The subtask's toolset gets `finish_subtask` appended. Its input schema is
  the supplied `output_schema`.
- The subtask is required to call `finish_subtask` to terminate.
- If `finish_subtask` is never called by `maxIterations`, the subtask fails
  with a structured error (`{ error: "schema_not_satisfied", ... }`).
- Schema validation runs on the `finish_subtask` call. Validation failure is
  fed back to the LLM as a `tool_result` with `is_error: true`; the loop
  continues and the model can retry. Limited to `MAX_SCHEMA_RETRIES` (3).

Unstructured output (no `output_schema`):

- Terminate when the model emits a turn with no tool calls. Assistant text
  becomes the result.

Execution is intercepted in the unified loop (it needs runner state — depth,
ctx, sendMessage). The tool's `Tool` instance exposes only the schema; calling
it doesn't go through `tool.process`. This is the same pattern as
`memory_*` tools that need the runner context — explicit interceptor list in
the loop.

#### `build_workflow` tool (new wrapper — editor-context only)

Only included in the toolbelt when:

```
chatContext.kind === "editor" && registry !== null
```

If `chatContext.kind === "editor"` but `registry === null`, log a server
warning and **omit** the tool (the editor can't really work without a
registry; this is a misconfiguration).

Wraps the existing `GraphPlanner` so the agent can call it as a single
primitive when the user asks for a workflow. Streams `planning_update` /
`task_update` events upward through the same channel as other tool events.

Input: `{ objective: string }`. Output: the built `Graph` reference. Applying
the graph to the live editor remains the job of the existing `ui_*` proxies
(the model can call `ui_paste` etc. after `build_workflow` if it wants the
graph rendered).

#### `composeToolbelt` (new — `packages/websocket/src/agent/toolbelt.ts`)

Toolbelt is the **intersection** of (server-registered tools) ∩ (tools the
session's policy allows) ∩ (tools the context unlocks).

```ts
function composeToolbelt(args: {
  chatContext: ChatContext;
  registry: NodeRegistry | null;
  providers: Record<string, BaseProvider>;
  memoryEnabled: boolean;
  clientToolsManifest: Record<string, UIToolManifest>;
  toolBridge: ToolBridge;
  sendMessage: SendFn;
  policy: ToolPolicy;                 // server-resolved per session
}): Tool[];
```

##### Tool permission classes

Every `Tool` instance declares its class:

```ts
abstract class Tool {
  abstract readonly permissionClass:
    | "safe"            // pure read, no network, no fs write
    | "knowledge"       // memory_*, search_nodes, etc.
    | "network"         // browser, google_search, MCP read
    | "workspace_write" // read_file (within workspace), write_file (within workspace)
    | "editor_mutate"   // build_workflow, ui_add_node, ui_connect_nodes, ...
    | "subagent"        // run_subtask, finish_subtask
    | "secrets"         // anything that reads/writes user secrets
  ;
  readonly parallelSafe: boolean = true;       // default true; override for mutating tools
  readonly requiresExclusiveLock?: string;     // optional named lock (e.g. "workspace_fs")
}
```

##### Session `ToolPolicy`

A `ToolPolicy` is built once per session by the runner:

```ts
type ToolPolicy = {
  classes: Set<PermissionClass>;   // which classes are enabled
  workspaceRoot: string | null;    // workspace_write tools are confined to this prefix
  allowedMcpServers: string[];     // explicit allowlist (no implicit access)
};
```

Defaults:

| Class | `chat_context: thread` | `chat_context: editor` |
|---|---|---|
| `safe`, `knowledge`, `subagent` | always on | always on |
| `network` | on | on |
| `workspace_write` | on, workspace-scoped | on, workspace-scoped |
| `editor_mutate` | **off** | **on** |
| `secrets` | off (opt-in only) | off (opt-in only) |

`workspace_write` tools must enforce their `workspaceRoot` prefix at runtime
(`read_file`, `write_file`) — a tool that ignores this is a bug. The policy
is *the policy*; tools are the *enforcement points*.

##### Composition

```ts
const all = [
  new RunSubtaskTool(),
  new MemoryListTool(), new MemoryReadTool(), new MemoryWriteTool(),
  new ReadFileTool(), new WriteFileTool(),
  new BrowserTool(), new GoogleSearchTool(),
  ...getAllMcpTools({ registry, providers, allowedServers: policy.allowedMcpServers }),
];

if (chatContext.kind === "editor" && registry !== null) {
  all.push(new BuildWorkflowTool({ registry, providers }));
  for (const m of Object.values(clientToolsManifest)) {
    all.push(new UIToolProxy(m, toolBridge, sendMessage));
  }
}

return all.filter((t) => policy.classes.has(t.permissionClass));
```

The client sends **no tool list**. `data.tools` is ignored.

### Wire protocol changes

This is a real protocol bump, not a tweak. The following types in
`packages/protocol/src/messages.ts` get new optional fields:

```ts
// ToolCallUpdate
interface ToolCallUpdate {
  type: "tool_call_update";
  tool_call_id: string;
  name: string;
  args?: unknown;
  result?: unknown;
  is_error?: boolean;
  // NEW:
  parent_id?: string | null;      // null at root; tool_call_id of enclosing run_subtask otherwise
  depth?: number;                 // 0 at root
  status?: "start" | "end";       // start when args are known; end with result
}

// Chunk
interface Chunk {
  type: "chunk";
  content: string;
  done?: boolean;
  // NEW:
  parent_id?: string | null;      // null at root; tool_call_id of enclosing run_subtask
  depth?: number;                 // 0 at root
}
```

All new fields are optional. Old clients (mobile, CLI) ignore them safely —
chunks render in the main thread and tool calls render at the top level (no
nesting). That gives us a backward-compatible rollout.

New event for budget exhaustion (rare; client can show an inline notice):

```ts
interface BudgetExceeded {
  type: "budget_exceeded";
  reason: "subtasks" | "llm_calls" | "tool_calls" | "wall_clock" | "tokens" | "bytes";
  limit: number;
  observed: number;
}
```

### Persistence of execution

Streamed subtask events are transient by default, but a compact tree is
persisted with the assistant message so thread reload doesn't lose context.

On `Message` (assistant role), add an optional `execution_tree` JSON column:

```ts
type ExecutionTreeSnapshot = {
  version: 1;
  nodes: ExecutionTreeNode[];     // flat list
};

type ExecutionTreeNode = {
  id: string;                      // tool_call_id
  parent_id: string | null;
  name: string;                    // tool name; "run_subtask" nodes are container nodes
  title?: string;                  // for run_subtask: the title arg
  args_preview?: string;           // truncated args (≤ 500 chars)
  result_preview?: string;         // truncated result (≤ 500 chars)
  is_error?: boolean;
  duration_ms: number;
  // NB: streamed chunks inside run_subtask are NOT persisted.
};
```

The renderer reconstructs the nested cards from this tree. Streamed chunk
content within a subtask card is **not** restored on reload — only the
title/status/result preview. Trade-off: bounded DB row size vs. full replay.
The "full replay" version is a follow-up if users demand it.

### UI: nested cards

Two render contexts:

- **Live (during streaming)**: events arrive via WebSocket; the renderer
  groups them by `parent_id` and recursively places nested `ToolCallCard`s
  inside their parent's "expanded" pane.
- **Reloaded (from DB)**: the renderer reads `assistant_message.execution_tree`
  and produces the same nested card layout, but each `run_subtask` card's
  expanded pane shows the saved previews, not a live stream.

Existing `ToolCallCard` becomes recursive. New props: `parentId`, `depth`,
`children`. Cards default to collapsed when `depth > 0`.

Mobile: ignore the new protocol fields; render tool calls flat. Acceptable
for v1.

### Global budgets

`TurnBudget` lives on the `ProcessingContext` for the duration of one root
turn. It's checked at three places: subtask spawn, LLM call, tool call.

| Budget | Default | Where checked |
|---|---|---|
| `MAX_DEPTH` | 3 | `run_subtask` boundary |
| `MAX_ITERATIONS_PER_LEVEL` | 20 | loop counter |
| `MAX_PARALLEL_PER_TURN` | 8 | fan-out batch size |
| `MAX_TOTAL_SUBTASKS` | 32 | subtask spawn |
| `MAX_TOTAL_LLM_CALLS` | 60 | before every `provider.generateMessages` |
| `MAX_TOTAL_TOOL_CALLS` | 200 | before every tool dispatch |
| `MAX_WALL_CLOCK_MS` | 180_000 (3 min) | `Date.now()` check on each iteration |
| `MAX_TOOL_RESULT_BYTES` | 50_000 per result | tool dispatcher; truncates above |
| `MAX_HISTORY_TOKENS` | 128_000 | provider-level pruning (existing) |

When any budget is exceeded, the runner emits a `budget_exceeded` event,
terminates the in-progress turn, and surfaces a clear error to the user. The
partial assistant text + persisted execution tree are still committed.

Constants live in `packages/agents/src/constants.ts`. No UI configuration;
env overrides only if needed later.

### Memory & history

- **`ChatHistory` (DB)** — root only, keyed by `thread_id`. Unchanged
  persistence. Subtasks do NOT see chat history; they see only their
  `instructions` plus the shared `AgentMemory`.
- **`AgentMemory`** — fresh per **root turn**. Shared across all subtasks
  within that turn. Subtask result auto-writes to `task:<subtask_id>` after
  the subtask finishes.
- **Sibling memory is across-rounds, not within-round.** Parallel siblings
  spawned in the same fan-out cannot read each other's writes (they're
  concurrent and the parent doesn't get a turn between them). They become
  visible to the parent after `Promise.allSettled` resolves; the parent's
  *next* LLM turn can then orchestrate a follow-up round that consumes them.
  The root system prompt documents this explicitly so the model doesn't try
  to "wait for a sibling" inside a single subtask.
- **Long-term memory** — opt-in via `memory_enabled` on the wire. Existing
  code path, unchanged.

### System prompts

#### Root chat prompt (new — `ROOT_CHAT_SYSTEM_PROMPT`)

Shape (final wording deferred to implementation):

- "You are NodeTool's assistant. Respond directly when you can."
- "For multi-step work, call `run_subtask`. For independent parallel work,
  emit several `run_subtask` calls in one turn — they run concurrently.
  Siblings spawned in the same turn cannot read each other's results; if a
  subtask depends on another, sequence them across turns."
- "Subtasks may decompose further (up to depth 3). Memory tools share state
  across turns and across the tree."
- *(conditional, editor context only)* "When the user wants to build or
  modify a workflow, call `build_workflow`."
- *(conditional, LTM enabled)* LTM section — existing code, unchanged.

#### Subtask prompt

Re-use `StepExecutor.buildSystemPrompt()` as a base (memory tools, structured
output discipline). Extend with one line referencing `run_subtask` when
`depth < MAX_DEPTH`; omit otherwise.

When `output_schema` is set, the subtask prompt explicitly requires
terminating via `finish_subtask` (matches the existing `finish_step` pattern).

### Provider compatibility

Not every provider supports tool calling identically. The unified loop's
contract with `BaseProvider`:

- Provider declares whether it supports tool calls (`provider.capabilities.tools`).
- Provider declares whether it supports **parallel** tool calls
  (`provider.capabilities.parallelToolCalls`).
- If parallel calls are not supported: the loop still emits parallel-safe
  tools concurrently *server-side*, but the LLM will only ever emit one at a
  time. That's fine — the loop is robust to either case.
- If tools are not supported at all: the toolbelt is empty; the loop becomes
  a single LLM turn returning text. `run_subtask` is unreachable, which is
  the expected degradation.
- Providers that emit thought signatures / raw parts (Gemini): the loop
  preserves the raw `assistant` message verbatim when appending to history.
  No tampering with provider-specific fields.

### Cost & token accounting

The existing `CostCalculator` aggregates per-provider calls. The unified loop
must:

- Pass a single `CostCalculator` through the recursive context so child loop
  costs accumulate to the same accountant.
- Avoid sharing **mutable** provider state across parallel calls — providers
  that maintain per-call state (e.g., streaming state) must already be
  thread-safe; if any aren't, we wrap with a per-call adapter.
- Emit a final `cost_summary` event at the end of the root turn.

Tool-result truncation (50 KB cap) keeps individual tool returns from
poisoning the next LLM turn. Browser/search-style tools should also do their
own pre-truncation in case the cap isn't enough.

### Error handling

- **Tool failure**: tool returns `is_error: true`; loop continues, model
  decides whether to retry. `Promise.allSettled` ensures one rejected tool
  doesn't take down siblings.
- **Subtask hits `MAX_ITERATIONS_PER_LEVEL`**: structured error result.
- **Subtask at `MAX_DEPTH`**: tool refuses before entering the loop.
- **Any global budget exceeded**: `budget_exceeded` event + immediate
  termination of the root turn.
- **Provider error / network**: bubble up; root surfaces `error` to client.
- **Cancellation** (`requestSeq` mismatch or socket close): `AbortSignal`
  propagates; all loops short-circuit.
- **Schema validation failure on `finish_subtask`**: feed back as
  `is_error: true`; retry up to `MAX_SCHEMA_RETRIES = 3`; then structured
  error result.

## Migration

Staged, not big-bang. Each step is independently shippable.

### Stage 1 — Plumbing & guardrails (no behaviour change for users)

1. Extract the existing regular-chat tool loop into a reusable `runToolLoop`
   under `packages/agents/src/`. Behaviour-preserving.
2. Add `permissionClass` + `parallelSafe` to `Tool` base class; annotate all
   existing tools. Default policy mirrors current behaviour exactly.
3. Add the protocol fields (`parent_id`, `depth`, `status`) and the
   `execution_tree` column on `Message`. All optional; old code keeps
   working.
4. Add `TurnBudget` to `ProcessingContext`. Existing paths get a no-op
   budget.

### Stage 2 — `run_subtask` behind `agent_mode`

1. Implement `run_subtask` (and `finish_subtask`). Add to the current
   `MultiModeAgent`-driven `agent_mode` path only.
2. Replace the forced TaskPlanner with the unified loop **inside agent mode**.
   Plain chat is still plain chat.
3. Add the nested-card renderer in the UI; agent mode now produces nested
   cards instead of a flat plan tree.

### Stage 3 — Routing & editor split

1. Introduce `chat_context` on the wire. Default to `"thread"` if omitted.
2. Split workflow-editor chat from workflow-run routing. Editor sends
   `chat_context: { kind: "editor", workflowId }`; saved-workflow runs keep
   using `workflow_target`.
3. Add `build_workflow` as a tool in the editor toolbelt.

### Stage 4 — Unification

1. Delete the `agent_mode` branch in the runner; route all non-workflow,
   non-media chat through `runChatAgent`.
2. The UI selector is hidden (still in code, behind a feature flag) so we can
   revert quickly.
3. `agent_mode` on the wire is ignored (logged at debug for one release).
4. CLI `--agent` becomes a no-op with a deprecation warning.

### Stage 5 — Cleanup

1. Remove the `AgentModeSelector` component, `agent_mode` / `agent_planner`
   store fields, and the wire field.
2. Remove the CLI `--agent` flag.
3. Remove `MultiModeAgent` from public-API surface (kept as an internal
   building block where genuinely needed — currently nothing depends on it
   externally once Stage 4 lands).

Each stage ships its own implementation plan.

## Testing

Unit tests (`packages/agents/tests/`):

- `unified-loop.test.ts` (fake provider)
  - Direct answer (no tool calls) → returns text.
  - Single tool call → executes, loops, returns text.
  - Parallel tool calls → fans out, awaits all, continues.
  - One tool rejects → siblings still complete; failure reported via
    `is_error`.
  - `run_subtask` at depth=0 → spawns child loop, returns result.
  - `run_subtask` at depth=3 → returns depth-limit error.
  - `max_iterations` overflow → iteration-limit error.
  - Budget exceeded (each of the budgets) → terminates with
    `budget_exceeded`.
  - Schema validation: valid `finish_subtask` → succeeds; invalid → retries
    up to limit then errors.
  - Cancellation via `AbortSignal` → terminates promptly at next await.
- `run-subtask-tool.test.ts`
  - Input schema validation.
  - Tool restriction respected when `tools` arg is set.
  - Subtask result written to `task:<id>` in shared `AgentMemory`.
- `build-workflow-tool.test.ts`
  - Only resolvable when `chat_context.kind === "editor"` and registry wired.
  - Calls `GraphPlanner` and returns its result.
- `tool-permissions.test.ts`
  - Policy filters the toolbelt correctly per `chat_context`.
  - `workspace_write` tools enforce workspace prefix at call time.

Integration tests (`packages/websocket/tests/`):

- `chat-direct.test.ts` — trivial question, fake provider, no subtasks.
- `chat-with-subtasks.test.ts` — fake provider emits parallel `run_subtask`
  calls; verify fan-out + result aggregation + persisted execution tree.
- `chat-workflow-editor.test.ts` — `chat_context: editor`, fake provider
  calls `build_workflow`; verify it succeeds. Without editor context, the
  tool is absent.
- `chat-budget.test.ts` — fake provider tries to exceed each budget; verify
  the corresponding `budget_exceeded` event.
- `chat-back-compat.test.ts` — old client without `chat_context` →
  defaults to thread; old client with `agent_mode: true` → still works (no-op
  in stage 4+; behaviorally identical in stage 3).

E2E (web):

- All existing chat tests pass at every stage.
- New: nested subtask card rendering test (Playwright). Card collapsed by
  default; expand reveals child events; reload shows the persisted tree.

## Out of scope

- Async / id-based subtask APIs (`create_subtask` + `wait_for_subtasks`).
  Sync only.
- "Budget" / "credit" passing between depths. Global per-turn budgets are
  sufficient.
- Removing `MultiModeAgent` entirely (its public surface) on day 1.
- Workflow-target chat (`workflow_target = "workflow"`) — unchanged.
- Media generation route — unchanged.
- Mobile nested-card rendering — flat rendering in v1; tracked for follow-up.
- Full streaming-chunk replay on thread reload — only previews are persisted.

## Open questions (deferred to implementation)

- Exact wording of `ROOT_CHAT_SYSTEM_PROMPT`. Iterate during testing.
- Whether `build_workflow` should also apply the graph to the editor
  automatically or wait for an explicit `ui_paste` call from the model.
  Likely wait — the model decides.
- Whether to expose budget values via env vars or a server settings table.
  Default: hard-coded constants in `constants.ts`. Revisit if tuning
  demand emerges.
- Whether `tool_call_update.depth` is needed at all if `parent_id` is
  present — depth is derivable. Likely keep for renderer convenience.

## Acceptance criteria

Acceptance is checked with **fake providers** for behaviour and against real
providers for smoke. We don't make assertions about real-model decisions.

1. The `AgentModeSelector` is hidden (Stage 4) and then removed (Stage 5);
   no chat path requires a mode toggle.
2. With a fake provider that emits zero tool calls, the runner returns one
   assistant text message and no nested events.
3. With a fake provider that emits parallel `run_subtask` calls, the runner
   spawns the expected number of child loops, persists an `execution_tree`,
   and the UI renders nested cards (live + after reload).
4. With a fake provider attempting recursion past `MAX_DEPTH`, the
   `run_subtask` tool returns a depth-limit error.
5. Each global budget, when violated by a deterministic fake provider,
   produces the expected `budget_exceeded` event and terminates the turn.
6. With `chat_context: { kind: "editor", workflowId }` and a wired registry,
   `build_workflow` appears in the toolbelt; without editor context, it does
   not appear; without a registry (misconfig), it is omitted with a warning.
7. `workspace_write` tools refuse paths outside `policy.workspaceRoot`.
8. `agent_mode: true` on the wire (Stage 3) behaves identically to today
   (`MultiModeAgent` plan mode). At Stage 4 it's a no-op; at Stage 5 the
   field is gone.
9. The CLI `--agent` flag (Stage 4) emits a deprecation warning and behaves
   as the unified loop. At Stage 5 it is removed.
10. All existing chat-related tests pass at every stage; new tests above pass.
