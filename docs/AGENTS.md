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

```
Objective (user goal)
    │
    ▼
┌── Agent ──────────────────────────────────────────────┐
│                                                        │
│  1. Skill resolution    (load SKILL.md files)          │
│  2. Planning phase      (TaskPlanner → Task with Steps)│
│  3. Execution phase     (TaskExecutor → CodeActExecutor)│
│                                                        │
└────────────────────────────────────────────────────────┘
    │
    ▼
Structured result (validated against output JSON schema)
```

### Agent Classes

| Class | When to Use | Source |
|---|---|---|
| **Agent** | Multi-step objectives needing decomposition (full DAG planning + execution) | `packages/agents/src/agent.ts` |
| **ParallelTaskExecutor** | Execute independent tasks of a plan concurrently | `packages/agents/src/parallel-task-executor.ts` |
| **TaskPlanner** | Decompose an objective into a task DAG | `packages/agents/src/task-planner.ts` |
| **TaskExecutor** | Walk the step DAG, respecting dependency order | `packages/agents/src/task-executor.ts` |
| **CodeActExecutor** | Run the sandboxed-JavaScript action loop for a single step | `packages/agents/src/codeact/codeact-executor.ts` |

The top-level **Agent** orchestrates planning (via `TaskPlanner`) and execution (via `TaskExecutor` →
`CodeActExecutor`), then validates the final result against the output schema. Its constructor accepts a
`provider` (`BaseProvider`), `model`, `tools`, `objective`, and the options in the
[Configuration Reference](#configuration-reference) below. It exposes
`execute(context): AsyncGenerator<ProcessingMessage>` and `getResults(): unknown`.

---

## Planning Phase

When you use the full **Agent**, the first thing it does is call **TaskPlanner** to decompose the objective into a **Task** — an ordered DAG of **Steps** with dependency edges.

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

The planner sends the objective to the LLM with a `create_task` tool. The response is parsed, validated as a DAG (no circular dependencies), and retried up to three times on failure.

You can skip planning entirely by passing a pre-built `task` object to the Agent constructor.

---

## Execution Phase

**TaskExecutor** walks the step DAG, respecting dependency order. For each step, it creates a **CodeActExecutor** that runs the code-action loop:

1. Build messages — the CodeAct contract, the tool catalog, the step instructions
2. Stream the LLM response
3. Run the action's JavaScript in the QuickJS sandbox, where the toolbelt is imported from `@nodetool-ai/sandbox-nodetool/<namespace>`
4. Feed the observation (return value, logs, error) back as the tool result
5. Repeat until the program calls `finish(result)` or max iterations are reached
6. Validate the result against the step's output schema — host-side, in `finish`

See [codeact-design.md](codeact-design.md) for the action protocol, the
sandbox limits that apply per action, and the `state` object that persists
across a step's actions, and [javascript-sandbox.md](javascript-sandbox.md)
for the engine itself — capabilities, limits, imports, security model.

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
| `workflows` | `list_workflows`, `get_workflow`, `create_workflow`, `run_workflow`, `debug_workflow`, `resolve_workflow_escalation`, `validate_workflow`, `start_background_job`, `get_example_workflow`, `export_workflow_digraph` |
| `nodes` | `list_nodes`, `search_nodes`, `get_node_info` |
| `models` | `find_model`, `list_models`, `list_provider_models` |
| `files` | `read_file`, `write_file`, `list_directory`, `edit_file`, `glob`, `grep`, `todo_write` |
| `web` | `web_search`, `browser`, `take_screenshot`, `download_file`, `http_request` |
| `apify` | `search_apify_actors`, `get_apify_actor`, `get_apify_actor_schema`, `run_apify_actor`, `get_apify_run`, `abort_apify_run`, `get_apify_dataset_items`, `get_apify_key_value_record` |
| `collections` | `list_collections`, `query_collection`, `vector_text_search`, `vector_index`, `vector_hybrid_search`, `vector_recursive_split_and_index`, `vector_markdown_split_and_index`, `vector_batch_index` |
| `documents` | `extract_pdf_text`, `extract_pdf_tables`, `convert_pdf_to_markdown`, `convert_markdown_to_pdf`, `convert_document` |
| `email` | `search_email`, `archive_email`, `add_label_to_email` |
| `assets` | `list_assets`, `get_asset`, `save_asset`, `read_asset`, `asset_search`, `asset_list`, `list_images`, `view_image` |
| `jobs` | `list_jobs`, `get_job`, `get_job_logs` |
| `apps` | `debug_app` |
| `code` | `validate_code`, `run_code`, `test_code` |
| `js-scripts` | `list_js_scripts`, `get_js_script`, `save_js_script`, `validate_js_script`, `run_js_script`, `test_js_script` |
| `media` | `generate_image`, `edit_image`, `generate_video`, `animate_image`, `generate_speech`, `transcribe_audio`, `embed_text`, `critique_image`, `compare_images`, `score_image_adherence`, `understand_video` |
| `timelines` | `list_timelines`, `list_timeline_versions`, `get_timeline_version`, `create_timeline_version`, `restore_timeline_version`, `edit_timeline`, `validate_timeline` |
| `sketches` | `list_sketches`, `list_sketch_versions`, `get_sketch_version`, `create_sketch_version`, `restore_sketch_version`, `edit_sketch`, `validate_sketch` |
| `storyboards` | `list_storyboards`, `get_storyboard`, `render_storyboard_stills`, `render_storyboard_clips`, `revise_storyboard_clip`, `assemble_storyboard_timeline`, `edit_storyboard` |
| `scripts` | `list_scripts`, `get_script`, `voice_script_lines`, `assemble_script_timeline`, `edit_script` |
| `memory` | `thread_memory_save`, `thread_memory_list`, `thread_memory_update`, `thread_memory_delete` |
| `shared` | `list_shared`, `read_shared`, `share_result` |
| `agents` | `run_subtask`, `run_search` |
| `google` | `google_drive_*`, `gmail_*`, `google_docs_*`, `google_sheets_*`, `google_calendar_*` |
| `packs` | `list_sandbox_packages`, `get_sandbox_package_docs` |
| `style` | `record_style_preference`, `get_style_profile` |
| `ui` | the `ui_*` workflow-document tools, derived from `WORKFLOW_DOCUMENT_TOOL_NAMES` |

What is still a `Tool` class is what is not request/response: `FinishStepTool`
(`finish-step-tool.ts`), `ControlNodeTool` (`control-tool.ts`), and
`RunSubtaskTool` (`run-subtask-tool.ts`). `capabilityFromTool`
(`capabilities/adapters.ts`) wraps one as a capability, and
`toolFromCapability` goes the other way for a belt that still wants classes.

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

It used to register all ~95 bridged tools flat, which made a scoped MCP session
NodeTool's largest surface anywhere — 120 tools and ~27k tokens of schema before
the caller did anything. It is one action tool plus the direct set now, and it
cannot drift from the chat surface because both call the same session builder.

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
  not offer, dangling/mis-typed edges. Sub-second. Run it before the expensive
  `debug`. `create_workflow` and `POST /api/workflows/:id/run|debug` apply the
  provider/model half of this check themselves, so a hallucinated model id is
  refused at save and at run rather than surfacing mid-execution.
- **`debug_workflow`** — run a workflow and return status, outputs, errors, job
  logs, and a graph overview in one call.
- **`debug_app`** — validate a mini app's bindings, simulate it, and return each
  widget's final state with a verdict. `run: false` is the free, instant wiring
  check an agent runs after every edit. There is no `build_app` tool: an app is
  built with the `ui_app_*` editor tools and graded with this one. The batch
  harness lives on at `POST /api/applications/build` and `nodetool app build`.
- **`run_workflow`** / **`start_background_job`** — execute synchronously or as a
  background job (poll with `get_job` / `get_job_logs`).
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

The sandbox exposes a curated surface: vanilla JavaScript plus bridge functions (`fetch`, `workspace`, `getSecret`, `uuid`, `sleep`, `console`). Third-party libraries (lodash, dayjs, etc.) are intentionally excluded — use dedicated workflow nodes instead.

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

Skills are markdown files (`SKILL.md`) that inject domain-specific instructions into the agent's system prompt.

### Skill Format

```markdown
---
name: data-analysis
description: Analyze CSV datasets and produce summary statistics
---

When working with data analysis tasks:
1. Load the dataset with the file read tool
2. Examine column types and null counts
3. Compute summary statistics
...
```

### Skill Discovery

The agent searches these directories (in order):

1. Directories passed to the constructor (`skillDirs`)
2. Paths in the `NODETOOL_AGENT_SKILL_DIRS` environment variable
3. `./.claude/skills`
4. `~/.claude/skills`
5. `~/.codex/skills`

### Skill Resolution

- **Explicit** — set `NODETOOL_AGENT_SKILLS=skill-a,skill-b` or pass `skills: ["skill-a"]` in the constructor
- **Auto-select** — the agent matches words in the objective against skill descriptions (disable with `NODETOOL_AGENT_AUTO_SKILLS=0`)

Matched skill instructions are prepended to the system prompt under an `# Agent Skills` header.

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

## Using Agents Programmatically

### Full Agent with Planning

```ts
import { Agent } from "@nodetool-ai/agents";
import { BrowserTool, GoogleSearchTool, WriteFileTool } from "@nodetool-ai/agents";

const agent = new Agent({
  name: "researcher",
  objective: "Research TypeScript ORMs and write a comparison report",
  provider: openaiProvider,
  model: "gpt-5.6",
  tools: [new GoogleSearchTool(), new BrowserTool(), new WriteFileTool()],
  workspace: "/tmp/research-output",
  maxSteps: 10,
  maxStepIterations: 15,
});

for await (const message of agent.execute(context)) {
  if (message.type === "chunk") {
    process.stdout.write(message.content);
  }
}

const result = agent.getResults();
```

### Agent with an Output Schema

Pass an `outputSchema` to have the final result validated against a JSON schema:

```ts
import { Agent } from "@nodetool-ai/agents";

const agent = new Agent({
  name: "extractor",
  objective: "Extract all email addresses from this text: ...",
  provider: openaiProvider,
  model: "gpt-5.6",
  tools: [],
  outputSchema: {
    type: "object",
    properties: {
      emails: { type: "array", items: { type: "string" } },
    },
  },
});

for await (const message of agent.execute(context)) {
  // handle streaming messages
}

const { emails } = agent.getResults() as { emails: string[] };
```

---

## Configuration Reference

| Option | Default | Description |
|---|---|---|
| `name` | required | Agent identifier |
| `objective` | required | Goal to achieve |
| `provider` | required | LLM provider instance (`BaseProvider`) |
| `model` | required | Model ID (e.g. `"gpt-5.6"`) |
| `planningModel` | same as `model` | Alternative model for the planning phase |
| `reasoningModel` | same as `model` | Alternative model for reasoning-heavy steps |
| `tools` | `[]` | Array of `Tool` instances |
| `systemPrompt` | `""` | Custom system instructions |
| `maxSteps` | `10` | Maximum number of steps in a task |
| `maxStepIterations` | `15` | Maximum LLM round-trips per step |
| `outputSchema` | — | JSON schema for the final result |
| `workspace` | auto-generated | Directory for file artifacts |
| `skills` | — | Explicit skill names to load |
| `skillDirs` | — | Additional directories to search for skills |
| `task` | — | Pre-planned task (skips planning phase) |

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
