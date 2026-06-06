# Chat Permission Model Design

**Status:** Draft
**Date:** 2026-05-28
**Author:** mg (with Claude)

## Summary

Replace the four chat selectors — built-in **Tools**, **Node-as-Tool**,
**Workflow-as-Tool**, and **Collections** — with a single **permission
dropdown**. The agent always carries a fixed, generic toolbelt; the selected
permission mode governs whether each tool call runs automatically, asks the
user first, or is blocked.

Three modes, mirroring Claude Code's mental model:

- **Plan** — read-only. Inspect and propose; never act.
- **Default** — read/inspect auto-runs; actionable tools ask for approval.
- **Auto** — everything runs, no prompts.

Per-node and per-workflow tool selection is **removed** (not scalable). In
its place the agent gets generic `run_node` / `run_workflow` tools and
collection discovery/query tools, so it finds and uses capabilities itself.
The full toolbelt and the active permission mode are advertised in the system
prompt. This builds directly on the unified chat-agent loop
(`2026-05-26-unified-chat-agent-design.md`), which already anticipated
"server-side permission classes, not client-driven tool lists."

## Motivation

The unified chat loop gave the model primitives and let it choose the shape of
its work. But the client still drives the toolbelt through four separate
selectors, and there is **no permission concept at all** — once a tool is
selected it runs unconditionally. Two problems:

1. **Per-item tool selection does not scale.** Node-as-Tool and
   Workflow-as-Tool require the user to hand-pick individual nodes/workflows
   before the agent can use them. With hundreds of nodes and many workflows
   this is unworkable, and it forces the user to predict what the agent needs.
2. **No notion of "permission to act."** The agent either has a tool or it
   doesn't; there is no way to let it read freely while gating actions, and no
   way to run fully autonomously when the user wants that.

The fix: give the agent a **fixed generic toolbelt** it can reason about, and
govern execution with a small set of **permission modes** plus a live approval
gate for actionable calls.

## Design choices

Settled through brainstorming. Key forks and chosen options:

| Fork | Choice | Why |
|---|---|---|
| Permission concept | **Permission modes** with a live approval gate (Claude Code style) | Matches the recent Claude-Code-shaped work and the user's mental model. |
| Number of modes | **Three: Plan / Default / Auto** | Clean mapping; the `acceptEdits` middle tier is hard to define for a workflow agent. |
| Tool availability | **All tools always available; mode governs approval** | "Replace the selector" — the agent reasons over a fixed toolbelt, not a client-curated list. |
| Node/Workflow tools | **Remove per-item selection; add generic `run_node` / `run_workflow`** | Per-item selection does not scale. |
| Collections | **Agent discovers and queries collections itself** (`list/search/query_collection`) | No pre-selection; RAG becomes a capability, not a config. |
| Approval UX | **Inline card in the thread** (Allow / Allow for this chat / Deny) | Reuses the tool-call card slot; non-blocking; multiple prompts queue. |
| Allow persistence | **Session-scoped** ("Allow for this chat") — no durable per-tool grants in v1 | Avoids introducing durable permission storage now. |
| Control style | **Dropdown** in the composer footer | Compact; matches the "permission dropdown" ask; scales if modes are added. |
| Default mode | **Default (ask before acting)** | Safe, predictable starting point. |
| Persistence | **Per-chat**; new chats start at Default | Different threads can run at different trust levels; mode is thread state. |
| Browser tool | **Single actionable tool in v1** (asks in Default) | Splitting read-navigation from page actions is a later refinement. |
| Delivery | **One combined deliverable** (toolbelt refactor + permission system together) | Per user: ship as one phase. |

## Architecture

### Permission matrix

Each tool declares a `permissionCategory`: `read` | `write` | `execute` |
`external`. The mode × category decision:

| Category (examples) | Plan | Default | Auto |
|---|---|---|---|
| `read` — read_file, web_search, list/search/query_collection, list/get nodes & workflows, todo_write | auto | auto | auto |
| `write` — write_file, image gen, text-to-speech | blocked | ask | auto |
| `execute` — run_node, run_workflow | blocked | ask | auto |
| `external` — MCP tools, browser actions | blocked | ask | auto |

Effectively: `read` always auto-runs; every other category is blocked in Plan,
asks in Default, auto-runs in Auto. Named categories are kept (rather than a
single `readOnly` boolean) so the matrix can be refined later — e.g. splitting
the browser tool's read vs. action operations.

### Always-on toolbelt

Composed server-side on every chat-agent run, regardless of client input:

- **Files & media:** `read_file`, `write_file`, image generation,
  text-to-speech.
- **Run compute:** `run_node(node_type, inputs)`, `run_workflow(workflow_id, params)`.
- **Knowledge:** `list_collections`, `search_collections(query)`,
  `query_collection(collection, query)`.
- **Web:** `web_search`, `browser`.
- **Internal:** `todo_write`, `run_subtask` (sub-agents inherit the parent's
  mode and gate).
- **Workflow editor:** the `ui_*` tools remain, auto-injected when a workflow
  is open. They are a UI capability, not a user selection, so they are
  unaffected by removing the selectors.

`run_node` and `run_workflow` reuse the existing kernel execution path and the
patterns already exposed by the MCP `run_workflow` / `query_collection` tools.

### Approval round-trip

The gate lives in the agent's tool-execution loop. Before executing a tool
call:

