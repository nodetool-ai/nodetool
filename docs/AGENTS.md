---
layout: page
title: "Agent System"
permalink: /agents
description: "Architecture of the NodeTool agent system — planning, execution, tools, skills, and workflow integration."
---

**Navigation**: [Root AGENTS.md](../AGENTS.md) → **Agent System**

> Code in `@nodetool-ai/agents` follows the canonical standards in [DEVELOPMENT_STANDARDS.md](DEVELOPMENT_STANDARDS.md) — in particular, the rules for [TypeScript (§1)](DEVELOPMENT_STANDARDS.md#1-typescript), [Error handling (§18)](DEVELOPMENT_STANDARDS.md#18-error-handling), [Observability (§17)](DEVELOPMENT_STANDARDS.md#17-observability), and [Security/Sandboxing (§16)](DEVELOPMENT_STANDARDS.md#16-security). This document describes the architecture; the standards doc describes the rules.

The **agent system** (`@nodetool-ai/agents`) gives LLMs the ability to decompose complex objectives into steps, execute those steps with tools, and return structured results. It powers the Agent, Research Agent, and Control Agent nodes in the workflow editor, as well as the standalone Agent CLI.

---

## Architecture Overview

There is one loop. A host — a chat turn, `nodetool agent run`, an MCP client —
builds a **CodeAct session** over a gated toolbelt and hands the user's message
to it. The model acts by writing sandboxed JavaScript; decomposition is
something it can ask for, not a stage the host imposes.

```
user message ──▶ CodeAct session (one turn over the gated belt)
                   │
                   ├── execute_code ──▶ QuickJS sandbox ──▶ nodetool.* toolbelt
                   │
                   └── create_plan ──▶ TaskPlanner ──▶ a task DAG, shown, not run
                            │
                            └── execute_plan ──▶ ParallelTaskExecutor
                                                   └── TaskExecutor
                                                        └── CodeActExecutor (per step)

                     each task's result ──▶ context.memory  ("task:<id>")
                     the session's next turn reads it and writes the answer
```

### The classes behind that

| Class | What it does | Source |
|---|---|---|
| **CodeActExecutor** | The action loop: one step or one turn, sandboxed JavaScript over the belt | `packages/agents/src/codeact/codeact-executor.ts` |
| **TaskPlanner** | `planMultiTask` decomposes an objective into a task DAG; `create_plan` is its only caller | `packages/agents/src/task-planner.ts` |
| **ParallelTaskExecutor** | Runs a plan's independent tasks concurrently; `execute_plan` is its only caller | `packages/agents/src/parallel-task-executor.ts` |
| **TaskExecutor** | Walks one task's step DAG in dependency order | `packages/agents/src/task-executor.ts` |
| **SubAgentTool** | `run_subtask` / `start_subtask` / `run_search` — a child loop under the parent's budget and gate | `packages/agents/src/subagent.ts` |

`createChatCodeActSession` (`src/codeact/chat-codeact.ts`) is what a host
constructs. It owns the system prompt, the sandbox package allowlist, the
split between resident and direct tools, and the clock that stops an action's
wall clock while a permission prompt is open.

---

## Planning Phase

Planning happens when the model calls `create_plan`, and not before.
**TaskPlanner** decomposes the objective into **Tasks**, each an ordered DAG of
**Steps** with dependency edges.

```ts
interface Task {
  id: string;
  title: string;
  description?: string;
  steps: Step[];
}

interface Step {
  id: string;
  instructions: string;
  dependsOn: string[];          // IDs of prerequisite steps (forms a DAG)
  tools?: string[];             // restrict available tools for this step
  outputSchema?: string;        // JSON schema for step output validation
  mode?: "discover" | "process" | "aggregate";
  perItemInstructions?: string; // template for fan-out processing
  completed: boolean;
}
```

The planner builds the plan incrementally: the model calls `add_task` once per
task and `finish_plan` to commit. Each task is validated as it arrives — unique
ids, dependencies that resolve, no cycle — and a rejected one comes back as the
tool result for the model to fix.

`create_plan` stops there. Running the plan is a separate call, `execute_plan`,
which takes the tasks inline — so the user sees what will run before it does,
and a caller that already knows the decomposition skips `create_plan`
altogether.

---

## Execution Phase

`execute_plan` hands the plan to **ParallelTaskExecutor**, which starts each
task the moment its last dependency settles rather than in barrier rounds
(`utils/dag-scheduler.ts`). Each task's **TaskExecutor** schedules its step DAG
the same way, and each step gets a **CodeActExecutor** running the code-action
loop:

1. Build messages — the CodeAct contract, the tool catalog, the step instructions
2. Stream the LLM response
3. Run the action's JavaScript in the QuickJS sandbox, where the toolbelt is imported from `@nodetool-ai/sandbox-nodetool/<namespace>`
4. Feed the observation (return value, logs, error) back as the tool result
5. Repeat until the program calls `finish(result)`, the run's budget stops it, or max iterations are reached
6. Validate the result against the step's output schema — host-side, in `finish`

Each task's result lands in `context.memory` under `task:<id>` and comes back
in `execute_plan`'s answer. There is no synthesis stage: the session's next
turn writes the answer, reading `read_shared` for anything the return did not
carry.

A run's bounds — a USD cap, a wall clock, a limit on open provider
conversations, and a cumulative turn count — are one `RunBudget` the host
creates and every loop below it shares, so a sub-agent reserves against its
parent instead of opening a fresh allowance. A step that a cap or deadline
stops fails naming that reason. See
[packages/agents/AGENTS.md § One budget per run](../packages/agents/AGENTS.md).

See [codeact-design.md](codeact-design.md) for the action protocol and
the sandbox limits that apply per action, and [javascript-sandbox.md](javascript-sandbox.md)
for the engine itself — capabilities, limits, imports, security model.
Results a later action or turn needs go through memory
(`nodetool.memory.*`); there is no cross-action variable bag.

### Fan-Out Execution

Steps can use three modes for batch processing:

| Mode | Purpose | Example |
|------|---------|---------|
| **discover** | Produce a list of items | "Find all CSV files in the workspace" |
| **process** | Create sub-step per item (runs in parallel) | "Analyze each CSV file" |
| **aggregate** | Collect per-item results into final output | "Summarize all analyses" |

---

## Memory

Every `ProcessingContext` carries an **`AgentMemory`** at `context.memory` — the single namespaced store for results shared between steps, tasks, sub-agents, and tools. There are no parallel result maps; all executors write and read through the same API.

```ts
import { memoryKeys } from "@nodetool-ai/runtime";

context.memory.set({
  key: memoryKeys.task("research"),
  kind: "task_result",
  value: { findings: ["alpha", "beta"] },
  source: "research",
  title: "Research findings"
});

context.memory.getValue(memoryKeys.task("research"));
```

| Namespace | Helper | Used For |
|---|---|---|
| `step:<id>` | `memoryKeys.step(id)` | Per-step results |
| `task:<id>` | `memoryKeys.task(id)` | Per-task results |
| `input:<key>` | `memoryKeys.input(key)` | Caller-supplied inputs and edge inputs |
| `shared:<key>` | `memoryKeys.shared(key)` | Cross-agent communication, tool-published facts |

**Access pattern — progressive disclosure via tool calls**: memory contents are NOT auto-injected into prompts. The agent uses three auto-attached tools:

| Tool | Purpose |
|---|---|
| `list_shared` | Discover available entries (metadata only — keys, titles, kinds, byte sizes) |
| `read_shared` | Fetch full values for specific keys |
| `share_result` | Publish a value under `shared:<key>` for other agents to discover |

The default execution system prompt explains these tools; the user message names only the **specific** upstream keys the planner declared as required for the step. Values are pulled on demand.

For the full API, tool schemas, propagation flow, examples, and troubleshooting, see [Agent Memory System](agent-memory.md).

### Transcript compaction

Memory is what survives between steps. Compaction is what the model still sees
of the conversation those steps happened in.

A stateless provider is sent the whole thread on every turn, so a long session
eventually exceeds the model's context window and each turn from then on fails
with an error the user can do nothing about. Before that happens, the chat turn
summarizes everything before its last few user turns and sends the summary in
their place. The summarizer prompt names what must survive verbatim: standing
goals and constraints, decisions taken, every artifact reference (`asset://`
uris, workflow and document ids, file paths), open questions, and what the last
tool results concluded.

The summary is persisted as a `role: "user"` message marked
`execution_event_type: "compaction"`. History assembly starts at the newest such
row, so the cut lands on a user-message boundary and a tool call is never
separated from its result. Only the provider's view shortens — every original
row stays in the database for the UI and for `nodetool.threads.*`, and the web
renders the record as a collapsed "Earlier conversation summarized" card the
user can open.

Two triggers: the estimated prompt crossing
`NODETOOL_CHAT_COMPACTION_TOKENS`, and the provider reporting that the prompt
did not fit, which compacts and retries the turn once. A provider that holds the
transcript itself skips the first — shortening what NodeTool sends does not
shorten what that provider already has. A summarizer call that fails leaves the
thread whole and lets the turn run, since the alternative to an imperfect
summary is no turn at all.

`NODETOOL_CHAT_COMPACTION_KEEP_TURNS` sets how many recent user turns stay
verbatim and `NODETOOL_COMPACTION_MODEL` picks a different model to write the
summary. Implementation:
`packages/websocket/src/session/chat-compaction.ts`. Compaction applies to a
chat thread, not to a step: a step transcript is bounded by the iteration cap
and the tool-result cut instead (`MAX_TOOL_RESULT_CHARS`, 25 000 characters).

---

## Tool System

A tool that is still a class extends a single base class:

```ts
abstract class Tool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly inputSchema: Record<string, unknown>; // JSON Schema

  abstract process(
    context: ProcessingContext,
    params: Record<string, unknown>,
  ): Promise<unknown>;

  toProviderTool(): ProviderTool;  // convert to LLM tool-call format
}
```

### Built-In Capabilities

Most built-in work is no longer one class per tool. A **capability** is a spec
(wire name, description, JSON schema, category, user message) in
`src/capabilities/<module>.specs.ts` plus an implementation in `<module>.ts`.
`DECLARED_CAPABILITY_MODULES` (`src/capabilities/registry.ts`) is the module
list, and `capabilityModuleDrift` reports when the eager spec table and the
lazy implementation table disagree.

| Module | Capabilities |
|---|---|
| `workflows` | `list_workflows`, `get_workflow`, `create_workflow`, `update_workflow`, `delete_workflow`, `list_workflow_versions`, `get_workflow_version`, `create_workflow_version`, `restore_workflow_version`, `delete_workflow_version`, `set_workflow_access`, `run_workflow`, `debug_workflow`, `resolve_workflow_escalation`, `validate_workflow`, `start_background_job`, `get_example_workflow`, `export_workflow_digraph` |
| `nodes` | `list_nodes`, `search_nodes`, `get_node_info` |
| `models` | `find_model`, `list_models`, `list_provider_models` |
| `files` | `read_file`, `write_file`, `list_directory`, `edit_file`, `glob`, `grep`, `todo_write` |
| `web` | `web_search`, `image_search`, `browser`, `take_screenshot`, `download_file`, `http_request` |
| `browser` | `browser_status`, `browser_view`, `browser_navigate`, `browser_restart`, `browser_click`, `browser_input_text`, `browser_move_mouse`, `browser_press_key`, `browser_select_option`, `browser_scroll`, `browser_console_exec`, `browser_console_view`, `browser_capture_media`, `browser_upload_asset` |
| `serpapi` | `list_serpapi_engines`, `get_serpapi_engine_schema`, `serpapi_search`, `get_serpapi_account`, `get_serpapi_locations` |
| `apify` | `search_apify_actors`, `get_apify_actor`, `get_apify_actor_schema`, `run_apify_actor`, `get_apify_run`, `abort_apify_run`, `get_apify_dataset_items`, `get_apify_key_value_record` |
| `collections` | `list_collections`, `query_collection`, `vector_text_search`, `vector_index`, `vector_hybrid_search`, `vector_recursive_split_and_index`, `vector_markdown_split_and_index`, `vector_batch_index`, `create_collection`, `delete_collection` |
| `documents` | `extract_pdf_text`, `extract_pdf_tables`, `convert_pdf_to_markdown`, `convert_markdown_to_pdf`, `convert_document` |
| `email` | `search_email`, `archive_email`, `add_label_to_email` |
| `assets` | `list_assets`, `get_asset`, `save_asset`, `read_asset`, `asset_search`, `asset_list`, `list_images`, `view_image`, `update_asset` |
| `jobs` | `list_jobs`, `get_job`, `get_job_logs`, `cancel_job` |
| `costs` | `get_cost_summary` |
| `apps` | `list_apps`, `get_app`, `create_app`, `edit_app`, `debug_app`, `delete_app` |
| `code` | `validate_code`, `run_code`, `test_code` |
| `flow` | `invoke_node`, `open_node_stream`, `take_node_stream`, `close_node_stream` |
| `js-scripts` | `list_js_scripts`, `get_js_script`, `save_js_script`, `validate_js_script`, `run_js_script`, `test_js_script`, `list_js_script_versions`, `get_js_script_version`, `create_js_script_version`, `restore_js_script_version`, `delete_js_script_version`, `delete_js_script` |
| `media` | `generate_image`, `edit_image`, `generate_video`, `animate_image`, `generate_speech`, `generate_music`, `transcribe_audio`, `embed_text`, `read_media_bytes`, `critique_image`, `compare_images`, `score_image_adherence`, `understand_video`, `ffmpeg`, `ffprobe`, `yt_dlp` |
| `analysis` | `analyze_audio`, `analyze_audio_spectrum`, `detect_audio_events`, `analyze_video`, `detect_video_scenes` |
| `timelines` | `list_timelines`, `create_timeline`, `get_timeline`, `list_timeline_versions`, `get_timeline_version`, `create_timeline_version`, `restore_timeline_version`, `delete_timeline_version`, `edit_timeline`, `validate_timeline`, `delete_timeline` |
| `sketches` | `list_sketches`, `create_sketch`, `get_sketch`, `list_sketch_versions`, `get_sketch_version`, `create_sketch_version`, `restore_sketch_version`, `delete_sketch_version`, `edit_sketch`, `validate_sketch`, `delete_sketch` |
| `model3d` | `list_model3ds`, `create_model3d`, `get_model3d`, `edit_model3d`, `validate_model3d` |
| `storyboards` | `list_storyboards`, `create_storyboard`, `get_storyboard`, `render_storyboard_stills`, `render_storyboard_clips`, `revise_storyboard_clip`, `assemble_storyboard_timeline`, `edit_storyboard`, `extract_script_from_storyboard`, `delete_storyboard` |
| `scripts` | `list_scripts`, `create_script`, `get_script`, `voice_script_lines`, `assemble_script_timeline`, `edit_script`, `derive_storyboard_from_script`, `delete_script` |
| `entities` | `list_entities`, `get_entity`, `apply_entities`, `create_entity`, `update_entity`, `delete_entity` |
| `memory` | `memory_save`, `memory_list`, `memory_search`, `memory_update`, `memory_delete` — durable notes scoped to the **user**, not the thread. A memory saved in one conversation is readable from every later one; `memory_search` is a keyword match over title and content — every word must appear. The turn's prompt block carries this thread's memories in full plus a count of the ones held elsewhere. |
| `threads` | `list_threads`, `get_thread`, `get_message` |
| `shared` | `list_shared`, `read_shared`, `share_result` |
| `agents` | `run_subtask`, `run_search`, `start_subtask`, `wait_subtasks`, `create_plan`, `execute_plan` |
| `google` | `google_drive_*`, `gmail_*`, `google_docs_*`, `google_sheets_*`, `google_calendar_*` |
| `packs` | `list_sandbox_packages`, `get_sandbox_package_docs` |
| `settings` | `list_settings`, `get_setting`, `set_setting`, `list_secrets`, `request_secret` |
| `skills` | `list_skills`, `load_skill`, `create_skill`, `update_skill`, `delete_skill` |
| `ui` | the `ui_*` workflow-document tools, derived from `WORKFLOW_DOCUMENT_TOOL_NAMES` |

What is still a `Tool` class is what is not request/response: `FinishStepTool`
(`finish-step-tool.ts`), `ControlNodeTool` (`control-tool.ts`), and
`RunSubtaskTool` (`run-subtask-tool.ts`). `capabilityFromTool`
(`capabilities/adapters.ts`) wraps one as a capability, and
`toolFromCapability` goes the other way for a belt that still wants classes.

### The permission gate

Every actionable call runs one ladder, in `capabilities/invoke.ts`: a
read-class capability goes straight to its implementation, then the mode and
category decide (`decidePermission`), then the session allow-set, then the
approval round trip. A capability declares its `category` (`read`, `write`,
`execute`, `external`) in its spec; a `Tool` reaches the same ladder through
`gateTools`, which builds a one-call `CapabilityRun` over a capability view of
the tool and classifies it by name with `permissionCategoryFor`.

The gate is per run, not per tool. A host publishes one
`PermissionGateOptions` on the context under `PERMISSION_GATE_CONTEXT_KEY`, and
every loop it never constructed reads that object with `gateFromContext` rather
than building its own: an `AgentNode` reached through `run_node`, a JS script,
a sub-agent several levels down. A context with no gate on it is a headless
host, and the answer there is `auto` with every escalation denied, not
"ungated". Which host sets what is the table in
[packages/agents/AGENTS.md § Where the permission gate is set](../packages/agents/AGENTS.md).

### The MCP surface is CodeAct too

An external agent (Claude Code, ChatGPT, …) that connects to NodeTool's MCP
server gets the same shape a chat turn gets, for the same reason: **one action
tool**, not a flat catalog.

`registerAgentMcpTools` (`packages/websocket/src/mcp-agent-tools.ts`) builds a
`createChatCodeActSession` over the derived belt — `getAgentToolbelt()` plus
`getAllMcpTools()` plus Google Workspace — and registers `execute_code`,
`view_image`, which is direct because pixels cannot ride a sandbox action's JSON
observation envelope, and the direct set: `DIRECT_TOOL_NAMES` minus every key of
`SDK_NATIVE_TOOL_REPLACEMENTS`, because an MCP client is the host agent that
table describes and its own `read_file` must not sit beside NodeTool's. What
survives is discovery, the server-side reach behind NodeTool's SSRF guard and
secrets, and `run_subtask`. Everything else on that belt is
reachable inside an action by import, through the `nodetool.*` object
model, or found with `await nodetool.searchTools("query")`. MCP has no system
prompt, so the guest contract leads the `execute_code` description and is also
the server `instructions` string. The machine-readable form is
`nodetool://capabilities` (tools) plus `nodetool://sandbox` (guest surface).

Registering every bridged tool flat is what this replaced: it made a scoped MCP
session NodeTool's largest surface anywhere, tens of thousands of tokens of
schema before the caller did anything. It is one action tool plus the direct set
now, and it cannot drift from the chat surface because both call the same
session builder.

`mcp-server.ts` used to hand-build a second product surface beside that one —
native `run_workflow` / `get_asset` / `get_node_info` / collection tools, a flat
`ui_*` renderer bridge, and seven MCP App HTML views. All of it is gone; each
capability stays available inside an action. The `ui_*` tools are on the belt of
a scoped session: `runBridgedTool` routes one to a connected editor over the
websocket renderer registry, optionally targeted with `renderer_id` (list them
with `list_renderers`). A workflow-document tool falls back to its server-side
implementation when no editor is open; any other `ui_*` call reports that it
needs one.

### Workflow Harness Tools

`validate_workflow` and `debug_workflow` (in `capabilities/workflows.ts`) are the
agent-facing front ends to the same harnesses the CLI exposes as
`nodetool validate` and `nodetool debug` — use them to author and verify graphs
from inside an agent:

- **`validate_workflow`** — static check of an inline `graph` ({nodes, edges})
  being built or a saved `workflow_id`: unknown node types, missing required
  props, unselected models, unregistered providers, model ids the provider does
  not offer, dangling/mis-typed edges, leftover DSL wiring handles.
  Sub-second. Run it before the expensive
  `debug`. `create_workflow` and `POST /api/workflows/:id/run|debug` apply the
  provider/model half of this check themselves, so a hallucinated model id is
  refused at save and at run rather than surfacing mid-execution.
- **`debug_workflow`** — run a workflow and return status, outputs, errors, job
  logs, and a graph overview in one call.
- **`debug_app`** — validate a mini app's bindings, simulate it, and return each
  widget's final state with a verdict. `run: false` is the free, instant wiring
  check an agent runs after every edit.
- **`create_app`** / **`edit_app`** — author the app itself. `create_app` makes
  the row; `edit_app` takes a list of `{tool, input}` steps naming the same
  `ui_app_*` tools the browser editor exposes, applies them to the saved
  document through the headless bridge (`app-build/bridge.ts`, which the
  `app-tools` eval and the build harness's Author stage already drive), and
  writes the result back once. `edit_app` with no steps returns every tool and
  its schema. Without these two the `ui_app_*` tools only existed inside a live
  Puck editor, so a chat agent could debug an app but never build one. There is
  still no `build_app` tool: the batch harness lives on at
  `POST /api/applications/build` and `nodetool app build`.
- **`run_workflow`** / **`start_background_job`** — execute synchronously, or
  start a detached run and get its job id back at once. Poll `get_job` until it
  settles: the settled job carries the run's `outputs`, and `get_job_logs`
  carries its log tail and any node error.
- **`create_workflow`**, **`search_nodes`**, **`list_nodes`**, **`get_node_info`**,
  **`get_example_workflow`**, **`export_workflow_digraph`** — build and inspect
  graphs against the live node registry.

The full harness index — CLI commands, the browser surface, single-node runs,
deploy, and tracing — is in the [root AGENTS.md](../AGENTS.md#agent-harnesses--tooling).

### JavaScript Sandbox

A CodeAct action (`execute_code`) and the `CodeNode` workflow node both run user JavaScript inside a **QuickJS WebAssembly** sandbox (`packages/agents/src/js-sandbox.ts`). QuickJS runs in its own WASM instance with a separate heap, providing a true memory/CPU boundary — unlike Node's `node:vm` which shares the V8 heap.

**Limits enforced:**

| Limit | Value |
|-------|-------|
| Execution timeout | 30 s |
| Guest heap | 64 MB |
| Guest stack | 512 KB |
| Max output size | 100 KB |
| Max loop iterations | 10 000 |
| Max `fetch` calls | 20 |
| Max response body | 1 MB |

The sandbox exposes a curated surface: vanilla JavaScript plus bridge globals (`fetch`, `workspace`, `getSecret`, `nodetool.secrets.*`, `sleep`, `crypto`, `console`, `media`, `image`/`audio`/`video`). Third-party libraries are not globals — each is a **sandbox package** the body imports (`import yaml from "@nodetool-ai/sandbox-yaml"`). NodeTool ships thirty-eight of them in `packages/sandbox-packs/`. See [javascript-sandbox.md](javascript-sandbox.md) for the full global table and the pack list.

### Tool Registry

Register custom tools so they can be resolved by name:

```ts
import { registerTool, resolveTool, getAllTools } from "@nodetool-ai/agents";

registerTool(new MyCustomTool());
const tool = resolveTool("my_custom_tool");
const allTools = getAllTools(); // returns all registered tools
```

### Builtin Tools in Tool-Agent Nodes (`runAgentLoop`)

There is a **separate** registry for tools that workflow tool-agent nodes
expose via `runAgentLoop` (in `@nodetool-ai/llm-nodes`) — distinct from the
`@nodetool-ai/agents` `registerTool`/`resolveTool` registry above. Builtin
node tools are registered into it at module load via
`registerBuiltinAgentToolClasses` or, for lazily-built sets,
`registerBuiltinAgentToolFactory` (which is what
`packages/base-nodes/src/index.ts` uses to register the `browser_*` CDP tools),
and resolved with `resolveBuiltinAgentTool(name)`.

**Hydration contract:** a tool may be passed as a fully-formed `ToolLike` (has
`process` + `inputSchema`) or a bare name-stub (`{ name }`). `runAgentLoop`
hydrates stubs by name before use, so either form works — a real tool passes
through unchanged. **But a stub is inert until hydrated:** it has no `process`,
so if you build tools by name and execute them *outside* `runAgentLoop`, call
`resolveBuiltinAgentTool` / `hydrateBuiltinAgentTool` yourself first, or the
model gets a schemaless tool and every call is rejected as "Unknown tool".

```ts
// In a tool-agent node, getTools() may return hydrated tools…
return TOOL_NAMES.map((name) => resolveBuiltinAgentTool(name)).filter(Boolean);
// …or stubs (runAgentLoop will hydrate them):
return TOOL_NAMES.map((name) => ({ name }));
```

### Writing a Custom Tool

```ts
import { Tool } from "@nodetool-ai/agents";
import type { ProcessingContext } from "@nodetool-ai/runtime";

class WeatherTool extends Tool {
  readonly name = "get_weather";
  readonly description = "Get current weather for a city.";
  readonly inputSchema = {
    type: "object",
    properties: {
      city: { type: "string", description: "City name" },
    },
    required: ["city"],
  };

  async process(context: ProcessingContext, params: Record<string, unknown>) {
    const city = String(params.city);
    const res = await fetch(`https://api.example.com/weather?q=${encodeURIComponent(city)}`);
    return await res.json();
  }
}
```

**Rules for custom tools**:
- Always validate params before use (the schema provides type hints to the LLM, but doesn't enforce at runtime).
- Return serializable values (JSON-compatible objects).
- Handle errors within `process` — throw `Error` objects with descriptive messages.
- Use `context` for secret resolution, storage access, and provider calls.

---

## Skills

Skills are user-scoped database records with `name`, `description`, and
markdown `content` columns. A turn's system prompt carries the **catalog** —
one line per skill the user owns, name and description — and the body arrives
only when the model calls `load_skill` or the user types `/<name>`. Two tiers
share that catalog: the user's own rows, and the system skills below.

### System Skills

A **system skill** ships with the build instead of living in a row. It is a
`SKILL.md` — YAML frontmatter naming it, Markdown body — under a directory that
carries its name, in `packages/system-skills/` in a checkout and staged to
`_skills/` beside the bundled `server.mjs` in the desktop app and the Docker
image. `NODETOOL_SYSTEM_SKILLS_DIR` overrides both roots
([Configuration](configuration.md#environment-variables-index)).

```markdown
---
name: launch-commercial
description: Turn a product page URL into a finished launch commercial — ... Use when someone asks for an ad, a launch spot, a promo or a commercial from a product page or website.
---

# Product Page → Launch Commercial Agent

You are a single agent. Your job: …
```

The `description` is what the model chooses from in the catalog, so it says
*when* the skill applies, not what it contains.

`list_skills` and `load_skill` serve both tiers, so a system skill reaches the
model exactly the way a user skill does. The difference is that it is read-only:
`create_skill`, `update_skill`, and `delete_skill` refuse a shipped name, naming
the verb they refused — `"<name>" is a system skill that ships with NodeTool and
cannot be overwritten. Pick another name; load_skill still reads it.`, and
likewise `edited`, `renamed over`, and `deleted`. A user row that already held
the name predates the reservation and wins — reserving names only stops new ones.

Nothing imports these files, so `packages/system-skills` is not a workspace and
npm links nothing. A file whose frontmatter is missing or malformed, or whose
`name` disagrees with its directory, is skipped rather than failing the catalog.

### Skill Resolution

A turn's system prompt carries the **catalog** — one line per skill, name and
description — and the model calls `load_skill` for the body it wants. Typing
`/<name>` skips that round trip: naming a skill is asking for it, so its body
arrives in the same block.

Nothing selects a skill on the model's behalf. Word overlap between an
objective and a description used to do it, and it picked the wrong document
often enough that the catalog replaced it. The `skillDirs` option, the
`NODETOOL_AGENT_SKILL_DIRS`, `NODETOOL_AGENT_SKILLS` and
`NODETOOL_AGENT_AUTO_SKILLS` environment variables, and filesystem `SKILL.md`
discovery are all gone.

---

## Workflow Nodes

The agent system surfaces in the workflow editor through several node types defined in `packages/llm-nodes/src/nodes/agents.ts`:

| Node | Purpose |
|---|---|
| **AgentNode** | General-purpose agent with streaming output, tool access, and control edges |
| **SummarizerNode** | Summarize text with streaming output |
| **ExtractorNode** | Extract structured data from text |
| **ClassifierNode** | Classify text into categories |
| **CreateThreadNode** | Manage multi-turn conversation threads |

### Control Edges

When an agent node has outgoing control edges, **ControlNodeTool** instances are automatically added to its tool list. The agent can call these tools to trigger downstream nodes with specific parameter values:

```
AgentNode ──control edge──> ImageGeneratorNode
   │
   └─ LLM calls "image_generator" tool with { prompt: "sunset over mountains" }
      → ImageGeneratorNode receives prompt override and executes
```

---

## Running an agent from code

Build a session, hand it the message, read the stream.
`createChatCodeActSession` turns a toolbelt into the `execute_code` action plus
whichever tools you want the provider to see directly; the belt itself is
whatever the host assembles — `getAgentToolbelt()` plus the host's own
additions, which is what `buildCliAgentBelt` does for the CLI.

```ts
import { createChatCodeActSession } from "@nodetool-ai/agents";

const session = createChatCodeActSession({
  tools: belt,                       // ToolSignatureSource[]
  executeTool: (call) => router(call), // the gated tool router
  signal: abortController.signal
});

// session.systemPrompt goes in the system message; session.tools are what the
// provider is offered. Run them through the host's own generateLoop.
```

`packages/cli/src/commands/agent.ts` is the smallest complete example: it
assembles the belt, wraps it with `createCliCodeActTurn`, and runs
`processChat`. The stream it forwards is the shared `ProcessingMessage`
union — `chunk`, `planning_update`, `task_update`, `tool_call_update`,
`tool_result_update`, `step_result`, `log_update`.

To validate a structured deliverable, put the schema on the step that produces
it: `execute_plan`'s steps carry `output_schema`, and `finish()` validates
host-side. There is no run-level output schema, because there is no run-level
synthesis stage to validate.

---

## Configuration Reference

A session's options, not an agent's — these are the fields of
`ChatCodeActSessionOptions` (`src/codeact/chat-codeact.ts`) and the run bounds
that reach it through the context.

| Option | Default | Description |
|---|---|---|
| `tools` | required | The belt as tool signatures — server and client tools alike |
| `executeTool` | required | The gated tool router the sandbox's calls go through |
| `signal` | — | Cancels the turn and every loop under it |
| `actionTimeoutMs` | `DEFAULT_CODEACT_ACTION_TIMEOUT_MS` | Wall clock for one code action |
| `maxToolCallsPerAction` | `50` | Tool calls one action may consume |
| `residentToolNames` | `CODEACT_RESIDENT_TOOL_NAMES` | Tools documented in full in the prompt |
| `directToolNames` | — | Belt tools also offered as provider tools, documented as direct calls |
| `clock` | — | `SandboxClock` that stops the action budget while a permission prompt is open |
| `sandboxPackages` | none | Package specifiers this session consents to import |

Provider, model and permission mode belong to the host's turn, not to the
session. The run's bounds are one `RunBudget` on the context
(`RUN_BUDGET_CONTEXT_KEY`) — USD cap, wall clock, concurrency, turn count —
and the permission gate is likewise on the context
(`PERMISSION_GATE_CONTEXT_KEY`), so a loop the host never constructed reads
both instead of inventing its own.

---

## Claude Agent SDK

`ClaudeAgentProvider` (`packages/runtime/src/providers/claude-agent-provider.ts`)
is a **pure LLM provider** that reaches Claude through the local `claude` CLI
(the Claude Agent SDK transport) instead of an API key. It sends no
`ANTHROPIC_API_KEY`; the CLI authenticates with the machine's logged-in Claude
subscription (credentials stored under `~/.claude`), so it bills against the
subscription rather than per-token API spend.

Internally it spawns the executable in non-interactive print mode
(`claude -p --output-format stream-json --verbose --include-partial-messages`)
and translates the CLI's newline-delimited JSON stream into the standard
`ProviderStreamItem` stream (text + thinking chunks). The Claude Code agent loop
is collapsed to a single, tool-free turn so it behaves like a plain chat
completion:

- `--system-prompt <prompt>` fully **replaces** the coding-agent preset with the
  caller's system message (or a generic assistant prompt), giving vanilla LLM
  behaviour rather than the Claude Code persona.
- `--allowedTools ""` disables every built-in tool, and `--max-turns 1` keeps it
  to one model call. `hasToolSupport()` returns `false` — the caller drives any
  tool loop with a `tool_use`-returning provider (e.g. `AnthropicProvider`).

Provider id: `claude_agent_sdk` (`PROVIDER_IDS.CLAUDE_AGENT_SDK`). It registers
with no credential kwargs (auth lives in the CLI's store, so it is always
"configured"; a missing CLI surfaces at call time) and is pruned from the cloud
profile since it needs a local executable. Token usage is attributed to the
concrete dated model the CLI resolves an alias to (captured from the
`message_start` event) so cost maps onto Anthropic pricing.

### Signing in

`nodetool auth claude login` runs the same OAuth flow the `claude` CLI does
(public client, PKCE, JSON token endpoint) and writes the tokens to
`$CLAUDE_CONFIG_DIR/.credentials.json` — the file the SDK reads — so a NodeTool
login and a `claude login` are interchangeable. On a headless or remote host,
`--manual` skips the loopback listener and takes the `code#state` shown in the
browser instead. The same flow is served at
`/api/oauth/claude/{start,complete,tokens,disconnect}` and rendered as a sign-in
card on the Models & Providers settings page. Implementation and protocol notes:
[packages/runtime/src/providers/oauth/README.md](../packages/runtime/src/providers/oauth/README.md).

`CLAUDE_CODE_OAUTH_TOKEN` remains the alternative on hosts with no interactive
login; it is explicitly allowlisted through the nested-session env stripping
below.

**Soft dependency.** `@anthropic-ai/claude-agent-sdk` is an *optional peer
dependency* of `@nodetool-ai/runtime` — it is not installed by default and must
be added with the package manager (`npm install @anthropic-ai/claude-agent-sdk`)
before this provider can run. The package is imported lazily, so its absence
only surfaces — as a clear install hint — when the provider is actually used;
the rest of the runtime and the browser worker bundle never pull it in.

### Executable resolution & nested sessions

The SDK resolves its own bundled `claude` binary, shipped per platform as an
optional dependency of `@anthropic-ai/claude-agent-sdk` (e.g.
`@anthropic-ai/claude-agent-sdk-linux-x64`), so nothing has to be on `PATH`;
`options.pathToClaudeCodeExecutable` overrides it and NodeTool does not set it.
Users still have to be logged in — auth comes from the credential store under
`~/.claude`. The `@anthropic-ai/claude-code` CLI the desktop app offers as the
`claude` runtime package is what the separate Claude Code *agent node* needs,
not this provider.

When NodeTool itself runs **under** Claude Code (e.g. Claude Code on the web),
the inherited `CLAUDECODE` / `CLAUDE_CODE_*` / `CLAUDE_SESSION_*` /
`CLAUDE_ENABLE_*` / `CLAUDE_AFTER_*` / `CLAUDE_AUTO_*` env vars are stripped from
the spawned child so the nested CLI starts clean. `ANTHROPIC_BASE_URL` and
`HTTP_PROXY` / `HTTPS_PROXY` are preserved for API routing.

**`uid=0` blocker (tool path).** The tool-free primitive
(`generateMessages`) runs without permission bypass, but `generateLoop` with
tools exposes them as an in-process MCP server and runs the SDK under
`permissionMode: "bypassPermissions"` + `allowDangerouslySkipPermissions: true`
(see the query options in `claude-agent-provider.ts`). The CLI **refuses
`--dangerously-skip-permissions` as `root`/sudo** — so the tool path fails
(`Claude Code process exited with code 1`) whenever NodeTool runs as `uid=0`,
which the web sandbox does. Two ways out:
- Run the server as a **non-root** user — but only if that user can reach the
  CLI's auth (in the web sandbox the OAuth credentials + proxy CA bundle are
  root-only, so switching users trips `authentication_failed` and a CA
  `EACCES`). This is the SDK's intended fix and works on normal hosts.
- Set **`IS_SANDBOX=1`** in the environment. It is preserved by
  `buildChildEnv()` (not a `CLAUDE_*` var) and lifts the CLI's root refusal.
  Accurate and safe inside an actual sandboxed container; do **not** set it on a
  real multi-tenant host.

---

## Related Pages

- [Agent Memory System](agent-memory.md) — Unified memory across all agent types: API, propagation, examples
- [Chat & Agents](global-chat-agents.md) — Using agents in the chat interface
- [Agent CLI](agent-cli.md) — Running agents from the command line
- [Custom Nodes Guide](developer/custom-nodes-guide.md) — Building custom workflow nodes