1. Resolve the tool's `permissionCategory`.
2. Consult the run's `permission_mode`:
   - **Plan** + non-`read` → **block**: return a tool result stating the tool
     is unavailable in plan mode; the agent proposes instead.
   - **Default** + non-`read` → check the per-chat **session-allow set**; if the
     tool is present, run. Otherwise **request approval**.
   - **Auto**, or any `read` → **run**.
3. Request approval: emit a `tool_approval_request` (tool call id, name, args,
   category) to the client and **pause that call**. The client renders an
   inline `ToolApprovalCard`. The user picks:
   - **Allow** → run this call.
   - **Allow for this chat** → add the tool to the session-allow set, then run.
   - **Deny** → return a structured "user denied" result to the LLM so it
     adapts.
   The client sends `tool_approval_response { tool_call_id, decision }`; the
   server resumes the paused call.

The session-allow set is per-thread and in-memory for the run/session; nothing
is persisted to disk in v1.

### Protocol & state

- `Message` gains `permission_mode: "plan" | "default" | "auto"`. The composer
  stops sending curated `tools` / `collections` (already-deprecated
  `agent_mode` / `agent_planner` are dropped from the send path).
- New messages: `tool_approval_request` (server → client) and
  `tool_approval_response` (client → server), added to
  `packages/protocol/src/messages.ts` and `web/src/core/chat/chatProtocol.ts`.
- `GlobalChatStore`: replace `selectedTools` / `selectedCollections` with
  per-thread `permissionMode`, plus a per-thread session-allow set and
  pending-approval state.

### UI

- **`PermissionSelector`** — compact dropdown in the composer footer showing
  the current mode (label + colored dot); opens a 3-item menu with one-line
  descriptions and a check on the active mode. Reads/writes the per-thread
  `permissionMode` from the store.
- **`ToolApprovalCard`** — rendered inline where tool-call cards render
  (`MessageView` / `ToolCallCard` area) when an approval is pending; dispatches
  the Allow / Allow-for-chat / Deny decision.
- **Delete** `ToolsSelector`, `NodeToolsSelector`, `WorkflowToolsSelector`,
  `CollectionsSelector` and their wiring in `ChatToolBar` and
  `MediaChatComposer`.

### System prompt

A new section advertises the toolbelt ("you can run any node via `run_node`,
run any workflow via `run_workflow`, search and query knowledge collections,
read/write files, browse and search the web, generate images and audio…") and
states the active permission mode and its rules. In **Plan** mode the prompt
explicitly instructs the agent not to call actionable tools and to produce a
plan — belt-and-suspenders with the hard gate.

## Data flow

1. User picks a mode in `PermissionSelector` (per-thread). Sends a message.
2. Outgoing `Message` carries `permission_mode`. Server composes the fixed
   toolbelt and injects the mode + toolbelt into the system prompt.
3. Agent loop runs. For each tool call the gate runs / asks / blocks per the
   matrix.
4. On "ask", a `tool_approval_request` round-trips to the inline card and back;
   the run resumes on the decision.
5. Sub-agents spawned via `run_subtask` inherit the same mode and gate.

## Edge cases & error handling

- **Mode is read at message-send time.** A run uses the mode it started with;
  changing the dropdown affects the next message, not the in-flight run.
- **Stop generation** cancels pending approvals along with the run.
- **Deny** and **Plan-block** both return structured tool results, keeping the
  agent productive (it adapts or proposes rather than erroring).
- **No user response to an approval:** the call stays paused; stop-generation
  is the escape hatch.
- **Unknown tool category** (e.g. a new MCP tool) defaults to `external` —
  gated by default, never silently auto-run in Default/Plan.

## Testing

- **Unit:** classification matrix (mode × category → auto/ask/block);
  session-allow set behavior; deny and plan-block feedback shapes.
- **Backend:** gate pauses on an actionable call in Default and resumes on
  Allow; blocks in Plan; runs all in Auto; sub-agent inheritance.
- **Protocol:** `tool_approval_request` / `tool_approval_response` round-trip.
- **Web:** `PermissionSelector` renders modes, switches, persists per thread;
  `ToolApprovalCard` renders and dispatches each decision; removed selectors
  are gone.
- **Parity:** update `chat-agent-parity.test.ts` and related tests for the new
  message shape and removed fields.

## Out of scope / future

- Durable per-tool "always allow" grants across chats.
- Splitting the browser tool's read-navigation (safe) from page actions
  (gated).
- A fourth `acceptEdits`-style middle mode.
- Per-category UI customization of the matrix.

## Files affected (indicative)

- `packages/protocol/src/messages.ts` — `permission_mode`, approval messages.
- `packages/websocket/src/unified-websocket-runner.ts`,
  `packages/websocket/src/agent/llm-agent.ts`, `packages/agents/` — toolbelt
  composition, gate, approval round-trip, system prompt.
- New generic tools: `run_node`, `run_workflow`, collection discovery/query.
- `web/src/stores/ApiTypes.ts`, `web/src/core/chat/chatProtocol.ts`,
  `web/src/stores/GlobalChatStore.ts` — types, protocol, per-thread state.
- `web/src/components/chat/composer/` — new `PermissionSelector`; delete the
  four selectors; update `ChatToolBar`, `MediaChatComposer`.
- New `ToolApprovalCard` in the chat message/thread components.
